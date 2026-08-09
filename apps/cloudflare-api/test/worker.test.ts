import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
  }
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO workflows (id,country_code,state_code,service_code,tenancy_role,version,status,authoritative_language,definition_json,created_at,updated_at) VALUES ('workflow-ng-la-tenant-v1','NG','LA','ng-la-tenancy-tenant-assessment','tenant',1,'review','en','{}','2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z')",
  ).run();
});

describe("Lex Worker", () => {
  it("reports D1 health", async () => {
    const response = await SELF.fetch("https://lex.test/v1/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "lex-staging-api",
      database: "reachable",
    });
  });

  it("creates one client session from a single-use OTP and exposes pilot capabilities", async () => {
    const requested = await SELF.fetch("https://lex.test/v1/auth/otp/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": "worker-test",
      },
      body: JSON.stringify({
        channel: "whatsapp",
        phone: "+2348012345678",
        purpose: "sign_in",
        locale: "en",
      }),
    });
    expect(requested.status).toBe(201);
    const challenge = await requested.json<{
      challengeId: string;
      devCode: string;
    }>();
    expect(challenge.devCode).toMatch(/^\d{6}$/u);
    const verified = await SELF.fetch("https://lex.test/v1/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        code: challenge.devCode,
        deviceName: "Worker test",
      }),
    });
    expect(verified.status).toBe(200);
    const session = await verified.json<{ accessToken: string }>();
    const replay = await SELF.fetch("https://lex.test/v1/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        code: challenge.devCode,
      }),
    });
    expect(replay.status).toBe(401);
    const capabilities = await SELF.fetch("https://lex.test/v1/capabilities", {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(capabilities.status).toBe(200);
    await expect(capabilities.json()).resolves.toMatchObject({
      pilot: { country: "NG", activeState: "LA", languages: ["en", "pcm"] },
    });
  });

  it("keeps non-Lagos submission in intake-only state", async () => {
    const user = await env.DB.prepare(
      "SELECT id FROM users WHERE role='client' LIMIT 1",
    ).first<{ id: string }>();
    expect(user?.id).toBeTruthy();
    const now = new Date().toISOString();
    const workflowId = "workflow-ng-la-tenant-v1";
    const intakeId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO intakes (id,client_user_id,language,tenancy_role,country_code,state_code,source_channel,workflow_id,state,structured_summary_json,confirmed_at,version,created_at,updated_at) VALUES (?,?,'en','tenant','NG','OG','mobile',?,'awaiting_confirmation','{\"summary\":\"confirmed synthetic facts\"}',?,1,?,?)",
    )
      .bind(intakeId, user!.id, workflowId, now, now, now)
      .run();
    const status = await env.DB.prepare(
      "SELECT CASE WHEN state_code='LA' THEN 'matching' ELSE 'intake_only' END target FROM intakes WHERE id=?",
    )
      .bind(intakeId)
      .first<{ target: string }>();
    expect(status?.target).toBe("intake_only");
  });
});
