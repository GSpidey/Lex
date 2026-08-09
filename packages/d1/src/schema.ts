import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    role: text("role", {
      enum: ["client", "lawyer", "admin", "super_admin"],
    }).notNull(),
    status: text("status", { enum: ["active", "suspended", "deleted"] })
      .notNull()
      .default("active"),
    phoneEncrypted: text("phone_encrypted"),
    phoneHash: text("phone_hash"),
    phoneVerifiedAt: text("phone_verified_at"),
    emailEncrypted: text("email_encrypted"),
    emailHash: text("email_hash"),
    emailVerifiedAt: text("email_verified_at"),
    preferredLanguage: text("preferred_language", { enum: ["en", "pcm"] })
      .notNull()
      .default("en"),
    mfaEnabled: integer("mfa_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    mfaSecretEncrypted: text("mfa_secret_encrypted"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_phone_hash_uq").on(table.phoneHash),
    uniqueIndex("users_email_hash_uq").on(table.emailHash),
  ],
);

export const authChallenges = sqliteTable(
  "auth_challenges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    channel: text("channel", { enum: ["whatsapp", "email"] }).notNull(),
    purpose: text("purpose").notNull(),
    destinationHash: text("destination_hash").notNull(),
    destinationEncrypted: text("destination_encrypted").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    supersededAt: text("superseded_at"),
    requestIpHash: text("request_ip_hash"),
    deviceHash: text("device_hash"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("auth_destination_created_idx").on(
      table.destinationHash,
      table.createdAt,
    ),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull(),
    userId: text("user_id").notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    deviceName: text("device_name"),
    deviceHash: text("device_hash"),
    expiresAt: text("expires_at").notNull(),
    refreshExpiresAt: text("refresh_expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("sessions_challenge_uq").on(table.challengeId),
    uniqueIndex("sessions_access_token_uq").on(table.accessTokenHash),
    uniqueIndex("sessions_refresh_token_uq").on(table.refreshTokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const notificationPreferences = sqliteTable("notification_preferences", {
  userId: text("user_id").primaryKey(),
  whatsapp: integer("whatsapp", { mode: "boolean" }).notNull().default(true),
  push: integer("push", { mode: "boolean" }).notNull().default(false),
  email: integer("email", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
});

export const preAuthTokens = sqliteTable(
  "pre_auth_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    challengeId: text("challenge_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose", { enum: ["mfa_setup", "mfa_verify"] }).notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("preauth_token_uq").on(table.tokenHash)],
);

export const pushDevices = sqliteTable(
  "push_devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenEncrypted: text("token_encrypted").notNull(),
    platform: text("platform").notNull(),
    consentAt: text("consent_at").notNull(),
    revokedAt: text("revoked_at"),
    ...timestamps,
  },
  (table) => [uniqueIndex("push_token_uq").on(table.tokenHash)],
);

export const workflows = sqliteTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    countryCode: text("country_code").notNull(),
    stateCode: text("state_code").notNull(),
    serviceCode: text("service_code").notNull(),
    tenancyRole: text("tenancy_role", {
      enum: ["tenant", "landlord"],
    }).notNull(),
    version: integer("version").notNull(),
    status: text("status", {
      enum: ["draft", "review", "approved", "published", "retired"],
    }).notNull(),
    authoritativeLanguage: text("authoritative_language")
      .notNull()
      .default("en"),
    definitionJson: text("definition_json").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    effectiveAt: text("effective_at"),
    retiredAt: text("retired_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workflow_version_uq").on(
      table.countryCode,
      table.stateCode,
      table.serviceCode,
      table.tenancyRole,
      table.version,
    ),
  ],
);

export const intakes = sqliteTable(
  "intakes",
  {
    id: text("id").primaryKey(),
    clientUserId: text("client_user_id").notNull(),
    language: text("language", { enum: ["en", "pcm"] }).notNull(),
    tenancyRole: text("tenancy_role", {
      enum: ["tenant", "landlord"],
    }).notNull(),
    countryCode: text("country_code").notNull(),
    stateCode: text("state_code").notNull(),
    sourceChannel: text("source_channel").notNull(),
    workflowId: text("workflow_id").notNull(),
    state: text("state").notNull().default("draft"),
    narrative: text("narrative"),
    desiredOutcome: text("desired_outcome"),
    structuredSummaryJson: text("structured_summary_json"),
    summaryVersion: integer("summary_version"),
    confirmedAt: text("confirmed_at"),
    submittedAt: text("submitted_at"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [index("intakes_client_idx").on(table.clientUserId)],
);

export const intakeAnswers = sqliteTable(
  "intake_answers",
  {
    intakeId: text("intake_id").notNull(),
    questionKey: text("question_key").notNull(),
    valueJson: text("value_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.intakeId, table.questionKey] })],
);

export const consentRecords = sqliteTable("consent_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  intakeId: text("intake_id"),
  consentType: text("consent_type").notNull(),
  contentVersion: text("content_version").notNull(),
  language: text("language").notNull(),
  accepted: integer("accepted", { mode: "boolean" }).notNull(),
  recordedAt: text("recorded_at").notNull(),
  withdrawnAt: text("withdrawn_at"),
  sourceIpHash: text("source_ip_hash"),
});

export const matters = sqliteTable(
  "matters",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull(),
    clientUserId: text("client_user_id").notNull(),
    intakeId: text("intake_id").notNull(),
    workflowId: text("workflow_id").notNull(),
    countryCode: text("country_code").notNull(),
    stateCode: text("state_code").notNull(),
    state: text("state").notNull(),
    urgency: text("urgency").notNull().default("standard"),
    selectedLawyerId: text("selected_lawyer_id"),
    paidAt: text("paid_at"),
    informationCompleteAt: text("information_complete_at"),
    dueAt: text("due_at"),
    closedAt: text("closed_at"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("matters_reference_uq").on(table.reference),
    uniqueIndex("matters_intake_uq").on(table.intakeId),
    index("matters_client_idx").on(table.clientUserId),
    index("matters_state_due_idx").on(table.state, table.dueAt),
  ],
);

export const lawyerProfiles = sqliteTable(
  "lawyer_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    displayName: text("display_name").notNull(),
    supremeCourtNumber: text("supreme_court_number").notNull(),
    yearOfCall: integer("year_of_call").notNull(),
    firmName: text("firm_name"),
    bio: text("bio").notNull(),
    verificationStatus: text("verification_status")
      .notNull()
      .default("pending"),
    verificationExpiresAt: text("verification_expires_at"),
    available: integer("available", { mode: "boolean" })
      .notNull()
      .default(false),
    urgentAvailable: integer("urgent_available", { mode: "boolean" })
      .notNull()
      .default(false),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lawyer_user_uq").on(table.userId),
    uniqueIndex("lawyer_sc_uq").on(table.supremeCourtNumber),
  ],
);

export const lawyerCapabilities = sqliteTable(
  "lawyer_capabilities",
  {
    lawyerId: text("lawyer_id").notNull(),
    kind: text("kind").notNull(),
    value: text("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.lawyerId, table.kind, table.value] }),
  ],
);

export const lawyerMatches = sqliteTable(
  "lawyer_matches",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    lawyerId: text("lawyer_id").notNull(),
    position: integer("position").notNull(),
    score: integer("score").notNull(),
    selectedAt: text("selected_at"),
    expiresAt: text("expires_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("matter_lawyer_match_uq").on(table.matterId, table.lawyerId),
  ],
);

export const conflictChecks = sqliteTable(
  "conflict_checks",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    lawyerId: text("lawyer_id").notNull(),
    decision: text("decision").notNull(),
    reasonCode: text("reason_code").notNull(),
    privateNoteEncrypted: text("private_note_encrypted"),
    decidedAt: text("decided_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("conflict_matter_lawyer_uq").on(table.matterId, table.lawyerId),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    senderUserId: text("sender_user_id"),
    channel: text("channel").notNull(),
    body: text("body").notNull(),
    messageType: text("message_type").notNull().default("message"),
    providerIdempotencyKey: text("provider_idempotency_key"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("messages_provider_key_uq").on(table.providerIdempotencyKey),
    index("messages_matter_idx").on(table.matterId, table.createdAt),
  ],
);

export const evidenceItems = sqliteTable(
  "evidence_items",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id"),
    intakeId: text("intake_id"),
    ownerUserId: text("owner_user_id").notNull(),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    status: text("status").notNull().default("quarantined"),
    retentionUntil: text("retention_until"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("evidence_object_key_uq").on(table.objectKey),
    index("evidence_matter_idx").on(table.matterId),
  ],
);

export const assessments = sqliteTable(
  "assessments",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    lawyerId: text("lawyer_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    limitations: text("limitations").notNull(),
    nextStepsJson: text("next_steps_json").notNull(),
    aiDraftRunId: text("ai_draft_run_id"),
    lawyerAttestedAt: text("lawyer_attested_at").notNull(),
    deliveredAt: text("delivered_at").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("assessment_matter_uq").on(table.matterId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    provider: text("provider").notNull(),
    internalReference: text("internal_reference").notNull(),
    providerReference: text("provider_reference"),
    state: text("state").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("NGN"),
    platformShareBps: integer("platform_share_bps").notNull(),
    lawyerShareBps: integer("lawyer_share_bps").notNull(),
    feeBearer: text("fee_bearer").notNull(),
    workflowId: text("workflow_id").notNull(),
    lawyerId: text("lawyer_id").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    version: integer("version").notNull().default(1),
    verifiedAt: text("verified_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("payment_internal_ref_uq").on(table.internalReference),
    uniqueIndex("payment_provider_ref_uq").on(
      table.provider,
      table.providerReference,
    ),
    index("payments_matter_idx").on(table.matterId),
  ],
);

export const refunds = sqliteTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id").notNull(),
    providerReference: text("provider_reference"),
    reason: text("reason").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    state: text("state").notNull(),
    requestedBy: text("requested_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("refund_provider_ref_uq").on(table.providerReference),
  ],
);

export const providerEvents = sqliteTable(
  "provider_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    eventKey: text("event_key").notNull(),
    signatureValid: integer("signature_valid", { mode: "boolean" }).notNull(),
    rawPayload: text("raw_payload").notNull(),
    status: text("status").notNull(),
    receivedAt: text("received_at").notNull(),
    processedAt: text("processed_at"),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("provider_event_uq").on(table.provider, table.eventKey),
  ],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    queueName: text("queue_name").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadJson: text("payload_json").notNull(),
    state: text("state").notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at").notNull(),
    lockedAt: text("locked_at"),
    completedAt: text("completed_at"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("jobs_idempotency_uq").on(table.idempotencyKey),
    index("jobs_state_available_idx").on(table.state, table.availableAt),
  ],
);

export const privacyRequests = sqliteTable("privacy_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  details: text("details"),
  responseObjectKey: text("response_object_key"),
  dueAt: text("due_at").notNull(),
  completedAt: text("completed_at"),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const payoutAccounts = sqliteTable(
  "payout_accounts",
  {
    id: text("id").primaryKey(),
    lawyerId: text("lawyer_id").notNull(),
    provider: text("provider").notNull(),
    subaccountEncrypted: text("subaccount_encrypted").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("payout_lawyer_provider_uq").on(table.lawyerId, table.provider),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    matterId: text("matter_id"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    requestId: text("request_id"),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    index("audit_entity_idx").on(
      table.entityType,
      table.entityId,
      table.occurredAt,
    ),
    index("audit_matter_idx").on(table.matterId, table.occurredAt),
  ],
);

export const aiRuns = sqliteTable("ai_runs", {
  id: text("id").primaryKey(),
  matterId: text("matter_id"),
  intakeId: text("intake_id"),
  purpose: text("purpose").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  schemaVersion: text("schema_version").notNull(),
  inputRefsJson: text("input_refs_json").notNull(),
  outputJson: text("output_json"),
  confidence: integer("confidence_millis"),
  requiresHumanReview: integer("requires_human_review", { mode: "boolean" })
    .notNull()
    .default(false),
  reviewedBy: text("reviewed_by"),
  reviewedAt: text("reviewed_at"),
  tokenUseJson: text("token_use_json"),
  latencyMs: integer("latency_ms"),
  createdAt: text("created_at").notNull(),
});

export const transcriptions = sqliteTable(
  "transcriptions",
  {
    id: text("id").primaryKey(),
    intakeId: text("intake_id").notNull(),
    evidenceId: text("evidence_id").notNull(),
    language: text("language").notNull(),
    status: text("status").notNull(),
    transcript: text("transcript"),
    confirmedTranscript: text("confirmed_transcript"),
    confidenceMillis: integer("confidence_millis"),
    model: text("model"),
    confirmedAt: text("confirmed_at"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("transcription_evidence_uq").on(table.evidenceId)],
);
