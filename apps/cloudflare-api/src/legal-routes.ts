import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { publicLegalDocuments } from "@lex/platform-core";
import { D1PublicLegalRepository } from "./public-legal-repository.js";
import { encrypt, hmac, randomToken, sha256 } from "./crypto.js";
import { requireAuth, requireRole, type AppContext } from "./middleware.js";
import { now, future, recordJobBeforePublish } from "./repository.js";
import type { Env, Variables } from "./types.js";

const routes = new Hono<{ Bindings: Env; Variables: Variables }>();
type Version = {
  id: string;
  document_id: string;
  code: string;
  title: string;
  version: number;
  language: string;
  status: string;
  content_markdown: string;
  content_hash: string | null;
  unresolved_fields_json: string;
  visibility: string;
  acceptance_kind: string;
  effective_at: string | null;
};
type Packet = {
  id: string;
  requested_by: string;
  reviewer_id: string;
  packet_hash: string;
  state: string;
  expires_at: string;
  claimed_at: string | null;
  created_at: string;
};
const columns =
  "v.*,v.id AS version_id,d.code,d.title,d.visibility,d.acceptance_kind,d.audience,d.required_at,d.optional";

routes.get("/legal/documents", async (c) => {
  return c.json(
    await publicLegalDocuments(
      new D1PublicLegalRepository(c.env.DB),
      c.req.query("language") ?? "en",
    ),
  );
});

