export interface Env {
  DB: D1Database;
  PRIVATE_EVIDENCE: R2Bucket;
  JOBS_QUEUE: Queue<{ jobId: string }>;
  NOTIFICATIONS_QUEUE: Queue<{ jobId: string }>;
  APP_ENV: "local" | "staging" | "production";
  CORS_ORIGINS: string;
  DEV_OTP_ECHO: string;
  EMAIL_DELIVERY_ENABLED: string;
  META_GRAPH_VERSION: string;
  META_AUTH_TEMPLATE: string;
  META_AUTH_LOCALE: string;
  MAX_EVIDENCE_BYTES: string;
  AUTH_HMAC_PEPPER: string;
  FIELD_ENCRYPTION_KEY: string;
  META_ACCESS_TOKEN?: string;
  META_PHONE_NUMBER_ID?: string;
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_WEBHOOK_SECRET?: string;
  FLUTTERWAVE_SECRET_KEY?: string;
  FLUTTERWAVE_WEBHOOK_SECRET?: string;
  OPENAI_API_KEY?: string;
  EXPO_ACCESS_TOKEN?: string;
}

export interface AuthenticatedUser {
  id: string;
  role: "client" | "lawyer" | "admin" | "super_admin";
  sessionId: string;
}

export type Variables = { user: AuthenticatedUser; requestId: string };
