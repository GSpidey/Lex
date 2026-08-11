import type {
  SupportedLanguage,
  PaymentProviderName,
  UrgencyLevel,
} from "./enums.js";
import type { StructuredIntake } from "./schemas.js";

export interface AIIntakeRequest {
  intakeId: string;
  originalLanguage: SupportedLanguage;
  clientType: "adult_individual" | "minor" | "organization";
  practiceAreaCode: string;
  serviceCode: string;
  issueRole?: string;
  jurisdiction: { countryCode: string; stateCode: string; status: string };
  narrative: string;
  answers: Record<string, unknown>;
  safetyIdentifier: string;
}

export interface AIProvider {
  summarizeIntake(request: AIIntakeRequest): Promise<StructuredIntake>;
  translateClientConfirmation(input: {
    text: string;
    targetLanguage: SupportedLanguage;
    safetyIdentifier: string;
  }): Promise<string>;
  draftAssessment(input: {
    matterId: string;
    confirmedFacts: StructuredIntake;
    lawyerInstructions: string;
  }): Promise<{ draft: string; model: string }>;
}

export interface TranscriptionResult {
  text: string;
  detectedLanguage: string | null;
  confidence: number | null;
  model: string;
}

export interface TranscriptionProvider {
  transcribe(input: {
    bytes: Uint8Array;
    fileName: string;
    language?: SupportedLanguage;
  }): Promise<TranscriptionResult>;
}

export interface OutboundMessage {
  recipient: string;
  body: string;
  templateName?: string;
  locale?: SupportedLanguage;
  mediaUrl?: string;
  idempotencyKey: string;
}

export interface MessagingProvider {
  send(
    message: OutboundMessage,
  ): Promise<{ providerMessageId: string; status: string }>;
  markRead(providerMessageId: string): Promise<void>;
}

export interface PaymentInitialization {
  internalReference: string;
  email: string;
  amountMinor: number;
  currency: "NGN";
  callbackUrl: string;
  lawyerSubaccount: string;
  platformSharePercent: number;
  feeBearer: "lawyer";
  metadata: Record<string, string>;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  initialize(
    input: PaymentInitialization,
  ): Promise<{ providerReference: string; checkoutUrl: string }>;
  verify(providerReference: string): Promise<{
    successful: boolean;
    amountMinor: number;
    currency: string;
    raw: unknown;
  }>;
  refund(input: {
    providerReference: string;
    amountMinor?: number;
    reason: string;
  }): Promise<{ refundReference: string; status: string }>;
  verifyWebhook(
    rawBody: Uint8Array,
    headers: Record<string, string | string[] | undefined>,
  ): boolean;
}

export interface ObjectStorageProvider {
  createUpload(input: {
    objectKey: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<{ uploadUrl: string; expiresAt: Date }>;
  createDownload(input: {
    objectKey: string;
    fileName: string;
  }): Promise<{ downloadUrl: string; expiresAt: Date }>;
  delete(objectKey: string): Promise<void>;
}

export interface JurisdictionResolution {
  countryCode: string;
  stateCode: string;
  status: "draft" | "intake_only" | "active" | "suspended";
  serviceCode: string;
  version: number;
  priceMinor: number;
  slaHours: number;
  urgency: UrgencyLevel;
}

export interface JurisdictionResolver {
  resolve(input: {
    countryCode: string;
    stateCode: string;
    practiceAreaCode: string;
    serviceCode?: string;
    issueRole?: string;
    issueTags?: string[];
  }): JurisdictionResolution;
}

export interface ProfessionalVerifier {
  recordManualVerification(input: {
    lawyerId: string;
    source: string;
    licenceYear: number;
    evidenceReference: string;
    reviewerId: string;
  }): Promise<{ status: "verified"; expiresAt: Date }>;
}
