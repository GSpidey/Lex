import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  acceptRepresentationProposalSchema,
  classificationConfirmationSchema,
  consultationScheduleSchema,
  engagementDeadlineSchema,
  engagementDisputeSchema,
  engagementTaskSchema,
  guardianLinkSchema,
  invoiceSchema,
  minorProfileSchema,
  organizationSchema,
  representationProposalSchema,
  refundRequestSchema,
} from "@lex/contracts";
import {
  NIGERIA_STATES,
  PRACTICE_AREAS,
  practiceAreaByCode,
  serviceForPracticeArea,
} from "@lex/jurisdictions";
import { encrypt, sha256 } from "./crypto.js";
import { canAccessMatter, requireAuth, requireRole } from "./middleware.js";
import { audit, now } from "./repository.js";
import type { Env, Variables } from "./types.js";

const routes = new Hono<{ Bindings: Env; Variables: Variables }>();

routes.get("/catalog/practice-areas", (context) => {
  const query = (context.req.query("q") ?? "").trim().toLowerCase();
  const items = PRACTICE_AREAS.filter(
    (item) =>
      !query ||
      [item.name, item.group, item.description, ...item.keywords].some(
        (value) => value.toLowerCase().includes(query),
      ),
  );
  const groups = [...new Set(items.map((item) => item.group))].map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  }));
  return context.json({
    countryCode: "NG",
    stagingAvailability: "nationwide",
    count: items.length,
    groups,
  });
});

routes.get("/catalog/services", (context) => {
  const code = context.req.query("practiceAreaCode");
  const areas = code
    ? PRACTICE_AREAS.filter((item) => item.code === code)
    : PRACTICE_AREAS;
  return context.json(
    areas.map((item) => ({
      ...serviceForPracticeArea(item.code),
      jurisdiction: {
        countryCode: "NG",
        states: NIGERIA_STATES.map(([stateCode, name]) => ({
          stateCode,
          name,
          status: "active",
        })),
      },
      syntheticStagingOnly: true,
    })),
  );
});

routes.post(
  "/internal/realtime/authorize",
  zValidator("json", z.object({ token: z.string().min(32) })),
  async (context) => {
    const tokenHash = await sha256(context.req.valid("json").token);
    const row = await context.env.DB.prepare(
      `SELECT rt.consultation_id,rt.user_id,cp.participant_role,c.matter_id,c.state
     FROM realtime_tokens rt JOIN consultation_participants cp ON cp.consultation_id=rt.consultation_id AND cp.user_id=rt.user_id
     JOIN consultations c ON c.id=rt.consultation_id
     WHERE rt.token_hash=? AND rt.expires_at>? AND rt.consumed_at IS NULL AND cp.removed_at IS NULL`,
    )
      .bind(tokenHash, now())
      .first<Record<string, string>>();
    if (!row) return context.json({ authorized: false }, 401);
    if (row.state === "scheduled") {
      const timestamp = now();
      await context.env.DB.batch([
        context.env.DB.prepare(
          "UPDATE consultations SET state='active',started_at=COALESCE(started_at,?),version=version+1,updated_at=? WHERE id=? AND state='scheduled'",
        ).bind(timestamp, timestamp, row.consultation_id),
        context.env.DB.prepare(
          "UPDATE matters SET state='consultation_active',version=version+1,updated_at=? WHERE id=? AND state='consultation_scheduled'",
        ).bind(timestamp, row.matter_id),
        context.env.DB.prepare(
          "UPDATE consultation_participants SET joined_at=COALESCE(joined_at,?),last_seen_at=? WHERE consultation_id=? AND user_id=?",
        ).bind(timestamp, timestamp, row.consultation_id, row.user_id),
      ]);
    }
    return context.json({ authorized: true, ...row });
  },
);

routes.post(
  "/internal/realtime/messages",
  zValidator(
    "json",
    z.object({
      token: z.string().min(32),
      clientMessageId: z.string().min(8).max(200),
      body: z.string().trim().min(1).max(10_000),
    }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const tokenHash = await sha256(input.token);
    const participant = await context.env.DB.prepare(
      `SELECT rt.consultation_id,rt.user_id,c.matter_id FROM realtime_tokens rt
     JOIN consultations c ON c.id=rt.consultation_id
     JOIN consultation_participants cp ON cp.consultation_id=rt.consultation_id AND cp.user_id=rt.user_id
     WHERE rt.token_hash=? AND rt.expires_at>? AND rt.consumed_at IS NULL AND cp.removed_at IS NULL AND c.state IN ('scheduled','active')`,
    )
      .bind(tokenHash, now())
      .first<{ consultation_id: string; user_id: string; matter_id: string }>();
    if (!participant)
      return context.json(
        { message: "Realtime token is invalid or expired" },
        401,
      );
    const id = crypto.randomUUID();
    const timestamp = now();
    const result = await context.env.DB.prepare(
      "INSERT OR IGNORE INTO messages (id,matter_id,sender_user_id,channel,body,message_type,consultation_id,client_message_id,created_at) VALUES (?,?,?,'web',?,'consultation_text',?,?,?)",
    )
      .bind(
        id,
        participant.matter_id,
        participant.user_id,
        input.body,
        participant.consultation_id,
        input.clientMessageId,
        timestamp,
      )
      .run();
    const saved =
      (result.meta.changes ?? 0) === 1
        ? id
        : (
            await context.env.DB.prepare(
              "SELECT id FROM messages WHERE consultation_id=? AND client_message_id=?",
            )
              .bind(participant.consultation_id, input.clientMessageId)
              .first<{ id: string }>()
          )?.id;
    return context.json({
      id: saved,
      consultationId: participant.consultation_id,
      createdAt: timestamp,
    });
  },
);

routes.use("/*", requireAuth);

routes.post(
  "/clients/minor",
  zValidator("json", minorProfileSchema),
  async (context) => {
    const user = context.get("user");
    if (user.role !== "client")
      return context.json(
        { message: "Only client accounts can create a minor profile" },
        403,
      );
    const input = context.req.valid("json");
    if (new Date(input.dateOfBirth).getTime() > Date.now())
      return context.json(
        { message: "Date of birth cannot be in the future" },
        422,
      );
    const id = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO minor_profiles (id,user_id,display_name_encrypted,date_of_birth_encrypted,status,created_at,updated_at) VALUES (?,?,?,?, 'guardian_pending',?,?)",
      ).bind(
        id,
        user.id,
        await encrypt(input.displayName, context.env.FIELD_ENCRYPTION_KEY),
        await encrypt(input.dateOfBirth, context.env.FIELD_ENCRYPTION_KEY),
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,occurred_at) VALUES (?,?,?,?,?,'{}',?,?)",
      ).bind(
        crypto.randomUUID(),
        user.id,
        "minor_profile.created",
        "MinorProfile",
        id,
        context.get("requestId"),
        timestamp,
      ),
    ]);
    return context.json(
      {
        id,
        status: "guardian_pending",
        restrictions: [
          "detailed_facts",
          "evidence",
          "lawyer_sharing",
          "payment",
        ],
      },
      201,
    );
  },
);

