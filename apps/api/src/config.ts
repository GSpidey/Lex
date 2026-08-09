import { z } from "zod";

const emptyToUndefined = (value: unknown) => value === "" ? undefined : value;

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  FIELD_ENCRYPTION_KEY: z.string().min(16),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENAI_INTAKE_MODEL: z.string().default("gpt-5.6-terra"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-transcribe"),
  META_VERIFY_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  META_APP_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  META_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  META_PHONE_NUMBER_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  META_GRAPH_VERSION: z.string().default("v24.0"),
  PAYSTACK_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  FLUTTERWAVE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  FLUTTERWAVE_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  S3_ENDPOINT: z.url(),
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.string().default("true").transform((value) => value === "true"),
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_FROM: z.string().default("Lex <no-reply@localhost>"),
  DEV_OTP_ECHO: z.string().default("false").transform((value) => value === "true"),
});

export type LexEnv = z.infer<typeof envSchema>;

export function validateEnvironment(input: Record<string, unknown>): LexEnv {
  const result = envSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`);
  if (result.data.NODE_ENV === "production" && result.data.DEV_OTP_ECHO) throw new Error("DEV_OTP_ECHO must be false in production");
  return result.data;
}
