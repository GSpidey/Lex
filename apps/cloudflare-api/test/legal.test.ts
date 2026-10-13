import { applyD1Migrations, env, SELF, fetchMock } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { sha256, encrypt, verifyTotp } from "../src/crypto.js";
import { optionalProcessingAllowed } from "@lex/d1";
import { dispatch } from "../../cloudflare-jobs/src/index.js";
declare module "cloudflare:test" {
  interface ProvidedEnv {
    FIELD_ENCRYPTION_KEY: string;
  }
}

const owner = "legal-owner",
  reviewer = "legal-reviewer",
  other = "legal-unrelated",
  client = "legal-client";
async function request(
  path: string,
  actor?: string,
  body?: unknown,
  key?: string,
) {
  return SELF.fetch(`https://lex.test/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(actor ? { authorization: `Bearer ${actor}-token` } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function fixture(id: string, role: "owner" | "client", lawyer = false) {
  const timestamp = new Date().toISOString(),
    expiry = new Date(Date.now() + 3600000).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id,role,status,display_name,preferred_language,mfa_enabled,version,created_at,updated_at) VALUES (?,?,'active','Synthetic legal reviewer','en',1,1,?,?)",
    ).bind(
      id,
      role === "owner" ? "super_admin" : "client",
      timestamp,
      timestamp,
    ),
    env.DB.prepare(
      "INSERT INTO user_role_assignments (id,user_id,role,status,assignment_source,assigned_at) VALUES (?,?,?,'active','test_fixture',?)",
    ).bind(`${id}-role`, id, role, timestamp),
    env.DB.prepare(
      "INSERT INTO auth_challenges (id,user_id,channel,purpose,destination_hash,destination_encrypted,code_hash,expires_at,created_at) VALUES (?,?,'whatsapp','sign_in','synthetic','synthetic','synthetic',?,?)",
    ).bind(`${id}-challenge`, id, expiry, timestamp),
    env.DB.prepare(
      "INSERT INTO sessions (id,challenge_id,user_id,access_token_hash,refresh_token_hash,expires_at,refresh_expires_at,last_seen_at,created_at,active_role,last_step_up_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      `${id}-session`,
      `${id}-challenge`,
      id,
      await sha256(`${id}-token`),
      await sha256(`${id}-refresh`),
      expiry,
      expiry,
      timestamp,
      timestamp,
      role,
      timestamp,
    ),
  ]);
  if (lawyer)
    await env.DB.prepare(
      "INSERT INTO user_role_assignments (id,user_id,role,status,assignment_source,assigned_at) VALUES (?,?,'lawyer','active','test_fixture',?)",
    )
      .bind(`${id}-lawyer`, id, timestamp)
      .run();
}
async function draft(code: string, placeholder = false, kind = "agreement") {
  const content = `# Synthetic ${code}\n\nThis is a fixture for electronic review testing, not a legal policy. ${placeholder ? "[COMPANY_CONTACT]" : "No unresolved fields."}`;
  const timestamp = new Date().toISOString(),
    id = `${code}-v1`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legal_documents (id,code,title,audience,required_at,optional,created_at,updated_at,acceptance_kind) VALUES (?,?,?,'all','test',0,?,?,?)",
    ).bind(code, code, code, timestamp, timestamp, kind),
    env.DB.prepare(
      "INSERT INTO legal_document_versions (id,document_id,version,language,status,content_markdown,company_placeholder_present,content_hash,unresolved_fields_json,created_at,updated_at) VALUES (?,?,1,'en','draft',?,?,?,?,?,?)",
    ).bind(
      id,
      code,
      content,
      placeholder ? 1 : 0,
      await sha256(content),
      placeholder ? '["COMPANY_CONTACT"]' : "[]",
      timestamp,
      timestamp,
    ),
  ]);
  return id;
}
async function packet(versionIds: string[]) {
  const response = await request("/owner/legal-reviews", owner, {
    reviewerId: reviewer,
    versionIds,
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json<{
    id: string;
    packetHash: string;
    invitationToken: string;
  }>();
}
async function approve(p: {
  id: string;
  packetHash: string;
  invitationToken: string;
}) {
  expect(
    (
      await request(`/owner/legal-reviews/${p.id}/claim`, reviewer, {
        token: p.invitationToken,
      })
    ).status,
  ).toBe(200);
  const response = await request(
    `/owner/legal-reviews/${p.id}/events`,
    reviewer,
    {
      kind: "approved",
      body: "Reviewed this exact synthetic version.",
      signedName: "Synthetic Reviewer",
      intent: true,
      packetHash: p.packetHash,
    },
    "approve",
  );
  expect(response.status, await response.clone().text()).toBe(201);
}
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const [id, role, lawyer] of [
    [owner, "owner", false],
    [reviewer, "owner", true],
    [other, "owner", false],
    [client, "client", false],
  ] as const)
    await fixture(id, role, lawyer);
});
describe("Version-bound legal review", () => {
  it("supports recipient-bound private handoff without requiring email credentials", async () => {
    const p = await packet([await draft("manual-invitation")]);
    expect(
      (
        await request(
          `/owner/legal-reviews/${p.id}/invitation-link`,
          reviewer,
          {},
        )
      ).status,
    ).toBe(404);
    const rotated = await request(
      `/owner/legal-reviews/${p.id}/invitation-link`,
      owner,
      {},
    );
    expect(rotated.status).toBe(200);
    const data = await rotated.json<{ invitationToken: string }>();
    expect(
      (
        await request(`/owner/legal-reviews/${p.id}/claim`, reviewer, {
          token: p.invitationToken,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`/owner/legal-reviews/${p.id}/claim`, reviewer, {
          token: data.invitationToken,
        })
      ).status,
    ).toBe(200);
    expect(
      (await request(`/owner/legal-reviews/${p.id}/invitation-link`, owner, {}))
        .status,
    ).toBe(409);
  });
  it("limits repeated step-up guesses at account scope", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    let code = "000000";
    if (await verifyTotp(secret, code)) code = "999999";
    await env.DB.prepare("UPDATE users SET mfa_secret_encrypted=? WHERE id=?")
      .bind(await encrypt(secret, env.FIELD_ENCRYPTION_KEY), other)
      .run();
    for (let n = 0; n < 5; n++)
      expect((await request("/auth/step-up", other, { code })).status).toBe(
        401,
      );
    const denied = await request("/auth/step-up", other, { code });
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("requires authentication, assigned Owner and recent MFA even on the collection route", async () => {
    expect((await request("/owner/legal-reviews")).status).toBe(401);
    expect((await request("/owner/legal-reviews", client)).status).toBe(403);
    await env.DB.prepare(
      "UPDATE sessions SET last_step_up_at=NULL WHERE user_id=?",
    )
      .bind(other)
      .run();
    expect((await request("/owner/legal-reviews", other)).status).toBe(403);
    await env.DB.prepare(
      "UPDATE sessions SET last_step_up_at=? WHERE user_id=?",
    )
      .bind(new Date().toISOString(), other)
      .run();
    const docs = await request("/owner/legal-reviews/documents", owner);
    expect(docs.status).toBe(200);
    expect(
      (await docs.json<{ items: unknown[] }>()).items.length,
    ).toBeGreaterThanOrEqual(39);
  });
  it("keeps invitations recipient-bound, single-use and approvals explicit", async () => {
    const version = await draft("review-invitation"),
      p = await packet([version]);
    expect((await request(`/owner/legal-reviews/${p.id}`, other)).status).toBe(
      404,
    );
    expect(
      (
        await request(`/owner/legal-reviews/${p.id}/claim`, other, {
          token: p.invitationToken,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/owner/legal-reviews/${p.id}/events`,
          reviewer,
          {
            kind: "approved",
            body: "Not yet claimed",
            signedName: "Tester",
            intent: true,
            packetHash: p.packetHash,
          },
          "before-claim",
        )
      ).status,
    ).toBe(403);
    await approve(p);
    expect(
      (
        await request(`/owner/legal-reviews/${p.id}/claim`, reviewer, {
          token: p.invitationToken,
        })
      ).status,
    ).toBe(409);
    const repeat = await request(
      `/owner/legal-reviews/${p.id}/events`,
      reviewer,
      {
        kind: "approved",
        body: "Reviewed this exact synthetic version.",
        signedName: "Synthetic Reviewer",
        intent: true,
        packetHash: p.packetHash,
      },
      "approve",
    );
    expect(repeat.status).toBe(200);
    const changed = await request(
      `/owner/legal-reviews/${p.id}/events`,
      reviewer,
      {
        kind: "approved",
        body: "Different decision",
        signedName: "Synthetic Reviewer",
        intent: true,
        packetHash: p.packetHash,
      },
      "approve",
    );
    expect(changed.status).toBe(409);
    await expect(
      env.DB.prepare(
        "UPDATE legal_document_versions SET content_markdown=? WHERE id=?",
      )
        .bind("Changed text", version)
        .run(),
    ).rejects.toThrow();
    expect(
      (await request(`/owner/legal-reviews/${p.id}/publish`, reviewer, {}))
        .status,
    ).toBe(403);
    expect(
      (await request(`/owner/legal-reviews/${p.id}/publish`, owner, {})).status,
    ).toBe(200);
    const receipt = await request(
      `/owner/legal-reviews/${p.id}/receipt`,
      reviewer,
    );
    expect(receipt.headers.get("content-disposition")).toContain("attachment");
    const record = await receipt.json<{
      documents: Array<{ content_hash: string }>;
      events: Array<{ kind: string }>;
    }>();
    expect(record.documents[0]?.content_hash).toBeTruthy();
    expect(record.events.map((e) => e.kind)).toEqual(["approved", "published"]);
  });
  it("does not let a new draft hide an effective policy, and preserves legacy version_id", async () => {
    const version = await draft("public-history"),
      p = await packet([version]);
    await approve(p);
    expect(
      (await request(`/owner/legal-reviews/${p.id}/publish`, owner, {})).status,
    ).toBe(200);
    const revision = await request(
      "/owner/legal-reviews/documents/public-history/versions",
      owner,
      {
        content:
          "# New draft\n\nThis new draft has not been approved or published. The previous effective policy must remain available to all clients before signing in.",
        language: "en",
        baseVersion: 1,
      },
    );
    expect(revision.status).toBe(201);
    const response = await request("/legal/documents");
    expect(response.status).toBe(200);
    const policy = (
      await response.json<{
        items: Array<{ id: string; version_id: string; version: number }>;
      }>()
    ).items.find((i) => i.id === "public-history");
    expect(policy).toMatchObject({ version: 1, version_id: version });
  });
  it("blocks unresolved publication and unauthorized self-approval", async () => {
    const version = await draft("unresolved-review", true),
      p = await packet([version]);
    await approve(p);
    expect(
      (await request(`/owner/legal-reviews/${p.id}/publish`, owner, {})).status,
    ).toBe(409);
    expect(
      (
        await request("/owner/legal-reviews", owner, {
          reviewerId: owner,
          versionIds: [version],
        })
      ).status,
    ).toBe(422);
  });
  it("rejects expired and revoked links and requires approval intent", async () => {
    const p = await packet([await draft("expired-review")]);
    await env.DB.prepare(
      "UPDATE legal_review_packets SET expires_at=? WHERE id=?",
    )
      .bind("2000-01-01T00:00:00.000Z", p.id)
      .run();
    expect(
      (
        await request(`/owner/legal-reviews/${p.id}/claim`, reviewer, {
          token: p.invitationToken,
        })
      ).status,
    ).toBe(409);
    const q = await packet([await draft("revoked-review")]);
    expect(
      (
        await request(`/owner/legal-reviews/${q.id}/claim`, reviewer, {
          token: q.invitationToken,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/owner/legal-reviews/${q.id}/events`,
          reviewer,
          { kind: "approved", body: "No intent", packetHash: q.packetHash },
          "no-intent",
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          `/owner/legal-reviews/${q.id}/events`,
          owner,
          {
            kind: "revoked",
            body: "Invitation withdrawn",
            packetHash: q.packetHash,
          },
          "revoke",
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(`/owner/legal-reviews/${q.id}/claim`, reviewer, {
          token: q.invitationToken,
        })
      ).status,
    ).toBe(409);
  });
  it("records acceptance, withdrawal and reacceptance without overwriting history", async () => {
    const version = await draft("optional-review", false, "optional_consent"),
      p = await packet([version]);
    await approve(p);
    await request(`/owner/legal-reviews/${p.id}/publish`, owner, {});
    const body = {
      documentVersionId: version,
      language: "en",
      channel: "web",
      accepted: true,
    };
    expect(
      (await request("/legal/acceptances", client, body, "consent-one")).status,
    ).toBe(201);
    expect(
      (await request("/legal/acceptances", client, body, "consent-one")).status,
    ).toBe(200);
    expect(
      (await request("/legal/withdrawals", client, body, "withdraw-one"))
        .status,
    ).toBe(201);
    expect(
      (await request("/legal/acceptances", client, body, "consent-two")).status,
    ).toBe(201);
    const history = await env.DB.prepare(
      "SELECT kind FROM legal_consent_events WHERE document_version_id=? ORDER BY rowid",
    )
      .bind(version)
      .all<{ kind: string }>();
    expect(history.results.map((e) => e.kind)).toEqual([
      "accepted",
      "withdrawn",
      "accepted",
    ]);
    await expect(
      env.DB.prepare(
        "DELETE FROM legal_consent_events WHERE document_version_id=?",
      )
        .bind(version)
        .run(),
    ).rejects.toThrow();
    const unpublished = await draft("not-effective");
    expect(
      (
        await request(
          "/legal/acceptances",
          client,
          { ...body, documentVersionId: unpublished },
          "unpublished",
        )
      ).status,
    ).toBe(409);
  });
  it("applies optional AI withdrawal across channels without disabling guided intake", async () => {
    const timestamp = new Date().toISOString();
    const document = await env.DB.prepare(
      "SELECT id FROM legal_documents WHERE code='ai-routing-disclosure'",
    ).first<{ id: string }>();
    const version = `synthetic-ai-${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT INTO legal_document_versions (id,document_id,version,language,status,content_markdown,effective_at,created_at,updated_at) VALUES (?,?,99,'en','published','Synthetic AI consent fixture',?,?,?)",
    )
      .bind(version, document!.id, timestamp, timestamp, timestamp)
      .run();
    const body = {
      documentVersionId: version,
      language: "en",
      channel: "web",
      accepted: true,
    };
    expect(
      (await request("/legal/acceptances", client, body, "ai-consent")).status,
    ).toBe(201);
    const response = await request("/ai/intake-sessions", client, {
      language: "en",
      channel: "mobile",
      aiDisclosureAccepted: true,
      aiDisclosureVersion: version,
    });
    expect(response.status).toBe(201);
    const conversation = await response.json<{ id: string }>();
    expect(
      (
        await request(
          "/legal/withdrawals",
          client,
          { ...body, channel: "mobile" },
          "ai-withdraw-mobile",
        )
      ).status,
    ).toBe(201);
    expect(
      await optionalProcessingAllowed(env.DB, client, "ai-routing-disclosure"),
    ).toBe(false);
    expect(
      (
        await env.DB.prepare(
          "SELECT ai_enabled FROM channel_conversations WHERE id=?",
        )
          .bind(conversation.id)
          .first<{ ai_enabled: number }>()
      )?.ai_enabled,
    ).toBe(0);
    const next = await request("/ai/intake-sessions", client, {
      language: "en",
      channel: "web",
      aiDisclosureAccepted: true,
      aiDisclosureVersion: version,
    });
    expect((await next.json<{ provider: string }>()).provider).toBe(
      "deterministic_fallback",
    );
    const turn = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO conversation_turns (id,conversation_id,actor,body,status,created_at) VALUES (?,?,'client','Synthetic contract enquiry','recorded',?)",
    )
      .bind(turn, conversation.id, timestamp)
      .run();
    // If the permission check is bypassed this unusable key causes the test to
    // fail instead of silently counting a provider call as verification.
    fetchMock.activate();
    fetchMock.disableNetConnect();
    try {
      await dispatch(
        "ai_guided_intake",
        { conversationId: conversation.id, clientTurnId: turn },
        {
          ...env,
          AUTH_HMAC_PEPPER: "synthetic-pepper-for-consent-test-only",
          OPENAI_API_KEY: "synthetic-invalid-key-never-send",
          OPENAI_INTAKE_MODEL: "synthetic",
          META_STATUS_TEMPLATE: "synthetic",
          POSTMARK_FROM_EMAIL: "",
          POSTMARK_MESSAGE_STREAM: "outbound",
        },
      );
    } finally {
      fetchMock.deactivate();
    }
    const run = await env.DB.prepare(
      "SELECT model FROM ai_runs WHERE input_refs_json LIKE ? ORDER BY rowid DESC LIMIT 1",
    )
      .bind(`%${turn}%`)
      .first<{ model: string }>();
    expect(run?.model).toBe("deterministic-fallback-v1");
    expect(
      (await request("/legal/acceptances", client, body, "ai-consent-restored"))
        .status,
    ).toBe(201);
    expect(
      await optionalProcessingAllowed(env.DB, client, "ai-routing-disclosure"),
    ).toBe(true);
    // Prior conversations do not silently reactivate after a fresh opt-in.
    expect(
      (
        await env.DB.prepare(
          "SELECT ai_enabled FROM channel_conversations WHERE id=?",
        )
          .bind(conversation.id)
          .first<{ ai_enabled: number }>()
      )?.ai_enabled,
    ).toBe(0);
    const newerVersion = `${version}-newer`;
    await env.DB.prepare(
      "INSERT INTO legal_document_versions (id,document_id,version,language,status,content_markdown,effective_at,created_at,updated_at) VALUES (?,?,100,'en','published','New synthetic consent version',?,?,?)",
    )
      .bind(newerVersion, document!.id, timestamp, timestamp, timestamp)
      .run();
    // A new policy must not strand the ability to withdraw an older consent.
    const newerBody = { ...body, documentVersionId: newerVersion };
    expect(
      (await request("/legal/withdrawals", client, newerBody)).status,
    ).toBe(201);
    expect(
      await optionalProcessingAllowed(env.DB, client, "ai-routing-disclosure"),
    ).toBe(false);
    expect(
      (await request("/legal/acceptances", client, newerBody)).status,
    ).toBe(201);
    expect((await request("/legal/withdrawals", client, body)).status).toBe(
      201,
    );
    expect(
      await optionalProcessingAllowed(env.DB, client, "ai-routing-disclosure"),
    ).toBe(false);
    expect((await request("/legal/acceptances", client, body)).status).toBe(
      409,
    );
  });
  it("withdraws external updates but preserves authentication and in-app access", async () => {
    const timestamp = new Date().toISOString();
    const document = await env.DB.prepare(
      "SELECT id FROM legal_documents WHERE code='electronic-communications'",
    ).first<{ id: string }>();
    const version = `synthetic-communications-${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT INTO legal_document_versions (id,document_id,version,language,status,content_markdown,effective_at,created_at,updated_at) VALUES (?,?,99,'en','published','Synthetic optional communication consent',?,?,?)",
    )
      .bind(version, document!.id, timestamp, timestamp, timestamp)
      .run();
    await env.DB.prepare(
      "INSERT INTO notification_preferences(user_id,whatsapp,push,email,updated_at) VALUES (?,1,1,1,?) ON CONFLICT(user_id) DO UPDATE SET whatsapp=1,push=1,email=1",
    )
      .bind(client, timestamp)
      .run();
    const body = {
      documentVersionId: version,
      language: "en",
      channel: "web",
      accepted: true,
    };
    expect(
      (
        await request(
          "/legal/acceptances",
          client,
          body,
          "communications-accept",
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          "/legal/withdrawals",
          client,
          { ...body, channel: "mobile" },
          "communications-withdraw",
        )
      ).status,
    ).toBe(201);
    const preferences = await env.DB.prepare(
      "SELECT whatsapp,push,email FROM notification_preferences WHERE user_id=?",
    )
      .bind(client)
      .first();
    expect(preferences).toEqual({ whatsapp: 0, push: 0, email: 0 });
    expect(
      await optionalProcessingAllowed(
        env.DB,
        client,
        "electronic-communications",
      ),
    ).toBe(false);
    expect((await request("/auth/me", client)).status).toBe(200);
    expect((await request("/notification-preferences", client)).status).toBe(
      200,
    );
  });
});