routes.get("/clients/minor", async (context) =>
  context.json(
    (
      await context.env.DB.prepare(
        "SELECT id,status,created_at,updated_at FROM minor_profiles WHERE user_id=?",
      )
        .bind(context.get("user").id)
        .all()
    ).results,
  ),
);

routes.post(
  "/guardian-links",
  zValidator("json", guardianLinkSchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    if (user.id !== input.guardianUserId)
      return context.json(
        { message: "A guardian may submit only their own link request" },
        403,
      );
    const minor = await context.env.DB.prepare(
      "SELECT id FROM minor_profiles WHERE id=?",
    )
      .bind(input.minorProfileId)
      .first();
    if (!minor)
      return context.json({ message: "Minor profile not found" }, 404);
    const id = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.prepare(
      "INSERT INTO guardian_links (id,minor_profile_id,guardian_user_id,relationship,identity_evidence_id,relationship_evidence_id,status,consent_version,version,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending',?,1,?,?)",
    )
      .bind(
        id,
        input.minorProfileId,
        user.id,
        input.relationship,
        input.identityEvidenceId,
        input.relationshipEvidenceId,
        input.consentVersion,
        timestamp,
        timestamp,
      )
      .run();
    await audit(context.env, {
      actorUserId: user.id,
      action: "guardian_link.requested",
      entityType: "GuardianLink",
      entityId: id,
      requestId: context.get("requestId"),
    });
    return context.json({ id, status: "pending" }, 201);
  },
);

routes.post(
  "/organizations",
  zValidator("json", organizationSchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    if (user.role !== "client")
      return context.json(
        { message: "Only client accounts can represent organizations" },
        403,
      );
    const organizationId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const reviewId = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO organizations (id,legal_name,registration_number,organization_type,status,version,created_at,updated_at) VALUES (?,?,?,?,'authority_review',1,?,?)",
      ).bind(
        organizationId,
        input.legalName,
        input.registrationNumber,
        input.organizationType,
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        "INSERT INTO organization_memberships (id,organization_id,user_id,role,status,created_at,updated_at) VALUES (?,?,?,'representative','pending',?,?)",
      ).bind(membershipId, organizationId, user.id, timestamp, timestamp),
      context.env.DB.prepare(
        "INSERT INTO authority_reviews (id,organization_id,membership_id,evidence_id,decision,version,created_at,updated_at) VALUES (?,?,?,?,'pending',1,?,?)",
      ).bind(
        reviewId,
        organizationId,
        membershipId,
        input.authorityEvidenceId ?? null,
        timestamp,
        timestamp,
      ),
    ]);
    await audit(context.env, {
      actorUserId: user.id,
      action: "organization.authority_requested",
      entityType: "Organization",
      entityId: organizationId,
      requestId: context.get("requestId"),
    });
    return context.json(
      {
        id: organizationId,
        membershipId,
        authorityReviewId: reviewId,
        status: "authority_review",
      },
      201,
    );
  },
);

routes.get("/organizations", async (context) =>
  context.json(
    (
      await context.env.DB.prepare(
        `SELECT o.id,o.legal_name,o.registration_number,o.organization_type,o.status,m.role,m.status membership_status
   FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id WHERE m.user_id=? ORDER BY o.created_at DESC`,
      )
        .bind(context.get("user").id)
        .all()
    ).results,
  ),
);

routes.get("/organizations/:id/members", async (context) => {
  const allowed = await context.env.DB.prepare(
    "SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='approved'",
  )
    .bind(context.req.param("id"), context.get("user").id)
    .first();
  if (!allowed) return context.json({ message: "Organization not found" }, 404);
  return context.json(
    (
      await context.env.DB.prepare(
        "SELECT id,user_id,role,status,created_at FROM organization_memberships WHERE organization_id=?",
      )
        .bind(context.req.param("id"))
        .all()
    ).results,
  );
});

