import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Language, MatterState, MatchStatus, TenancyRole, VerificationStatus } from "@lex/database";
import { PrismaService } from "./prisma.service.js";
import { AuditService } from "./audit.service.js";

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async generate(matterId: string) {
    const matter = await this.prisma.matter.findUnique({ where: { id: matterId }, include: { intakeSession: true, jurisdiction: true } });
    if (!matter || matter.state !== MatterState.MATCHING) throw new BadRequestException("Matter is not ready for matching");
    const role = matter.intakeSession.tenancyRole;
    const requiresUrgent = matter.urgency !== "STANDARD";
    const now = new Date();
    const lawyers = await this.prisma.lawyerProfile.findMany({
      where: {
        verificationStatus: VerificationStatus.VERIFIED,
        acceptingNewMatters: true,
        stateCodes: { has: matter.jurisdiction.stateCode },
        tenancyRoles: { has: role },
        credentials: { some: { status: VerificationStatus.VERIFIED, expiresAt: { gt: now } } },
        availability: { some: { startsAt: { lte: now }, endsAt: { gte: now }, capacity: { gte: 1 } } },
        ...(requiresUrgent ? { urgentAvailable: true } : {}),
      },
      include: { user: true, availability: { where: { startsAt: { lte: now }, endsAt: { gte: now } } } },
    });
    const language = matter.intakeSession.language;
    const ranked = lawyers.filter((lawyer) => lawyer.user.status === "ACTIVE" && lawyer.availability.some((slot) => slot.bookedCount < slot.capacity)).map((lawyer) => ({
      lawyer,
      score: Number(lawyer.qualityScore) * 0.55 + Number(lawyer.responseScore) * 0.3 + (lawyer.languages.includes(language) ? 10 : 0) + (lawyer.urgentAvailable && requiresUrgent ? 5 : 0) - (lawyer.lastShownAt ? Math.max(0, 3 - (Date.now() - lawyer.lastShownAt.getTime()) / 86_400_000) : 0),
    })).sort((left, right) => right.score - left.score).slice(0, 5);
    await this.prisma.$transaction(async (tx) => {
      await tx.lawyerMatch.updateMany({ where: { matterId, status: MatchStatus.OFFERED }, data: { status: MatchStatus.REPLACED } });
      for (const [index, item] of ranked.entries()) {
        await tx.lawyerMatch.upsert({
          where: { matterId_lawyerId: { matterId, lawyerId: item.lawyer.id } },
          update: { rank: index + 1, score: item.score, status: MatchStatus.OFFERED, offeredAt: new Date(), reasons: { languageMatch: item.lawyer.languages.includes(language), urgentCapable: item.lawyer.urgentAvailable, noPaidRanking: true } },
          create: { matterId, lawyerId: item.lawyer.id, rank: index + 1, score: item.score, reasons: { languageMatch: item.lawyer.languages.includes(language), urgentCapable: item.lawyer.urgentAvailable, noPaidRanking: true } },
        });
        await tx.lawyerProfile.update({ where: { id: item.lawyer.id }, data: { lastShownAt: new Date() } });
      }
    });
    return this.list(matter.clientUserId, matterId);
  }

  async list(clientUserId: string, matterId: string) {
    const matter = await this.prisma.matter.findUnique({ where: { id: matterId } });
    if (!matter || matter.clientUserId !== clientUserId) throw new NotFoundException("Matter not found");
    return this.prisma.lawyerMatch.findMany({ where: { matterId, status: { in: [MatchStatus.OFFERED, MatchStatus.SELECTED] } }, orderBy: { rank: "asc" }, include: { lawyer: { select: { id: true, displayName: true, slug: true, firmName: true, bio: true, languages: true, yearOfCall: true, qualityScore: true, responseScore: true, urgentAvailable: true, verificationStatus: true } } } });
  }

  async select(clientUserId: string, matterId: string, lawyerId: string) {
    const matter = await this.prisma.matter.findUnique({ where: { id: matterId } });
    if (!matter || matter.clientUserId !== clientUserId) throw new NotFoundException("Matter not found");
    if (matter.state !== MatterState.MATCHING) throw new BadRequestException("Matter is not accepting lawyer selections");
    const match = await this.prisma.lawyerMatch.findUnique({ where: { matterId_lawyerId: { matterId, lawyerId } } });
    if (!match || match.status !== MatchStatus.OFFERED) throw new ForbiddenException("Lawyer is not in the eligible shortlist");
    await this.prisma.$transaction([
      this.prisma.lawyerMatch.updateMany({ where: { matterId }, data: { status: MatchStatus.REJECTED } }),
      this.prisma.lawyerMatch.update({ where: { id: match.id }, data: { status: MatchStatus.SELECTED, selectedAt: new Date() } }),
      this.prisma.conflictCheck.upsert({ where: { matterId_lawyerId: { matterId, lawyerId } }, update: { decision: "PENDING", requestedAt: new Date(), decidedAt: null }, create: { matterId, lawyerId } }),
      this.prisma.matter.update({ where: { id: matterId }, data: { state: MatterState.CONFLICT_REVIEW } }),
    ]);
    await this.audit.record({ actorUserId: clientUserId, matterId, action: "matching.lawyer_selected", entityType: "LawyerProfile", entityId: lawyerId });
    return { matterId, lawyerId, state: "conflict_review" };
  }
}
