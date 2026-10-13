import { zValidator } from "@hono/zod-validator";
import { optionalProcessingAllowed } from "@lex/d1";
import {
  aiIntakeConfirmationSchema,
  aiIntakeMessageSchema,
  cookiePreferenceSchema,
  createAiIntakeSessionSchema,
  professionalApplicationReviewSchema,
  professionalApplicationSchema,
} from "@lex/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { constantTimeEqual, encrypt, hmac, sha256 } from "./crypto.js";
import { requireAuth, requireRole, type AppContext } from "./middleware.js";
import { audit, future, now, recordJobBeforePublish } from "./repository.js";
import type { Env, Variables } from "./types.js";

const routes = new Hono<{ Bindings: Env; Variables: Variables }>();
const canonicalRoles = ["client", "lawyer", "operations", "owner"] as const;

routes.post(
  "/internal/founder-bootstrap",
  zValidator(
    "json",
    z.object({
      founders: z
        .array(
          z.object({
            label: z.string().trim().min(2).max(120),
            phone: z.string().regex(/^\+[1-9]\d{7,14}$/u),
            email: z.email(),
            roles: z.array(z.enum(canonicalRoles)).min(1),
            defaultRole: z.enum(canonicalRoles),
          }),
        )
        .length(2),
    }),
  ),
  async (context) => {
    const bootstrapError = await bootstrapAuthorizationError(context);
    if (bootstrapError) return bootstrapError;

    const timestamp = now();
    const results: Array<{ label: string; userId: string; created: boolean }> =
      [];
    for (const founder of context.req.valid("json").founders) {
      if (!founder.roles.includes(founder.defaultRole))
        return context.json(
          { message: `Default role is not assigned for ${founder.label}` },
          422,
        );
      const phoneHash = await hmac(
        founder.phone.toLowerCase(),
        context.env.AUTH_HMAC_PEPPER,
      );
      const emailHash = await hmac(
        founder.email.toLowerCase(),
        context.env.AUTH_HMAC_PEPPER,
      );
      const existing = await context.env.DB.prepare(
        "SELECT id FROM users WHERE phone_hash=? OR email_hash=? LIMIT 1",
      )
        .bind(phoneHash, emailHash)
        .first<{ id: string }>();
      const userId = existing?.id ?? crypto.randomUUID();
      const legacyRole = founder.roles.includes("owner")
        ? "super_admin"
        : founder.roles.includes("lawyer")
          ? "lawyer"
          : "client";
      const statements = [
        context.env.DB.prepare(
          `INSERT INTO users
           (id,role,status,display_name,default_mobile_role,default_web_role,phone_encrypted,phone_hash,phone_verified_at,email_encrypted,email_hash,email_verified_at,preferred_language,mfa_enabled,version,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,1,?,?)
           ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,default_mobile_role=excluded.default_mobile_role,default_web_role=excluded.default_web_role,phone_encrypted=excluded.phone_encrypted,phone_hash=excluded.phone_hash,phone_verified_at=excluded.phone_verified_at,email_encrypted=excluded.email_encrypted,email_hash=excluded.email_hash,email_verified_at=excluded.email_verified_at,updated_at=excluded.updated_at`,
        ).bind(
          userId,
          legacyRole,
          "active",
          founder.label,
          founder.roles.includes("client") ? "client" : founder.defaultRole,
          founder.defaultRole,
          await encrypt(founder.phone, context.env.FIELD_ENCRYPTION_KEY),
          phoneHash,
          timestamp,
          await encrypt(
            founder.email.toLowerCase(),
            context.env.FIELD_ENCRYPTION_KEY,
          ),
          emailHash,
          timestamp,
          "en",
          timestamp,
          timestamp,
        ),
      ];
      for (const role of founder.roles) {
        statements.push(
          context.env.DB.prepare(
            `INSERT INTO user_role_assignments
             (id,user_id,role,status,assignment_source,assigned_at)
             VALUES (?,?,?,'active','founder_authorized_staging_bootstrap',?)
             ON CONFLICT(user_id,role) DO UPDATE SET status='active',revoked_at=NULL`,
          ).bind(crypto.randomUUID(), userId, role, timestamp),
        );
      }
      const contactFingerprint = await sha256(`${phoneHash}:${emailHash}`);
      statements.push(
        context.env.DB.prepare(
          `INSERT OR IGNORE INTO founder_bootstrap_events
           (id,user_id,contact_fingerprint,assigned_roles_json,verification_source,occurred_at)
           VALUES (?,?,?,?,?,?)`,
        ).bind(
          crypto.randomUUID(),
          userId,
          contactFingerprint,
          JSON.stringify(founder.roles),
          "founder_authorized_staging_bootstrap",
          timestamp,
        ),
      );
      statements.push(
        context.env.DB.prepare(
          `INSERT INTO audit_events
           (id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,occurred_at)
           VALUES (?,NULL,'founder.staging_bootstrapped','User',?,?,?,?)`,
        ).bind(
          crypto.randomUUID(),
          userId,
          JSON.stringify({
            label: founder.label,
            roles: founder.roles,
            defaultRole: founder.defaultRole,
            verificationSource: "founder_authorized_staging_bootstrap",
          }),
          context.get("requestId"),
          timestamp,
        ),
      );
      await context.env.DB.batch(statements);
      results.push({ label: founder.label, userId, created: !existing });
    }
    return context.json({ bootstrapped: results });
  },
);