routes.post(
  "/intakes/:id/classification",
  zValidator("json", classificationConfirmationSchema),
  async (context) => {
    const input = context.req.valid("json");
    if (!practiceAreaByCode(input.practiceAreaCode))
      return context.json({ message: "Unknown practice area" }, 422);
    const service = serviceForPracticeArea(input.practiceAreaCode);
    const result = await context.env.DB.prepare(
      "UPDATE intakes SET practice_area_code=?,service_version_id=?,classification_status='confirmed',version=version+1,updated_at=? WHERE id=? AND client_user_id=? AND version=? AND state IN ('draft','awaiting_confirmation')",
    )
      .bind(
        input.practiceAreaCode,
        service.id,
        now(),
        context.req.param("id"),
        context.get("user").id,
        input.version,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1)
      return context.json(
        { message: "Intake changed or cannot be reclassified" },
        409,
      );
    return context.json({
      intakeId: context.req.param("id"),
      practiceAreaCode: input.practiceAreaCode,
      serviceVersionId: service.id,
      classificationStatus: "confirmed",
      version: input.version + 1,
    });
  },
);

routes.post(
  "/consultations",
  zValidator("json", consultationScheduleSchema.extend({ matterId: z.uuid() })),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    if (!(await canAccessMatter(context, input.matterId)))
      return context.json({ message: "Matter not found" }, 404);
    const matter = await context.env.DB.prepare(
      "SELECT id,client_user_id,selected_lawyer_id,state FROM matters WHERE id=? AND state='consultation_scheduled'",
    )
      .bind(input.matterId)
      .first<{
        id: string;
        client_user_id: string;
        selected_lawyer_id: string | null;
        state: string;
      }>();
    if (!matter?.selected_lawyer_id)
      return context.json(
        { message: "Verified payment and an assigned lawyer are required" },
        409,
      );
    const existing = await context.env.DB.prepare(
      "SELECT id,state,scheduled_start startsAt,scheduled_end endsAt,version FROM consultations WHERE matter_id=?",
    )
      .bind(input.matterId)
      .first<Record<string, unknown>>();
    if (existing)
      return context.json({ ...existing, matterId: input.matterId });
    const lawyerUser = await context.env.DB.prepare(
      "SELECT user_id FROM lawyer_profiles WHERE id=?",
    )
      .bind(matter.selected_lawyer_id)
      .first<{ user_id: string }>();
    const id = crypto.randomUUID();
    const timestamp = now();
    const end = new Date(
      new Date(input.startsAt).getTime() + input.durationMinutes * 60_000,
    ).toISOString();
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT OR IGNORE INTO consultations (id,matter_id,lawyer_id,state,mode,scheduled_start,scheduled_end,time_zone,realtime_room_key,version,created_at,updated_at) VALUES (?,?,?,'scheduled','live_text',?,?,?,?,1,?,?)",
      ).bind(
        id,
        matter.id,
        matter.selected_lawyer_id,
        input.startsAt,
        end,
        input.timeZone,
        `consultation:${matter.id}`,
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        "INSERT OR IGNORE INTO consultation_participants (consultation_id,user_id,participant_role) VALUES (?,?, 'client')",
      ).bind(id, matter.client_user_id),
      context.env.DB.prepare(
        "INSERT OR IGNORE INTO consultation_participants (consultation_id,user_id,participant_role) VALUES (?,?, 'lawyer')",
      ).bind(id, lawyerUser?.user_id ?? ""),
      context.env.DB.prepare(
        "UPDATE matters SET consultation_id=?,state='consultation_scheduled',version=version+1,updated_at=? WHERE id=?",
      ).bind(id, timestamp, matter.id),
    ]);
    await audit(context.env, {
      actorUserId: user.id,
      action: "consultation.scheduled",
      entityType: "Consultation",
      entityId: id,
      matterId: matter.id,
      requestId: context.get("requestId"),
      metadata: {
        startsAt: input.startsAt,
        durationMinutes: input.durationMinutes,
      },
    });
    return context.json(
      {
        id,
        matterId: matter.id,
        state: "scheduled",
        startsAt: input.startsAt,
        endsAt: end,
        version: 1,
      },
      201,
    );
  },
);

routes.get("/consultations/:id", async (context) => {
  const row = await context.env.DB.prepare(
    `SELECT c.* FROM consultations c JOIN consultation_participants cp ON cp.consultation_id=c.id
     WHERE c.id=? AND cp.user_id=? AND cp.removed_at IS NULL`,
  )
    .bind(context.req.param("id"), context.get("user").id)
    .first<Record<string, unknown>>();
  if (!row) return context.json({ message: "Consultation not found" }, 404);
  const messages = (
    await context.env.DB.prepare(
      "SELECT id,sender_user_id,body,message_type,created_at FROM messages WHERE consultation_id=? ORDER BY created_at",
    )
      .bind(context.req.param("id"))
      .all()
  ).results;
  return context.json({ ...row, messages });
});

routes.post("/consultations/:id/realtime-token", async (context) => {
  const user = context.get("user");
  const participant = await context.env.DB.prepare(
    "SELECT 1 FROM consultation_participants cp JOIN consultations c ON c.id=cp.consultation_id WHERE cp.consultation_id=? AND cp.user_id=? AND cp.removed_at IS NULL AND c.state IN ('scheduled','active')",
  )
    .bind(context.req.param("id"), user.id)
    .first();
  if (!participant)
    return context.json({ message: "Consultation is not available" }, 404);
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
    "-",
    "",
  );
  const id = crypto.randomUUID();
  const timestamp = now();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await context.env.DB.prepare(
    "INSERT INTO realtime_tokens (id,consultation_id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(
      id,
      context.req.param("id"),
      user.id,
      await sha256(token),
      expiresAt,
      timestamp,
    )
    .run();
  return context.json({ token, expiresAt, protocol: "lex.realtime.v1" });
});

