import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MatterState, MessageChannel, MessageDirection, UserRole } from "@lex/database";
import { createMessageSchema } from "@lex/contracts";
import { PrismaService } from "./prisma.service.js";
import { AuditService } from "./audit.service.js";
import { MetaWhatsAppProvider } from "./meta.provider.js";
import type { AuthUser } from "./auth.guard.js";

@Injectable()
export class MatterService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly meta: MetaWhatsAppProvider) {}

  async list(user: AuthUser) {
    if (user.role === "CLIENT") return this.prisma.matter.findMany({ where: { clientUserId: user.id }, orderBy: { updatedAt: "desc" }, include: { jurisdiction: true, serviceDefinition: true, payments: { orderBy: { createdAt: "desc" }, take: 1 }, assessments: { orderBy: { version: "desc" }, take: 1 } } });
    if (user.role === "LAWYER") {
      const profile = await this.prisma.lawyerProfile.findUnique({ where: { userId: user.id } });
      if (!profile) return [];
      return this.prisma.matter.findMany({ where: { OR: [{ assignedLawyerId: profile.id }, { conflictChecks: { some: { lawyerId: profile.id } } }] }, orderBy: { updatedAt: "desc" }, include: { jurisdiction: true, serviceDefinition: true, intakeSession: true } });
    }
    return this.prisma.matter.findMany({ orderBy: { updatedAt: "desc" }, take: 200, include: { jurisdiction: true, serviceDefinition: true, client: { select: { id: true, email: true, phone: true } } } });
  }

  async get(user: AuthUser, matterId: string) {
    await this.assertAccess(user, matterId);
    return this.prisma.matter.findUniqueOrThrow({ where: { id: matterId }, include: {
      jurisdiction: true, serviceDefinition: true, workflowVersion: true,
      intakeSession: { include: { parties: true, evidence: true } },
      matches: { include: { lawyer: true }, orderBy: { rank: "asc" } }, conflictChecks: true,
      engagements: true, messages: { include: { attachments: true }, orderBy: { createdAt: "asc" } },
      payments: { include: { split: true, refunds: true }, orderBy: { createdAt: "desc" } }, assessments: { orderBy: { version: "desc" } }, urgencyAssessment: true,
    } });
  }

  async message(user: AuthUser, matterId: string, raw: unknown) {
    await this.assertAccess(user, matterId);
    const input = createMessageSchema.parse(raw);
    const message = await this.prisma.message.create({ data: {
      matterId,
      senderUserId: user.id,
      channel: input.channel.toUpperCase() as MessageChannel,
      direction: user.role === "CLIENT" ? MessageDirection.INBOUND : MessageDirection.OUTBOUND,
      body: input.body,
      idempotencyKey: randomUUID(),
      sentAt: new Date(),
    } });
    if (user.role !== "CLIENT") {
      const matter = await this.prisma.matter.findUniqueOrThrow({ where: { id: matterId }, include: { client: { include: { clientProfile: true } } } });
      const recipient = matter.client.clientProfile?.whatsappUserId ?? matter.client.phone;
      if (recipient && input.channel === "whatsapp") {
        const sent = await this.meta.send({ recipient, body: input.body, idempotencyKey: message.idempotencyKey });
        await this.prisma.message.update({ where: { id: message.id }, data: { providerMessageId: sent.providerMessageId } });
      }
    }
    await this.audit.record({ actorUserId: user.id, matterId, action: "matter.message_created", entityType: "Message", entityId: message.id, metadata: { channel: input.channel } });
    return message;
  }

  async requestReassignment(clientUserId: string, matterId: string, reason: string) {
    const matter = await this.prisma.matter.findUnique({ where: { id: matterId } });
    if (!matter || matter.clientUserId !== clientUserId) throw new NotFoundException("Matter not found");
    const reassignableStates: MatterState[] = [MatterState.ACTIVE, MatterState.AWAITING_CLIENT, MatterState.LAWYER_REVIEW, MatterState.DELIVERED];
    if (!reassignableStates.includes(matter.state)) throw new BadRequestException("Matter cannot be reassigned in its current state");
    await this.prisma.$transaction([
      this.prisma.matter.update({ where: { id: matterId }, data: { state: MatterState.REASSIGNMENT_REQUESTED } }),
      this.prisma.humanReview.create({ data: { matterId, reason: `reassignment:${reason}` } }),
    ]);
    await this.audit.record({ actorUserId: clientUserId, matterId, action: "matter.reassignment_requested", entityType: "Matter", entityId: matterId, metadata: { reason } });
    return { state: "reassignment_requested" };
  }

  async challengeRouting(clientUserId: string, matterId: string, reason: string) {
    const matter = await this.prisma.matter.findUnique({ where: { id: matterId } });
    if (!matter || matter.clientUserId !== clientUserId) throw new NotFoundException("Matter not found");
    const review = await this.prisma.humanReview.create({ data: { matterId, reason: `automated_routing_challenge:${reason}` } });
    await this.audit.record({ actorUserId: clientUserId, matterId, action: "privacy.routing_challenged", entityType: "HumanReview", entityId: review.id });
    return review;
  }

  async exportUserData(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { clientProfile: true, consentRecords: true, intakeSessions: { include: { parties: true, evidence: true } }, clientMatters: { include: { messages: true, assessments: true, payments: true } }, sessions: { select: { id: true, deviceName: true, expiresAt: true, revokedAt: true, createdAt: true } } } });
  }

  async requestDeletion(userId: string, reason: string) {
    const review = await this.prisma.humanReview.create({ data: { reason: `data_deletion_request:user=${userId}:${reason}` } });
    await this.audit.record({ actorUserId: userId, action: "privacy.deletion_requested", entityType: "HumanReview", entityId: review.id });
    return { requestId: review.id, status: "open" };
  }

  private async assertAccess(user: AuthUser, matterId: string) {
    const matter = await this.prisma.matter.findUnique({ where: { id: matterId } });
    if (!matter) throw new NotFoundException("Matter not found");
    if (["ADMIN", "SUPER_ADMIN"].includes(user.role)) return;
    if (user.role === "CLIENT" && matter.clientUserId === user.id) return;
    if (user.role === "LAWYER") {
      const profile = await this.prisma.lawyerProfile.findUnique({ where: { userId: user.id } });
      if (profile && (matter.assignedLawyerId === profile.id || await this.prisma.conflictCheck.count({ where: { matterId, lawyerId: profile.id } }))) return;
    }
    throw new ForbiddenException("Matter is outside your authorized scope");
  }
}