routes.post("/internal/openai-smoke", async (context) => {
  const bootstrapError = await bootstrapAuthorizationError(context);
  if (bootstrapError) return bootstrapError;
  const timestamp = now();
  const userId = "synthetic-openai-smoke-user";
  const conversationId = crypto.randomUUID();
  const clientTurnId = crypto.randomUUID();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT OR IGNORE INTO users
       (id,role,status,display_name,default_mobile_role,default_web_role,preferred_language,mfa_enabled,version,created_at,updated_at)
       VALUES (?,'client','active','Synthetic OpenAI smoke client','client','client','en',0,1,?,?)`,
    ).bind(userId, timestamp, timestamp),
    context.env.DB.prepare(
      `INSERT OR IGNORE INTO user_role_assignments
       (id,user_id,role,status,assignment_source,assigned_at)
       VALUES (?,?, 'client','active','synthetic_provider_smoke',?)`,
    ).bind(crypto.randomUUID(), userId, timestamp),
    context.env.DB.prepare(
      `INSERT INTO channel_conversations
       (id,user_id,channel,language,state,ai_disclosure_version,ai_enabled,version,created_at,updated_at)
       VALUES (?,?,'web','en','active','synthetic-provider-smoke-v1',1,1,?,?)`,
    ).bind(conversationId, userId, timestamp, timestamp),
    context.env.DB.prepare(
      `INSERT INTO conversation_turns
       (id,conversation_id,actor,body,client_message_id,status,created_at)
       VALUES (?,?,'client','My synthetic test issue is that a supplier did not deliver goods after a written business contract. No real person or matter is involved.',?,'recorded',?)`,
    ).bind(
      clientTurnId,
      conversationId,
      `synthetic-${clientTurnId}`,
      timestamp,
    ),
  ]);
  const job = await recordJobBeforePublish(context.env, {
    kind: "ai_guided_intake",
    queueName: "jobs",
    idempotencyKey: `openai-smoke:${conversationId}`,
    payload: { conversationId, clientTurnId },
  });
  return context.json({ conversationId, jobId: job.id, state: "queued" }, 202);
});

routes.get("/internal/openai-smoke/:id", async (context) => {
  const bootstrapError = await bootstrapAuthorizationError(context);
  if (bootstrapError) return bootstrapError;
  const conversationId = context.req.param("id");
  const result = await context.env.DB.prepare(
    `SELECT c.state conversation_state,j.state job_state,j.attempts,j.last_error,
            a.model,a.prompt_version,a.schema_version,a.latency_ms,a.token_use_json,
            a.requires_human_review,a.created_at
       FROM channel_conversations c
       LEFT JOIN jobs j ON j.idempotency_key='openai-smoke:' || c.id
       LEFT JOIN ai_runs a ON json_extract(a.input_refs_json,'$.conversationId')=c.id
      WHERE c.id=? AND c.user_id='synthetic-openai-smoke-user'
      ORDER BY a.created_at DESC LIMIT 1`,
  )
    .bind(conversationId)
    .first();
  return result
    ? context.json(result)
    : context.json({ message: "Synthetic OpenAI smoke run not found" }, 404);
});

routes.use("/legal/*", requireAuth);
routes.use("/cookie-preferences", requireAuth);
routes.use("/professional-applications/*", requireAuth);
routes.use("/ai/*", requireAuth);
routes.use("/owner/*", requireAuth);

// Legal publication, acceptance and review live in legal-routes.ts.

routes.put(
  "/cookie-preferences",
  zValidator("json", cookiePreferenceSchema),
  async (context) => {
    const user = context.get("user");
    const input = context.req.valid("json");
    const timestamp = now();
    await context.env.DB.prepare(
      `INSERT INTO cookie_preferences
       (user_id,essential,analytics,preferences,marketing,policy_version,updated_at)
       VALUES (?,1,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET analytics=excluded.analytics,preferences=excluded.preferences,marketing=excluded.marketing,policy_version=excluded.policy_version,updated_at=excluded.updated_at`,
    )
      .bind(
        user.id,
        input.analytics ? 1 : 0,
        input.preferences ? 1 : 0,
        input.marketing ? 1 : 0,
        input.policyVersion,
        timestamp,
      )
      .run();
    return context.json({ essential: true, ...input, updatedAt: timestamp });
  },
);

routes.get("/professional-applications/me", async (context) => {
  const result = await context.env.DB.prepare(
    `SELECT a.*,
            (SELECT COUNT(*) FROM professional_credentials c WHERE c.application_id=a.id) credential_count
       FROM professional_applications a WHERE a.user_id=?`,
  )
    .bind(context.get("user").id)
    .first();
  return result ? context.json(result) : context.json({ state: "not_started" });
});

routes.put(
  "/professional-applications/me",
  zValidator("json", professionalApplicationSchema),
  async (context) => {
    const user = context.get("user");
    const input = context.req.valid("json");
    const current = await context.env.DB.prepare(
      "SELECT id,state,version FROM professional_applications WHERE user_id=?",
    )
      .bind(user.id)
      .first<{ id: string; state: string; version: number }>();
    if (current && !["draft", "information_requested"].includes(current.state))
      return context.json(
        { message: "This application cannot currently be edited" },
        409,
      );
    const id = current?.id ?? crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.prepare(
      `INSERT INTO professional_applications
       (id,user_id,legal_name,public_name,professional_email,professional_phone,date_of_birth_encrypted,supreme_court_number,year_of_call,jurisdiction_of_call,firm_name,office_address,website,biography,languages_json,state_codes_json,practice_area_codes_json,consultation_modes_json,weekly_capacity,urgent_available,conduct_declaration,disciplinary_disclosure,terms_version,state,version,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',1,?,?)
       ON CONFLICT(user_id) DO UPDATE SET legal_name=excluded.legal_name,public_name=excluded.public_name,professional_email=excluded.professional_email,professional_phone=excluded.professional_phone,date_of_birth_encrypted=excluded.date_of_birth_encrypted,supreme_court_number=excluded.supreme_court_number,year_of_call=excluded.year_of_call,jurisdiction_of_call=excluded.jurisdiction_of_call,firm_name=excluded.firm_name,office_address=excluded.office_address,website=excluded.website,biography=excluded.biography,languages_json=excluded.languages_json,state_codes_json=excluded.state_codes_json,practice_area_codes_json=excluded.practice_area_codes_json,consultation_modes_json=excluded.consultation_modes_json,weekly_capacity=excluded.weekly_capacity,urgent_available=excluded.urgent_available,conduct_declaration=excluded.conduct_declaration,disciplinary_disclosure=excluded.disciplinary_disclosure,terms_version=excluded.terms_version,state='draft',version=professional_applications.version+1,updated_at=excluded.updated_at`,
    )
      .bind(
        id,
        user.id,
        input.legalName,
        input.publicName,
        input.professionalEmail,
        input.professionalPhone,
        input.dateOfBirth
          ? await encrypt(input.dateOfBirth, context.env.FIELD_ENCRYPTION_KEY)
          : null,
        input.supremeCourtNumber,
        input.yearOfCall,
        input.jurisdictionOfCall,
        input.firmName ?? null,
        input.officeAddress ?? null,
        input.website ?? null,
        input.biography,
        JSON.stringify(input.languages),
        JSON.stringify(input.stateCodes),
        JSON.stringify(input.practiceAreaCodes),
        JSON.stringify(input.consultationModes),
        input.weeklyCapacity,
        input.urgentAvailable ? 1 : 0,
        input.conductDeclaration ? 1 : 0,
        input.disciplinaryDisclosure ?? null,
        input.termsVersion,
        timestamp,
        timestamp,
      )
      .run();
    await audit(context.env, {
      actorUserId: user.id,
      action: "professional.application_saved",
      entityType: "ProfessionalApplication",
      entityId: id,
      requestId: context.get("requestId"),
    });
    return context.json({ id, state: "draft" });
  },
);

routes.post("/professional-applications/me/submit", async (context) => {
  const user = context.get("user");
  const timestamp = now();
  const result = await context.env.DB.prepare(
    "UPDATE professional_applications SET state='submitted',submitted_at=?,version=version+1,updated_at=? WHERE user_id=? AND state IN ('draft','information_requested')",
  )
    .bind(timestamp, timestamp, user.id)
    .run();
  if ((result.meta.changes ?? 0) !== 1)
    return context.json({ message: "No application is ready to submit" }, 409);
  await audit(context.env, {
    actorUserId: user.id,
    action: "professional.application_submitted",
    entityType: "User",
    entityId: user.id,
    requestId: context.get("requestId"),
  });
  return context.json({ state: "submitted", submittedAt: timestamp });
});

routes.put("/professional-applications/me/evidence", async (context) => {
  const user = context.get("user");
  const application = await context.env.DB.prepare(
    "SELECT id,state FROM professional_applications WHERE user_id=?",
  )
    .bind(user.id)
    .first<{ id: string; state: string }>();
  if (!application)
    return context.json(
      { message: "Save the professional application first" },
      409,
    );
  if (!["draft", "information_requested"].includes(application.state))
    return context.json(
      { message: "Evidence cannot be added in this application state" },
      409,
    );

  const size = Number(context.req.header("content-length"));
  const max = Number(context.env.MAX_EVIDENCE_BYTES);
  if (!Number.isInteger(size) || size < 1 || size > max)
    return context.json(
      { message: `Evidence must be between 1 and ${max} bytes` },
      413,
    );
  const contentType = (context.req.header("content-type") ?? "")
    .split(";")[0]!
    .toLowerCase();
  if (!new Set(["application/pdf", "image/jpeg", "image/png"]).has(contentType))
    return context.json(
      { message: "Credential evidence type is not allowed" },
      415,
    );
  const checksum = context.req.header("x-file-sha256")?.toLowerCase();
  if (!checksum || !/^[a-f0-9]{64}$/u.test(checksum))
    return context.json(
      { message: "A lowercase hexadecimal SHA-256 checksum is required" },
      422,
    );
  const credentialType = (
    context.req.header("x-credential-type") ?? "practice_licence"
  )
    .trim()
    .toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,63}$/u.test(credentialType))
    return context.json({ message: "Credential type is invalid" }, 422);
  if (!context.req.raw.body)
    return context.json(
      { message: "Credential evidence body is required" },
      400,
    );

  const credentialId = crypto.randomUUID();
  const objectKey = `quarantine/professional/${application.id}/${crypto.randomUUID()}`;
  const timestamp = now();
  try {
    const object = await context.env.PRIVATE_EVIDENCE.put(
      objectKey,
      context.req.raw.body,
      {
        httpMetadata: { contentType },
        customMetadata: {
          credentialId,
          applicationId: application.id,
          syntheticOnly: "true",
        },
        sha256: checksum,
      },
    );
    if (!object.checksums.sha256)
      throw new Error("R2 did not confirm the SHA-256 checksum");
    await context.env.DB.prepare(
      `INSERT INTO professional_credentials
       (id,application_id,credential_type,evidence_object_key,state,created_at,updated_at)
       VALUES (?,?,?,?,'pending',?,?)`,
    )
      .bind(
        credentialId,
        application.id,
        credentialType,
        objectKey,
        timestamp,
        timestamp,
      )
      .run();
  } catch (error) {
    await context.env.PRIVATE_EVIDENCE.delete(objectKey);
    return context.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Credential evidence upload failed",
      },
      422,
    );
  }
  await audit(context.env, {
    actorUserId: user.id,
    action: "professional.credential_uploaded",
    entityType: "ProfessionalCredential",
    entityId: credentialId,
    requestId: context.get("requestId"),
    metadata: { credentialType, contentType, size, state: "pending" },
  });
  return context.json(
    { id: credentialId, credentialType, status: "quarantined_pending_review" },
    201,
  );
});

routes.post(
  "/ai/intake-sessions",
  zValidator("json", createAiIntakeSessionSchema),
  async (context) => {
    const user = context.get("user");
    if (user.role !== "client")
      return context.json(
        { message: "Ask Lex is available in the client workspace" },
        403,
      );
    const input = context.req.valid("json");
    const id = crypto.randomUUID();
    const timestamp = now();
    const aiAllowed = await optionalProcessingAllowed(
      context.env.DB,
      user.id,
      "ai-routing-disclosure",
    );
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO channel_conversations
         (id,user_id,channel,language,state,ai_disclosure_version,ai_enabled,version,created_at,updated_at)
         VALUES (?,?,?,?,'active',?,?,1,?,?)`,
      ).bind(
        id,
        user.id,
        input.channel,
        input.language,
        input.aiDisclosureVersion,
        aiAllowed ? 1 : 0,
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        `INSERT INTO conversation_turns
         (id,conversation_id,actor,body,status,created_at)
         VALUES (?,?,'system',?,'recorded',?)`,
      ).bind(
        crypto.randomUUID(),
        id,
        "The client accepted the AI-assisted intake disclosure. AI output is not legal advice and requires confirmation.",
        timestamp,
      ),
    ]);
    return context.json(
      {
        id,
        state: "active",
        provider:
          aiAllowed && isOpenAIConfigured(context.env)
            ? "openai"
            : "deterministic_fallback",
        disclosureVersion: input.aiDisclosureVersion,
      },
      201,
    );
  },
);

