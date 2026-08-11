import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
  }
}

let clientAccessToken = "";

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
        phone: "+2348000000001",
        purpose: "sign_in",
        locale: "en",
      }),
    });
    expect(requested.status).toBe(201);
    const challenge = await requested.json<{
      challengeId: string;
      stagingTestLogin: boolean;
    }>();
    expect(challenge.stagingTestLogin).toBe(true);
    const verified = await SELF.fetch("https://lex.test/v1/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        code: "246810",
        deviceName: "Worker test",
      }),
    });
    expect(verified.status).toBe(200);
    const session = await verified.json<{ accessToken: string }>();
    clientAccessToken = session.accessToken;
    const replay = await SELF.fetch("https://lex.test/v1/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        code: "246810",
      }),
    });
    expect(replay.status).toBe(401);
    const capabilities = await SELF.fetch("https://lex.test/v1/capabilities", {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(capabilities.status).toBe(200);
    await expect(capabilities.json()).resolves.toMatchObject({
      release: {
        country: "NG",
        practiceAreaCount: 52,
        languages: ["en", "pcm", "ha", "yo", "ig"],
      },
    });
  });

  it("does not bypass WhatsApp for any other staging number", async () => {
    const response = await SELF.fetch("https://lex.test/v1/auth/otp/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": "worker-test-other-number",
      },
      body: JSON.stringify({
        channel: "whatsapp",
        phone: "+2348012345678",
        purpose: "sign_in",
        locale: "en",
      }),
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      capability: "whatsapp_otp",
      status: "unconfigured",
    });
  });

  it("exposes a searchable 52-area catalogue and creates nationwide general intake", async () => {
    const catalogue = await SELF.fetch(
      "https://lex.test/v1/catalog/practice-areas?q=police",
    );
    expect(catalogue.status).toBe(200);
    await expect(catalogue.json()).resolves.toMatchObject({
      countryCode: "NG",
      stagingAvailability: "nationwide",
      count: 1,
    });
    const created = await SELF.fetch("https://lex.test/v1/intakes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${clientAccessToken}`,
      },
      body: JSON.stringify({
        language: "ha",
        clientType: "adult_individual",
        practiceAreaCode: "police-detention-bail",
        countryCode: "NG",
        stateCode: "OG",
        sourceChannel: "mobile",
      }),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      state: "draft",
      jurisdictionStatus: "active",
      service: { practiceAreaCode: "police-detention-bail" },
    });
  });

  it("blocks detailed minor intake until a verified guardian exists", async () => {
    const created = await SELF.fetch("https://lex.test/v1/intakes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${clientAccessToken}`,
      },
      body: JSON.stringify({
        language: "en",
        clientType: "minor",
        practiceAreaCode: "custody-child-support",
        countryCode: "NG",
        stateCode: "LA",
        sourceChannel: "mobile",
      }),
    });
    const intake = await created.json<{ id: string }>();
    const update = await SELF.fetch(
      `https://lex.test/v1/intakes/${intake.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${clientAccessToken}`,
        },
        body: JSON.stringify({
          narrative: "Detailed protected facts must not be stored yet",
          answers: [],
          version: 1,
        }),
      },
    );
    expect(update.status).toBe(403);
    await expect(update.json()).resolves.toMatchObject({
      message: "A verified client subject is required",
    });
  });
});