routes.post(
  "/engagements/:matterId/proposals",
  requireRole("lawyer"),
  zValidator("json", representationProposalSchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    const matter = await context.env.DB.prepare(
      `SELECT m.id,m.client_user_id,m.selected_lawyer_id,m.state FROM matters m JOIN lawyer_profiles l ON l.id=m.selected_lawyer_id
     WHERE m.id=? AND l.user_id=? AND m.state IN ('delivered','representation_proposed')`,
    )
      .bind(context.req.param("matterId"), user.id)
      .first<{
        id: string;
        client_user_id: string;
        selected_lawyer_id: string;
        state: string;
      }>();
    if (!matter)
      return context.json({ message: "Delivered matter not found" }, 404);
    const engagementId = crypto.randomUUID();
    const proposalId = crypto.randomUUID();
    const timestamp = now();
    const statements: D1PreparedStatement[] = [
      context.env.DB.prepare(
        "INSERT INTO representation_engagements (id,matter_id,client_user_id,lawyer_id,state,engagement_version,version,created_at,updated_at) VALUES (?,?,?,?,'offered',1,1,?,?)",
      ).bind(
        engagementId,
        matter.id,
        matter.client_user_id,
        matter.selected_lawyer_id,
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        "INSERT INTO engagement_proposals (id,engagement_id,version,scope,exclusions,fee_basis,fee_summary,expected_expenses,cancellation_terms,client_responsibilities,state,lawyer_attested_at,offered_at,snapshot_json,created_at,updated_at) VALUES (?,?,1,?,?,?,?,?,?,?,'offered',?,?,?,?,?)",
      ).bind(
        proposalId,
        engagementId,
        input.scope,
        input.exclusions,
        input.feeBasis,
        input.feeSummary,
        input.expectedExpenses,
        input.cancellationTerms,
        input.clientResponsibilities,
        timestamp,
        timestamp,
        JSON.stringify(input),
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        "UPDATE matters SET state='representation_proposed',version=version+1,updated_at=? WHERE id=?",
      ).bind(timestamp, matter.id),
    ];
    input.milestones.forEach((milestone, position) =>
      statements.push(
        context.env.DB.prepare(
          "INSERT INTO milestones (id,engagement_id,title,state,position,amount_minor,version,created_at,updated_at) VALUES (?,?,?,'pending',?,?,1,?,?)",
        ).bind(
          crypto.randomUUID(),
          engagementId,
          milestone.title,
          position,
          milestone.amountMinor ?? null,
          timestamp,
          timestamp,
        ),
      ),
    );
    await context.env.DB.batch(statements);
    await audit(context.env, {
      actorUserId: user.id,
      action: "representation.proposal_offered",
      entityType: "RepresentationEngagement",
      entityId: engagementId,
      matterId: matter.id,
      requestId: context.get("requestId"),
      metadata: { proposalId },
    });
    return context.json(
      { id: engagementId, proposalId, state: "offered", version: 1 },
      201,
    );
  },
);

routes.get("/engagements", async (context) => {
  const user = context.get("user");
  const rows =
    user.role === "lawyer"
      ? await context.env.DB.prepare(
          "SELECT e.* FROM representation_engagements e JOIN lawyer_profiles l ON l.id=e.lawyer_id WHERE l.user_id=? ORDER BY e.created_at DESC",
        )
          .bind(user.id)
          .all()
      : await context.env.DB.prepare(
          "SELECT * FROM representation_engagements WHERE client_user_id=? ORDER BY created_at DESC",
        )
          .bind(user.id)
          .all();
  return context.json(rows.results);
});

routes.get("/engagements/:id", async (context) => {
  const user = context.get("user");
  const engagement = await context.env.DB.prepare(
    `SELECT e.* FROM representation_engagements e
      LEFT JOIN lawyer_profiles l ON l.id=e.lawyer_id
     WHERE e.id=? AND (e.client_user_id=? OR l.user_id=? OR ? IN ('operations','owner'))`,
  )
    .bind(context.req.param("id"), user.id, user.id, user.role)
    .first<Record<string, unknown>>();
  if (!engagement)
    return context.json({ message: "Engagement not found" }, 404);
  const id = context.req.param("id");
  const [proposals, milestones, invoices, tasks, deadlines, disputes] =
    await Promise.all([
      context.env.DB.prepare(
        "SELECT * FROM engagement_proposals WHERE engagement_id=? ORDER BY version DESC",
      )
        .bind(id)
        .all(),
      context.env.DB.prepare(
        "SELECT * FROM milestones WHERE engagement_id=? ORDER BY position",
      )
        .bind(id)
        .all(),
      context.env.DB.prepare(
        "SELECT * FROM invoices WHERE engagement_id=? ORDER BY created_at DESC",
      )
        .bind(id)
        .all(),
      context.env.DB.prepare(
        "SELECT * FROM engagement_tasks WHERE engagement_id=? ORDER BY created_at DESC",
      )
        .bind(id)
        .all(),
      context.env.DB.prepare(
        "SELECT * FROM deadlines WHERE engagement_id=? ORDER BY due_at",
      )
        .bind(id)
        .all(),
      context.env.DB.prepare(
        "SELECT id,invoice_id,opened_by,reason_code,details,state,resolution,created_at,updated_at FROM engagement_disputes WHERE engagement_id=? ORDER BY created_at DESC",
      )
        .bind(id)
        .all(),
    ]);
  return context.json({
    ...engagement,
    proposals: proposals.results,
    milestones: milestones.results,
    invoices: invoices.results,
    tasks: tasks.results,
    deadlines: deadlines.results,
    disputes: disputes.results,
  });
});