routes.use("/legal/acceptances", requireAuth);
routes.use("/legal/withdrawals", requireAuth);
routes.get("/legal/acceptances", async (c) =>
  c.json({
    items: (
      await c.env.DB.prepare(
        "SELECT e.id,e.document_version_id,e.kind,e.language,e.channel,e.occurred_at,d.code AS document_code FROM legal_consent_events e JOIN legal_document_versions v ON v.id=e.document_version_id JOIN legal_documents d ON d.id=v.document_id WHERE e.user_id=? ORDER BY e.rowid",
      )
        .bind(c.get("user").id)
        .all()
    ).results,
  }),
);
const consent = z.object({
  documentVersionId: z.string().min(1),
  channel: z.enum(["mobile", "web", "whatsapp"]),
  language: z.enum(["en", "pcm", "ha", "yo", "ig"]),
  accepted: z.literal(true).optional(),
});
async function recordConsent(
  c: AppContext,
  input: z.infer<typeof consent>,
  withdrawal: boolean,
) {
  const version = await c.env.DB.prepare(
    `SELECT ${columns} FROM legal_document_versions v JOIN legal_documents d ON d.id=v.document_id WHERE v.id=? AND d.visibility='public'`,
  )
    .bind(input.documentVersionId)
    .first<Version>();
  if (!version || version.language !== input.language)
    return c.json({ message: "Document version or language not found" }, 404);
  if (
    !withdrawal &&
    (version.status !== "published" ||
      !version.effective_at ||
      version.effective_at > now())
  )
    return c.json(
      { message: "Only an effective published document can be accepted" },
      409,
    );
  if (withdrawal && version.acceptance_kind !== "optional_consent")
    return c.json(
      {
        message:
          "Use the privacy or engagement termination process for this document",
      },
      409,
    );
  if (!withdrawal) {
    const newer = await c.env.DB.prepare(
      "SELECT 1 FROM legal_document_versions WHERE document_id=? AND language=? AND status='published' AND effective_at<=? AND version>?",
    )
      .bind(version.document_id, version.language, now(), version.version)
      .first();
    if (newer)
      return c.json(
        {
          message:
            "A newer effective document is available. Read that version before accepting.",
        },
        409,
      );
  }
  if (!withdrawal && version.acceptance_kind === "notice")
    return c.json({ message: "This notice does not require consent" }, 422);
  const kind = withdrawal
    ? "withdrawn"
    : version.acceptance_kind === "acknowledgement"
      ? "acknowledged"
      : "accepted";
  const latest = await c.env.DB.prepare(
    version.acceptance_kind === "optional_consent"
      ? "SELECT e.id,e.kind,e.occurred_at,e.document_version_id FROM legal_consent_events e JOIN legal_document_versions v ON v.id=e.document_version_id WHERE e.user_id=? AND v.document_id=? ORDER BY e.rowid DESC LIMIT 1"
      : "SELECT id,kind,occurred_at,document_version_id FROM legal_consent_events WHERE user_id=? AND document_version_id=? ORDER BY rowid DESC LIMIT 1",
  )
    .bind(
      c.get("user").id,
      version.acceptance_kind === "optional_consent"
        ? version.document_id
        : version.id,
    )
    .first<{
      id: string;
      kind: string;
      occurred_at: string;
      document_version_id: string;
    }>();
  const idempotency =
    c.req.header("idempotency-key") ??
    `${kind}:${version.id}:${input.channel}:${latest?.kind === kind ? "repeat" : (latest?.id ?? "initial")}`;
  if (
    !c.req.header("idempotency-key") &&
    latest?.kind === kind &&
    (withdrawal || latest.document_version_id === version.id)
  )
    return c.json({ kind, acceptedAt: latest.occurred_at, duplicate: true });
  if (idempotency.length > 200)
    return c.json({ message: "Invalid idempotency key" }, 400);
  const existing = await c.env.DB.prepare(
    "SELECT document_version_id,kind,occurred_at,channel FROM legal_consent_events WHERE user_id=? AND idempotency_key=?",
  )
    .bind(c.get("user").id, idempotency)
    .first<{
      document_version_id: string;
      kind: string;
      occurred_at: string;
      channel: string;
    }>();
  if (existing)
    return existing.document_version_id === version.id &&
      existing.kind === kind &&
      existing.channel === input.channel
      ? c.json({ kind, acceptedAt: existing.occurred_at, duplicate: true })
      : c.json(
          { message: "Idempotency key already used for another action" },
          409,
        );
  if (withdrawal && (!latest || latest.kind === "withdrawn"))
    return c.json({ message: "No active optional consent to withdraw" }, 409);
  const timestamp = now(),
    id = crypto.randomUUID();
  const statements = [
    c.env.DB.prepare(
      "INSERT INTO legal_consent_events (id,user_id,document_version_id,kind,language,channel,device_hash,source_ip_hash,occurred_at,idempotency_key) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,idempotency_key) DO NOTHING",
    ).bind(
      id,
      c.get("user").id,
      version.id,
      kind,
      input.language,
      input.channel,
      await hmac(
        c.req.header("x-device-id") ?? "unknown",
        c.env.AUTH_HMAC_PEPPER,
      ),
      await hmac(
        c.req.header("cf-connecting-ip") ?? "unavailable",
        c.env.AUTH_HMAC_PEPPER,
      ),
      timestamp,
      idempotency,
    ),
    c.env.DB.prepare(
      "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,occurred_at) SELECT ?,user_id,?,'LegalDocument',document_version_id,?,? FROM legal_consent_events WHERE id=?",
    ).bind(
      crypto.randomUUID(),
      `legal.${kind}`,
      JSON.stringify({ eventId: id }),
      timestamp,
      id,
    ),
  ];
  if (withdrawal && version.code === "ai-routing-disclosure") {
    statements.push(
      c.env.DB.prepare(
        "UPDATE channel_conversations SET ai_enabled=0,version=version+1,updated_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM legal_consent_events WHERE id=?)",
      ).bind(timestamp, c.get("user").id, id),
    );
  }
  if (withdrawal && version.code === "electronic-communications") {
    statements.push(
      c.env.DB.prepare(
        "UPDATE notification_preferences SET whatsapp=0,push=0,email=0,updated_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM legal_consent_events WHERE id=?)",
      ).bind(timestamp, c.get("user").id, id),
    );
    statements.push(
      c.env.DB.prepare(
        "UPDATE push_devices SET revoked_at=?,updated_at=? WHERE user_id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM legal_consent_events WHERE id=?)",
      ).bind(timestamp, timestamp, c.get("user").id, id),
    );
  }
  const results = await c.env.DB.batch(statements);
  if (results[0]?.meta.changes !== 1)
    return c.json(
      {
        message:
          "Consent changed concurrently; reload and retry with the same request key",
      },
      409,
    );
  return c.json({ kind, acceptedAt: timestamp }, 201);
}
routes.post(
  "/legal/acceptances",
  zValidator("json", consent.extend({ accepted: z.literal(true) })),
  (c) => recordConsent(c, c.req.valid("json"), false),
);
routes.post("/legal/withdrawals", zValidator("json", consent), (c) =>
  recordConsent(c, c.req.valid("json"), true),
);

