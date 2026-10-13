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

export const practiceAreas = sqliteTable(
  "practice_areas",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    groupName: text("group_name").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    urgent: integer("urgent", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("practice_areas_code_uq").on(table.code),
    index("practice_areas_group_sort_idx").on(table.groupName, table.sortOrder),
  ],
);

export const serviceDefinitions = sqliteTable(
  "service_definitions",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    practiceAreaId: text("practice_area_id").notNull(),
    countryCode: text("country_code").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("service_definitions_code_uq").on(table.code)],
);

export const serviceVersions = sqliteTable(
  "service_versions",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    authoritativeLanguage: text("authoritative_language").notNull(),
    definitionJson: text("definition_json").notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    slaHours: integer("sla_hours").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    effectiveAt: text("effective_at"),
    retiredAt: text("retired_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("service_versions_service_version_uq").on(
      table.serviceId,
      table.version,
    ),
  ],
);

export const serviceJurisdictions = sqliteTable(
  "service_jurisdictions",
  {
    serviceVersionId: text("service_version_id").notNull(),
    countryCode: text("country_code").notNull(),
    stateCode: text("state_code").notNull(),
    status: text("status").notNull(),
    rulesJson: text("rules_json").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.serviceVersionId, table.countryCode, table.stateCode],
    }),
  ],
);

export const minorProfiles = sqliteTable(
  "minor_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    displayNameEncrypted: text("display_name_encrypted").notNull(),
    dateOfBirthEncrypted: text("date_of_birth_encrypted").notNull(),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("minor_profiles_user_uq").on(table.userId)],
);

export const guardianLinks = sqliteTable(
  "guardian_links",
  {
    id: text("id").primaryKey(),
    minorProfileId: text("minor_profile_id").notNull(),
    guardianUserId: text("guardian_user_id").notNull(),
    relationship: text("relationship").notNull(),
    status: text("status").notNull(),
    consentVersion: text("consent_version").notNull(),
    version: integer("version").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("guardian_links_subject_guardian_uq").on(
      table.minorProfileId,
      table.guardianUserId,
    ),
  ],
);

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    legalName: text("legal_name").notNull(),
    registrationNumber: text("registration_number").notNull(),
    organizationType: text("organization_type").notNull(),
    status: text("status").notNull(),
    version: integer("version").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("organizations_registration_uq").on(table.registrationNumber),
  ],
);

export const consultations = sqliteTable(
  "consultations",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    lawyerId: text("lawyer_id").notNull(),
    state: text("state").notNull(),
    mode: text("mode").notNull(),
    scheduledStart: text("scheduled_start"),
    scheduledEnd: text("scheduled_end"),
    timeZone: text("time_zone"),
    realtimeRoomKey: text("realtime_room_key").notNull(),
    version: integer("version").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("consultations_matter_uq").on(table.matterId),
    uniqueIndex("consultations_room_uq").on(table.realtimeRoomKey),
  ],
);

export const consultationParticipants = sqliteTable(
  "consultation_participants",
  {
    consultationId: text("consultation_id").notNull(),
    userId: text("user_id").notNull(),
    participantRole: text("participant_role").notNull(),
    joinedAt: text("joined_at"),
    lastSeenAt: text("last_seen_at"),
    removedAt: text("removed_at"),
  },
  (table) => [primaryKey({ columns: [table.consultationId, table.userId] })],
);

export const representationEngagements = sqliteTable(
  "representation_engagements",
  {
    id: text("id").primaryKey(),
    matterId: text("matter_id").notNull(),
    clientUserId: text("client_user_id").notNull(),
    lawyerId: text("lawyer_id").notNull(),
    state: text("state").notNull(),
    engagementVersion: integer("engagement_version").notNull(),
    acceptedProposalId: text("accepted_proposal_id"),
    version: integer("version").notNull(),
    ...timestamps,
  },
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    engagementId: text("engagement_id").notNull(),
    milestoneId: text("milestone_id"),
    invoiceNumber: text("invoice_number").notNull(),
    description: text("description").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    state: text("state").notNull(),
    dueAt: text("due_at"),
    paymentId: text("payment_id"),
    version: integer("version").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("invoices_number_uq").on(table.invoiceNumber)],
);

export const paymentAllocations = sqliteTable(
  "payment_allocations",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id").notNull(),
    allocationType: text("allocation_type").notNull(),
    recipientReference: text("recipient_reference").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    basisPoints: integer("basis_points").notNull(),
    feeBearer: integer("fee_bearer", { mode: "boolean" }).notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("payment_allocations_uq").on(
      table.paymentId,
      table.allocationType,
      table.recipientReference,
    ),
  ],
);
