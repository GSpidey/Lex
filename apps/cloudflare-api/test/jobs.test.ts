import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { processMessage } from "../../cloudflare-jobs/src/index.js";

const workerEnv = () => ({
  ...env,
  AUTH_HMAC_PEPPER: "synthetic-job-tests-only",
  FIELD_ENCRYPTION_KEY: "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
  META_STATUS_TEMPLATE: "synthetic",
  POSTMARK_FROM_EMAIL: "",
  POSTMARK_MESSAGE_STREAM: "outbound",
  OPENAI_INTAKE_MODEL: "synthetic",
});

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

async function job(
  input: {
    state?: string;
    attempts?: number;
    lockedAt?: string;
    availableAt?: string;
    kind?: string;
  } = {},
) {
  const id = `job-contract-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO jobs (id,kind,queue_name,idempotency_key,payload_json,state,attempts,available_at,locked_at,created_at,updated_at) VALUES (?,?,'jobs',?,'{}',?,?,?,?,?,?)",
  )
    .bind(
      id,
      input.kind ?? "evidence_check",
      id,
      input.state ?? "queued",
      input.attempts ?? 0,
      input.availableAt ?? timestamp,
      input.lockedAt ?? null,
      timestamp,
      timestamp,
    )
    .run();
  return id;
}
async function record(id: string) {
  return env.DB.prepare(
    "SELECT state,attempts,last_error,locked_at FROM jobs WHERE id=?",
  )
    .bind(id)
    .first();
}

describe("Durable job claims", () => {
  it("allows only one concurrent execution and ignores completed replay", async () => {
    const id = await job();
    await Promise.all(
      Array.from({ length: 8 }, () => processMessage(id, workerEnv())),
    );
    expect(await record(id)).toMatchObject({
      state: "completed",
      attempts: 1,
      locked_at: null,
    });
    await processMessage(id, workerEnv());
    expect(await record(id)).toMatchObject({ state: "completed", attempts: 1 });
  });
  it("does not steal a live lease or run a delayed job early", async () => {
    const id = await job({
      state: "processing",
      attempts: 1,
      lockedAt: new Date().toISOString(),
    });
    const delayed = await job({
      availableAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await processMessage(id, workerEnv());
    await processMessage(delayed, workerEnv());
    expect(await record(id)).toMatchObject({
      state: "processing",
      attempts: 1,
    });
    expect(await record(delayed)).toMatchObject({
      state: "queued",
      attempts: 0,
    });
  });
  it("recovers an expired claim without resetting its attempt history", async () => {
    const id = await job({
      state: "processing",
      attempts: 1,
      lockedAt: new Date(Date.now() - 31 * 60_000).toISOString(),
    });
    await processMessage(id, workerEnv());
    expect(await record(id)).toMatchObject({ state: "completed", attempts: 2 });
  });
  it("bounds failed execution and retains a dead-letter record for operations", async () => {
    const id = await job({ attempts: 3, kind: "unsupported_synthetic_kind" });
    await expect(processMessage(id, workerEnv())).rejects.toThrow(
      "UnsupportedJobKind",
    );
    expect(await record(id)).toMatchObject({
      state: "dead_letter",
      attempts: 4,
      last_error: "UnsupportedJobKind",
    });
    await processMessage(id, workerEnv());
    expect(await record(id)).toMatchObject({
      state: "dead_letter",
      attempts: 4,
    });
    const historical = await job({ state: "retry", attempts: 12 });
    await processMessage(historical, workerEnv());
    expect(await record(historical)).toMatchObject({
      state: "dead_letter",
      attempts: 12,
    });
  });
});
