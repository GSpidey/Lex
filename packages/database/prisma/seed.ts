import { createHash } from "node:crypto";
import { PrismaClient, ContentStatus, JurisdictionStatus, Language, PaymentProvider, TenancyRole, UserRole, UserStatus, VerificationStatus } from "@prisma/client";
import { LANDLORD_WORKFLOW, NIGERIA_STATES, TENANT_WORKFLOW } from "@lex/jurisdictions";

const prisma = new PrismaClient();

function contentHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function main() {
  for (const [stateCode, name] of NIGERIA_STATES) {
    await prisma.jurisdiction.upsert({
      where: { countryCode_stateCode: { countryCode: "NG", stateCode } },
      update: { name, status: stateCode === "LA" ? JurisdictionStatus.ACTIVE : JurisdictionStatus.INTAKE_ONLY },
      create: { countryCode: "NG", stateCode, name, status: stateCode === "LA" ? JurisdictionStatus.ACTIVE : JurisdictionStatus.INTAKE_ONLY },
    });
  }

  const lagos = await prisma.jurisdiction.findUniqueOrThrow({ where: { countryCode_stateCode: { countryCode: "NG", stateCode: "LA" } } });
  const version = await prisma.jurisdictionVersion.upsert({
    where: { jurisdictionId_version: { jurisdictionId: lagos.id, version: 1 } },
    update: {},
    create: {
      jurisdictionId: lagos.id,
      version: 1,
      status: ContentStatus.PUBLISHED,
      effectiveFrom: new Date(),
      approvedBy: "staging-seed-pending-legal-review",
      approvedAt: new Date(),
      contentHash: contentHash({ jurisdiction: "NG-LA", version: 1 }),
      disclosures: { en: TENANT_WORKFLOW.disclosure, reviewStatus: "draft_for_device_testing" },
      retentionRules: { matterYears: 7, intakeOnlyDays: 180, reviewStatus: "pending_partner_review" },
    },
  });

  for (const workflow of [TENANT_WORKFLOW, LANDLORD_WORKFLOW]) {
    const service = await prisma.serviceDefinition.upsert({
      where: { jurisdictionVersionId_code_version: { jurisdictionVersionId: version.id, code: workflow.code, version: workflow.version } },
      update: {},
      create: {
        jurisdictionVersionId: version.id,
        code: workflow.code,
        name: workflow.title,
        tenancyRole: workflow.tenancyRole === "tenant" ? TenancyRole.TENANT : TenancyRole.LANDLORD,
        version: workflow.version,
        status: ContentStatus.PUBLISHED,
        priceMinor: workflow.priceMinor,
        slaHours: workflow.slaHours,
        eligibilityRules: { adultsOnly: true, state: "LA" },
        evidenceRequirements: workflow.evidence,
        urgentRules: { answerKeys: workflow.urgentAnswerKeys },
        exclusions: ["criminal", "family", "land_title", "court_filing", "emergency_guarantee"],
        matchingRules: { shortlistMin: 3, shortlistMax: 5, noPaidRanking: true },
        assessmentTemplate: { sections: ["facts", "issues", "limitations", "next_steps"], lawyerAttestationRequired: true },
      },
    });
    await prisma.workflowVersion.upsert({
      where: { serviceDefinitionId_version: { serviceDefinitionId: service.id, version: workflow.version } },
      update: {},
      create: {
        serviceDefinitionId: service.id,
        version: workflow.version,
        status: ContentStatus.PUBLISHED,
        schema: { questions: workflow.questions },
        promptVersion: "intake-v1",
        consentVersion: "test-consent-v1",
        contentHash: contentHash(workflow),
        approvedBy: "staging-seed-pending-legal-review",
        approvedAt: new Date(),
        publishedAt: new Date(),
      },
    });
  }

  const admin = await prisma.user.upsert({
    where: { email: "admin@lex.test" },
    update: { mfaEnabled: false, mfaSecretEncrypted: null },
    create: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE, email: "admin@lex.test", emailVerifiedAt: new Date(), preferredLanguage: Language.EN, mfaEnabled: false },
  });
  await prisma.adminRole.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, permissions: ["lawyers:verify", "jurisdictions:publish", "matters:escalate", "payments:refund", "audits:read"] },
  });

  const lawyerSeeds = [
    { email: "amina@lex.test", name: "Amina Yusuf", slug: "amina-yusuf", scn: "SCN-LEX-001", languages: [Language.EN, Language.HA], urgent: true, quality: 94 },
    { email: "chidi@lex.test", name: "Chidi Okafor", slug: "chidi-okafor", scn: "SCN-LEX-002", languages: [Language.EN, Language.IG], urgent: false, quality: 91 },
    { email: "tola@lex.test", name: "Tola Adeyemi", slug: "tola-adeyemi", scn: "SCN-LEX-003", languages: [Language.EN, Language.YO], urgent: true, quality: 89 },
    { email: "bisi@lex.test", name: "Bisi Johnson", slug: "bisi-johnson", scn: "SCN-LEX-004", languages: [Language.EN, Language.PCM], urgent: false, quality: 87 },
    { email: "musa@lex.test", name: "Musa Ibrahim", slug: "musa-ibrahim", scn: "SCN-LEX-005", languages: [Language.EN, Language.HA, Language.PCM], urgent: true, quality: 86 },
  ];

  for (const seed of lawyerSeeds) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: { mfaEnabled: false, mfaSecretEncrypted: null },
      create: { role: UserRole.LAWYER, status: UserStatus.ACTIVE, email: seed.email, emailVerifiedAt: new Date(), preferredLanguage: Language.EN, mfaEnabled: false },
    });
    const lawyer = await prisma.lawyerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        displayName: seed.name,
        slug: seed.slug,
        supremeCourtNumber: seed.scn,
        yearOfCall: 2010,
        firmName: `${seed.name} Legal`,
        bio: "Verified staging lawyer profile for complete marketplace and device workflow testing.",
        languages: seed.languages,
        stateCodes: ["LA"],
        tenancyRoles: [TenancyRole.TENANT, TenancyRole.LANDLORD],
        urgentAvailable: seed.urgent,
        acceptingNewMatters: true,
        verificationStatus: VerificationStatus.VERIFIED,
        qualityScore: seed.quality,
        responseScore: seed.quality - 2,
      },
    });
    const licenceExpiresAt = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 31, 23, 59, 59));
    const credential = await prisma.professionalCredential.findFirst({ where: { lawyerId: lawyer.id, type: "NBA_PRACTISING_LICENCE", licenceYear: new Date().getUTCFullYear() } });
    if (credential) await prisma.professionalCredential.update({ where: { id: credential.id }, data: { status: VerificationStatus.VERIFIED, verifiedAt: new Date(), expiresAt: licenceExpiresAt } });
    else await prisma.professionalCredential.create({ data: { lawyerId: lawyer.id, type: "NBA_PRACTISING_LICENCE", licenceYear: new Date().getUTCFullYear(), identifier: seed.scn, status: VerificationStatus.VERIFIED, verifiedAt: new Date(), expiresAt: licenceExpiresAt } });
    const availability = await prisma.availability.findFirst({ where: { lawyerId: lawyer.id, endsAt: { gte: new Date() } } });
    if (!availability) await prisma.availability.create({ data: { lawyerId: lawyer.id, startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), endsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), urgent: seed.urgent, capacity: 20 } });
    for (const provider of [PaymentProvider.PAYSTACK, PaymentProvider.FLUTTERWAVE]) {
      await prisma.payoutAccount.upsert({
        where: { lawyerId_provider: { lawyerId: lawyer.id, provider } },
        update: {},
        create: {
          lawyerId: lawyer.id,
          provider,
          providerSubaccountId: `${provider.toLowerCase()}_test_${seed.slug}`,
          bankName: "Lex test bank",
          accountLast4: String(1000 + lawyerSeeds.indexOf(seed)).slice(-4),
          accountName: seed.name,
          verifiedAt: new Date(),
        },
      });
    }
  }

  const edgeSeeds = [
    { email: "rejected@lex.test", name: "Rejected Test Applicant", slug: "rejected-test", scn: "SCN-LEX-R01", status: VerificationStatus.REJECTED, available: true },
    { email: "expired@lex.test", name: "Expired Test Lawyer", slug: "expired-test", scn: "SCN-LEX-E01", status: VerificationStatus.EXPIRED, available: true },
    { email: "unavailable@lex.test", name: "Unavailable Test Lawyer", slug: "unavailable-test", scn: "SCN-LEX-U01", status: VerificationStatus.VERIFIED, available: false },
  ];
  for (const edge of edgeSeeds) {
    const user = await prisma.user.upsert({ where: { email: edge.email }, update: {}, create: { role: UserRole.LAWYER, status: UserStatus.ACTIVE, email: edge.email, emailVerifiedAt: new Date() } });
    const lawyer = await prisma.lawyerProfile.upsert({ where: { userId: user.id }, update: { verificationStatus: edge.status }, create: { userId: user.id, displayName: edge.name, slug: edge.slug, supremeCourtNumber: edge.scn, yearOfCall: 2015, bio: "Deliberate edge-case profile used to prove marketplace eligibility exclusions.", languages: [Language.EN], stateCodes: ["LA"], tenancyRoles: [TenancyRole.TENANT, TenancyRole.LANDLORD], verificationStatus: edge.status, acceptingNewMatters: true } });
    const credential = await prisma.professionalCredential.findFirst({ where: { lawyerId: lawyer.id, type: "NBA_PRACTISING_LICENCE" } });
    if (!credential) await prisma.professionalCredential.create({ data: { lawyerId: lawyer.id, type: "NBA_PRACTISING_LICENCE", licenceYear: new Date().getUTCFullYear() - (edge.status === VerificationStatus.EXPIRED ? 1 : 0), identifier: edge.scn, status: edge.status, verifiedAt: edge.status === VerificationStatus.VERIFIED ? new Date() : null, expiresAt: edge.status === VerificationStatus.EXPIRED ? new Date(Date.now() - 86_400_000) : new Date(Date.now() + 365 * 86_400_000) } });
    if (edge.available && !await prisma.availability.findFirst({ where: { lawyerId: lawyer.id } })) await prisma.availability.create({ data: { lawyerId: lawyer.id, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 30 * 86_400_000), capacity: 5 } });
  }

  for (let index = 1; index <= 52; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const email = `applicant${suffix}@lex.test`;
    const user = await prisma.user.upsert({ where: { email }, update: {}, create: { role: UserRole.LAWYER, status: UserStatus.PENDING, email, emailVerifiedAt: new Date() } });
    await prisma.lawyerProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, displayName: `Test Applicant ${suffix}`, slug: `test-applicant-${suffix}`, supremeCourtNumber: `SCN-APP-${suffix}`, yearOfCall: 2018, bio: "Pending internal applicant record for verification workflow load and pagination testing.", languages: [Language.EN], stateCodes: ["LA"], tenancyRoles: index % 2 ? [TenancyRole.TENANT] : [TenancyRole.LANDLORD], verificationStatus: VerificationStatus.PENDING } });
  }
}

main().finally(async () => prisma.$disconnect());
