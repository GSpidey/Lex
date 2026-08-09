import { z } from "zod";
import {
  JURISDICTION_STATUSES,
  MATTER_STATES,
  MESSAGE_CHANNELS,
  PAYMENT_PROVIDERS,
  SUPPORTED_LANGUAGES,
  TENANCY_ROLES,
  URGENCY_LEVELS,
  USER_ROLES,
} from "./enums.js";

export const e164PhoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 phone format");
export const emailSchema = z.email().transform((value) => value.toLowerCase());
export const idSchema = z.uuid();

export const requestOtpSchema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  phone: e164PhoneSchema.optional(),
  email: emailSchema.optional(),
  purpose: z.enum(["sign_in", "link_whatsapp", "verify_email", "recovery"]).default("sign_in"),
  locale: z.enum(SUPPORTED_LANGUAGES).default("en"),
}).refine((value) => value.channel === "whatsapp" ? Boolean(value.phone) : Boolean(value.email), {
  message: "The selected channel destination is required",
});

export const verifyOtpSchema = z.object({
  challengeId: idSchema,
  code: z.string().regex(/^\d{6}$/),
  deviceName: z.string().trim().min(1).max(120).optional(),
});

export const refreshSessionSchema = z.object({ refreshToken: z.string().min(32) });

export const intakeAnswerSchema = z.object({
  questionKey: z.string().min(1).max(100),
  value: z.union([z.string().max(10_000), z.number(), z.boolean(), z.array(z.string().max(500)).max(30)]),
});

export const createIntakeSchema = z.object({
  language: z.enum(SUPPORTED_LANGUAGES),
  tenancyRole: z.enum(TENANCY_ROLES),
  countryCode: z.literal("NG").default("NG"),
  stateCode: z.string().trim().min(2).max(20),
  localGovernmentArea: z.string().trim().min(2).max(120).optional(),
  sourceChannel: z.enum(MESSAGE_CHANNELS).default("mobile"),
});

export const updateIntakeSchema = z.object({
  narrative: z.string().trim().min(10).max(20_000).optional(),
  answers: z.array(intakeAnswerSchema).max(100).optional(),
  desiredOutcome: z.string().trim().max(2_000).optional(),
});

export const partySchema = z.object({
  role: z.string().trim().min(1).max(100),
  name: z.string().trim().min(2).max(200),
  email: emailSchema.optional(),
  phone: e164PhoneSchema.optional(),
  organization: z.string().trim().max(200).optional(),
});

export const structuredIntakeSchema = z.object({
  authoritativeLanguage: z.literal("en"),
  originalLanguage: z.enum(SUPPORTED_LANGUAGES),
  summary: z.string().min(20).max(5_000),
  facts: z.array(z.string().min(1).max(1_000)).max(50),
  parties: z.array(partySchema).max(20),
  timeline: z.array(z.object({ date: z.string().max(50).nullable(), event: z.string().max(1_000) })).max(50),
  issueTags: z.array(z.string().max(100)).max(20),
  missingInformation: z.array(z.string().max(500)).max(30),
  urgency: z.enum(URGENCY_LEVELS),
  urgencyReasons: z.array(z.string().max(500)).max(20),
  confidence: z.number().min(0).max(1),
  requiresHumanReview: z.boolean(),
  safeClientConfirmation: z.string().min(10).max(5_000),
});

export const confirmIntakeSchema = z.object({
  summaryConfirmed: z.literal(true),
  consentVersion: z.string().min(1).max(100),
  consentAccepted: z.literal(true),
  corrections: z.string().trim().max(5_000).optional(),
});

export const lawyerApplicationSchema = z.object({
  displayName: z.string().trim().min(2).max(150),
  email: emailSchema,
  phone: e164PhoneSchema,
  supremeCourtNumber: z.string().trim().min(3).max(80),
  yearOfCall: z.number().int().min(1900).max(new Date().getFullYear()),
  firmName: z.string().trim().max(200).optional(),
  bio: z.string().trim().min(30).max(2_000),
  languages: z.array(z.enum(SUPPORTED_LANGUAGES)).min(1),
  stateCodes: z.array(z.string().min(2).max(20)).min(1),
  tenancyRoles: z.array(z.enum(TENANCY_ROLES)).min(1),
  urgentAvailable: z.boolean().default(false),
});

export const conflictDecisionSchema = z.object({
  decision: z.enum(["accepted", "declined"]),
  reasonCode: z.enum(["clear", "existing_client", "former_client", "personal_interest", "capacity", "other"]),
  privateNote: z.string().trim().max(2_000).optional(),
});

export const assessmentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(100).max(30_000),
  limitations: z.string().trim().min(20).max(5_000),
  nextSteps: z.array(z.string().min(2).max(1_000)).min(1).max(20),
  lawyerAttestation: z.literal(true),
});

export const initializePaymentSchema = z.object({
  matterId: idSchema,
  provider: z.enum(PAYMENT_PROVIDERS),
  callbackUrl: z.url(),
});

export const createMessageSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  channel: z.enum(MESSAGE_CHANNELS),
  attachmentIds: z.array(idSchema).max(10).default([]),
});

export const jurisdictionSchema = z.object({
  countryCode: z.string().length(2),
  stateCode: z.string().min(2).max(20),
  name: z.string().min(2),
  status: z.enum(JURISDICTION_STATUSES),
});

export const matterStateSchema = z.enum(MATTER_STATES);
export const userRoleSchema = z.enum(USER_ROLES);

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type CreateIntakeInput = z.infer<typeof createIntakeSchema>;
export type UpdateIntakeInput = z.infer<typeof updateIntakeSchema>;
export type StructuredIntake = z.infer<typeof structuredIntakeSchema>;
export type ConfirmIntakeInput = z.infer<typeof confirmIntakeSchema>;
export type LawyerApplicationInput = z.infer<typeof lawyerApplicationSchema>;
export type ConflictDecisionInput = z.infer<typeof conflictDecisionSchema>;
export type AssessmentInput = z.infer<typeof assessmentSchema>;
export type InitializePaymentInput = z.infer<typeof initializePaymentSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
