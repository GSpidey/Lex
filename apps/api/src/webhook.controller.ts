import { createHash, randomUUID } from "node:crypto";
import { Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Post, Query, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { MessageChannel, MessageDirection, PaymentProvider, UserRole, UserStatus } from "@lex/database";
import type { Request } from "express";
import { PrismaService } from "./prisma.service.js";
import { MetaWhatsAppProvider } from "./meta.provider.js";
import { PaymentProviderRegistry } from "./payment.providers.js";
import { PaymentService } from "./payment.service.js";

type RawRequest = Request & { rawBody?: Buffer };

interface MetaMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  audio?: { id?: string; mime_type?: string; voice?: boolean };
}

interface MetaStatus { id?: string; status?: string; timestamp?: string; errors?: Array<{ title?: string }> }

@ApiExcludeController()
@Controller("webhooks")
export class WebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaWhatsAppProvider,
    private readonly providerRegistry: PaymentProviderRegistry,
    private readonly payments: PaymentService,
  ) {}

  @Get("meta")
  verifyMeta(@Query("hub.mode") mode?: string, @Query("hub.verify_token") token?: string, @Query("hub.challenge") challenge?: string) {
    const result = this.meta.verifyChallenge(mode, token, challenge);
    if (!result) throw new HttpException("Invalid Meta verification challenge", HttpStatus.FORBIDDEN);
    return result;
  }

  @Post("meta")
  @HttpCode(200)
  async metaEvent(@Req() request: RawRequest, @Headers("x-hub-signature-256") signature: string | undefined, @Body() payload: unknown) {
    const raw = request.rawBody ?? Buffer.from(JSON.stringify(payload));
    if (!this.meta.verifyWebhook(raw, signature)) throw new HttpException("Invalid webhook signature", HttpStatus.UNAUTHORIZED);
    const entries = (payload as { entry?: Array<{ changes?: Array<{ value?: { messages?: MetaMessage[]; statuses?: MetaStatus[] } }> }> }).entry ?? [];
    for (const entry of entries) for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) await this.applyMetaStatus(status);
      for (const message of change.value?.messages ?? []) await this.applyMetaMessage(message);
    }
    return { received: true };
  }

  @Post("paystack")
  @HttpCode(200)
  paystack(@Req() request: RawRequest, @Headers() headers: Record<string, string | string[] | undefined>, @Body() payload: unknown) {
    return this.applyPaymentWebhook("paystack", request.rawBody ?? Buffer.from(JSON.stringify(payload)), headers, payload);
  }

  @Post("flutterwave")
  @HttpCode(200)
  flutterwave(@Req() request: RawRequest, @Headers() headers: Record<string, string | string[] | undefined>, @Body() payload: unknown) {
    return this.applyPaymentWebhook("flutterwave", request.rawBody ?? Buffer.from(JSON.stringify(payload)), headers, payload);
  }

  private async applyPaymentWebhook(providerName: "paystack" | "flutterwave", raw: Buffer, headers: Record<string, string | string[] | undefined>, payload: unknown) {
    const signatureValid = this.providerRegistry.get(providerName).verifyWebhook(raw, headers);
    if (!signatureValid) throw new HttpException("Invalid webhook signature", HttpStatus.UNAUTHORIZED);
    const body = payload as { event?: string; id?: string | number; data?: { id?: string | number; reference?: string; tx_ref?: string } };
    const providerReference = providerName === "paystack" ? body.data?.reference : body.data?.tx_ref;
    const eventType = body.event ?? "unknown";
    const payloadHash = createHash("sha256").update(raw).digest("hex");
    const providerEventId = String(body.id ?? body.data?.id ?? `${eventType}:${providerReference ?? payloadHash}`);
    const provider = providerName === "paystack" ? PaymentProvider.PAYSTACK : PaymentProvider.FLUTTERWAVE;
    const payment = providerReference ? await this.prisma.payment.findFirst({ where: { OR: [{ providerReference }, { internalReference: providerReference }] } }) : null;
    const prior = await this.prisma.paymentWebhookEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId } } });
    if (prior?.processedAt) return { received: true, duplicate: true };
    const event = prior ?? await this.prisma.paymentWebhookEvent.create({ data: { paymentId: payment?.id, provider, providerEventId, eventType, signatureValid, payloadHash, rawPayload: payload as object } });
    try {
      if (payment && ["charge.success", "payment.completed", "transfer.completed"].includes(eventType)) await this.payments.verifyAndComplete(payment.id);
      await this.prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), processingError: null } });
    } catch (error) {
      await this.prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processingError: error instanceof Error ? error.message : "unknown" } });
      throw error;
    }
    return { received: true };
  }

  private async applyMetaStatus(status: MetaStatus) {
    if (!status.id) return;
    const timestamp = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
    if (status.status === "delivered") await this.prisma.message.updateMany({ where: { providerMessageId: status.id }, data: { deliveredAt: timestamp } });
    if (status.status === "read") await this.prisma.message.updateMany({ where: { providerMessageId: status.id }, data: { readAt: timestamp } });
    if (status.status === "failed") await this.prisma.message.updateMany({ where: { providerMessageId: status.id }, data: { failedAt: timestamp, failureReason: status.errors?.[0]?.title ?? "provider_failure" } });
  }

  private async applyMetaMessage(message: MetaMessage) {
    if (!message.id || !message.from) return;
    if (await this.prisma.message.findUnique({ where: { providerMessageId: message.id } })) return;
    const phone = message.from.startsWith("+") ? message.from : `+${message.from}`;
    let client = await this.prisma.clientProfile.findUnique({ where: { whatsappUserId: message.from }, include: { user: true } });
    if (!client) {
      const user = await this.prisma.user.upsert({ where: { phone }, update: { phoneVerifiedAt: new Date() }, create: { phone, phoneVerifiedAt: new Date(), role: UserRole.CLIENT, status: UserStatus.ACTIVE } });
      client = await this.prisma.clientProfile.upsert({ where: { userId: user.id }, update: { whatsappUserId: message.from, whatsappOptInAt: new Date() }, create: { userId: user.id, whatsappUserId: message.from, whatsappOptInAt: new Date() }, include: { user: true } });
    }
    const matter = await this.prisma.matter.findFirst({ where: { clientUserId: client.userId, state: { notIn: ["CLOSED", "CANCELLED", "REFUNDED"] } }, orderBy: { updatedAt: "desc" } });
    const body = message.text?.body ?? message.image?.caption ?? message.document?.caption ?? `[${message.type ?? "media"} received]`;
    if (matter) {
      await this.prisma.message.create({ data: { matterId: matter.id, senderUserId: client.userId, channel: MessageChannel.WHATSAPP, direction: MessageDirection.INBOUND, body, providerMessageId: message.id, idempotencyKey: `meta:${message.id}`, sentAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date() } });
    }
    await this.meta.markRead(message.id);
    if (!matter) {
      await this.meta.send({ recipient: message.from, body: "Welcome to Lex. Reply START to begin a private tenancy intake. Lex does not provide emergency services or automated legal advice.", idempotencyKey: `welcome:${message.id}` });
    }
  }
}
