import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  assessmentSchema,
  conflictDecisionSchema,
  createIntakeSchema,
  createMessageSchema,
  lawyerApplicationSchema,
  updateIntakeSchema,
} from "@lex/contracts";
import {
  NIGERIA_STATES,
  PRACTICE_AREAS,
  calculateUrgency,
  classifyUrgency,
  serviceForPracticeArea,
  workflowFor,
} from "@lex/jurisdictions";
import {
  canAccessMatter,
  requireAuth,
  requireRole,
  type AppContext,
} from "./middleware.js";
import { audit, future, now, recordJobBeforePublish } from "./repository.js";
import { encrypt, hmac, sha256 } from "./crypto.js";
import type { Env, Variables } from "./types.js";

const routes = new Hono<{ Bindings: Env; Variables: Variables }>();
routes.use("/*", requireAuth);

const pilotLanguage = z.enum(["en", "pcm", "ha", "yo", "ig"]);
const intakeCreate = createIntakeSchema;
const confirmSchema = z.object({
  summaryConfirmed: z.literal(true),
  consentAccepted: z.literal(true),
  consentVersion: z.string().min(1).max(100),
  corrections: z.string().max(5_000).optional(),
  version: z.number().int().positive(),
});
const privacySchema = z.object({
  type: z.enum([
    "export",
    "correction",
    "deletion",
    "consent_withdrawal",
    "automated_routing_challenge",
  ]),
  details: z.string().max(5_000).optional(),
});
const preferenceSchema = z.object({
  whatsapp: z.boolean(),
  push: z.boolean(),
  email: z.boolean(),
});
const pushSchema = z.object({
  token: z.string().min(20).max(500),
  platform: z.enum(["android", "ios"]),
  consent: z.literal(true),
});
const evidenceContentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
]);

function workflowView(role: "tenant" | "landlord", language: "en" | "pcm") {
  const workflow = workflowFor(role);
  const pidgin: Record<string, string> = {
    property_address: "Where the rented house dey? Put the full address.",
    tenancy_written: "Una get written tenancy agreement?",
    tenancy_start: "When the tenancy start?",
    rent_amount: "How much be the rent?",
    rent_frequency: "How often una dey pay rent?",
    last_payment: "When last rent payment happen?",
    notice_received: "You don receive any written notice or court paper?",
    court_order: "Court don give any order about the house?",
    opposing_party: "Who be the other person or organisation?",
    timeline: "Tell us wetin happen, arrange am by date.",
    desired_outcome: "Wetin you want make happen?",
    tenant_issue: "Which problem you dey face?",
    locked_out: "Dem lock you outside the house now?",
    belongings_inside: "Your property still dey inside?",
    utilities_cut:
      "Person cut light, water or other important service on purpose?",
    threats_or_violence:
      "Any threat, violence or immediate safety problem dey?",
    deposit_amount: "How much deposit you pay?",
    landlord_issue: "Which problem you dey face as landlord?",
    arrears_amount: "How much rent never pay?",
    breach_details: "Explain the tenancy breach wey you believe happen.",
    possession_urgent:
      "Any immediate safety or serious property damage problem dey?",
    self_help_action:
      "Anybody don change lock, cut utilities, or block access?",
  };
  return {
    ...workflow,
    language,
    title:
      language === "pcm"
        ? role === "tenant"
          ? "Lagos tenant matter check"
          : "Lagos landlord matter check"
        : workflow.title,
    disclosure:
      language === "pcm"
        ? "Lex dey collect information and connect you with verified lawyer. This automated intake no be legal advice, and Lex no be emergency service."
        : workflow.disclosure,
    questions: workflow.questions.map((question) => ({
      ...question,
      label:
        language === "pcm"
          ? (pidgin[question.key] ?? question.label)
          : question.label,
    })),
  };
}

routes.get("/capabilities", (context) =>
  context.json({
    environment: context.env.APP_ENV,
    release: {
      country: "NG",
      activeStates: NIGERIA_STATES.map(([code]) => code),
      practiceAreaCount: PRACTICE_AREAS.length,
      languages: ["en", "pcm", "ha", "yo", "ig"],
      androidFirst: true,
    },
    providers: {
      whatsapp:
        context.env.META_ACCESS_TOKEN && context.env.META_PHONE_NUMBER_ID
          ? "configured_unverified"
          : "unconfigured",
      openai: context.env.OPENAI_API_KEY
        ? "configured_unverified"
        : "unconfigured",
      paystack: context.env.PAYSTACK_SECRET_KEY
        ? "configured_unverified"
        : "unconfigured",
      flutterwave: context.env.FLUTTERWAVE_SECRET_KEY
        ? "configured_unverified"
        : "unconfigured",
      push: context.env.EXPO_ACCESS_TOKEN
        ? "configured_unverified"
        : "unconfigured",
      email:
        context.env.EMAIL_DELIVERY_ENABLED === "true"
          ? "configured_unverified"
          : "unconfigured",
    },
    whatsappImplemented: [
      "otp",
      "status",
      "information_request",
      "assessment_ready_link",
      "typed_intake",
      "app_linking",
    ],
    whatsappPendingProviderValidation: [
      "media_retrieval",
      "voice_note_transcription",
    ],
    providerVerificationPending: [
      "whatsapp",
      "openai",
      "paystack",
      "flutterwave",
      "postmark",
      "push",
    ],
  }),
);

routes.get("/workflows/:role", (context) => {
  const role = z.enum(["tenant", "landlord"]).parse(context.req.param("role"));
  const language = pilotLanguage
    .catch("en")
    .parse(context.req.query("language"));
  return context.json(workflowView(role, language === "pcm" ? "pcm" : "en"));
});

routes.post("/intakes", zValidator("json", intakeCreate), async (context) => {
  const input = context.req.valid("json");
  const user = context.get("user");
  if (user.role !== "client")
    return context.json(
      { message: "Only client accounts can create intake records" },
      403,
    );
  const state = input.stateCode.toUpperCase();
  if (!NIGERIA_STATES.some(([code]) => code === state))
    return context.json({ message: "Unknown Nigerian state" }, 422);
  const id = crypto.randomUUID();
  const timestamp = now();
  const practiceAreaCode = input.practiceAreaCode;
  if (!PRACTICE_AREAS.some((area) => area.code === practiceAreaCode))
    return context.json({ message: "Unknown practice area" }, 422);
  const service = serviceForPracticeArea(practiceAreaCode);
  const tenancyRole =
    input.tenancyRole ??
    (input.issueRole === "landlord" ? "landlord" : "tenant");
  const workflowId =
    practiceAreaCode === "tenancy" && input.tenancyRole === "tenant"
      ? "workflow-ng-la-tenant-v1"
      : practiceAreaCode === "tenancy" && input.tenancyRole === "landlord"
        ? "workflow-ng-la-landlord-v1"
        : `workflow-compat-${service.code}-v1`;
  await context.env.DB.batch([
    context.env.DB.prepare(
      "INSERT INTO intakes (id,client_user_id,language,language_v2,tenancy_role,client_type,client_subject_id,practice_area_code,service_version_id,issue_role,classification_status,country_code,state_code,source_channel,workflow_id,state,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'draft',1,?,?)",
    ).bind(
      id,
      user.id,
      input.language === "en" || input.language === "pcm"
        ? input.language
        : "en",
      input.language,
      tenancyRole,
      input.clientType,
      input.clientSubjectId ?? null,
      practiceAreaCode,
      input.serviceVersionId ?? service.id,
      input.issueRole ?? input.tenancyRole ?? null,
      input.classificationStatus,
      "NG",
      state,
      input.sourceChannel,
      workflowId,
      timestamp,
      timestamp,
    ),
    context.env.DB.prepare(
      "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      user.id,
      "intake.created",
      "Intake",
      id,
      JSON.stringify({
        stateCode: state,
        practiceAreaCode,
        clientType: input.clientType,
      }),
      context.get("requestId"),
      timestamp,
    ),
  ]);
  return context.json(
    {
      id,
      state: "draft",
      jurisdictionStatus: "active",
      service,
      workflow:
        practiceAreaCode === "tenancy" && input.tenancyRole
          ? workflowView(
              input.tenancyRole,
              input.language === "pcm" ? "pcm" : "en",
            )
          : service,
      version: 1,
    },
    201,
  );
});