routes.post(
  "/engagements/:id/accept",
  zValidator("json", acceptRepresentationProposalSchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    const timestamp = now();
    const proposal = await context.env.DB.prepare(
      "SELECT p.id FROM engagement_proposals p JOIN representation_engagements e ON e.id=p.engagement_id WHERE e.id=? AND e.client_user_id=? AND e.state='offered' AND p.version=?",
    )
      .bind(context.req.param("id"), user.id, input.proposalVersion)
      .first<{ id: string }>();
    if (!proposal)
      return context.json(
        { message: "Proposal is unavailable or changed" },
        409,
      );
    await context.env.DB.batch([
      context.env.DB.prepare(
        "UPDATE engagement_proposals SET state='accepted',accepted_at=?,consent_version=?,updated_at=? WHERE id=?",
      ).bind(timestamp, input.consentVersion, timestamp, proposal.id),
      context.env.DB.prepare(
        "UPDATE representation_engagements SET state='accepted',accepted_proposal_id=?,version=version+1,updated_at=? WHERE id=? AND state='offered'",
      ).bind(proposal.id, timestamp, context.req.param("id")),
      context.env.DB.prepare(
        "INSERT INTO consent_records (id,user_id,consent_type,content_version,language,accepted,recorded_at) VALUES (?,?, 'representation_engagement',?,'en',1,?)",
      ).bind(crypto.randomUUID(), user.id, input.consentVersion, timestamp),
    ]);
    return context.json({ id: context.req.param("id"), state: "accepted" });
  },
);

routes.post(
  "/engagements/:id/conflict-reconfirm",
  requireRole("lawyer"),
  async (context) => {
    const timestamp = now();
    const result = await context.env.DB.prepare(
      `UPDATE representation_engagements SET state='conflict_reconfirmed',conflict_reconfirmed_at=?,version=version+1,updated_at=?
     WHERE id=? AND state='accepted' AND lawyer_id IN (SELECT id FROM lawyer_profiles WHERE user_id=?)`,
    )
      .bind(
        timestamp,
        timestamp,
        context.req.param("id"),
        context.get("user").id,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1)
      return context.json({ message: "Engagement cannot be confirmed" }, 409);
    return context.json({
      id: context.req.param("id"),
      state: "conflict_reconfirmed",
    });
  },
);

