-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'LAWYER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'PCM', 'HA', 'YO', 'IG');

-- CreateEnum
CREATE TYPE "TenancyRole" AS ENUM ('TENANT', 'LANDLORD');

-- CreateEnum
CREATE TYPE "JurisdictionStatus" AS ENUM ('DRAFT', 'INTAKE_ONLY', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "MatterState" AS ENUM ('INTAKE_DRAFT', 'AWAITING_CONFIRMATION', 'SUBMITTED', 'INTAKE_ONLY', 'MATCHING', 'LAWYER_SELECTED', 'CONFLICT_REVIEW', 'AWAITING_PAYMENT', 'ACTIVE', 'AWAITING_CLIENT', 'LAWYER_REVIEW', 'DELIVERED', 'CLOSED', 'CANCELLED', 'REASSIGNMENT_REQUESTED', 'REFUND_REQUESTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('STANDARD', 'URGENT', 'CRITICAL_HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ConflictDecision" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('OFFERED', 'SELECTED', 'REJECTED', 'EXPIRED', 'REPLACED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYSTACK', 'FLUTTERWAVE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('MOBILE', 'WEB', 'WHATSAPP', 'EMAIL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING_UPLOAD', 'QUARANTINED', 'SCANNING', 'AVAILABLE', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "AIRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'HUMAN_REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "HumanReviewStatus" AS ENUM ('OPEN', 'APPROVED', 'CORRECTED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "preferredLanguage" "Language" NOT NULL DEFAULT 'EN',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "governmentIdType" TEXT,
    "governmentIdRef" TEXT,
    "whatsappOptInAt" TIMESTAMP(3),
    "whatsappUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawyerProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "supremeCourtNumber" TEXT NOT NULL,
    "yearOfCall" INTEGER NOT NULL,
    "firmName" TEXT,
    "bio" TEXT NOT NULL,
    "languages" "Language"[],
    "stateCodes" TEXT[],
    "tenancyRoles" "TenancyRole"[],
    "urgentAvailable" BOOLEAN NOT NULL DEFAULT false,
    "acceptingNewMatters" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "qualityScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "responseScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lastShownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LawyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceName" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "channel" TEXT NOT NULL,
    "destinationHash" TEXT NOT NULL,
    "destinationEncrypted" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalCredential" (
    "id" UUID NOT NULL,
    "lawyerId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "licenceYear" INTEGER,
    "identifier" TEXT NOT NULL,
    "evidenceObjectKey" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationReview" (
    "id" UUID NOT NULL,
    "lawyerId" UUID NOT NULL,
    "reviewerUserId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "licenceYear" INTEGER NOT NULL,
    "status" "VerificationStatus" NOT NULL,
    "privateNote" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "VerificationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" UUID NOT NULL,
    "lawyerId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAccount" (
    "id" UUID NOT NULL,
    "lawyerId" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerSubaccountId" TEXT NOT NULL,
    "bankName" TEXT,
    "accountLast4" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jurisdiction" (
    "id" UUID NOT NULL,
    "countryCode" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "JurisdictionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Jurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JurisdictionVersion" (
    "id" UUID NOT NULL,
    "jurisdictionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "disclosures" JSONB NOT NULL,
    "retentionRules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JurisdictionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceDefinition" (
    "id" UUID NOT NULL,
    "jurisdictionVersionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenancyRole" "TenancyRole" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "slaHours" INTEGER NOT NULL DEFAULT 48,
    "platformShareBps" INTEGER NOT NULL DEFAULT 2000,
    "lawyerShareBps" INTEGER NOT NULL DEFAULT 8000,
    "feeBearer" TEXT NOT NULL DEFAULT 'lawyer',
    "eligibilityRules" JSONB NOT NULL,
    "evidenceRequirements" JSONB NOT NULL,
    "urgentRules" JSONB NOT NULL,
    "exclusions" JSONB NOT NULL,
    "matchingRules" JSONB NOT NULL,
    "assessmentTemplate" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" UUID NOT NULL,
    "serviceDefinitionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "schema" JSONB NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeSession" (
    "id" UUID NOT NULL,
    "clientUserId" UUID NOT NULL,
    "serviceDefinitionId" UUID NOT NULL,
    "workflowVersionId" UUID NOT NULL,
    "sourceChannel" "MessageChannel" NOT NULL,
    "language" "Language" NOT NULL,
    "tenancyRole" "TenancyRole" NOT NULL,
    "countryCode" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "localGovernmentArea" TEXT,
    "narrative" TEXT,
    "desiredOutcome" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "structuredSummary" JSONB,
    "summaryConfirmedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" UUID NOT NULL,
    "intakeSessionId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "phoneEncrypted" TEXT,
    "emailEncrypted" TEXT,
    "organization" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" UUID NOT NULL,
    "intakeSessionId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "matterId" UUID,
    "consentType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "evidence" JSONB NOT NULL,
    "ipHash" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matter" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "clientUserId" UUID NOT NULL,
    "intakeSessionId" UUID NOT NULL,
    "jurisdictionId" UUID NOT NULL,
    "serviceDefinitionId" UUID NOT NULL,
    "workflowVersionId" UUID NOT NULL,
    "state" "MatterState" NOT NULL DEFAULT 'INTAKE_DRAFT',
    "urgency" "UrgencyLevel" NOT NULL DEFAULT 'STANDARD',
    "urgencyReasons" TEXT[],
    "assignedLawyerId" UUID,
    "informationCompleteAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "slaStartedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Matter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrgencyAssessment" (
    "id" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "level" "UrgencyLevel" NOT NULL,
    "reasons" TEXT[],
    "source" TEXT NOT NULL,
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrgencyAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawyerMatch" (
    "id" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "lawyerId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "reasons" JSONB NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'OFFERED',
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "selectedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "LawyerMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictCheck" (
    "id" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "lawyerId" UUID NOT NULL,
    "decision" "ConflictDecision" NOT NULL DEFAULT 'PENDING',
    "reasonCode" TEXT,
    "privateNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ConflictCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "lawyerId" UUID NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "acceptedByClientAt" TIMESTAMP(3),
    "acceptedByLawyerAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "senderUserId" UUID,
    "channel" "MessageChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "messageId" UUID,
    "evidenceItemId" UUID,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'QUARANTINED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "lawyerId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "limitations" TEXT NOT NULL,
    "nextSteps" JSONB NOT NULL,
    "draftSource" TEXT NOT NULL,
    "lawyerAttestedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "internalReference" TEXT NOT NULL,
    "providerReference" TEXT,
    "checkoutUrl" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "platformShareBps" INTEGER NOT NULL,
    "lawyerShareBps" INTEGER NOT NULL,
    "feeBearer" TEXT NOT NULL,
    "lawyerSubaccountId" TEXT NOT NULL,
    "serviceVersion" INTEGER NOT NULL,
    "jurisdictionVersion" INTEGER NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "rawVerification" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSplit" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "grossAmountMinor" INTEGER NOT NULL,
    "providerFeeMinor" INTEGER,
    "platformAmountMinor" INTEGER,
    "lawyerAmountMinor" INTEGER,
    "calculatedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "raw" JSONB,

    CONSTRAINT "PaymentSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "providerReference" TEXT,
    "requestedBy" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" UUID NOT NULL,
    "paymentId" UUID,
    "provider" "PaymentProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRun" (
    "id" UUID NOT NULL,
    "intakeSessionId" UUID,
    "matterId" UUID,
    "evidenceItemId" UUID,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "safetyIdentifierHash" TEXT NOT NULL,
    "inputReferences" JSONB NOT NULL,
    "status" "AIRunStatus" NOT NULL DEFAULT 'QUEUED',
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "confidence" DECIMAL(5,4),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AIRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIOutput" (
    "id" UUID NOT NULL,
    "aiRunId" UUID NOT NULL,
    "outputType" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "clientConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanReview" (
    "id" UUID NOT NULL,
    "matterId" UUID,
    "aiRunId" UUID,
    "reviewerUserId" UUID,
    "reason" TEXT NOT NULL,
    "status" "HumanReviewStatus" NOT NULL DEFAULT 'OPEN',
    "correction" JSONB,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "HumanReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "matterId" UUID,
    "channel" "MessageChannel" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "complaint" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "matterId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "previousHash" TEXT,
    "eventHash" TEXT NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_userId_key" ON "ClientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_whatsappUserId_key" ON "ClientProfile"("whatsappUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LawyerProfile_userId_key" ON "LawyerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LawyerProfile_slug_key" ON "LawyerProfile"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LawyerProfile_supremeCourtNumber_key" ON "LawyerProfile"("supremeCourtNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_userId_key" ON "AdminRole"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthChallenge_destinationHash_purpose_createdAt_idx" ON "AuthChallenge"("destinationHash", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "ProfessionalCredential_lawyerId_status_idx" ON "ProfessionalCredential"("lawyerId", "status");

-- CreateIndex
CREATE INDEX "VerificationReview_lawyerId_reviewedAt_idx" ON "VerificationReview"("lawyerId", "reviewedAt");

-- CreateIndex
CREATE INDEX "Availability_lawyerId_startsAt_endsAt_idx" ON "Availability"("lawyerId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAccount_lawyerId_provider_key" ON "PayoutAccount"("lawyerId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Jurisdiction_countryCode_stateCode_key" ON "Jurisdiction"("countryCode", "stateCode");

-- CreateIndex
CREATE UNIQUE INDEX "JurisdictionVersion_jurisdictionId_version_key" ON "JurisdictionVersion"("jurisdictionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceDefinition_jurisdictionVersionId_code_version_key" ON "ServiceDefinition"("jurisdictionVersionId", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_serviceDefinitionId_version_key" ON "WorkflowVersion"("serviceDefinitionId", "version");

-- CreateIndex
CREATE INDEX "IntakeSession_clientUserId_createdAt_idx" ON "IntakeSession"("clientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Party_intakeSessionId_normalizedName_idx" ON "Party"("intakeSessionId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceItem_objectKey_key" ON "EvidenceItem"("objectKey");

-- CreateIndex
CREATE INDEX "EvidenceItem_intakeSessionId_status_idx" ON "EvidenceItem"("intakeSessionId", "status");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_consentType_acceptedAt_idx" ON "ConsentRecord"("userId", "consentType", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Matter_reference_key" ON "Matter"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Matter_intakeSessionId_key" ON "Matter"("intakeSessionId");

-- CreateIndex
CREATE INDEX "Matter_clientUserId_state_idx" ON "Matter"("clientUserId", "state");

-- CreateIndex
CREATE INDEX "Matter_assignedLawyerId_state_idx" ON "Matter"("assignedLawyerId", "state");

-- CreateIndex
CREATE INDEX "Matter_dueAt_state_idx" ON "Matter"("dueAt", "state");

-- CreateIndex
CREATE UNIQUE INDEX "UrgencyAssessment_matterId_key" ON "UrgencyAssessment"("matterId");

-- CreateIndex
CREATE INDEX "LawyerMatch_matterId_rank_idx" ON "LawyerMatch"("matterId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "LawyerMatch_matterId_lawyerId_key" ON "LawyerMatch"("matterId", "lawyerId");

-- CreateIndex
CREATE UNIQUE INDEX "ConflictCheck_matterId_lawyerId_key" ON "ConflictCheck"("matterId", "lawyerId");

-- CreateIndex
CREATE INDEX "Engagement_matterId_createdAt_idx" ON "Engagement"("matterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_providerMessageId_key" ON "Message"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_idempotencyKey_key" ON "Message"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Message_matterId_createdAt_idx" ON "Message"("matterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_objectKey_key" ON "Attachment"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_matterId_version_key" ON "Assessment"("matterId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_internalReference_key" ON "Payment"("internalReference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerReference_key" ON "Payment"("providerReference");

-- CreateIndex
CREATE INDEX "Payment_matterId_status_idx" ON "Payment"("matterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSplit_paymentId_key" ON "PaymentSplit"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "HumanReview_status_openedAt_idx" ON "HumanReview"("status", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_matterId_userId_key" ON "Feedback"("matterId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_eventHash_key" ON "AuditEvent"("eventHash");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_matterId_createdAt_idx" ON "AuditEvent"("matterId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawyerProfile" ADD CONSTRAINT "LawyerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRole" ADD CONSTRAINT "AdminRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalCredential" ADD CONSTRAINT "ProfessionalCredential_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationReview" ADD CONSTRAINT "VerificationReview_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JurisdictionVersion" ADD CONSTRAINT "JurisdictionVersion_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDefinition" ADD CONSTRAINT "ServiceDefinition_jurisdictionVersionId_fkey" FOREIGN KEY ("jurisdictionVersionId") REFERENCES "JurisdictionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_serviceDefinitionId_fkey" FOREIGN KEY ("serviceDefinitionId") REFERENCES "ServiceDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSession" ADD CONSTRAINT "IntakeSession_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSession" ADD CONSTRAINT "IntakeSession_serviceDefinitionId_fkey" FOREIGN KEY ("serviceDefinitionId") REFERENCES "ServiceDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSession" ADD CONSTRAINT "IntakeSession_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_intakeSessionId_fkey" FOREIGN KEY ("intakeSessionId") REFERENCES "IntakeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_intakeSessionId_fkey" FOREIGN KEY ("intakeSessionId") REFERENCES "IntakeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_assignedLawyerId_fkey" FOREIGN KEY ("assignedLawyerId") REFERENCES "LawyerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_intakeSessionId_fkey" FOREIGN KEY ("intakeSessionId") REFERENCES "IntakeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_serviceDefinitionId_fkey" FOREIGN KEY ("serviceDefinitionId") REFERENCES "ServiceDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UrgencyAssessment" ADD CONSTRAINT "UrgencyAssessment_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawyerMatch" ADD CONSTRAINT "LawyerMatch_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawyerMatch" ADD CONSTRAINT "LawyerMatch_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictCheck" ADD CONSTRAINT "ConflictCheck_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictCheck" ADD CONSTRAINT "ConflictCheck_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSplit" ADD CONSTRAINT "PaymentSplit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRun" ADD CONSTRAINT "AIRun_intakeSessionId_fkey" FOREIGN KEY ("intakeSessionId") REFERENCES "IntakeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRun" ADD CONSTRAINT "AIRun_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRun" ADD CONSTRAINT "AIRun_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIOutput" ADD CONSTRAINT "AIOutput_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AIRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AIRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