routes.get("/intakes/:id", async (context) => {
  const intake = await context.env.DB.prepare(
    "SELECT * FROM intakes WHERE id=? AND client_user_id=?",
  )
    .bind(context.req.param("id"), context.get("user").id)
    .first<Record<string, unknown>>();
  if (!intake) return context.json({ message: "Intake not found" }, 404);
  const answers = await context.env.DB.prepare(
    "SELECT question_key,value_json FROM intake_answers WHERE intake_id=? ORDER BY question_key",
  )
    .bind(context.req.param("id"))
    .all<{ question_key: string; value_json: string }>();
  return context.json({
    ...intake,
    answers: Object.fromEntries(
      answers.results.map((item) => [
        item.question_key,
        JSON.parse(item.value_json),
      ]),
    ),
  });
});

routes.patch(
  "/intakes/:id",
  zValidator(
    "json",
    updateIntakeSchema.extend({ version: z.number().int().positive() }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const id = context.req.param("id");
    const user = context.get("user");
    const timestamp = now();
    const intake = await context.env.DB.prepare(
      "SELECT state,version,client_type,client_subject_id FROM intakes WHERE id=? AND client_user_id=?",
    )
      .bind(id, user.id)
      .first<{
        state: string;
        version: number;
        client_type: string;
        client_subject_id: string | null;
      }>();
    if (!intake) return context.json({ message: "Intake not found" }, 404);
    const contextGate = await clientContextGate(
      context.env,
      user.id,
      intake.client_type,
      intake.client_subject_id,
    );
    if (contextGate) return context.json({ message: contextGate }, 403);
    if (!["draft", "awaiting_confirmation"].includes(intake.state))
      return context.json(
        { message: "Submitted intake cannot be edited" },
        409,
      );
    if (intake.version !== input.version)
      return context.json(
        {
          message: "Intake changed on another device",
          currentVersion: intake.version,
        },
        409,
      );
    const statements: D1PreparedStatement[] = [];
    for (const answer of input.answers ?? [])
      statements.push(
        context.env.DB.prepare(
          "INSERT INTO intake_answers (intake_id,question_key,value_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(intake_id,question_key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at",
        ).bind(id, answer.questionKey, JSON.stringify(answer.value), timestamp),
      );
    statements.push(
      context.env.DB.prepare(
        "UPDATE intakes SET narrative=COALESCE(?,narrative),desired_outcome=COALESCE(?,desired_outcome),structured_summary_json=NULL,summary_version=NULL,confirmed_at=NULL,state='draft',version=version+1,updated_at=? WHERE id=? AND version=?",
      ).bind(
        input.narrative ?? null,
        input.desiredOutcome ?? null,
        timestamp,
        id,
        input.version,
      ),
    );
    await context.env.DB.batch(statements);
    return context.json({ id, state: "draft", version: input.version + 1 });
  },
);

routes.post("/intakes/:id/summarize", async (context) => {
  const id = context.req.param("id");
  const user = context.get("user");
  const intake = await context.env.DB.prepare(
    "SELECT * FROM intakes WHERE id=? AND client_user_id=?",
  )
    .bind(id, user.id)
    .first<{
      narrative: string | null;
      desired_outcome: string | null;
      language: "en" | "pcm";
      language_v2: "en" | "pcm" | "ha" | "yo" | "ig" | null;
      tenancy_role: "tenant" | "landlord";
      practice_area_code: string | null;
      client_type: "adult_individual" | "minor" | "organization";
      client_subject_id: string | null;
      version: number;
    }>();
  if (!intake) return context.json({ message: "Intake not found" }, 404);
  const contextGate = await clientContextGate(
    context.env,
    user.id,
    intake.client_type,
    intake.client_subject_id,
  );
  if (contextGate) return context.json({ message: contextGate }, 403);
  const answersResult = await context.env.DB.prepare(
    "SELECT question_key,value_json FROM intake_answers WHERE intake_id=?",
  )
    .bind(id)
    .all<{ question_key: string; value_json: string }>();
  const answers = Object.fromEntries(
    answersResult.results.map((item) => [
      item.question_key,
      JSON.parse(item.value_json),
    ]),
  );
  const practiceAreaCode = intake.practice_area_code ?? "tenancy";
  const service = serviceForPracticeArea(practiceAreaCode);
  const questions =
    practiceAreaCode === "tenancy"
      ? workflowFor(intake.tenancy_role).questions
      : service.questions;
  const missing = questions
    .filter(
      (question) => question.required && answers[question.key] === undefined,
    )
    .map((question) => question.label);
  const urgency =
    practiceAreaCode === "tenancy"
      ? calculateUrgency(intake.tenancy_role, answers)
      : classifyUrgency(practiceAreaCode, answers);
  const originalLanguage = intake.language_v2 ?? intake.language;
  const confirmationByLanguage = {
    en: "Review this English record carefully and correct anything inaccurate before it is shared with a lawyer.",
    pcm: "Check this English record well. Correct anything wey no correct before lawyer see am.",
    ha: "Duba wannan bayanin Turanci sosai, sannan ka gyara duk abin da bai dace ba kafin a tura wa lauya.",
    yo: "Ṣàyẹ̀wò àkọsílẹ̀ Gẹ̀ẹ́sì yìí dáadáa, kí o sì ṣàtúnṣe ohun tí kò tọ́ kí a tó fi ránṣẹ́ sí agbẹjọ́rò.",
    ig: "Nyochaa ndekọ Bekee a nke ọma ma dozie ihe ọ bụla na-ezighi ezi tupu ekerịta ya na ọka iwu.",
  } as const;
  const summary = {
    authoritativeLanguage: "en",
    originalLanguage,
    summary:
      intake.narrative?.trim() ||
      `The ${intake.client_type.replaceAll("_", " ")} client completed the ${practiceAreaCode.replaceAll("-", " ")} questionnaire and requested a lawyer consultation and assessment.`,
    facts: Object.entries(answers)
      .map(
        ([key, value]) =>
          `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join(", ") : String(value)}`,
      )
      .slice(0, 50),
    parties: [],
    timeline: [],
    issueTags: [],
    missingInformation: missing,
    urgency,
    urgencyReasons: service.urgentAnswerKeys.filter(
      (key) => answers[key] === true,
    ),
    confidence: 0,
    requiresHumanReview: true,
    safeClientConfirmation: confirmationByLanguage[originalLanguage],
    source: "client_confirmed_structuring",
  };
  const timestamp = now();
  await context.env.DB.prepare(
    "UPDATE intakes SET structured_summary_json=?,summary_version=?,state='awaiting_confirmation',version=version+1,updated_at=? WHERE id=? AND version=?",
  )
    .bind(
      JSON.stringify(summary),
      intake.version + 1,
      timestamp,
      id,
      intake.version,
    )
    .run();
  if (context.env.OPENAI_API_KEY)
    await recordJobBeforePublish(context.env, {
      kind: "ai_intake_extraction",
      queueName: "jobs",
      idempotencyKey: `ai-intake:${id}:${intake.version + 1}`,
      payload: { intakeId: id, version: intake.version + 1 },
    });
  return context.json({ ...summary, intakeVersion: intake.version + 1 });
});

routes.post(
  "/intakes/:id/confirm",
  zValidator("json", confirmSchema),
  async (context) => {
    const input = context.req.valid("json");
    const id = context.req.param("id");
    const user = context.get("user");
    const timestamp = now();
    const intake = await context.env.DB.prepare(
      "SELECT version,state,language,structured_summary_json FROM intakes WHERE id=? AND client_user_id=?",
    )
      .bind(id, user.id)
      .first<{
        version: number;
        state: string;
        language: string;
        structured_summary_json: string | null;
      }>();
    if (!intake) return context.json({ message: "Intake not found" }, 404);
    if (
      intake.version !== input.version ||
      intake.state !== "awaiting_confirmation" ||
      !intake.structured_summary_json
    )
      return context.json(
        {
          message: "Intake summary must be current before confirmation",
          currentVersion: intake.version,
        },
        409,
      );
    const summary = JSON.parse(intake.structured_summary_json) as Record<
      string,
      unknown
    >;
    if (input.corrections) summary.clientCorrections = input.corrections;
    await context.env.DB.batch([
      context.env.DB.prepare(
        "UPDATE intakes SET structured_summary_json=?,confirmed_at=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      ).bind(JSON.stringify(summary), timestamp, timestamp, id, input.version),
      context.env.DB.prepare(
        "INSERT INTO consent_records (id,user_id,intake_id,consent_type,content_version,language,accepted,recorded_at,source_ip_hash) VALUES (?,?,?,?,?,?,1,?,?)",
      ).bind(
        crypto.randomUUID(),
        user.id,
        id,
        "lawyer_information_sharing",
        input.consentVersion,
        intake.language,
        timestamp,
        await hmac(
          context.req.header("cf-connecting-ip") ?? "local",
          context.env.AUTH_HMAC_PEPPER,
        ),
      ),
    ]);
    return context.json({
      id,
      confirmedAt: timestamp,
      version: input.version + 1,
    });
  },
);

routes.post("/intakes/:id/submit", async (context) => {
  const id = context.req.param("id");
  const user = context.get("user");
  const timestamp = now();
  const intake = await context.env.DB.prepare(
    "SELECT * FROM intakes WHERE id=? AND client_user_id=?",
  )
    .bind(id, user.id)
    .first<{
      id: string;
      confirmed_at: string | null;
      structured_summary_json: string | null;
      state_code: string;
      workflow_id: string;
      tenancy_role: "tenant" | "landlord";
      practice_area_code: string | null;
      service_version_id: string | null;
      client_type: "adult_individual" | "minor" | "organization";
      client_subject_id: string | null;
      language_v2: string | null;
      version: number;
    }>();
  if (!intake) return context.json({ message: "Intake not found" }, 404);
  if (!intake.confirmed_at || !intake.structured_summary_json)
    return context.json(
      {
        message: "Confirm the structured summary and consent before submission",
      },
      409,
    );
  const answersResult = await context.env.DB.prepare(
    "SELECT question_key,value_json FROM intake_answers WHERE intake_id=?",
  )
    .bind(id)
    .all<{ question_key: string; value_json: string }>();
  const answerKeys = new Set(
    answersResult.results.map((item) => item.question_key),
  );
  const practiceAreaCode = intake.practice_area_code ?? "tenancy";
  const service = serviceForPracticeArea(practiceAreaCode);
  const questions =
    practiceAreaCode === "tenancy"
      ? workflowFor(intake.tenancy_role).questions
      : service.questions;
  const missing = questions
    .filter((question) => question.required && !answerKeys.has(question.key))
    .map((question) => question.key);
  if (missing.length)
    return context.json(
      { message: "Required questionnaire answers are missing", missing },
      422,
    );
  if (intake.client_type === "minor") {
    const guardian = await context.env.DB.prepare(
      "SELECT 1 FROM minor_profiles mp JOIN guardian_links gl ON gl.minor_profile_id=mp.id WHERE mp.id=? AND mp.user_id=? AND mp.status='guardian_verified' AND gl.status='verified'",
    )
      .bind(intake.client_subject_id, user.id)
      .first();
    if (!guardian)
      return context.json(
        {
          message:
            "Verified guardian consent is required before detailed submission",
        },
        403,
      );
  }
  if (intake.client_type === "organization") {
    const authority = await context.env.DB.prepare(
      "SELECT 1 FROM organizations o JOIN organization_memberships om ON om.organization_id=o.id WHERE o.id=? AND om.user_id=? AND o.status='active' AND om.status='approved'",
    )
      .bind(intake.client_subject_id, user.id)
      .first();
    if (!authority)
      return context.json(
        {
          message:
            "Approved organization authority is required before submission",
        },
        403,
      );
  }
  const matterId = crypto.randomUUID();
  const reference = `LEX-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const answers = Object.fromEntries(
    answersResult.results.map((item) => [
      item.question_key,
      JSON.parse(item.value_json),
    ]),
  );
  const urgency =
    practiceAreaCode === "tenancy"
      ? calculateUrgency(intake.tenancy_role, answers)
      : classifyUrgency(practiceAreaCode, answers);
  const eligible = await context.env.DB.prepare(
    `SELECT COUNT(*) count FROM lawyer_profiles l WHERE l.verification_status='verified' AND l.available=1
     AND (l.verification_expires_at IS NULL OR l.verification_expires_at>?)
     AND EXISTS(SELECT 1 FROM lawyer_capabilities c WHERE c.lawyer_id=l.id AND c.kind='state' AND c.value=?)
     AND EXISTS(SELECT 1 FROM lawyer_capabilities c WHERE c.lawyer_id=l.id AND c.kind='practice_area' AND c.value=?)
     AND EXISTS(SELECT 1 FROM lawyer_capabilities c WHERE c.lawyer_id=l.id AND c.kind='language' AND c.value=?)`,
  )
    .bind(
      timestamp,
      intake.state_code,
      practiceAreaCode,
      intake.language_v2 ?? "en",
    )
    .first<{ count: number }>();
  const matterState =
    urgency !== "standard"
      ? "urgent_operations_review"
      : (eligible?.count ?? 0) > 0
        ? "matching"
        : "matching_assistance";
  const statements: D1PreparedStatement[] = [
    context.env.DB.prepare(
      "UPDATE intakes SET state='submitted',submitted_at=?,version=version+1,updated_at=? WHERE id=? AND submitted_at IS NULL",
    ).bind(timestamp, timestamp, id),
    context.env.DB.prepare(
      "INSERT INTO matters (id,reference,client_user_id,intake_id,workflow_id,service_version_id,client_type,client_subject_id,country_code,state_code,state,urgency,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'NG',?,?,?,1,?,?)",
    ).bind(
      matterId,
      reference,
      user.id,
      id,
      intake.workflow_id,
      intake.service_version_id ?? service.id,
      intake.client_type,
      intake.client_subject_id,
      intake.state_code,
      matterState,
      urgency,
      timestamp,
      timestamp,
    ),
    context.env.DB.prepare(
      "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,matter_id,metadata_json,request_id,occurred_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      user.id,
      "matter.submitted",
      "Matter",
      matterId,
      matterId,
      JSON.stringify({ state: matterState, urgency }),
      context.get("requestId"),
      timestamp,
    ),
  ];
  if (matterState === "matching_assistance")
    statements.push(
      context.env.DB.prepare(
        "INSERT INTO operations_matching_requests (id,matter_id,practice_area_code,state_code,urgency,state,version,created_at,updated_at) VALUES (?,?,?,?,?,'open',1,?,?)",
      ).bind(
        crypto.randomUUID(),
        matterId,
        practiceAreaCode,
        intake.state_code,
        urgency,
        timestamp,
        timestamp,
      ),
    );
  await context.env.DB.batch(statements);
  if (urgency !== "standard")
    await recordJobBeforePublish(context.env, {
      kind: "urgent_matter_alert",
      queueName: "notifications",
      idempotencyKey: `urgent:${matterId}`,
      payload: { matterId },
    });
  return context.json(
    {
      id: matterId,
      reference,
      state: matterState,
      urgency,
      serviceAvailable: true,
      operationsReviewRequired: matterState === "urgent_operations_review",
      matchingAssistanceRequired: matterState === "matching_assistance",
    },
    201,
  );
});

routes.post(
  "/intakes/:id/transcriptions",
  zValidator(
    "json",
    z.object({ evidenceId: z.uuid(), language: pilotLanguage }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const intakeId = context.req.param("id");
    const user = context.get("user");
    const evidence = await context.env.DB.prepare(
      "SELECT e.id FROM evidence_items e JOIN intakes i ON i.id=e.intake_id WHERE e.id=? AND i.id=? AND i.client_user_id=? AND e.content_type LIKE 'audio/%'",
    )
      .bind(input.evidenceId, intakeId, user.id)
      .first();
    if (!evidence)
      return context.json({ message: "Audio evidence not found" }, 404);
    if (!context.env.OPENAI_API_KEY)
      return context.json(
        {
          capability: "voice_transcription",
          status: "unconfigured",
          message: "OpenAI test credentials are required for transcription",
        },
        503,
      );
    const id = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.prepare(
      "INSERT INTO transcriptions (id,intake_id,evidence_id,language,status,version,created_at,updated_at) VALUES (?,?,?,?,'queued',1,?,?)",
    )
      .bind(
        id,
        intakeId,
        input.evidenceId,
        input.language,
        timestamp,
        timestamp,
      )
      .run();
    await recordJobBeforePublish(context.env, {
      kind: "transcription",
      queueName: "jobs",
      idempotencyKey: `transcription:${input.evidenceId}`,
      payload: { transcriptionId: id },
    });
    return context.json({ id, status: "queued" }, 202);
  },
);

routes.post(
  "/transcriptions/:id/confirm",
  zValidator(
    "json",
    z.object({
      transcript: z.string().min(1).max(20_000),
      version: z.number().int().positive(),
    }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    const timestamp = now();
    const transcription = await context.env.DB.prepare(
      "SELECT t.version,t.status FROM transcriptions t JOIN intakes i ON i.id=t.intake_id WHERE t.id=? AND i.client_user_id=?",
    )
      .bind(context.req.param("id"), user.id)
      .first<{ version: number; status: string }>();
    if (!transcription)
      return context.json({ message: "Transcription not found" }, 404);
    if (
      transcription.version !== input.version ||
      transcription.status !== "ready"
    )
      return context.json(
        { message: "Transcription is not ready or changed" },
        409,
      );
    await context.env.DB.prepare(
      "UPDATE transcriptions SET confirmed_transcript=?,confirmed_at=?,status='confirmed',version=version+1,updated_at=? WHERE id=? AND version=?",
    )
      .bind(
        input.transcript,
        timestamp,
        timestamp,
        context.req.param("id"),
        input.version,
      )
      .run();
    return context.json({
      id: context.req.param("id"),
      status: "confirmed",
      version: input.version + 1,
    });
  },
);
routes.get("/transcriptions/:id", async (context) => {
  const value = await context.env.DB.prepare(
    "SELECT t.id,t.status,t.transcript,t.confirmed_transcript,t.confidence_millis,t.model,t.version,t.created_at,t.updated_at FROM transcriptions t JOIN intakes i ON i.id=t.intake_id WHERE t.id=? AND i.client_user_id=?",
  )
    .bind(context.req.param("id"), context.get("user").id)
    .first();
  if (!value) return context.json({ message: "Transcription not found" }, 404);
  return context.json(value);
});

routes.get("/matters", async (context) => {
  const user = context.get("user");
  const query =
    user.role === "client"
      ? "SELECT m.*,i.practice_area_code,i.client_type FROM matters m JOIN intakes i ON i.id=m.intake_id WHERE m.client_user_id=? ORDER BY m.created_at DESC"
      : user.role === "lawyer"
        ? "SELECT m.*,i.practice_area_code,i.client_type FROM matters m JOIN intakes i ON i.id=m.intake_id JOIN lawyer_profiles l ON l.id=m.selected_lawyer_id WHERE l.user_id=? ORDER BY m.created_at DESC"
        : "SELECT m.*,i.practice_area_code,i.client_type FROM matters m JOIN intakes i ON i.id=m.intake_id ORDER BY m.created_at DESC LIMIT 200";
  const statement = context.env.DB.prepare(query);
  const result =
    user.role === "admin" || user.role === "super_admin"
      ? await statement.all()
      : await statement.bind(user.id).all();
  return context.json(result.results);
});

routes.get("/matters/:id", async (context) => {
  const id = context.req.param("id");
  if (!(await canAccessMatter(context, id)))
    return context.json({ message: "Matter not found" }, 404);
  const matter = await context.env.DB.prepare(
    "SELECT m.*,i.structured_summary_json,COALESCE(i.language_v2,i.language) language,i.tenancy_role,i.practice_area_code,i.client_type FROM matters m JOIN intakes i ON i.id=m.intake_id WHERE m.id=?",
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!matter) return context.json({ message: "Matter not found" }, 404);
  const [messages, evidence, assessment, consultation] = await Promise.all([
    context.env.DB.prepare(
      "SELECT id,sender_user_id,channel,body,message_type,created_at FROM messages WHERE matter_id=? ORDER BY created_at",
    )
      .bind(id)
      .all(),
    context.env.DB.prepare(
      "SELECT id,file_name,content_type,size_bytes,sha256,status,created_at FROM evidence_items WHERE matter_id=? AND deleted_at IS NULL ORDER BY created_at",
    )
      .bind(id)
      .all(),
    context.env.DB.prepare(
      "SELECT id,title,body,limitations,next_steps_json,lawyer_attested_at,delivered_at FROM assessments WHERE matter_id=?",
    )
      .bind(id)
      .first(),
    context.env.DB.prepare(
      "SELECT id,state,mode,scheduled_start,scheduled_end,time_zone,started_at,ended_at,version FROM consultations WHERE matter_id=?",
    )
      .bind(id)
      .first(),
  ]);
  return context.json({
    ...matter,
    structuredSummary: matter.structured_summary_json
      ? JSON.parse(String(matter.structured_summary_json))
      : null,
    messages: messages.results,
    evidence: evidence.results,
    assessment,
    consultation,
  });
});

routes.post(
  "/matters/:id/messages",
  zValidator("json", createMessageSchema),
  async (context) => {
    const id = context.req.param("id");
    if (!(await canAccessMatter(context, id)))
      return context.json({ message: "Matter not found" }, 404);
    const input = context.req.valid("json");
    const user = context.get("user");
    const messageId = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.prepare(
      "INSERT INTO messages (id,matter_id,sender_user_id,channel,body,message_type,created_at) VALUES (?,?,?,?,?,'message',?)",
    )
      .bind(messageId, id, user.id, input.channel, input.body, timestamp)
      .run();
    await audit(context.env, {
      actorUserId: user.id,
      action: "matter.message_created",
      entityType: "Message",
      entityId: messageId,
      matterId: id,
      requestId: context.get("requestId"),
    });
    const matter = await context.env.DB.prepare(
      "SELECT client_user_id,selected_lawyer_id FROM matters WHERE id=?",
    )
      .bind(id)
      .first<{ client_user_id: string; selected_lawyer_id: string | null }>();
    if (matter && user.id !== matter.client_user_id)
      await recordJobBeforePublish(context.env, {
        kind: "matter_status",
        queueName: "notifications",
        idempotencyKey: `message-notify:${messageId}`,
        payload: { matterId: id, userId: matter.client_user_id, messageId },
      });
    return context.json({ id: messageId, createdAt: timestamp }, 201);
  },
);

routes.put("/matters/:id/evidence", async (context) =>
  uploadEvidence(context, "matter"),
);
routes.put("/intakes/:id/evidence", async (context) =>
  uploadEvidence(context, "intake"),
);
routes.get("/evidence/:id", async (context) => {
  const evidence = await context.env.DB.prepare(
    "SELECT * FROM evidence_items WHERE id=? AND deleted_at IS NULL",
  )
    .bind(context.req.param("id"))
    .first<{
      matter_id: string | null;
      intake_id: string | null;
      owner_user_id: string;
      object_key: string;
      file_name: string;
      content_type: string;
    }>();
  if (!evidence) return context.json({ message: "Evidence not found" }, 404);
  const user = context.get("user");
  const intakeOwned = evidence.intake_id
    ? Boolean(
        await context.env.DB.prepare(
          "SELECT 1 FROM intakes WHERE id=? AND client_user_id=?",
        )
          .bind(evidence.intake_id, user.id)
          .first(),
      )
    : false;
  if (!(
    evidence.owner_user_id === user.id ||
    intakeOwned ||
    (evidence.matter_id && (await canAccessMatter(context, evidence.matter_id)))
  ))
    return context.json({ message: "Evidence not found" }, 404);
  const object = await context.env.PRIVATE_EVIDENCE.get(evidence.object_key);
  if (!object)
    return context.json({ message: "Evidence object is unavailable" }, 404);
  await audit(context.env, {
    actorUserId: user.id,
    action: "evidence.downloaded",
    entityType: "EvidenceItem",
    entityId: context.req.param("id"),
    ...(evidence.matter_id ? { matterId: evidence.matter_id } : {}),
    requestId: context.get("requestId"),
  });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", evidence.content_type);
  headers.set(
    "content-disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(evidence.file_name)}`,
  );
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");
  return new Response(object.body, { headers });
});

routes.get("/matches/:matterId", async (context) => {
  const matterId = context.req.param("matterId");
  if (!(await canAccessMatter(context, matterId)))
    return context.json({ message: "Matter not found" }, 404);
  const matter = await context.env.DB.prepare(
    "SELECT m.state,m.urgency,m.state_code,i.practice_area_code,COALESCE(i.language_v2,i.language) language FROM matters m JOIN intakes i ON i.id=m.intake_id WHERE m.id=? AND m.client_user_id=?",
  )
    .bind(matterId, context.get("user").id)
    .first<{
      state: string;
      urgency: string;
      state_code: string;
      practice_area_code: string;
      language: string;
    }>();
  if (!matter || matter.state !== "matching")
    return context.json(
      { message: "Matching is not available for this matter" },
      409,
    );
  const urgentClause =
    matter.urgency === "standard" ? "" : " AND l.urgent_available=1";
  const result = await context.env.DB.prepare(
    `SELECT l.id,l.display_name,l.year_of_call,l.firm_name,l.bio FROM lawyer_profiles l
     WHERE l.verification_status='verified' AND l.available=1 AND (l.verification_expires_at IS NULL OR l.verification_expires_at>?)${urgentClause}
     AND EXISTS(SELECT 1 FROM lawyer_capabilities c WHERE c.lawyer_id=l.id AND c.kind='state' AND c.value=?)
     AND EXISTS(SELECT 1 FROM lawyer_capabilities c WHERE c.lawyer_id=l.id AND c.kind='practice_area' AND c.value=?)
     AND EXISTS(SELECT 1 FROM lawyer_capabilities c WHERE c.lawyer_id=l.id AND c.kind='language' AND c.value=?)
     ORDER BY (SELECT COUNT(*) FROM matters m WHERE m.selected_lawyer_id=l.id AND m.state NOT IN ('closed','cancelled','refunded')) ASC,l.updated_at ASC LIMIT 5`,
  )
    .bind(now(), matter.state_code, matter.practice_area_code, matter.language)
    .all();
  return context.json(result.results);
});

routes.post(
  "/matches/:matterId/select",
  zValidator(
    "json",
    z.object({ lawyerId: z.uuid(), version: z.number().int().positive() }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const matterId = context.req.param("matterId");
    const user = context.get("user");
    const timestamp = now();
    const eligible = await context.env.DB.prepare(
      `SELECT 1 FROM lawyer_profiles l JOIN matters m ON m.id=? JOIN intakes i ON i.id=m.intake_id WHERE l.id=?
       AND l.verification_status='verified' AND l.available=1 AND (l.verification_expires_at IS NULL OR l.verification_expires_at>?)
       AND (m.urgency='standard' OR l.urgent_available=1)
       AND EXISTS(SELECT 1 FROM lawyer_capabilities c WHERE c.lawyer_id=l.id AND c.kind='state' AND c.value=m.state_code)
       AND EXISTS(SELECT 1 FROM lawyer_capabilities c WHERE c.lawyer_id=l.id AND c.kind='practice_area' AND c.value=i.practice_area_code)
       AND EXISTS(SELECT 1 FROM lawyer_capabilities c WHERE c.lawyer_id=l.id AND c.kind='language' AND c.value=COALESCE(i.language_v2,i.language))`,
    )
      .bind(matterId, input.lawyerId, timestamp)
      .first();
    if (!eligible)
      return context.json(
        { message: "Lawyer is not eligible for this matter" },
        422,
      );
    const result = await context.env.DB.prepare(
      "UPDATE matters SET selected_lawyer_id=?,state='conflict_review',version=version+1,updated_at=? WHERE id=? AND client_user_id=? AND state='matching' AND version=?",
    )
      .bind(input.lawyerId, timestamp, matterId, user.id, input.version)
      .run();
    if ((result.meta.changes ?? 0) !== 1)
      return context.json(
        { message: "Matter changed before lawyer selection" },
        409,
      );
    await audit(context.env, {
      actorUserId: user.id,
      action: "matching.lawyer_selected",
      entityType: "Matter",
      entityId: matterId,
      matterId,
      requestId: context.get("requestId"),
      metadata: { lawyerId: input.lawyerId },
    });
    return context.json({
      matterId,
      state: "conflict_review",
      version: input.version + 1,
    });
  },
);

routes.get("/notification-preferences", async (context) => {
  const value = await context.env.DB.prepare(
    "SELECT whatsapp,push,email,updated_at FROM notification_preferences WHERE user_id=?",
  )
    .bind(context.get("user").id)
    .first();
  return context.json(value ?? { whatsapp: true, push: false, email: false });
});
routes.put(
  "/notification-preferences",
  zValidator("json", preferenceSchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    if (input.email && context.env.EMAIL_DELIVERY_ENABLED !== "true")
      return context.json({ message: "Email delivery is not configured" }, 422);
    await context.env.DB.prepare(
      "INSERT INTO notification_preferences (user_id,whatsapp,push,email,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET whatsapp=excluded.whatsapp,push=excluded.push,email=excluded.email,updated_at=excluded.updated_at",
    )
      .bind(
        user.id,
        Number(input.whatsapp),
        Number(input.push),
        Number(input.email),
        now(),
      )
      .run();
    return context.json(input);
  },
);
routes.post(
  "/push-devices",
  zValidator("json", pushSchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    const tokenHash = await sha256(input.token);
    const timestamp = now();
    await context.env.DB.prepare(
      "INSERT INTO push_devices (id,user_id,token_hash,token_encrypted,platform,consent_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET user_id=excluded.user_id,token_encrypted=excluded.token_encrypted,consent_at=excluded.consent_at,revoked_at=NULL,updated_at=excluded.updated_at",
    )
      .bind(
        crypto.randomUUID(),
        user.id,
        tokenHash,
        await encrypt(input.token, context.env.FIELD_ENCRYPTION_KEY),
        input.platform,
        timestamp,
        timestamp,
        timestamp,
      )
      .run();
    return context.json({ registered: true }, 201);
  },
);

routes.post(
  "/privacy/requests",
  zValidator("json", privacySchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    const id = crypto.randomUUID();
    const timestamp = now();
    await context.env.DB.prepare(
      "INSERT INTO privacy_requests (id,user_id,type,status,details,due_at,version,created_at,updated_at) VALUES (?,?,?,'open',?,?,1,?,?)",
    )
      .bind(
        id,
        user.id,
        input.type,
        input.details ?? null,
        future(30 * 24 * 60 * 60_000),
        timestamp,
        timestamp,
      )
      .run();
    await audit(context.env, {
      actorUserId: user.id,
      action: "privacy.request_created",
      entityType: "PrivacyRequest",
      entityId: id,
      requestId: context.get("requestId"),
      metadata: { type: input.type },
    });
    return context.json({ id, status: "open" }, 201);
  },
);
routes.get("/privacy/requests", async (context) =>
  context.json(
    (
      await context.env.DB.prepare(
        "SELECT id,type,status,due_at,completed_at,created_at FROM privacy_requests WHERE user_id=? ORDER BY created_at DESC",
      )
        .bind(context.get("user").id)
        .all()
    ).results,
  ),
);

routes.post(
  "/lawyer/application",
  zValidator("json", lawyerApplicationSchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    const id = crypto.randomUUID();
    const timestamp = now();
    const destinationEmailHash = await hmac(
      input.email.toLowerCase(),
      context.env.AUTH_HMAC_PEPPER,
    );
    const destinationPhoneHash = await hmac(
      input.phone,
      context.env.AUTH_HMAC_PEPPER,
    );
    try {
      const statements: D1PreparedStatement[] = [
        context.env.DB.prepare(
          "UPDATE users SET role='lawyer',email_encrypted=?,email_hash=?,phone_encrypted=?,phone_hash=?,version=version+1,updated_at=? WHERE id=? AND role='client'",
        ).bind(
          await encrypt(input.email, context.env.FIELD_ENCRYPTION_KEY),
          destinationEmailHash,
          await encrypt(input.phone, context.env.FIELD_ENCRYPTION_KEY),
          destinationPhoneHash,
          timestamp,
          user.id,
        ),
        context.env.DB.prepare(
          "INSERT INTO lawyer_profiles (id,user_id,display_name,supreme_court_number,year_of_call,firm_name,bio,verification_status,available,urgent_available,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending',0,?,1,?,?)",
        ).bind(
          id,
          user.id,
          input.displayName,
          input.supremeCourtNumber,
          input.yearOfCall,
          input.firmName ?? null,
          input.bio,
          Number(input.urgentAvailable),
          timestamp,
          timestamp,
        ),
      ];
      for (const language of input.languages)
        statements.push(
          context.env.DB.prepare(
            "INSERT INTO lawyer_capabilities (lawyer_id,kind,value) VALUES (?,'language',?)",
          ).bind(id, language),
        );
      for (const stateCode of input.stateCodes)
        statements.push(
          context.env.DB.prepare(
            "INSERT INTO lawyer_capabilities (lawyer_id,kind,value) VALUES (?,'state',?)",
          ).bind(id, stateCode.toUpperCase()),
        );
      for (const practiceAreaCode of input.practiceAreaCodes)
        statements.push(
          context.env.DB.prepare(
            "INSERT INTO lawyer_capabilities (lawyer_id,kind,value) VALUES (?,'practice_area',?)",
          ).bind(id, practiceAreaCode),
        );
      for (const serviceCode of input.serviceCodes)
        statements.push(
          context.env.DB.prepare(
            "INSERT INTO lawyer_capabilities (lawyer_id,kind,value) VALUES (?,'service',?)",
          ).bind(id, serviceCode),
        );
      for (const consultationMode of input.consultationModes)
        statements.push(
          context.env.DB.prepare(
            "INSERT INTO lawyer_capabilities (lawyer_id,kind,value) VALUES (?,'consultation_mode',?)",
          ).bind(id, consultationMode),
        );
      for (const role of input.tenancyRoles)
        statements.push(
          context.env.DB.prepare(
            "INSERT INTO lawyer_capabilities (lawyer_id,kind,value) VALUES (?,'tenancy_role',?)",
          ).bind(id, role),
        );
      await context.env.DB.batch(statements);
    } catch {
      return context.json(
        {
          message:
            "Lawyer application conflicts with an existing account or credential",
        },
        409,
      );
    }
    return context.json(
      { id, verificationStatus: "pending", mfaSetupRequired: true },
      201,
    );
  },
);

routes.put(
  "/lawyer/availability",
  requireRole("lawyer"),
  zValidator(
    "json",
    z.object({ available: z.boolean(), urgentAvailable: z.boolean() }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    await context.env.DB.prepare(
      "UPDATE lawyer_profiles SET available=?,urgent_available=?,version=version+1,updated_at=? WHERE user_id=? AND verification_status='verified'",
    )
      .bind(
        Number(input.available),
        Number(input.urgentAvailable),
        now(),
        context.get("user").id,
      )
      .run();
    return context.json(input);
  },
);

routes.post(
  "/lawyer/matters/:id/conflict",
  requireRole("lawyer"),
  zValidator(
    "json",
    conflictDecisionSchema.extend({
      matterVersion: z.number().int().positive(),
    }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const matterId = context.req.param("id");
    const user = context.get("user");
    const timestamp = now();
    const lawyer = await context.env.DB.prepare(
      "SELECT l.id FROM lawyer_profiles l JOIN matters m ON m.selected_lawyer_id=l.id WHERE l.user_id=? AND m.id=? AND m.state='conflict_review'",
    )
      .bind(user.id, matterId)
      .first<{ id: string }>();
    if (!lawyer)
      return context.json(
        { message: "Matter is not assigned for conflict review" },
        404,
      );
    const nextState =
      input.decision === "accepted" ? "awaiting_payment" : "matching";
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO conflict_checks (id,matter_id,lawyer_id,decision,reason_code,private_note_encrypted,decided_at,version) VALUES (?,?,?,?,?,?,?,1)",
      ).bind(
        crypto.randomUUID(),
        matterId,
        lawyer.id,
        input.decision,
        input.reasonCode,
        input.privateNote
          ? await encrypt(input.privateNote, context.env.FIELD_ENCRYPTION_KEY)
          : null,
        timestamp,
      ),
      context.env.DB.prepare(
        "UPDATE matters SET state=?,selected_lawyer_id=CASE WHEN ?='matching' THEN NULL ELSE selected_lawyer_id END,version=version+1,updated_at=? WHERE id=? AND state='conflict_review' AND version=?",
      ).bind(nextState, nextState, timestamp, matterId, input.matterVersion),
    ]);
    return context.json({
      matterId,
      state: nextState,
      version: input.matterVersion + 1,
    });
  },
);

routes.post(
  "/lawyer/matters/:id/assessment",
  requireRole("lawyer"),
  zValidator(
    "json",
    assessmentSchema.extend({ matterVersion: z.number().int().positive() }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const matterId = context.req.param("id");
    const user = context.get("user");
    const timestamp = now();
    const lawyer = await context.env.DB.prepare(
      "SELECT l.id FROM lawyer_profiles l JOIN matters m ON m.selected_lawyer_id=l.id WHERE l.user_id=? AND m.id=? AND m.state IN ('consultation_active','lawyer_review')",
    )
      .bind(user.id, matterId)
      .first<{ id: string }>();
    if (!lawyer)
      return context.json(
        { message: "Matter is not available for assessment delivery" },
        404,
      );
    const assessmentId = crypto.randomUUID();
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO assessments (id,matter_id,lawyer_id,title,body,limitations,next_steps_json,lawyer_attested_at,delivered_at,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)",
      ).bind(
        assessmentId,
        matterId,
        lawyer.id,
        input.title,
        input.body,
        input.limitations,
        JSON.stringify(input.nextSteps),
        timestamp,
        timestamp,
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        "UPDATE matters SET state='delivered',version=version+1,updated_at=? WHERE id=? AND version=?",
      ).bind(timestamp, matterId, input.matterVersion),
    ]);
    await recordJobBeforePublish(context.env, {
      kind: "assessment_ready",
      queueName: "notifications",
      idempotencyKey: `assessment-ready:${assessmentId}`,
      payload: { matterId, assessmentId },
    });
    return context.json(
      { id: assessmentId, matterId, state: "delivered", lawyerReviewed: true },
      201,
    );
  },
);