routes.get("/ai/intake-sessions/:id", async (context) => {
  const user = context.get("user");
  const conversation = await ownedConversation(
    context.env,
    context.req.param("id") ?? "",
    user.id,
  );
  if (!conversation)
    return context.json({ message: "AI intake session not found" }, 404);
  const turns = await context.env.DB.prepare(
    "SELECT id,actor,body,status,created_at FROM conversation_turns WHERE conversation_id=? AND actor<>'system' ORDER BY created_at",
  )
    .bind(conversation.id)
    .all();
  const aiAllowed =
    conversation.ai_enabled === 1 &&
    (await optionalProcessingAllowed(
      context.env.DB,
      user.id,
      "ai-routing-disclosure",
    ));
  return context.json({
    ...conversation,
    turns: turns.results,
    provider:
      aiAllowed && isOpenAIConfigured(context.env)
        ? "openai"
        : "deterministic_fallback",
  });
});

routes.post(
  "/ai/intake-sessions/:id/messages",
  zValidator("json", aiIntakeMessageSchema),
  async (context) => {
    const user = context.get("user");
    const conversation = await ownedConversation(
      context.env,
      context.req.param("id"),
      user.id,
    );
    if (!conversation)
      return context.json({ message: "AI intake session not found" }, 404);
    if (!["active", "awaiting_confirmation"].includes(conversation.state))
      return context.json(
        { message: "This AI intake session is not accepting messages" },
        409,
      );
    const input = context.req.valid("json");
    const existing = await context.env.DB.prepare(
      "SELECT id FROM conversation_turns WHERE conversation_id=? AND client_message_id=?",
    )
      .bind(conversation.id, input.clientMessageId)
      .first<{ id: string }>();
    if (existing) return context.json({ id: existing.id, duplicate: true });
    const turnId = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO conversation_turns
         (id,conversation_id,actor,body,client_message_id,status,created_at)
         VALUES (?,?,'client',?,?,'recorded',?)`,
      ).bind(
        turnId,
        conversation.id,
        input.body,
        input.clientMessageId,
        timestamp,
      ),
      context.env.DB.prepare(
        "UPDATE channel_conversations SET state='active',version=version+1,updated_at=? WHERE id=?",
      ).bind(timestamp, conversation.id),
    ]);
    const job = await recordJobBeforePublish(context.env, {
      kind: "ai_guided_intake",
      queueName: "jobs",
      idempotencyKey: `ai-guided:${turnId}`,
      payload: { conversationId: conversation.id, clientTurnId: turnId },
    });
    return context.json(
      { id: turnId, jobId: job.id, state: "processing" },
      202,
    );
  },
);

routes.post(
  "/ai/intake-sessions/:id/confirm",
  zValidator("json", aiIntakeConfirmationSchema),
  async (context) => {
    const user = context.get("user");
    const conversation = await ownedConversation(
      context.env,
      context.req.param("id"),
      user.id,
    );
    if (!conversation)
      return context.json({ message: "AI intake session not found" }, 404);
    const input = context.req.valid("json");
    const timestamp = now();
    await context.env.DB.prepare(
      "UPDATE channel_conversations SET state='completed',classification_json=?,version=version+1,updated_at=? WHERE id=?",
    )
      .bind(JSON.stringify(input), timestamp, conversation.id)
      .run();
    await audit(context.env, {
      actorUserId: user.id,
      action: "ai.intake_confirmed",
      entityType: "ChannelConversation",
      entityId: conversation.id,
      requestId: context.get("requestId"),
      metadata: {
        practiceAreaCode: input.practiceAreaCode,
        corrected: Boolean(input.corrections),
      },
    });
    return context.json({ state: "completed", confirmedAt: timestamp });
  },
);

routes.post("/ai/intake-sessions/:id/human-review", async (context) => {
  return createHandoff(context, "client_requested_human_review");
});
routes.post("/ai/intake-sessions/:id/challenge", async (context) => {
  return createHandoff(context, "automated_routing_challenged");
});

routes.get("/owner/users", requireRole("owner"), async (context) => {
  const result = await context.env.DB.prepare(
    `SELECT u.id,u.display_name,u.status,u.phone_verified_at,u.email_verified_at,u.mfa_enabled,u.created_at,
            group_concat(r.role) roles
       FROM users u LEFT JOIN user_role_assignments r ON r.user_id=u.id AND r.status='active'
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`,
  ).all();
  return context.json(result.results);
});

routes.get("/owner/approvals", requireRole("owner"), async (context) => {
  const result = await context.env.DB.prepare(
    `SELECT r.id,r.action,r.target_type,r.target_id,r.payload_json,r.requested_by,r.state,r.expires_at,r.created_at,r.updated_at,
            (SELECT COUNT(*) FROM privileged_action_approvals a WHERE a.request_id=r.id AND a.decision='approved') approval_count,
            (SELECT COUNT(*) FROM privileged_action_approvals a WHERE a.request_id=r.id AND a.decision='rejected') rejection_count
       FROM privileged_action_requests r ORDER BY r.created_at DESC LIMIT 100`,
  ).all();
  return context.json(result.results);
});

routes.post(
  "/owner/approvals",
  requireRole("owner"),
  zValidator(
    "json",
    z.object({
      action: z.string().trim().min(3).max(120),
      targetType: z.string().trim().min(2).max(80),
      targetId: z.string().trim().min(1).max(180),
      payload: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
  async (context) => {
    const stepUpError = requireRecentStepUp(context);
    if (stepUpError) return stepUpError;
    const user = context.get("user");
    const input = context.req.valid("json");
    const id = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.prepare(
      `INSERT INTO privileged_action_requests
       (id,action,target_type,target_id,payload_json,requested_by,state,expires_at,version,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'pending',?,1,?,?)`,
    )
      .bind(
        id,
        input.action,
        input.targetType,
        input.targetId,
        JSON.stringify(input.payload),
        user.id,
        future(24 * 60 * 60_000),
        timestamp,
        timestamp,
      )
      .run();
    await audit(context.env, {
      actorUserId: user.id,
      action: "privileged_action.requested",
      entityType: "PrivilegedActionRequest",
      entityId: id,
      requestId: context.get("requestId"),
      metadata: { action: input.action, targetType: input.targetType },
    });
    return context.json(
      { id, state: "pending", requiresDistinctOwner: true },
      201,
    );
  },
);

routes.post(
  "/owner/approvals/:id/decision",
  requireRole("owner"),
  zValidator("json", z.object({ decision: z.enum(["approved", "rejected"]) })),
  async (context) => {
    const stepUpError = requireRecentStepUp(context);
    if (stepUpError) return stepUpError;
    const user = context.get("user");
    const request = await context.env.DB.prepare(
      "SELECT id,requested_by,state,expires_at FROM privileged_action_requests WHERE id=?",
    )
      .bind(context.req.param("id"))
      .first<{
        id: string;
        requested_by: string;
        state: string;
        expires_at: string;
      }>();
    if (!request)
      return context.json({ message: "Approval request not found" }, 404);
    if (request.requested_by === user.id)
      return context.json(
        { message: "A distinct owner must decide this request" },
        409,
      );
    if (request.state !== "pending")
      return context.json(
        { message: "Approval request is no longer pending" },
        409,
      );
    const timestamp = now();
    if (Date.parse(request.expires_at) <= Date.now()) {
      await context.env.DB.prepare(
        "UPDATE privileged_action_requests SET state='expired',version=version+1,updated_at=? WHERE id=? AND state='pending'",
      )
        .bind(timestamp, request.id)
        .run();
      return context.json({ message: "Approval request has expired" }, 409);
    }
    const { decision } = context.req.valid("json");
    const nextState = decision === "approved" ? "approved" : "rejected";
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO privileged_action_approvals (request_id,owner_user_id,decision,decided_at)
         VALUES (?,?,?,?)`,
      ).bind(request.id, user.id, decision, timestamp),
      context.env.DB.prepare(
        "UPDATE privileged_action_requests SET state=?,version=version+1,updated_at=? WHERE id=? AND state='pending'",
      ).bind(nextState, timestamp, request.id),
    ]);
    await audit(context.env, {
      actorUserId: user.id,
      action: `privileged_action.${decision}`,
      entityType: "PrivilegedActionRequest",
      entityId: request.id,
      requestId: context.get("requestId"),
    });
    return context.json({ id: request.id, state: nextState, executed: false });
  },
);

