import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const userRoleAssignments = sqliteTable(
  "user_role_assignments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    role: text("role", {
      enum: ["client", "lawyer", "operations", "owner"],
    }).notNull(),
    status: text("status", {
      enum: ["active", "suspended", "revoked"],
    }).notNull(),
    assignedBy: text("assigned_by"),
    assignmentSource: text("assignment_source").notNull(),
    assignedAt: text("assigned_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("user_role_assignments_user_role_uq").on(
      table.userId,
      table.role,
    ),
    index("user_role_assignments_user_status_idx").on(
      table.userId,
      table.status,
    ),
  ],
);

export const professionalApplications = sqliteTable(
  "professional_applications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    legalName: text("legal_name").notNull(),
    publicName: text("public_name").notNull(),
    professionalEmail: text("professional_email").notNull(),
    professionalPhone: text("professional_phone").notNull(),
    supremeCourtNumber: text("supreme_court_number").notNull(),
    yearOfCall: integer("year_of_call").notNull(),
    jurisdictionOfCall: text("jurisdiction_of_call").notNull(),
    biography: text("biography").notNull(),
    languagesJson: text("languages_json").notNull(),
    stateCodesJson: text("state_codes_json").notNull(),
    practiceAreaCodesJson: text("practice_area_codes_json").notNull(),
    consultationModesJson: text("consultation_modes_json").notNull(),
    weeklyCapacity: integer("weekly_capacity").notNull(),
    urgentAvailable: integer("urgent_available", { mode: "boolean" }).notNull(),
    conductDeclaration: integer("conduct_declaration", {
      mode: "boolean",
    }).notNull(),
    termsVersion: text("terms_version").notNull(),
    state: text("state").notNull(),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("professional_applications_user_uq").on(table.userId),
  ],
);

export const legalDocuments = sqliteTable("legal_documents", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  audience: text("audience").notNull(),
  requiredAt: text("required_at"),
  optional: integer("optional", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const legalDocumentVersions = sqliteTable(
  "legal_document_versions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull(),
    version: integer("version").notNull(),
    language: text("language").notNull(),
    status: text("status").notNull(),
    contentMarkdown: text("content_markdown").notNull(),
    companyPlaceholderPresent: integer("company_placeholder_present", {
      mode: "boolean",
    }).notNull(),
    effectiveAt: text("effective_at"),
    approvedBy: text("approved_by"),
    approvalReference: text("approval_reference"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("legal_document_versions_document_version_language_uq").on(
      table.documentId,
      table.version,
      table.language,
    ),
  ],
);

export const channelConversations = sqliteTable(
  "channel_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    intakeId: text("intake_id"),
    channel: text("channel").notNull(),
    language: text("language").notNull(),
    state: text("state").notNull(),
    aiDisclosureVersion: text("ai_disclosure_version").notNull(),
    aiEnabled: integer("ai_enabled", { mode: "boolean" }).notNull(),
    classificationJson: text("classification_json"),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("channel_conversations_user_state_idx").on(table.userId, table.state),
  ],
);

export const conversationTurns = sqliteTable(
  "conversation_turns",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    actor: text("actor").notNull(),
    body: text("body").notNull(),
    providerMessageId: text("provider_message_id"),
    clientMessageId: text("client_message_id"),
    aiRunId: text("ai_run_id"),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("conversation_turns_client_message_uq").on(
      table.conversationId,
      table.clientMessageId,
    ),
    index("conversation_turns_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const privilegedActionApprovals = sqliteTable(
  "privileged_action_approvals",
  {
    requestId: text("request_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    decision: text("decision").notNull(),
    decidedAt: text("decided_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.ownerUserId] })],
);
