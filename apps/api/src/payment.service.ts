import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MatterState, PaymentProvider as DatabasePaymentProvider, PaymentStatus, RefundStatus } from "@lex/database";
import { initializePaymentSchema } from "@lex/contracts";
import { PrismaService } from "./prisma.service.js";
import { AuditService } from "./audit.service.js";
import { PaymentProviderRegistry } from "./payment.providers.js";

const providerEnums = {
  paystack: DatabasePaymentProvider.PAYSTACK,
  flutterwave: DatabasePaymentProvider.FLUTTERWAVE,
} as const;

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly providers: PaymentProviderRegistry,
  ) {}

  async initialize(clientUserId: string, raw: unknown) {
    const input = initializePaymentSchema.parse(raw);
    const matter = await this.prisma.matter.findFirst({
      where: { id: input.matterId, clientUserId },
      include: {
        client: true,
        assignedLawyer: { include: { payoutAccounts: true } },
        serviceDefinition: { include: { jurisdictionVersion: true } },
        engagements: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!matter) throw new NotFoundException("Matter not found");
    if (matter.state !== MatterState.AWAITING_PAYMENT || !matter.assignedLawyer) throw new BadRequestException("Matter is not ready for payment");
    if (!matter.client.email || !matter.client.emailVerifiedAt) throw new BadRequestException("A verified email is required before payment");
    const provider = input.provider;
    if (matter.serviceDefinition.currency !== "NGN" || matter.serviceDefinition.feeBearer !== "lawyer") throw new BadRequestException("This MVP payment contract requires NGN pricing with lawyer-borne gateway fees");
    const payout = matter.assignedLawyer.payoutAccounts.find((account) => account.provider === providerEnums[provider] && account.active && account.verifiedAt);
    if (!payout) throw new BadRequestException(`Selected lawyer has no verified ${provider} payout account`);
    const existing = await this.prisma.payment.findFirst({ where: { matterId: matter.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.SUCCESSFUL] } }, orderBy: { createdAt: "desc" } });
    if (existing) return existing;

    const internalReference = `LEX-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const payment = await this.prisma.payment.create({ data: {
      matterId: matter.id,
      provider: providerEnums[provider],
      status: PaymentStatus.CREATED,
      internalReference,
      amountMinor: matter.serviceDefinition.priceMinor,
      currency: matter.serviceDefinition.currency,
      platformShareBps: matter.serviceDefinition.platformShareBps,
      lawyerShareBps: matter.serviceDefinition.lawyerShareBps,
      feeBearer: matter.serviceDefinition.feeBearer,
      lawyerSubaccountId: payout.providerSubaccountId,
      serviceVersion: matter.serviceDefinition.version,
      jurisdictionVersion: matter.serviceDefinition.jurisdictionVersion.version,
    } });
    try {
      const initialized = await this.providers.get(provider).initialize({
        internalReference,
        amountMinor: payment.amountMinor,
        currency: "NGN",
        email: matter.client.email,
        callbackUrl: input.callbackUrl,
        lawyerSubaccount: payout.providerSubaccountId,
        platformSharePercent: payment.platformShareBps / 100,
        feeBearer: "lawyer",
        metadata: { paymentId: payment.id, matterId: matter.id, serviceVersion: String(payment.serviceVersion) },
      });
      const updated = await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PENDING, providerReference: initialized.providerReference, checkoutUrl: initialized.checkoutUrl } });
      await this.audit.record({ actorUserId: clientUserId, matterId: matter.id, action: "payment.initialized", entityType: "Payment", entityId: payment.id, metadata: { provider, amountMinor: payment.amountMinor } });
      return updated;
    } catch (error) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, failedAt: new Date() } });
      throw error;
    }
  }

  async verify(clientUserId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { matter: true } });
    if (!payment || payment.matter.clientUserId !== clientUserId) throw new NotFoundException("Payment not found");
    return this.verifyAndComplete(payment.id);
  }

  async verifyAndComplete(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { matter: { include: { serviceDefinition: true } } } });
    if (!payment?.providerReference) throw new NotFoundException("Payment reference not found");
    if (payment.status === PaymentStatus.SUCCESSFUL) return payment;
    const providerName = payment.provider === DatabasePaymentProvider.PAYSTACK ? "paystack" : "flutterwave";
    const verification = await this.providers.get(providerName).verify(payment.providerReference);
    if (!verification.successful || verification.amountMinor !== payment.amountMinor || verification.currency !== payment.currency) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, failedAt: new Date(), rawVerification: verification.raw as object } });
      throw new BadRequestException("Payment could not be verified for the expected amount and currency");
    }
    const now = new Date();
    const complete = Boolean(payment.matter.informationCompleteAt);
    const dueAt = complete ? new Date(now.getTime() + payment.matter.serviceDefinition.slaHours * 60 * 60 * 1000) : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: { not: PaymentStatus.SUCCESSFUL } }, data: { status: PaymentStatus.SUCCESSFUL, verifiedAt: now, rawVerification: verification.raw as object } });
      if (!claimed.count) return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      await tx.paymentSplit.upsert({
        where: { paymentId: payment.id },
        update: {},
        create: {
          paymentId: payment.id,
          grossAmountMinor: payment.amountMinor,
          platformAmountMinor: Math.floor(payment.amountMinor * payment.platformShareBps / 10_000),
          lawyerAmountMinor: Math.floor(payment.amountMinor * payment.lawyerShareBps / 10_000),
          calculatedAt: now,
          raw: { feeBearer: payment.feeBearer, providerFeePending: true },
        },
      });
      await tx.matter.update({ where: { id: payment.matterId }, data: { state: MatterState.ACTIVE, paidAt: now, slaStartedAt: complete ? now : null, dueAt } });
      await tx.engagement.updateMany({ where: { matterId: payment.matterId, endedAt: null }, data: { acceptedByClientAt: now, startedAt: now } });
      return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { split: true } });
    });
    await this.audit.record({ matterId: payment.matterId, action: "payment.verified", entityType: "Payment", entityId: payment.id, metadata: { provider: providerName, slaStarted: complete } });
    return updated;
  }

  async requestRefund(userId: string, role: string, matterId: string, reason: string) {
    const matter = await this.prisma.matter.findUnique({ where: { id: matterId }, include: { payments: { where: { status: PaymentStatus.SUCCESSFUL }, orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!matter || (role === "CLIENT" && matter.clientUserId !== userId)) throw new NotFoundException("Matter not found");
    const payment = matter.payments[0];
    if (!payment) throw new BadRequestException("No successful payment is available for refund");
    const existing = await this.prisma.refund.findFirst({ where: { paymentId: payment.id, status: { in: [RefundStatus.REQUESTED, RefundStatus.PROCESSING, RefundStatus.SUCCESSFUL] } } });
    if (existing) return existing;
    const refund = await this.prisma.$transaction(async (tx) => {
      await tx.matter.update({ where: { id: matterId }, data: { state: MatterState.REFUND_REQUESTED } });
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.REFUND_PENDING } });
      return tx.refund.create({ data: { matterId, paymentId: payment.id, reason, amountMinor: payment.amountMinor, requestedBy: userId } });
    });
    await this.audit.record({ actorUserId: userId, matterId, action: "refund.requested", entityType: "Refund", entityId: refund.id, metadata: { reason } });
    return refund;
  }

  async processRefund(adminUserId: string, refundId: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
    if (!refund) throw new NotFoundException("Refund not found");
    if (refund.status === RefundStatus.SUCCESSFUL) return refund;
    if (!refund.payment.providerReference) throw new BadRequestException("Payment has no provider reference");
    const providerName = refund.payment.provider === DatabasePaymentProvider.PAYSTACK ? "paystack" : "flutterwave";
    await this.prisma.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.PROCESSING } });
    const result = await this.providers.get(providerName).refund({ providerReference: refund.payment.providerReference, amountMinor: refund.amountMinor, reason: refund.reason });
    const completed = await this.prisma.$transaction(async (tx) => {
      const value = await tx.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.SUCCESSFUL, providerReference: result.refundReference, processedAt: new Date() } });
      await tx.payment.update({ where: { id: refund.paymentId }, data: { status: PaymentStatus.REFUNDED } });
      await tx.matter.update({ where: { id: refund.matterId }, data: { state: MatterState.REFUNDED } });
      return value;
    });
    await this.audit.record({ actorUserId: adminUserId, matterId: refund.matterId, action: "refund.processed", entityType: "Refund", entityId: refund.id, metadata: { provider: providerName } });
    return completed;
  }
}