routes.post(
  "/invoices",
  requireRole("lawyer"),
  zValidator("json", invoiceSchema),
  async (context) => {
    const input = context.req.valid("json");
    const authorized = await context.env.DB.prepare(
      "SELECT 1 FROM representation_engagements e JOIN lawyer_profiles l ON l.id=e.lawyer_id WHERE e.id=? AND l.user_id=? AND e.state IN ('conflict_reconfirmed','awaiting_invoice_payment','active','milestone_in_progress')",
    )
      .bind(input.engagementId, context.get("user").id)
      .first();
    if (!authorized)
      return context.json({ message: "Engagement not found" }, 404);
    const id = crypto.randomUUID();
    const timestamp = now();
    const invoiceNumber = `LEX-INV-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO invoices (id,engagement_id,milestone_id,invoice_number,description,amount_minor,currency,state,due_at,version,created_at,updated_at) VALUES (?,?,?,?,?,?,'NGN','issued',?,1,?,?)",
      ).bind(
        id,
        input.engagementId,
        input.milestoneId ?? null,
        invoiceNumber,
        input.description,
        input.amountMinor,
        input.dueAt ?? null,
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        "UPDATE representation_engagements SET state='awaiting_invoice_payment',version=version+1,updated_at=? WHERE id=?",
      ).bind(timestamp, input.engagementId),
    ]);
    return context.json(
      {
        id,
        invoiceNumber,
        state: "issued",
        amountMinor: input.amountMinor,
        provider: input.provider,
      },
      201,
    );
  },
);

routes.post(
  "/engagement-tasks",
  requireRole("lawyer"),
  zValidator("json", engagementTaskSchema),
  async (context) => {
    const input = context.req.valid("json");
    const authorized = await context.env.DB.prepare(
      "SELECT 1 FROM representation_engagements e JOIN lawyer_profiles l ON l.id=e.lawyer_id WHERE e.id=? AND l.user_id=? AND e.state IN ('active','milestone_in_progress','awaiting_client')",
    )
      .bind(input.engagementId, context.get("user").id)
      .first();
    if (!authorized)
      return context.json({ message: "Active engagement not found" }, 404);
    const id = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.prepare(
      "INSERT INTO engagement_tasks (id,engagement_id,milestone_id,title,assignee_user_id,state,due_at,due_at_confirmed_by_lawyer,version,created_at,updated_at) VALUES (?,?,?,?,?,'open',?,?,1,?,?)",
    )
      .bind(
        id,
        input.engagementId,
        input.milestoneId ?? null,
        input.title,
        input.assigneeUserId ?? null,
        input.dueAt ?? null,
        input.lawyerConfirmedDeadline ? 1 : 0,
        timestamp,
        timestamp,
      )
      .run();
    await audit(context.env, {
      actorUserId: context.get("user").id,
      action: "representation.task_created",
      entityType: "EngagementTask",
      entityId: id,
      requestId: context.get("requestId"),
      metadata: { engagementId: input.engagementId },
    });
    return context.json({ id, state: "open" }, 201);
  },
);

routes.post(
  "/deadlines",
  requireRole("lawyer"),
  zValidator("json", engagementDeadlineSchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    const authorized = await context.env.DB.prepare(
      "SELECT 1 FROM representation_engagements e JOIN lawyer_profiles l ON l.id=e.lawyer_id WHERE e.id=? AND l.user_id=?",
    )
      .bind(input.engagementId, user.id)
      .first();
    if (!authorized)
      return context.json({ message: "Engagement not found" }, 404);
    const id = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.prepare(
      "INSERT INTO deadlines (id,engagement_id,title,due_at,source,lawyer_confirmed_by,lawyer_confirmed_at,notes,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)",
    )
      .bind(
        id,
        input.engagementId,
        input.title,
        input.dueAt,
        input.source,
        user.id,
        timestamp,
        input.notes ?? null,
        timestamp,
        timestamp,
      )
      .run();
    return context.json({ id, lawyerConfirmedAt: timestamp }, 201);
  },
);

routes.post(
  "/engagements/:id/disputes",
  zValidator("json", engagementDisputeSchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    const participant = await context.env.DB.prepare(
      `SELECT e.matter_id FROM representation_engagements e LEFT JOIN lawyer_profiles l ON l.id=e.lawyer_id
      WHERE e.id=? AND (e.client_user_id=? OR l.user_id=?)`,
    )
      .bind(context.req.param("id"), user.id, user.id)
      .first<{ matter_id: string }>();
    if (!participant)
      return context.json({ message: "Engagement not found" }, 404);
    const id = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO engagement_disputes (id,engagement_id,invoice_id,opened_by,reason_code,details,state,created_at,updated_at) VALUES (?,?,?,?,?,?,'open',?,?)",
      ).bind(
        id,
        context.req.param("id"),
        input.invoiceId ?? null,
        user.id,
        input.reasonCode,
        input.details,
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        "UPDATE representation_engagements SET state='disputed',version=version+1,updated_at=? WHERE id=?",
      ).bind(timestamp, context.req.param("id")),
    ]);
    await audit(context.env, {
      actorUserId: user.id,
      action: "representation.dispute_opened",
      entityType: "EngagementDispute",
      entityId: id,
      matterId: participant.matter_id,
      requestId: context.get("requestId"),
      metadata: { reasonCode: input.reasonCode },
    });
    return context.json({ id, state: "open" }, 201);
  },
);

routes.post(
  "/invoices/:id/refund-request",
  zValidator("json", refundRequestSchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    const payment = await context.env.DB.prepare(
      `SELECT p.id payment_id,p.amount_minor,e.matter_id,e.id engagement_id FROM invoices i
      JOIN representation_engagements e ON e.id=i.engagement_id JOIN payments p ON p.id=i.payment_id
      WHERE i.id=? AND e.client_user_id=? AND p.state='successful'`,
    )
      .bind(context.req.param("id"), user.id)
      .first<{
        payment_id: string;
        amount_minor: number;
        matter_id: string;
        engagement_id: string;
      }>();
    if (!payment)
      return context.json({ message: "Paid invoice not found" }, 404);
    const amount = input.amountMinor ?? payment.amount_minor;
    if (amount > payment.amount_minor)
      return context.json(
        { message: "Refund cannot exceed the paid amount" },
        422,
      );
    const id = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO refunds (id,payment_id,reason,amount_minor,state,requested_by,created_at,updated_at) VALUES (?,?,?,?,'requested',?,?,?)",
      ).bind(
        id,
        payment.payment_id,
        input.reason,
        amount,
        user.id,
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        "UPDATE representation_engagements SET state='disputed',version=version+1,updated_at=? WHERE id=?",
      ).bind(timestamp, payment.engagement_id),
    ]);
    await audit(context.env, {
      actorUserId: user.id,
      action: "representation.refund_requested",
      entityType: "Refund",
      entityId: id,
      matterId: payment.matter_id,
      requestId: context.get("requestId"),
      metadata: { amountMinor: amount, invoiceId: context.req.param("id") },
    });
    return context.json({ id, state: "requested", amountMinor: amount }, 201);
  },
);

routes.get(
  "/admin/safeguarding",
  requireRole("admin", "super_admin"),
  async (context) =>
    context.json(
      (
        await context.env.DB.prepare(
          "SELECT id,minor_profile_id,intake_id,matter_id,reason_code,state,assigned_to,created_at,updated_at FROM safeguarding_reviews ORDER BY created_at DESC LIMIT 200",
        ).all()
      ).results,
    ),
);

routes.get(
  "/admin/matching-assistance",
  requireRole("admin", "super_admin"),
  async (context) =>
    context.json(
      (
        await context.env.DB.prepare(
          "SELECT * FROM operations_matching_requests ORDER BY CASE state WHEN 'open' THEN 0 ELSE 1 END,created_at DESC LIMIT 200",
        ).all()
      ).results,
    ),
);

routes.post(
  "/admin/matching-assistance/:id/assign",
  requireRole("admin", "super_admin"),
  zValidator(
    "json",
    z.object({ lawyerId: z.uuid(), version: z.number().int().positive() }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const request = await context.env.DB.prepare(
      "SELECT matter_id,practice_area_code,state_code FROM operations_matching_requests WHERE id=? AND state='open' AND version=?",
    )
      .bind(context.req.param("id"), input.version)
      .first<{
        matter_id: string;
        practice_area_code: string;
        state_code: string;
      }>();
    if (!request)
      return context.json({ message: "Matching request changed" }, 409);
    const eligible = await context.env.DB.prepare(
      `SELECT l.id FROM lawyer_profiles l WHERE l.id=? AND l.verification_status='verified' AND l.verification_expires_at>?
      AND l.available=1 AND EXISTS(SELECT 1 FROM lawyer_capabilities c WHERE c.lawyer_id=l.id AND c.kind='practice_area' AND c.value=?)
      AND EXISTS(SELECT 1 FROM lawyer_capabilities c WHERE c.lawyer_id=l.id AND c.kind='state' AND c.value IN (?, 'ALL'))`,
    )
      .bind(
        input.lawyerId,
        now(),
        request.practice_area_code,
        request.state_code,
      )
      .first();
    if (!eligible)
      return context.json(
        {
          message:
            "Lawyer is not currently verified and eligible for this matter",
        },
        422,
      );
    const timestamp = now();
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT OR IGNORE INTO lawyer_matches (id,matter_id,lawyer_id,position,score,expires_at,created_at) VALUES (?,?,?,1,1000,?,?)",
      ).bind(
        crypto.randomUUID(),
        request.matter_id,
        input.lawyerId,
        new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        timestamp,
      ),
      context.env.DB.prepare(
        "UPDATE matters SET state='matching',version=version+1,updated_at=? WHERE id=? AND state='matching_assistance'",
      ).bind(timestamp, request.matter_id),
      context.env.DB.prepare(
        "UPDATE operations_matching_requests SET state='resolved',assigned_to=?,resolution_note='Eligible lawyer assigned by operations',resolved_at=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      ).bind(
        context.get("user").id,
        timestamp,
        timestamp,
        context.req.param("id"),
        input.version,
      ),
    ]);
    return context.json({
      id: context.req.param("id"),
      state: "resolved",
      matterState: "matching",
    });
  },
);

routes.post(
  "/admin/safeguarding/:id/resolve",
  requireRole("admin", "super_admin"),
  zValidator(
    "json",
    z.object({
      resolution: z.enum([
        "restricted_continue",
        "guardian_required",
        "closed",
      ]),
      version: z.number().int().positive(),
    }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const timestamp = now();
    const result = await context.env.DB.prepare(
      "UPDATE safeguarding_reviews SET state=?,assigned_to=?,resolved_at=?,version=version+1,updated_at=? WHERE id=? AND state='open' AND version=?",
    )
      .bind(
        input.resolution,
        context.get("user").id,
        timestamp,
        timestamp,
        context.req.param("id"),
        input.version,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1)
      return context.json({ message: "Safeguarding review changed" }, 409);
    await audit(context.env, {
      actorUserId: context.get("user").id,
      action: "safeguarding.review_resolved",
      entityType: "SafeguardingReview",
      entityId: context.req.param("id"),
      requestId: context.get("requestId"),
      metadata: { resolution: input.resolution },
    });
    return context.json({
      id: context.req.param("id"),
      state: input.resolution,
    });
  },
);

routes.get(
  "/admin/authority-reviews",
  requireRole("admin", "super_admin"),
  async (context) =>
    context.json(
      (
        await context.env.DB.prepare(
          "SELECT ar.id,ar.organization_id,ar.membership_id,ar.evidence_id,ar.decision,ar.reason,ar.version,ar.created_at,o.legal_name,o.registration_number FROM authority_reviews ar JOIN organizations o ON o.id=ar.organization_id ORDER BY ar.created_at DESC LIMIT 200",
        ).all()
      ).results,
    ),
);

routes.get(
  "/admin/guardian-links",
  requireRole("admin", "super_admin"),
  async (context) =>
    context.json(
      (
        await context.env.DB.prepare(
          "SELECT gl.id,gl.minor_profile_id,gl.guardian_user_id,gl.relationship,gl.identity_evidence_id,gl.relationship_evidence_id,gl.status,gl.version,gl.created_at FROM guardian_links gl ORDER BY gl.created_at DESC LIMIT 200",
        ).all()
      ).results,
    ),
);

routes.get(
  "/admin/service-versions",
  requireRole("admin", "super_admin"),
  async (context) =>
    context.json(
      (
        await context.env.DB.prepare(
          `SELECT sv.*,sd.code service_code,sd.name service_name,pa.code practice_area_code
     FROM service_versions sv JOIN service_definitions sd ON sd.id=sv.service_id JOIN practice_areas pa ON pa.id=sd.practice_area_id
    ORDER BY sd.code,sv.version DESC`,
        ).all()
      ).results,
    ),
);

routes.post(
  "/admin/services/:code/versions",
  requireRole("admin", "super_admin"),
  zValidator(
    "json",
    z.object({
      definition: z.record(z.string(), z.unknown()),
      priceMinor: z.number().int().positive(),
      slaHours: z.number().int().min(1).max(720),
    }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const service = await context.env.DB.prepare(
      "SELECT id FROM service_definitions WHERE code=?",
    )
      .bind(context.req.param("code"))
      .first<{ id: string }>();
    if (!service) return context.json({ message: "Service not found" }, 404);
    const latest = await context.env.DB.prepare(
      "SELECT COALESCE(MAX(version),0) version FROM service_versions WHERE service_id=?",
    )
      .bind(service.id)
      .first<{ version: number }>();
    const version = (latest?.version ?? 0) + 1;
    const id = `${service.id}-v${version}`;
    const timestamp = now();
    await context.env.DB.prepare(
      "INSERT INTO service_versions (id,service_id,version,status,authoritative_language,definition_json,price_minor,currency,sla_hours,created_at,updated_at) VALUES (?,?,?,'draft','en',?,?,'NGN',?,?,?)",
    )
      .bind(
        id,
        service.id,
        version,
        JSON.stringify(input.definition),
        input.priceMinor,
        input.slaHours,
        timestamp,
        timestamp,
      )
      .run();
    await audit(context.env, {
      actorUserId: context.get("user").id,
      action: "service.version_drafted",
      entityType: "ServiceVersion",
      entityId: id,
      requestId: context.get("requestId"),
      metadata: { version },
    });
    return context.json({ id, version, status: "draft" }, 201);
  },
);

routes.post(
  "/admin/service-versions/:id/review",
  requireRole("admin", "super_admin"),
  async (context) => {
    const result = await context.env.DB.prepare(
      "UPDATE service_versions SET status='review',updated_at=? WHERE id=? AND status='draft'",
    )
      .bind(now(), context.req.param("id"))
      .run();
    if ((result.meta.changes ?? 0) !== 1)
      return context.json({ message: "Only a draft can enter review" }, 409);
    return context.json({ id: context.req.param("id"), status: "review" });
  },
);

routes.post(
  "/admin/service-versions/:id/publish",
  requireRole("super_admin"),
  zValidator(
    "json",
    z.object({
      lawyerCoFounderApprovalReference: z.string().trim().min(8).max(500),
      effectiveAt: z.iso.datetime({ offset: true }).optional(),
    }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const timestamp = now();
    const effectiveAt = input.effectiveAt ?? timestamp;
    const result = await context.env.DB.prepare(
      "UPDATE service_versions SET status='published',approved_by=?,approved_at=?,effective_at=?,updated_at=? WHERE id=? AND status='review'",
    )
      .bind(
        context.get("user").id,
        timestamp,
        effectiveAt,
        timestamp,
        context.req.param("id"),
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1)
      return context.json(
        {
          message:
            "Service version must be in review and have recorded lawyer-co-founder approval",
        },
        409,
      );
    await audit(context.env, {
      actorUserId: context.get("user").id,
      action: "service.version_published",
      entityType: "ServiceVersion",
      entityId: context.req.param("id"),
      requestId: context.get("requestId"),
      metadata: {
        lawyerCoFounderApprovalReference:
          input.lawyerCoFounderApprovalReference,
        effectiveAt,
      },
    });
    return context.json({
      id: context.req.param("id"),
      status: "published",
      effectiveAt,
    });
  },
);

routes.post(
  "/admin/service-versions/:id/retire",
  requireRole("super_admin"),
  zValidator("json", z.object({ reason: z.string().trim().min(5).max(2_000) })),
  async (context) => {
    const input = context.req.valid("json");
    const timestamp = now();
    const result = await context.env.DB.prepare(
      "UPDATE service_versions SET status='retired',retired_at=?,updated_at=? WHERE id=? AND status='published'",
    )
      .bind(timestamp, timestamp, context.req.param("id"))
      .run();
    if ((result.meta.changes ?? 0) !== 1)
      return context.json(
        { message: "Only a published version can be retired" },
        409,
      );
    await audit(context.env, {
      actorUserId: context.get("user").id,
      action: "service.version_retired",
      entityType: "ServiceVersion",
      entityId: context.req.param("id"),
      requestId: context.get("requestId"),
      metadata: { reason: input.reason },
    });
    return context.json({ id: context.req.param("id"), status: "retired" });
  },
);

routes.post(
  "/admin/authority-reviews/:id",
  requireRole("admin", "super_admin"),
  zValidator(
    "json",
    z.object({
      decision: z.enum(["approved", "declined"]),
      reason: z.string().max(2_000).optional(),
      version: z.number().int().positive(),
    }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const timestamp = now();
    const review = await context.env.DB.prepare(
      "SELECT organization_id,membership_id FROM authority_reviews WHERE id=? AND decision='pending' AND version=?",
    )
      .bind(context.req.param("id"), input.version)
      .first<{ organization_id: string; membership_id: string }>();
    if (!review)
      return context.json({ message: "Authority review changed" }, 409);
    await context.env.DB.batch([
      context.env.DB.prepare(
        "UPDATE authority_reviews SET decision=?,reason=?,reviewer_id=?,decided_at=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      ).bind(
        input.decision,
        input.reason ?? null,
        context.get("user").id,
        timestamp,
        timestamp,
        context.req.param("id"),
        input.version,
      ),
      context.env.DB.prepare(
        "UPDATE organization_memberships SET status=?,updated_at=? WHERE id=?",
      ).bind(input.decision, timestamp, review.membership_id),
      context.env.DB.prepare(
        "UPDATE organizations SET status=?,version=version+1,updated_at=? WHERE id=?",
      ).bind(
        input.decision === "approved" ? "active" : "declined",
        timestamp,
        review.organization_id,
      ),
    ]);
    return context.json({
      id: context.req.param("id"),
      decision: input.decision,
    });
  },
);

routes.post(
  "/admin/guardian-links/:id",
  requireRole("admin", "super_admin"),
  zValidator(
    "json",
    z.object({
      decision: z.enum(["verified", "declined", "safeguarding_review"]),
      reason: z.string().max(2_000).optional(),
      version: z.number().int().positive(),
    }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const timestamp = now();
    const link = await context.env.DB.prepare(
      "SELECT minor_profile_id FROM guardian_links WHERE id=? AND version=? AND status='pending'",
    )
      .bind(context.req.param("id"), input.version)
      .first<{ minor_profile_id: string }>();
    if (!link) return context.json({ message: "Guardian review changed" }, 409);
    if (input.decision === "safeguarding_review") {
      await context.env.DB.prepare(
        "INSERT INTO safeguarding_reviews (id,minor_profile_id,reason_code,state,version,created_at,updated_at) VALUES (?,?,'guardian_conflict','open',1,?,?)",
      )
        .bind(crypto.randomUUID(), link.minor_profile_id, timestamp, timestamp)
        .run();
    }
    await context.env.DB.batch([
      context.env.DB.prepare(
        "UPDATE guardian_links SET status=?,reviewed_by=?,reviewed_at=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      ).bind(
        input.decision,
        context.get("user").id,
        timestamp,
        timestamp,
        context.req.param("id"),
        input.version,
      ),
      context.env.DB.prepare(
        "UPDATE minor_profiles SET status=?,updated_at=? WHERE id=?",
      ).bind(
        input.decision === "verified" ? "guardian_verified" : input.decision,
        timestamp,
        link.minor_profile_id,
      ),
    ]);
    return context.json({
      id: context.req.param("id"),
      decision: input.decision,
    });
  },
);

export default routes;
