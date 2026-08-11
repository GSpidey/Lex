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

  it("exposes assigned client roles and versioned staging legal documents", async () => {
    const me = await SELF.fetch("https://lex.test/v1/auth/me", {
      headers: { authorization: `Bearer ${clientAccessToken}` },
    });
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({
      activeRole: "client",
      roles: ["client"],
    });
    const legal = await SELF.fetch(
      "https://lex.test/v1/legal/documents?language=en",
      { headers: { authorization: `Bearer ${clientAccessToken}` } },
    );
    expect(legal.status).toBe(200);
    const payload = await legal.json<{
      items: Array<{ code: string; status: string }>;
    }>();
    expect(payload.items.length).toBeGreaterThanOrEqual(19);
    expect(payload.items.some((item) => item.code === "privacy-notice")).toBe(
      true,
    );
    expect(payload.items.every((item) => item.status === "draft")).toBe(true);
  });

  it("records Ask Lex disclosure, idempotent client turns and human review", async () => {
    const created = await SELF.fetch("https://lex.test/v1/ai/intake-sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${clientAccessToken}`,
      },
      body: JSON.stringify({
        channel: "mobile",
        language: "en",
        aiDisclosureAccepted: true,
        aiDisclosureVersion: "ai-test-v1",
      }),
    });
    expect(created.status).toBe(201);
    const session = await created.json<{ id: string; provider: string }>();
    expect(session.provider).toBe("openai");
    const input = {
      body: "Police detained my brother in Lagos this morning.",
      clientMessageId: "worker-test-message-0001",
    };
    const first = await SELF.fetch(
      `https://lex.test/v1/ai/intake-sessions/${session.id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${clientAccessToken}`,
        },
        body: JSON.stringify(input),
      },
    );
    expect(first.status).toBe(202);
    const replay = await SELF.fetch(
      `https://lex.test/v1/ai/intake-sessions/${session.id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${clientAccessToken}`,
        },
        body: JSON.stringify(input),
      },
    );
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ duplicate: true });
    const handoff = await SELF.fetch(
      `https://lex.test/v1/ai/intake-sessions/${session.id}/human-review`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${clientAccessToken}` },
      },
    );
    expect(handoff.status).toBe(201);
    await expect(handoff.json()).resolves.toMatchObject({ state: "open" });
  });

  it("keeps founder role bootstrap isolated, authenticated and auditable", async () => {
    const unauthorized = await SELF.fetch(
      "https://lex.test/v1/internal/founder-bootstrap",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ founders: [] }),
      },
    );
    expect(unauthorized.status).not.toBe(200);
    const response = await SELF.fetch(
      "https://lex.test/v1/internal/founder-bootstrap",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-founder-bootstrap-token":
            "local-founder-bootstrap-test-token-at-least-32-characters",
        },
        body: JSON.stringify({
          founders: [
            {
              label: "Synthetic primary owner",
              phone: "+15550000001",
              email: "primary-owner@lex.test",
              roles: ["client", "owner"],
              defaultRole: "owner",
            },
            {
              label: "Synthetic partner owner lawyer",
              phone: "+15550000002",
              email: "partner-owner@lex.test",
              roles: ["owner", "lawyer"],
              defaultRole: "lawyer",
            },
          ],
        }),
      },
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const payload = await response.json<{
      bootstrapped: Array<{ userId: string }>;
    }>();
    expect(payload.bootstrapped).toHaveLength(2);
    const partner = await env.DB.prepare(
      "SELECT default_web_role,mfa_enabled FROM users WHERE id=?",
    )
      .bind(payload.bootstrapped[1]!.userId)
      .first<{ default_web_role: string; mfa_enabled: number }>();
    expect(partner).toEqual({ default_web_role: "lawyer", mfa_enabled: 0 });
    const roles = await env.DB.prepare(
      "SELECT role FROM user_role_assignments WHERE user_id=? ORDER BY role",
    )
      .bind(payload.bootstrapped[1]!.userId)
      .all<{ role: string }>();
    expect(roles.results.map((item) => item.role)).toEqual(["lawyer", "owner"]);
  });
});