routes.use(
  "/owner/legal-reviews/*",
  requireAuth,
  requireRole("owner"),
  async (c, next) => {
    const user = c.get("user");
    const identity = await c.env.DB.prepare(
      "SELECT mfa_enabled FROM users WHERE id=?",
    )
      .bind(user.id)
      .first<{ mfa_enabled: number }>();
    const stamp = Date.parse(user.lastStepUpAt ?? "");
    if (
      identity?.mfa_enabled !== 1 ||
      !Number.isFinite(stamp) ||
      stamp > Date.now() + 30_000 ||
      Date.now() - stamp > 600_000
    )
      return c.json(
        {
          message:
            "Verify MFA with /auth/step-up before reviewing legal documents",
        },
        403,
      );
    await next();
  },
);
routes.get("/owner/legal-reviews/documents", async (c) =>
  c.json({
    items: (
      await c.env.DB.prepare(
        `SELECT ${columns} FROM legal_document_versions v JOIN legal_documents d ON d.id=v.document_id ORDER BY d.title,v.version DESC`,
      ).all<Version>()
    ).results,
  }),
);
routes.post(
  "/owner/legal-reviews/documents/:documentId/versions",
  zValidator(
    "json",
    z.object({
      content: z.string().trim().min(100).max(100_000),
      language: z.enum(["en", "pcm", "ha", "yo", "ig"]),
      baseVersion: z.number().int().positive(),
    }),
  ),
  async (c) => {
    const input = c.req.valid("json"),
      documentId = c.req.param("documentId");
    const latest = await c.env.DB.prepare(
      "SELECT MAX(version) version FROM legal_document_versions WHERE document_id=? AND language=?",
    )
      .bind(documentId, input.language)
      .first<{ version: number | null }>();
    if (latest?.version !== input.baseVersion)
      return c.json(
        { message: "Document changed; reload before creating a revision" },
        409,
      );
    const id = crypto.randomUUID(),
      content = input.content.replaceAll("\r\n", "\n"),
      hash = await sha256(content),
      timestamp = now();
    const unresolved = [
      ...new Set(
        [...content.matchAll(/\[([A-Z][A-Z0-9_]+)\]/g)].map((m) => m[1]),
      ),
    ];
    const results = await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO legal_document_versions (id,document_id,version,language,status,content_markdown,company_placeholder_present,content_hash,unresolved_fields_json,created_at,updated_at) SELECT ?,?,?,?,'draft',?,?,?,?,?,? WHERE (SELECT MAX(version) FROM legal_document_versions WHERE document_id=? AND language=?)=?",
      ).bind(
        id,
        documentId,
        input.baseVersion + 1,
        input.language,
        content,
        unresolved.length ? 1 : 0,
        hash,
        JSON.stringify(unresolved),
        timestamp,
        timestamp,
        documentId,
        input.language,
        input.baseVersion,
      ),
      c.env.DB.prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,occurred_at) SELECT ?,?,'legal.version_created','LegalDocument',id,?,? FROM legal_document_versions WHERE id=?",
      ).bind(
        crypto.randomUUID(),
        c.get("user").id,
        JSON.stringify({ hash, documentId }),
        timestamp,
        id,
      ),
    ]);
    if (results[0]?.meta.changes !== 1)
      return c.json(
        {
          message:
            "Document changed concurrently; reload before creating a revision",
        },
        409,
      );
    return c.json({ id, contentHash: hash, unresolvedFields: unresolved }, 201);
  },
);
routes.get("/owner/legal-reviews", async (c) =>
  c.json({
    items: (
      await c.env.DB.prepare(
        "SELECT id,requested_by,reviewer_id,packet_hash,state,expires_at,claimed_at,created_at FROM legal_review_packets WHERE requested_by=? OR reviewer_id=? ORDER BY created_at DESC",
      )
        .bind(c.get("user").id, c.get("user").id)
        .all<Packet>()
    ).results,
  }),
);
routes.post(
  "/owner/legal-reviews",
  zValidator(
    "json",
    z.object({
      reviewerId: z.string().min(1),
      versionIds: z.array(z.string().min(1)).min(1).max(20),
    }),
  ),
  async (c) => {
    const input = c.req.valid("json"),
      user = c.get("user");
    if (input.reviewerId === user.id)
      return c.json(
        { message: "Select a different owner as legal reviewer" },
        422,
      );
    const reviewer = await c.env.DB.prepare(
      "SELECT u.id FROM users u JOIN user_role_assignments r ON r.user_id=u.id AND r.role='owner' AND r.status='active' JOIN user_role_assignments l ON l.user_id=u.id AND l.role='lawyer' AND l.status='active' WHERE u.id=? AND u.status='active'",
    )
      .bind(input.reviewerId)
      .first();
    if (!reviewer)
      return c.json(
        {
          message:
            "The legal reviewer must have assigned Owner and Lawyer roles",
        },
        422,
      );
    const ids = [...new Set(input.versionIds)].sort();
    const versions = await c.env.DB.prepare(
      `SELECT ${columns} FROM legal_document_versions v JOIN legal_documents d ON d.id=v.document_id WHERE v.id IN (${ids.map(() => "?").join(",")}) ORDER BY v.id`,
    )
      .bind(...ids)
      .all<Version>();
    if (
      versions.results.length !== ids.length ||
      versions.results.some(
        (v) => v.status !== "draft" && v.status !== "legal_review",
      )
    )
      return c.json({ message: "Select existing draft versions" }, 409);
    if (
      new Set(versions.results.map((v) => `${v.document_id}:${v.language}`))
        .size !== versions.results.length
    )
      return c.json(
        { message: "Include only one version of each document and language" },
        422,
      );
    const entries = [];
    for (const v of versions.results) {
      const hash = await sha256(v.content_markdown);
      if (hash !== v.content_hash)
        return c.json(
          { message: "Document hash is missing or mismatched" },
          409,
        );
      entries.push({ versionId: v.id, hash });
    }
    const packetHash = await sha256(JSON.stringify(entries)),
      id = crypto.randomUUID(),
      token = randomToken(),
      timestamp = now();
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO legal_review_packets (id,requested_by,reviewer_id,packet_hash,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?,?)",
      ).bind(
        id,
        user.id,
        input.reviewerId,
        packetHash,
        await sha256(token),
        future(7 * 86400_000),
        timestamp,
      ),
      ...entries.map((e) =>
        c.env.DB.prepare(
          "INSERT INTO legal_review_items (packet_id,document_version_id,content_hash) VALUES (?,?,?)",
        ).bind(id, e.versionId, e.hash),
      ),
      ...entries.map((e) =>
        c.env.DB.prepare(
          "UPDATE legal_document_versions SET status='legal_review',updated_at=? WHERE id=?",
        ).bind(timestamp, e.versionId),
      ),
      auditStatement(
        c,
        "legal.review_created",
        id,
        { packetHash, versionIds: ids },
        timestamp,
      ),
    ]);
    // The token is returned only to the authenticated requesting owner. It is never placed in a query string or audit metadata.
    return c.json({ id, packetHash, invitationToken: token }, 201);
  },
);
routes.get("/owner/legal-reviews/:id", async (c) => {
  const packet = await visiblePacket(c);
  if (!packet) return c.json({ message: "Review not found" }, 404);
  const items = await packetItems(c, packet.id);
  const events = await c.env.DB.prepare(
    "SELECT id,actor_user_id,kind,body,signed_name,packet_hash,occurred_at FROM legal_review_events WHERE packet_id=? ORDER BY occurred_at,id",
  )
    .bind(packet.id)
    .all();
  return c.json({ packet, items, events: events.results });
});
routes.post(
  "/owner/legal-reviews/:id/claim",
  zValidator("json", z.object({ token: z.string().min(32).max(200) })),
  async (c) => {
    const id = c.req.param("id"),
      timestamp = now();
    const result = await c.env.DB.prepare(
      "UPDATE legal_review_packets SET claimed_at=? WHERE id=? AND reviewer_id=? AND token_hash=? AND claimed_at IS NULL AND state='pending' AND expires_at>?",
    )
      .bind(
        timestamp,
        id,
        c.get("user").id,
        await sha256(c.req.valid("json").token),
        timestamp,
      )
      .run();
    return result.meta.changes === 1
      ? c.json({ claimed: true })
      : c.json(
          {
            message:
              "Invitation is expired, already used, revoked or not addressed to this account",
          },
          409,
        );
  },
);
routes.post(
  "/owner/legal-reviews/:id/events",
  zValidator(
    "json",
    z.object({
      kind: z.enum(["comment", "approved", "changes_requested", "revoked"]),
      body: z.string().trim().min(1).max(8000),
      signedName: z.string().trim().min(2).max(160).optional(),
      intent: z.literal(true).optional(),
      packetHash: z.string().min(1),
    }),
  ),
  async (c) => {
    const packet = await visiblePacket(c);
    if (!packet) return c.json({ message: "Review not found" }, 404);
    const input = c.req.valid("json"),
      actor = c.get("user").id;
    if (packet.packet_hash !== input.packetHash)
      return c.json({ message: "Document packet changed; reload it" }, 409);
    if (
      input.kind === "revoked"
        ? actor !== packet.requested_by
        : input.kind !== "comment" && actor !== packet.reviewer_id
    )
      return c.json({ message: "This action is not assigned to you" }, 403);
    if (actor === packet.reviewer_id && !packet.claimed_at)
      return c.json({ message: "Claim your review invitation first" }, 403);
    if (input.kind === "approved" && (!input.signedName || !input.intent))
      return c.json(
        { message: "Signing name and explicit approval intent are required" },
        422,
      );
    const key = c.req.header("idempotency-key");
    if (!key || key.length > 200)
      return c.json({ message: "A unique Idempotency-Key is required" }, 400);
    const existing = await c.env.DB.prepare(
      "SELECT kind,body,signed_name FROM legal_review_events WHERE packet_id=? AND actor_user_id=? AND idempotency_key=?",
    )
      .bind(packet.id, actor, key)
      .first<{ kind: string; body: string; signed_name: string | null }>();
    if (existing)
      return existing.kind === input.kind &&
        existing.body === input.body &&
        existing.signed_name === (input.signedName ?? null)
        ? c.json({ duplicate: true })
        : c.json(
            { message: "Idempotency key reused for a different decision" },
            409,
          );
    if (packet.state !== "pending" || packet.expires_at <= now())
      return c.json({ message: "Review is no longer pending" }, 409);
    const timestamp = now(),
      id = crypto.randomUUID();
    const statements = [
      c.env.DB.prepare(
        "INSERT INTO legal_review_events (id,packet_id,actor_user_id,kind,body,signed_name,packet_hash,occurred_at,idempotency_key) SELECT ?,id,?,?,?,?,?,?,? FROM legal_review_packets WHERE id=? AND state='pending' AND expires_at>? ON CONFLICT(packet_id,actor_user_id,idempotency_key) DO NOTHING",
      ).bind(
        id,
        actor,
        input.kind,
        input.body,
        input.signedName ?? null,
        packet.packet_hash,
        timestamp,
        key,
        packet.id,
        timestamp,
      ),
    ];
    if (input.kind !== "comment")
      statements.push(
        c.env.DB.prepare(
          "UPDATE legal_review_packets SET state=? WHERE id=? AND state='pending' AND EXISTS(SELECT 1 FROM legal_review_events WHERE id=?)",
        ).bind(input.kind, packet.id, id),
      );
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,occurred_at) SELECT ?,?,?, 'LegalReview',packet_id,?,? FROM legal_review_events WHERE id=?",
      ).bind(
        crypto.randomUUID(),
        actor,
        `legal.review_${input.kind}`,
        JSON.stringify({ packetHash: packet.packet_hash }),
        timestamp,
        id,
      ),
    );
    const results = await c.env.DB.batch(statements);
    return results[0]?.meta.changes === 1
      ? c.json(
          { id, state: input.kind === "comment" ? "pending" : input.kind },
          201,
        )
      : c.json({ message: "Review changed concurrently" }, 409);
  },
);
routes.post("/owner/legal-reviews/:id/publish", async (c) => {
  const packet = await visiblePacket(c);
  if (!packet) return c.json({ message: "Review not found" }, 404);
  if (
    packet.requested_by !== c.get("user").id ||
    packet.reviewer_id === c.get("user").id ||
    packet.state !== "approved"
  )
    return c.json(
      {
        message:
          "Publication requires the requesting owner and a different owner-lawyer approval",
      },
      403,
    );
  const items = await packetItems(c, packet.id);
  for (const item of items) {
    if (
      item.unresolved_fields_json !== "[]" ||
      /\[[A-Z][A-Z0-9_]+\]/u.test(item.content_markdown) ||
      (await sha256(item.content_markdown)) !== item.content_hash
    )
      return c.json(
        {
          message:
            "Resolve document fields and obtain a new review before publication",
          versionId: item.id,
        },
        409,
      );
    const newer = await c.env.DB.prepare(
      "SELECT 1 FROM legal_document_versions WHERE document_id=? AND language=? AND version>?",
    )
      .bind(item.document_id, item.language, item.version)
      .first();
    if (newer)
      return c.json(
        { message: "A newer document exists and needs its own review" },
        409,
      );
  }
  const timestamp = now(),
    eventId = crypto.randomUUID();
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO legal_review_events (id,packet_id,actor_user_id,kind,body,packet_hash,occurred_at,idempotency_key)
      SELECT ?,p.id,?,'published','Published reviewed versions',p.packet_hash,?,'publish' FROM legal_review_packets p WHERE p.id=? AND p.state='approved'
      AND NOT EXISTS(SELECT 1 FROM legal_review_items i JOIN legal_document_versions v ON v.id=i.document_version_id JOIN legal_document_versions newer ON newer.document_id=v.document_id AND newer.language=v.language AND newer.version>v.version WHERE i.packet_id=p.id)
      AND NOT EXISTS(SELECT 1 FROM legal_review_items i JOIN legal_document_versions v ON v.id=i.document_version_id WHERE i.packet_id=p.id AND v.status<>'legal_review')
      ON CONFLICT(packet_id,actor_user_id,idempotency_key) DO NOTHING`,
    ).bind(eventId, c.get("user").id, timestamp, packet.id),
    ...items.map((item) =>
      c.env.DB.prepare(
        "UPDATE legal_document_versions SET status='published',effective_at=COALESCE(effective_at,?),approved_by=?,approval_reference=?,updated_at=? WHERE id=? AND status='legal_review' AND EXISTS(SELECT 1 FROM legal_review_events WHERE id=?)",
      ).bind(
        timestamp,
        packet.reviewer_id,
        packet.id,
        timestamp,
        item.id,
        eventId,
      ),
    ),
    c.env.DB.prepare(
      "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,occurred_at) SELECT ?,actor_user_id,'legal.published','LegalReview',packet_id,?,? FROM legal_review_events WHERE id=?",
    ).bind(
      crypto.randomUUID(),
      JSON.stringify({ packetHash: packet.packet_hash }),
      timestamp,
      eventId,
    ),
  ]);
  if (results[0]?.meta.changes !== 1) {
    const previous = await c.env.DB.prepare(
      "SELECT id FROM legal_review_events WHERE packet_id=? AND kind='published'",
    )
      .bind(packet.id)
      .first();
    return previous
      ? c.json({ published: true, duplicate: true })
      : c.json(
          {
            message:
              "Review or document versions changed; reload before publishing",
          },
          409,
        );
  }
  return c.json({ published: true });
});
routes.get("/owner/legal-reviews/:id/receipt", async (c) => {
  const packet = await visiblePacket(c);
  if (!packet) return c.json({ message: "Review not found" }, 404);
  const events = (
    await c.env.DB.prepare(
      "SELECT actor_user_id,kind,body,signed_name,packet_hash,occurred_at FROM legal_review_events WHERE packet_id=? ORDER BY occurred_at,id",
    )
      .bind(packet.id)
      .all()
  ).results;
  c.header(
    "content-disposition",
    `attachment; filename="lex-review-${packet.id}.json"`,
  );
  return c.json({
    schemaVersion: 1,
    packet,
    documents: await packetItems(c, packet.id),
    events,
    notice:
      "Electronic review evidence; not a certificate of regulatory approval or execution for both companies.",
  });
});
routes.post("/owner/legal-reviews/:id/invitation-link", async (c) => {
  const packet = await visiblePacket(c);
  if (!packet || packet.requested_by !== c.get("user").id)
    return c.json({ message: "Review not found" }, 404);
  const token = randomToken(),
    expiresAt = future(7 * 86400_000),
    timestamp = now();
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE legal_review_packets SET token_hash=?,expires_at=? WHERE id=? AND state='pending' AND claimed_at IS NULL",
    ).bind(await sha256(token), expiresAt, packet.id),
    c.env.DB.prepare(
      "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,occurred_at) SELECT ?,?,'legal.invitation_rotated','LegalReview',id,'{}',? FROM legal_review_packets WHERE id=? AND token_hash=? AND state='pending' AND claimed_at IS NULL",
    ).bind(
      crypto.randomUUID(),
      c.get("user").id,
      timestamp,
      packet.id,
      await sha256(token),
    ),
  ]);
  return results[0]?.meta.changes === 1
    ? c.json({ invitationToken: token, expiresAt })
    : c.json(
        { message: "Only an unclaimed pending review can be invited" },
        409,
      );
});
routes.post("/owner/legal-reviews/:id/invite", async (c) => {
  const packet = await visiblePacket(c);
  if (!packet || packet.requested_by !== c.get("user").id)
    return c.json({ message: "Review not found" }, 404);
  if (packet.state !== "pending" || packet.claimed_at)
    return c.json(
      { message: "Only an unclaimed pending review can be invited" },
      409,
    );
  if (c.env.EMAIL_DELIVERY_ENABLED !== "true" || !c.env.LEGAL_REVIEW_ORIGIN)
    return c.json(
      {
        message:
          "Configure the verified email sender and HTTPS review origin first",
      },
      503,
    );
  const recipient = await c.env.DB.prepare(
    "SELECT email_encrypted,email_verified_at FROM users WHERE id=?",
  )
    .bind(packet.reviewer_id)
    .first<{
      email_encrypted: string | null;
      email_verified_at: string | null;
    }>();
  if (!recipient?.email_encrypted || !recipient.email_verified_at)
    return c.json(
      { message: "The reviewer needs a verified email destination" },
      409,
    );
  const origin = new URL(c.env.LEGAL_REVIEW_ORIGIN);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    return c.json({ message: "Review origin must be an HTTPS origin" }, 503);
  const token = randomToken();
  const tokenHash = await sha256(token);
  const rotated = await c.env.DB.prepare(
    "UPDATE legal_review_packets SET token_hash=?,expires_at=? WHERE id=? AND state='pending' AND claimed_at IS NULL",
  )
    .bind(tokenHash, future(7 * 86400_000), packet.id)
    .run();
  if (rotated.meta.changes !== 1)
    return c.json({ message: "Review changed; reload before inviting" }, 409);
  const encrypted = await encrypt(
    JSON.stringify({
      recipient: recipient.email_encrypted,
      packetId: packet.id,
      tokenHash,
      link: `${origin.origin}/legal/review/#request=${packet.id}&token=${token}`,
    }),
    c.env.FIELD_ENCRYPTION_KEY,
  );
  const job = await recordJobBeforePublish(c.env, {
    kind: "legal_review_invitation",
    queueName: "notifications",
    idempotencyKey: `legal-invite:${packet.id}:${await sha256(token)}`,
    payload: { encrypted },
  });
  return c.json({ queued: true, jobId: job.id }, 202);
});
async function visiblePacket(c: AppContext) {
  return c.env.DB.prepare(
    "SELECT id,requested_by,reviewer_id,packet_hash,state,expires_at,claimed_at,created_at FROM legal_review_packets WHERE id=? AND (requested_by=? OR reviewer_id=?)",
  )
    .bind(c.req.param("id"), c.get("user").id, c.get("user").id)
    .first<Packet>();
}
async function packetItems(c: AppContext, id: string) {
  return (
    await c.env.DB.prepare(
      `SELECT ${columns} FROM legal_review_items i JOIN legal_document_versions v ON v.id=i.document_version_id JOIN legal_documents d ON d.id=v.document_id WHERE i.packet_id=? ORDER BY v.id`,
    )
      .bind(id)
      .all<Version>()
  ).results;
}
function auditStatement(
  c: AppContext,
  action: string,
  id: string,
  metadata: unknown,
  timestamp: string,
) {
  return c.env.DB.prepare(
    "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
  ).bind(
    crypto.randomUUID(),
    c.get("user").id,
    action,
    "LegalDocument",
    id,
    JSON.stringify(metadata),
    c.get("requestId"),
    timestamp,
  );
}
export default routes;