routes.post("/matters/:id/reassignment", async (context) =>
  clientMatterAction(context, "reassignment_requested"),
);
routes.post("/matters/:id/refund", async (context) =>
  clientMatterAction(context, "refund_requested"),
);

routes.get(
  "/admin/jobs",
  requireRole("admin", "super_admin"),
  async (context) =>
    context.json(
      (
        await context.env.DB.prepare(
          "SELECT id,kind,queue_name,state,attempts,available_at,last_error,created_at,updated_at FROM jobs ORDER BY created_at DESC LIMIT 200",
        ).all()
      ).results,
    ),
);
routes.get(
  "/admin/audits",
  requireRole("admin", "super_admin"),
  async (context) =>
    context.json(
      (
        await context.env.DB.prepare(
          "SELECT * FROM audit_events ORDER BY occurred_at DESC LIMIT 200",
        ).all()
      ).results,
    ),
);
routes.get(
  "/admin/privacy",
  requireRole("admin", "super_admin"),
  async (context) =>
    context.json(
      (
        await context.env.DB.prepare(
          "SELECT * FROM privacy_requests ORDER BY created_at DESC LIMIT 200",
        ).all()
      ).results,
    ),
);
routes.get(
  "/admin/lawyers",
  requireRole("admin", "super_admin"),
  async (context) =>
    context.json(
      (
        await context.env.DB.prepare(
          "SELECT * FROM lawyer_profiles ORDER BY created_at DESC LIMIT 200",
        ).all()
      ).results,
    ),
);
routes.post(
  "/admin/lawyers/:id/review",
  requireRole("admin", "super_admin"),
  zValidator(
    "json",
    z.object({
      decision: z.enum(["verified", "declined"]),
      evidenceReference: z.string().min(3).max(500),
      expiresAt: z.iso.datetime().optional(),
    }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const id = context.req.param("id");
    const user = context.get("user");
    const timestamp = now();
    await context.env.DB.prepare(
      "UPDATE lawyer_profiles SET verification_status=?,verification_expires_at=?,available=CASE WHEN ?='verified' THEN available ELSE 0 END,version=version+1,updated_at=? WHERE id=?",
    )
      .bind(
        input.decision,
        input.expiresAt ?? null,
        input.decision,
        timestamp,
        id,
      )
      .run();
    await audit(context.env, {
      actorUserId: user.id,
      action: "lawyer.verification_reviewed",
      entityType: "LawyerProfile",
      entityId: id,
      requestId: context.get("requestId"),
      metadata: input,
    });
    return context.json({ id, verificationStatus: input.decision });
  },
);
routes.post(
  "/admin/workflows/:id/publish",
  requireRole("super_admin"),
  zValidator(
    "json",
    z.object({
      legalApprovalReference: z.string().min(5).max(500),
      version: z.number().int().positive(),
    }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const id = context.req.param("id");
    const user = context.get("user");
    const timestamp = now();
    const result = await context.env.DB.prepare(
      "UPDATE workflows SET status='published',approved_by=?,approved_at=?,effective_at=?,updated_at=? WHERE id=? AND version=? AND status IN ('review','approved')",
    )
      .bind(user.id, timestamp, timestamp, timestamp, id, input.version)
      .run();
    if ((result.meta.changes ?? 0) !== 1)
      return context.json(
        {
          message:
            "Workflow cannot be published from its current version or state",
        },
        409,
      );
    await audit(context.env, {
      actorUserId: user.id,
      action: "workflow.published",
      entityType: "Workflow",
      entityId: id,
      requestId: context.get("requestId"),
      metadata: { legalApprovalReference: input.legalApprovalReference },
    });
    return context.json({ id, status: "published", effectiveAt: timestamp });
  },
);

async function uploadEvidence(
  context: AppContext,
  ownerType: "matter" | "intake",
) {
  const ownerId = context.req.param("id") as string;
  const user = context.get("user");
  const authorized =
    ownerType === "matter"
      ? await canAccessMatter(context, ownerId)
      : Boolean(
          await context.env.DB.prepare(
            "SELECT 1 FROM intakes WHERE id=? AND client_user_id=?",
          )
            .bind(ownerId, user.id)
            .first(),
        );
  if (!authorized)
    return context.json(
      { message: `${ownerType === "matter" ? "Matter" : "Intake"} not found` },
      404,
    );
  if (ownerType === "intake") {
    const intake = await context.env.DB.prepare(
      "SELECT client_type,client_subject_id FROM intakes WHERE id=? AND client_user_id=?",
    )
      .bind(ownerId, user.id)
      .first<{ client_type: string; client_subject_id: string | null }>();
    const gate = intake
      ? await clientContextGate(
          context.env,
          user.id,
          intake.client_type,
          intake.client_subject_id,
        )
      : "Intake not found";
    if (gate) return context.json({ message: gate }, 403);
  }
  const size = Number(context.req.header("content-length"));
  const max = Number(context.env.MAX_EVIDENCE_BYTES);
  if (!Number.isInteger(size) || size < 1 || size > max)
    return context.json(
      {
        message: `Evidence must include Content-Length and be no larger than ${max} bytes`,
      },
      413,
    );
  const contentType = (context.req.header("content-type") ?? "")
    .split(";")[0]!
    .toLowerCase();
  if (!evidenceContentTypes.has(contentType))
    return context.json({ message: "Evidence type is not allowed" }, 415);
  const checksum = context.req.header("x-file-sha256")?.toLowerCase();
  if (!checksum || !/^[a-f0-9]{64}$/u.test(checksum))
    return context.json(
      { message: "A lowercase hexadecimal SHA-256 checksum is required" },
      422,
    );
  const fileName = (context.req.header("x-file-name") ?? "evidence")
    .replace(/[\r\n\\/]/gu, "_")
    .slice(0, 180);
  if (!context.req.raw.body)
    return context.json({ message: "Evidence body is required" }, 400);
  const evidenceId = crypto.randomUUID();
  const objectKey = `quarantine/${ownerType}/${ownerId}/${crypto.randomUUID()}`;
  const timestamp = now();
  try {
    const object = await context.env.PRIVATE_EVIDENCE.put(
      objectKey,
      context.req.raw.body,
      {
        httpMetadata: { contentType },
        customMetadata: { evidenceId, ownerType, syntheticOnly: "true" },
        sha256: checksum,
      },
    );
    if (!object.checksums.sha256)
      throw new Error("R2 did not confirm the SHA-256 checksum");
    await context.env.DB.prepare(
      "INSERT INTO evidence_items (id,matter_id,intake_id,owner_user_id,object_key,file_name,content_type,size_bytes,sha256,status,retention_until,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'quarantined',?,?,?)",
    )
      .bind(
        evidenceId,
        ownerType === "matter" ? ownerId : null,
        ownerType === "intake" ? ownerId : null,
        user.id,
        objectKey,
        fileName,
        contentType,
        size,
        checksum,
        future(90 * 24 * 60 * 60_000),
        timestamp,
        timestamp,
      )
      .run();
    await recordJobBeforePublish(context.env, {
      kind: "evidence_check",
      queueName: "jobs",
      idempotencyKey: `evidence-check:${evidenceId}`,
      payload: { evidenceId },
    });
  } catch (error) {
    await context.env.PRIVATE_EVIDENCE.delete(objectKey);
    return context.json(
      {
        message:
          error instanceof Error ? error.message : "Evidence upload failed",
      },
      422,
    );
  }
  await audit(context.env, {
    actorUserId: user.id,
    action: "evidence.uploaded",
    entityType: "EvidenceItem",
    entityId: evidenceId,
    ...(ownerType === "matter" ? { matterId: ownerId } : {}),
    requestId: context.get("requestId"),
    metadata: { contentType, size, status: "quarantined" },
  });
  return context.json(
    {
      id: evidenceId,
      fileName,
      contentType,
      sizeBytes: size,
      sha256: checksum,
      status: "quarantined",
    },
    201,
  );
}

async function clientMatterAction(
  context: AppContext,
  state: "reassignment_requested" | "refund_requested",
) {
  const matterId = context.req.param("id") as string;
  const user = context.get("user");
  const body = (await context.req.json().catch(() => ({}))) as {
    reason?: string;
    version?: number;
  };
  if (!body.version || !body.reason?.trim())
    return context.json(
      { message: "Reason and current matter version are required" },
      422,
    );
  const result = await context.env.DB.prepare(
    "UPDATE matters SET state=?,version=version+1,updated_at=? WHERE id=? AND client_user_id=? AND version=? AND state IN ('consultation_scheduled','consultation_active','awaiting_client','lawyer_review','delivered')",
  )
    .bind(state, now(), matterId, user.id, body.version)
    .run();
  if ((result.meta.changes ?? 0) !== 1)
    return context.json(
      { message: "Matter cannot be changed from its current state or version" },
      409,
    );
  await audit(context.env, {
    actorUserId: user.id,
    action: `matter.${state}`,
    entityType: "Matter",
    entityId: matterId,
    matterId,
    requestId: context.get("requestId"),
    metadata: { reason: body.reason },
  });
  return context.json({ matterId, state, version: body.version + 1 });
}

async function clientContextGate(
  env: Env,
  userId: string,
  clientType: string,
  subjectId: string | null,
): Promise<string | null> {
  if (clientType === "adult_individual") return null;
  if (!subjectId) return "A verified client subject is required";
  if (clientType === "minor") {
    const verified = await env.DB.prepare(
      "SELECT 1 FROM minor_profiles mp JOIN guardian_links gl ON gl.minor_profile_id=mp.id WHERE mp.id=? AND mp.user_id=? AND mp.status='guardian_verified' AND gl.status='verified'",
    )
      .bind(subjectId, userId)
      .first();
    return verified
      ? null
      : "Verified guardian consent or a restricted safeguarding decision is required before detailed facts or evidence";
  }
  if (clientType === "organization") {
    const approved = await env.DB.prepare(
      "SELECT 1 FROM organizations o JOIN organization_memberships om ON om.organization_id=o.id WHERE o.id=? AND om.user_id=? AND o.status='active' AND om.status='approved'",
    )
      .bind(subjectId, userId)
      .first();
    return approved
      ? null
      : "Operations approval of organization authority is required before detailed facts or evidence";
  }
  return "Unsupported client context";
}

export default routes;
