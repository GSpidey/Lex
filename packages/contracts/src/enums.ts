export const SUPPORTED_LANGUAGES = ["en", "pcm", "ha", "yo", "ig"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const USER_ROLES = ["client", "lawyer", "admin", "super_admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const TENANCY_ROLES = ["tenant", "landlord"] as const;
export type TenancyRole = (typeof TENANCY_ROLES)[number];

export const CLIENT_TYPES = [
  "adult_individual",
  "minor",
  "organization",
] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const CLASSIFICATION_STATUSES = [
  "selected",
  "suggested",
  "confirmed",
] as const;
export type ClassificationStatus = (typeof CLASSIFICATION_STATUSES)[number];

export const JURISDICTION_STATUSES = [
  "draft",
  "intake_only",
  "active",
  "suspended",
] as const;
export type JurisdictionStatus = (typeof JURISDICTION_STATUSES)[number];

export const MATTER_STATES = [
  "intake_draft",
  "awaiting_confirmation",
  "guardian_pending",
  "authority_review",
  "submitted",
  "intake_only",
  "urgent_operations_review",
  "matching",
  "matching_assistance",
  "lawyer_selected",
  "conflict_review",
  "awaiting_payment",
  "consultation_scheduled",
  "consultation_active",
  "awaiting_client",
  "lawyer_review",
  "delivered",
  "closed",
  "representation_proposed",
  "cancelled",
  "reassignment_requested",
  "refund_requested",
  "refunded",
] as const;
export type MatterState = (typeof MATTER_STATES)[number];

export const REPRESENTATION_STATES = [
  "proposal_draft",
  "offered",
  "accepted",
  "conflict_reconfirmed",
  "awaiting_invoice_payment",
  "active",
  "milestone_in_progress",
  "awaiting_client",
  "completed",
  "terminated",
  "disputed",
  "refunded",
] as const;
export type RepresentationState = (typeof REPRESENTATION_STATES)[number];

export const CONSULTATION_STATES = [
  "requested",
  "scheduled",
  "active",
  "ended",
  "cancelled",
] as const;
export type ConsultationState = (typeof CONSULTATION_STATES)[number];

export const PAYMENT_PROVIDERS = ["paystack", "flutterwave"] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATES = [
  "created",
  "pending",
  "successful",
  "failed",
  "cancelled",
  "refund_pending",
  "refunded",
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export const URGENCY_LEVELS = [
  "standard",
  "urgent",
  "critical_human_review",
] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const MESSAGE_CHANNELS = [
  "mobile",
  "web",
  "whatsapp",
  "email",
  "system",
] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