routes.get(
  "/owner/professional-applications",
  requireRole("owner", "operations"),
  async (context) => {
    const result = await context.env.DB.prepare(
      "SELECT id,user_id,legal_name,public_name,supreme_court_number,year_of_call,state,submitted_at,updated_at FROM professional_applications ORDER BY updated_at DESC",
    ).all();
    return context.json(result.results);
  },
);

routes.post(
  "/owner/professional-applications/:id/review",
  requireRole("owner", "operations"),
  zValidator("json", professionalApplicationReviewSchema),
  async (context) => {
    const user = context.get("user");
    const input = context.req.valid("json");
    const application = await context.env.DB.prepare(
      "SELECT id,user_id,legal_name,public_name,supreme_court_number,year_of_call,firm_name,biography,languages_json,state_codes_json,practice_area_codes_json,urgent_available FROM professional_applications WHERE id=?",
    )
      .bind(context.req.param("id"))
      .first<Record<string, unknown> & { id: string; user_id: string }>();
    if (!application)
      return context.json({ message: "Application not found" }, 404);
    const nextState =
      input.decision === "information_requested"
        ? "information_requested"
        : input.decision === "approved" || input.decision === "renewed"
          ? "approved"
          : "declined";
    const timestamp = now();
    const statements = [
      context.env.DB.prepare(
        `INSERT INTO professional_verification_reviews
         (id,application_id,reviewer_id,decision,reason,evidence_reference,licence_expires_at,created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        application.id,
        user.id,
        input.decision,
        input.reason,
        input.evidenceReference ?? null,
        input.licenceExpiresAt ?? null,
        timestamp,
      ),
      context.env.DB.prepare(
        "UPDATE professional_applications SET state=?,reviewed_at=?,reviewed_by=?,review_reason=?,version=version+1,updated_at=? WHERE id=?",
      ).bind(
        nextState,
        timestamp,
        user.id,
        input.reason,
        timestamp,
        application.id,
      ),
    ];
    if (nextState === "approved") {
      const lawyerId = crypto.randomUUID();
      statements.push(
        context.env.DB.prepare(
          `INSERT INTO user_role_assignments
           (id,user_id,role,status,assigned_by,assignment_source,assigned_at)
           VALUES (?,?,'lawyer','active',?,'professional_verification',?)
           ON CONFLICT(user_id,role) DO UPDATE SET status='active',assigned_by=excluded.assigned_by,revoked_at=NULL`,
        ).bind(crypto.randomUUID(), application.user_id, user.id, timestamp),
        context.env.DB.prepare(
          `INSERT INTO lawyer_profiles
           (id,user_id,display_name,supreme_court_number,year_of_call,firm_name,bio,verification_status,verification_expires_at,available,urgent_available,version,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,'verified',?,0,?,1,?,?)
           ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,supreme_court_number=excluded.supreme_court_number,year_of_call=excluded.year_of_call,firm_name=excluded.firm_name,bio=excluded.bio,verification_status='verified',verification_expires_at=excluded.verification_expires_at,available=0,urgent_available=excluded.urgent_available,version=lawyer_profiles.version+1,updated_at=excluded.updated_at`,
        ).bind(
          lawyerId,
          application.user_id,
          application.public_name,
          application.supreme_court_number,
          application.year_of_call,
          application.firm_name ?? null,
          application.biography,
          input.licenceExpiresAt ?? null,
          application.urgent_available,
          timestamp,
          timestamp,
        ),
      );
    }
    await context.env.DB.batch(statements);
    await audit(context.env, {
      actorUserId: user.id,
      action: `professional.application_${input.decision}`,
      entityType: "ProfessionalApplication",
      entityId: application.id,
      requestId: context.get("requestId"),
      metadata: { reason: input.reason, marketplaceAvailable: false },
    });
    return context.json({
      id: application.id,
      state: nextState,
      marketplaceAvailable: false,
    });
  },
);

routes.get(
  "/owner/providers",
  requireRole("owner", "operations"),
  (context) => {
    return context.json(providerCapabilities(context.env));
  },
);

routes.get(
  "/owner/release-readiness",
  requireRole("owner", "operations"),
  async (context) => {
    const pendingLegal = await context.env.DB.prepare(
      "SELECT COUNT(*) count FROM legal_document_versions WHERE status<>'published' OR company_placeholder_present=1",
    ).first<{ count: number }>();
    const failedJobs = await context.env.DB.prepare(
      "SELECT COUNT(*) count FROM jobs WHERE state IN ('retry','dead_letter')",
    ).first<{ count: number }>();
    return context.json({
      environment: context.env.APP_ENV,
      productionReady: false,
      legalDocumentsPending: pendingLegal?.count ?? 0,
      failedJobs: failedJobs?.count ?? 0,
      providers: providerCapabilities(context.env),
      gates: [
        "lawyer-co-founder legal approval",
        "parent company details",
        "native-language review",
        "real payment and Meta provider verification",
      ],
    });
  },
);

routes.get(
  "/owner/ai-runs",
  requireRole("owner", "operations"),
  async (context) => {
    const result = await context.env.DB.prepare(
      `SELECT id,purpose,model,prompt_version,schema_version,input_refs_json,confidence_millis,
            requires_human_review,reviewed_at,token_use_json,latency_ms,created_at
       FROM ai_runs ORDER BY created_at DESC LIMIT 100`,
    ).all();
    return context.json(result.results);
  },
);

async function ownedConversation(
  env: Env,
  id: string | undefined,
  userId: string,
) {
  return env.DB.prepare(
    "SELECT id,user_id,channel,language,state,classification_json,version,ai_enabled,created_at,updated_at FROM channel_conversations WHERE id=? AND user_id=?",
  )
    .bind(id ?? "", userId)
    .first<{
      id: string;
      user_id: string;
      channel: string;
      language: string;
      state: string;
      classification_json: string | null;
      ai_enabled: number;
      version: number;
      created_at: string;
      updated_at: string;
    }>();
}

async function createHandoff(context: AppContext, reason: string) {
  const user = context.get("user");
  const conversation = await ownedConversation(
    context.env,
    context.req.param("id"),
    user.id,
  );
  if (!conversation)
    return context.json({ message: "AI intake session not found" }, 404);
  const id = crypto.randomUUID();
  const timestamp = now();
  await context.env.DB.batch([
    context.env.DB.prepare(
      "INSERT INTO conversation_handoffs (id,conversation_id,reason,state,created_at) VALUES (?,?,?,'open',?)",
    ).bind(id, conversation.id, reason, timestamp),
    context.env.DB.prepare(
      "UPDATE channel_conversations SET state='human_review',version=version+1,updated_at=? WHERE id=?",
    ).bind(timestamp, conversation.id),
  ]);
  await audit(context.env, {
    actorUserId: user.id,
    action: "ai.human_review_requested",
    entityType: "ConversationHandoff",
    entityId: id,
    requestId: context.get("requestId"),
    metadata: { reason },
  });
  return context.json({ id, state: "open", reason }, 201);
}

function requireRecentStepUp(context: AppContext) {
  const lastStepUpAt = context.get("user").lastStepUpAt;
  if (
    !lastStepUpAt ||
    !Number.isFinite(Date.parse(lastStepUpAt)) ||
    Date.now() - Date.parse(lastStepUpAt) > 10 * 60_000
  )
    return context.json(
      { message: "Recent MFA step-up is required for this privileged action" },
      403,
    );
  return null;
}

function providerCapabilities(env: Env) {
  return {
    openai: {
      implemented: true,
      configured: isOpenAIConfigured(env),
      status: env.OPENAI_PROVIDER_STATUS,
    },
    whatsapp: {
      implemented: true,
      configured: Boolean(env.META_ACCESS_TOKEN && env.META_PHONE_NUMBER_ID),
      status:
        env.META_ACCESS_TOKEN && env.META_PHONE_NUMBER_ID
          ? "ready_for_test"
          : "unconfigured",
    },
    paystack: {
      implemented: true,
      configured: Boolean(env.PAYSTACK_SECRET_KEY),
      status: env.PAYSTACK_SECRET_KEY ? "ready_for_test" : "unconfigured",
    },
    flutterwave: {
      implemented: true,
      configured: Boolean(env.FLUTTERWAVE_SECRET_KEY),
      status: env.FLUTTERWAVE_SECRET_KEY ? "ready_for_test" : "unconfigured",
    },
    expoPush: {
      implemented: true,
      configured: Boolean(env.EXPO_ACCESS_TOKEN),
      status: env.EXPO_ACCESS_TOKEN ? "ready_for_test" : "unconfigured",
    },
    email: {
      implemented: true,
      provider: env.EMAIL_PROVIDER ?? "postmark",
      configured:
        Boolean(
          env.EMAIL_PROVIDER_STATUS &&
          env.EMAIL_PROVIDER_STATUS !== "unconfigured",
        ) || env.EMAIL_DELIVERY_ENABLED === "true",
      deliveryEnabled: env.EMAIL_DELIVERY_ENABLED === "true",
      status:
        env.EMAIL_PROVIDER_STATUS ??
        (env.EMAIL_DELIVERY_ENABLED === "true"
          ? "ready_for_test"
          : "unconfigured"),
    },
  };
}

function isOpenAIConfigured(env: Env) {
  return env.OPENAI_PROVIDER_STATUS !== "unconfigured";
}

async function bootstrapAuthorizationError(context: AppContext) {
  const bootstrapSecret =
    context.env.TEST_MODE === "true"
      ? context.env.FOUNDER_BOOTSTRAP_TEST_TOKEN
      : context.env.FOUNDER_BOOTSTRAP_TOKEN;
  const bootstrapHash = context.env.FOUNDER_BOOTSTRAP_TOKEN_HASH;
  if (context.env.APP_ENV !== "staging" || (!bootstrapSecret && !bootstrapHash))
    return context.json({ message: "Staging bootstrap is unavailable" }, 404);
  const supplied = context.req.header("x-founder-bootstrap-token") ?? "";
  const authorized = bootstrapHash
    ? constantTimeEqual(supplied, bootstrapHash) ||
      constantTimeEqual(await sha256(supplied), bootstrapHash)
    : constantTimeEqual(supplied, String(bootstrapSecret));
  if (!authorized)
    return context.json({ message: "Staging bootstrap is unauthorized" }, 401);
  return null;
}

export default routes;
