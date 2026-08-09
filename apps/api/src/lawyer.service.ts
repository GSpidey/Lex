import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Language, MatterState, MatchStatus, TenancyRole, UserRole, UserStatus, VerificationStatus } from "@lex/database";
import { assessmentSchema, conflictDecisionSchema, lawyerApplicationSchema, structuredIntakeSchema, type SupportedLanguage } from "@lex/contracts";
import { PrismaService } from "./prisma.service.js";
import { AuditService } from "./audit.service.js";
import { OpenAIProviderService } from "./openai.provider.js";

const languageMap: Record<SupportedLanguage, Language> = { en: Language.EN, pcm: Language.PCM, ha: Language.HA, yo: Language.YO, ig: Language.IG };

@Injectable()
export class LawyerService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly ai: OpenAIProviderService) {}

  async apply(userId: string, raw: unknown) {
    const input = lawyerApplicationSchema.parse(raw);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const slugBase = input.displayName.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
    const slug = `${slugBase}-${input.supremeCourtNumber.toLowerCase().replace(/[^a-z0-9]+/gu, "").slice(-6)}`;
    const profile = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { role: UserRole.LAWYER, status: UserStatus.ACTIVE, email: input.email, phone: input.phone } });
      return tx.lawyerProfile.upsert({
        where: { userId },
        update: { displayName: input.displayName, supremeCourtNumber: input.supremeCourtNumber, yearOfCall: input.yearOfCall, firmName: input.firmName, bio: input.bio, languages: input.languages.map((value) => languageMap[value]), stateCodes: input.stateCodes.map((value) => value.toUpperCase()), tenancyRoles: input.tenancyRoles.map((value) => value === "tenant" ? TenancyRole.TENANT : TenancyRole.LANDLORD), urgentAvailable: input.urgentAvailable, verificationStatus: VerificationStatus.PENDING },
        create: { userId, displayName: input.displayName, slug, supremeCourtNumber: input.supremeCourtNumber, yearOfCall: input.yearOfCall, firmName: input.firmName, bio: input.bio, languages: input.languages.map((value) => languageMap[value]), stateCodes: input.stateCodes.map((value) => value.toUpperCase()), tenancyRoles: input.tenancyRoles.map((value) => value === "tenant" ? TenancyRole.TENANT : TenancyRole.LANDLORD), urgentAvailable: input.urgentAvailable },
      });
    });
    await this.audit.record({ actorUserId: user.id, action: "lawyer.application_submitted", entityType: "LawyerProfile", entityId: profile.id });
    return profile;
  }

  async profile(userId: string) { return this.prisma.lawyerProfile.findUnique({ where: { userId }, include: { credentials: true, verificationReviews: true, payoutAccounts: true, availability: { where: { endsAt: { gte: new Date() } } } } }); }

  async conflict(userId: string, matterId: string, raw: unknown) {
    const input = conflictDecisionSchema.parse(raw);
    const lawyer = await this.prisma.lawyerProfile.findUnique({ where: { userId } });
    if (!lawyer || lawyer.verificationStatus !== VerificationStatus.VERIFIED) throw new ForbiddenException("Verified lawyer profile required");
    const check = await this.prisma.conflictCheck.findUnique({ where: { matterId_lawyerId: { matterId, lawyerId: lawyer.id } }, include: { matter: true } });
    if (!check || check.decision !== "PENDING") throw new NotFoundException("Pending conflict check not found");
    const accepted = input.decision === "accepted";
    await this.prisma.$transaction(async (tx) => {
      await tx.conflictCheck.update({ where: { id: check.id }, data: { decision: accepted ? "ACCEPTED" : "DECLINED", reasonCode: input.reasonCode, privateNote: input.privateNote, decidedAt: new Date() } });
      if (accepted) {
        await tx.matter.update({ where: { id: matterId }, data: { assignedLawyerId: lawyer.id, state: MatterState.AWAITING_PAYMENT } });
        await tx.engagement.create({ data: { matterId, lawyerId: lawyer.id, termsVersion: "test-engagement-v1", acceptedByLawyerAt: new Date() } });
      } else {
        await tx.lawyerMatch.update({ where: { matterId_lawyerId: { matterId, lawyerId: lawyer.id } }, data: { status: MatchStatus.REJECTED } });
        await tx.matter.update({ where: { id: matterId }, data: { state: MatterState.MATCHING } });
      }
    });
    await this.audit.record({ actorUserId: userId, matterId, action: `lawyer.conflict_${input.decision}`, entityType: "ConflictCheck", entityId: check.id, metadata: { reasonCode: input.reasonCode } });
    return { matterId, decision: input.decision, state: accepted ? "awaiting_payment" : "matching" };
  }

  async aiDraft(userId: string, matterId: string, instructions: string) {
    const lawyer = await this.prisma.lawyerProfile.findUnique({ where: { userId } });
    const matter = lawyer ? await this.prisma.matter.findFirst({ where: { id: matterId, assignedLawyerId: lawyer.id }, include: { intakeSession: true } }) : null;
    if (!matter?.intakeSession.structuredSummary) throw new NotFoundException("Assigned matter with confirmed summary not found");
    const confirmedFacts = structuredIntakeSchema.parse(matter.intakeSession.structuredSummary);
    const result = await this.ai.draftAssessment({ matterId, confirmedFacts, lawyerInstructions: instructions });
    await this.prisma.aIRun.create({ data: { matterId, purpose: "assessment_draft", provider: this.ai.configured ? "openai" : "local-deterministic", model: result.model, promptVersion: "assessment-draft-v1", schemaVersion: "text-v1", safetyIdentifierHash: matterId, inputReferences: { matterId }, status: "SUCCEEDED", completedAt: new Date(), outputs: { create: { outputType: "assessment_draft", content: { draft: result.draft }, contentHash: matterId } } } });
    return result;
  }

  async deliverAssessment(userId: string, matterId: string, raw: unknown) {
    const input = assessmentSchema.parse(raw);
    const lawyer = await this.prisma.lawyerProfile.findUnique({ where: { userId } });
    const matter = lawyer ? await this.prisma.matter.findFirst({ where: { id: matterId, assignedLawyerId: lawyer.id } }) : null;
    const deliverableStates: MatterState[] = [MatterState.ACTIVE, MatterState.LAWYER_REVIEW, MatterState.AWAITING_CLIENT];
    if (!matter || !deliverableStates.includes(matter.state)) throw new BadRequestException("Matter is not ready for assessment delivery");
    const last = await this.prisma.assessment.findFirst({ where: { matterId }, orderBy: { version: "desc" } });
    const now = new Date();
    const assessment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assessment.create({ data: { matterId, lawyerId: lawyer!.id, version: (last?.version ?? 0) + 1, title: input.title, body: input.body, limitations: input.limitations, nextSteps: input.nextSteps, draftSource: "lawyer_final", lawyerAttestedAt: now, deliveredAt: now } });
      await tx.matter.update({ where: { id: matterId }, data: { state: MatterState.DELIVERED, deliveredAt: now } });
      return created;
    });
    await this.audit.record({ actorUserId: userId, matterId, action: "assessment.delivered", entityType: "Assessment", entityId: assessment.id, metadata: { lawyerAttested: true } });
    return assessment;
  }
}
