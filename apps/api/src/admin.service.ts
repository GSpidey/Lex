import { createHash } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AttachmentStatus, ContentStatus, HumanReviewStatus, VerificationStatus } from "@lex/database";
import { PrismaService } from "./prisma.service.js";
import { AuditService } from "./audit.service.js";
import { PaymentService } from "./payment.service.js";

export interface LawyerReviewInput {
  decision?: "verified" | "rejected";
  source?: string;
  evidenceReference?: string;
  licenceYear?: number;
  expiresAt?: string;
  privateNote?: string;
}

export interface WorkflowDraftInput {
  schema?: unknown;
  promptVersion?: string;
  consentVersion?: string;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly payments: PaymentService) {}

  lawyers(status?: string) {
    const verificationStatus = status?.toUpperCase() as VerificationStatus | undefined;
    return this.prisma.lawyerProfile.findMany({
      where: verificationStatus ? { verificationStatus } : undefined,
      include: { user: { select: { email: true, phone: true, mfaEnabled: true } }, credentials: true, verificationReviews: { orderBy: { reviewedAt: "desc" }, take: 3 }, payoutAccounts: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async reviewLawyer(adminUserId: string, lawyerId: string, input: LawyerReviewInput) {
    if (!input.decision || !input.source || !input.evidenceReference || !input.licenceYear) throw new BadRequestException("Decision, verification source, evidence reference, and licence year are required");
    const lawyer = await this.prisma.lawyerProfile.findUnique({ where: { id: lawyerId } });
    if (!lawyer) throw new NotFoundException("Lawyer application not found");
    const status = input.decision === "verified" ? VerificationStatus.VERIFIED : VerificationStatus.REJECTED;
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.UTC(input.licenceYear + 1, 0, 31, 23, 59, 59));
    const result = await this.prisma.$transaction(async (tx) => {
      const review = await tx.verificationReview.create({ data: { lawyerId, reviewerUserId: adminUserId, source: input.source!, evidenceReference: input.evidenceReference!, licenceYear: input.licenceYear!, status, privateNote: input.privateNote, expiresAt } });
      await tx.lawyerProfile.update({ where: { id: lawyerId }, data: { verificationStatus: status } });
      const existing = await tx.professionalCredential.findFirst({ where: { lawyerId, type: "NBA_PRACTISING_LICENCE", licenceYear: input.licenceYear } });
      if (existing) {
        await tx.professionalCredential.update({ where: { id: existing.id }, data: { status, verifiedAt: status === VerificationStatus.VERIFIED ? new Date() : null, expiresAt } });
      } else {
        await tx.professionalCredential.create({ data: { lawyerId, type: "NBA_PRACTISING_LICENCE", licenceYear: input.licenceYear!, identifier: lawyer.supremeCourtNumber, status, verifiedAt: status === VerificationStatus.VERIFIED ? new Date() : null, expiresAt } });
      }
      return review;
    });
    await this.audit.record({ actorUserId: adminUserId, action: `lawyer.verification_${input.decision}`, entityType: "LawyerProfile", entityId: lawyerId, metadata: { source: input.source, licenceYear: input.licenceYear, expiresAt } });
    return result;
  }

  jurisdictions() {
    return this.prisma.jurisdiction.findMany({ include: { versions: { include: { services: { include: { workflows: true } } }, orderBy: { version: "desc" } } }, orderBy: [{ countryCode: "asc" }, { name: "asc" }] });
  }

  async createWorkflowDraft(adminUserId: string, serviceId: string, input: WorkflowDraftInput) {
    if (!input.schema || !input.promptVersion || !input.consentVersion) throw new BadRequestException("Schema, prompt version, and consent version are required");
    const service = await this.prisma.serviceDefinition.findUnique({ where: { id: serviceId }, include: { workflows: { orderBy: { version: "desc" }, take: 1 } } });
    if (!service) throw new NotFoundException("Service definition not found");
    const version = (service.workflows[0]?.version ?? 0) + 1;
    const contentHash = createHash("sha256").update(JSON.stringify(input.schema)).digest("hex");
    const workflow = await this.prisma.workflowVersion.create({ data: { serviceDefinitionId: serviceId, version, status: ContentStatus.DRAFT, schema: input.schema as object, promptVersion: input.promptVersion, consentVersion: input.consentVersion, contentHash } });
    await this.audit.record({ actorUserId: adminUserId, action: "workflow.draft_created", entityType: "WorkflowVersion", entityId: workflow.id, metadata: { serviceId, version } });
    return workflow;
  }

  async publishWorkflow(adminUserId: string, workflowId: string, approverName: string, confirmation: boolean) {
    if (!confirmation || !approverName.trim()) throw new BadRequestException("Explicit lawyer-partner approval and approver name are required");
    const workflow = await this.prisma.workflowVersion.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new NotFoundException("Workflow not found");
    const publishable: ContentStatus[] = [ContentStatus.DRAFT, ContentStatus.IN_REVIEW, ContentStatus.APPROVED];
    if (!publishable.includes(workflow.status)) throw new BadRequestException("Workflow cannot be published from its current state");
    const now = new Date();
    const published = await this.prisma.$transaction(async (tx) => {
      await tx.workflowVersion.updateMany({ where: { serviceDefinitionId: workflow.serviceDefinitionId, status: ContentStatus.PUBLISHED }, data: { status: ContentStatus.RETIRED, retiredAt: now } });
      return tx.workflowVersion.update({ where: { id: workflowId }, data: { status: ContentStatus.PUBLISHED, approvedBy: approverName, approvedAt: now, publishedAt: now } });
    });
    await this.audit.record({ actorUserId: adminUserId, action: "workflow.published", entityType: "WorkflowVersion", entityId: workflowId, metadata: { approverName } });
    return published;
  }

  reviews(status = HumanReviewStatus.OPEN) { return this.prisma.humanReview.findMany({ where: { status }, include: { matter: true, aiRun: true }, orderBy: { openedAt: "asc" } }); }

  async resolveReview(adminUserId: string, reviewId: string, resolution: "approved" | "corrected" | "rejected", correction?: unknown) {
    const status = resolution === "approved" ? HumanReviewStatus.APPROVED : resolution === "corrected" ? HumanReviewStatus.CORRECTED : HumanReviewStatus.REJECTED;
    const review = await this.prisma.humanReview.update({ where: { id: reviewId }, data: { reviewerUserId: adminUserId, status, correction: correction as object | undefined, resolvedAt: new Date() } });
    await this.audit.record({ actorUserId: adminUserId, matterId: review.matterId ?? undefined, action: `human_review.${resolution}`, entityType: "HumanReview", entityId: review.id });
    return review;
  }

  async reviewEvidence(adminUserId: string, evidenceId: string, accepted: boolean, reason?: string) {
    const evidence = await this.prisma.evidenceItem.update({ where: { id: evidenceId }, data: { status: accepted ? AttachmentStatus.AVAILABLE : AttachmentStatus.REJECTED, rejectionReason: accepted ? null : reason ?? "upload_rejected" } });
    await this.audit.record({ actorUserId: adminUserId, action: accepted ? "evidence.approved" : "evidence.rejected", entityType: "EvidenceItem", entityId: evidence.id });
    return evidence;
  }

  auditEvents() { return this.prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 500 }); }
  processRefund(adminUserId: string, refundId: string) { return this.payments.processRefund(adminUserId, refundId); }
}
