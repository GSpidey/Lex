import { decrypt, encrypt, hmac } from "./crypto.js";
import { optionalProcessingAllowed } from "@lex/d1/optional-processing";

interface Env {
  DB: D1Database;
  PRIVATE_EVIDENCE: R2Bucket;
  JOBS_QUEUE: Queue<{ jobId: string }>;
  NOTIFICATIONS_QUEUE: Queue<{ jobId: string }>;
  APP_ENV: string;
  FIELD_ENCRYPTION_KEY: string;
  AUTH_HMAC_PEPPER: string;
  META_GRAPH_VERSION: string;
  META_AUTH_TEMPLATE: string;
  META_AUTH_LOCALE: string;
  META_STATUS_TEMPLATE: string;
  EMAIL_DELIVERY_ENABLED: string;
  POSTMARK_FROM_EMAIL: string;
  POSTMARK_MESSAGE_STREAM: string;
  OPENAI_INTAKE_MODEL: string;
  META_ACCESS_TOKEN?: string;
  META_PHONE_NUMBER_ID?: string;
  OPENAI_API_KEY?: string;
  PAYSTACK_SECRET_KEY?: string;
  FLUTTERWAVE_SECRET_KEY?: string;
  EXPO_ACCESS_TOKEN?: string;
  POSTMARK_SERVER_TOKEN?: string;
}

interface JobMessage {
  jobId: string;
}
interface JobRow {
  id: string;
  kind: string;
  payload_json: string;
  state: string;
  attempts: number;
}
const now = () => new Date().toISOString();

export default {
  async queue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processMessage(message.body.jobId, env);
        message.ack();
      } catch (error) {
        const delaySeconds = Math.min(
          900,
          30 * 2 ** Math.max(0, message.attempts - 1),
        );
        console.error(
          JSON.stringify({
            level: "error",
            event: "job_failed",
            jobId: message.body.jobId,
            attempt: message.attempts,
            name: error instanceof Error ? error.name : "unknown",
          }),
        );
        message.retry({ delaySeconds });
      }
    }
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ): Promise<void> {
    context.waitUntil(runMaintenance(env));
  },
};

async function processMessage(jobId: string, env: Env) {
  const job = await env.DB.prepare(
    "SELECT id,kind,payload_json,state,attempts FROM jobs WHERE id=?",
  )
    .bind(jobId)
    .first<JobRow>();
  if (!job || job.state === "completed") return;
  const timestamp = now();
  const claim = await env.DB.prepare(
    "UPDATE jobs SET state='processing',attempts=attempts+1,locked_at=?,updated_at=? WHERE id=? AND state IN ('queued','retry','processing')",
  )
    .bind(timestamp, timestamp, jobId)
    .run();
  if ((claim.meta.changes ?? 0) !== 1) return;
  try {
    const payload = JSON.parse(job.payload_json) as Record<string, unknown>;
    await dispatch(job.kind, payload, env);
    await env.DB.prepare(
      "UPDATE jobs SET state='completed',completed_at=?,locked_at=NULL,last_error=NULL,updated_at=? WHERE id=?",
    )
      .bind(now(), now(), jobId)
      .run();
  } catch (error) {
    const safeError =
      error instanceof Error
        ? `${error.name}:${error.message}`.slice(0, 240)
        : "job_error";
    await env.DB.prepare(
      "UPDATE jobs SET state='retry',locked_at=NULL,last_error=?,available_at=?,updated_at=? WHERE id=?",
    )
      .bind(
        safeError,
        new Date(Date.now() + 30_000).toISOString(),
        now(),
        jobId,
      )
      .run();
    throw error;
  }
}

export async function dispatch(
  kind: string,
  payload: Record<string, unknown>,
  env: Env,
) {
  if (kind === "auth_otp") return sendOtp(payload, env);
  if (kind === "legal_review_invitation") {
    if (
      env.EMAIL_DELIVERY_ENABLED !== "true" ||
      !env.POSTMARK_SERVER_TOKEN ||
      !env.POSTMARK_FROM_EMAIL
    )
      throw new Error("EmailNotConfigured");
    const invitation = JSON.parse(
      await decrypt(String(payload.encrypted), env.FIELD_ENCRYPTION_KEY),
    ) as {
      recipient: string;
      packetId: string;
      tokenHash: string;
      link: string;
    };
    const packet = await env.DB.prepare(
      "SELECT state,expires_at,claimed_at,token_hash FROM legal_review_packets WHERE id=?",
    )
      .bind(invitation.packetId)
      .first<{
        state: string;
        expires_at: string;
        claimed_at: string | null;
        token_hash: string;
      }>();
    if (
      !packet ||
      packet.state !== "pending" ||
      packet.claimed_at ||
      packet.expires_at <= now() ||
      packet.token_hash !== invitation.tokenHash
    )
      return;
    await sendPostmark(
      env,
      await decrypt(invitation.recipient, env.FIELD_ENCRYPTION_KEY),
      "Lex documents ready for your legal review",
      `Please review the Lex legal documents at the secure link below. Sign in to your own Owner workspace and verify MFA. You can comment, request changes or expressly approve the exact versions. Opening this email or link does not approve anything.\n\n${invitation.link}\n\nThe invitation expires in seven days. Do not forward it. Corporate execution and public publication remain separate actions.`,
    );
    return;
  }
  if (kind === "evidence_check")
    return checkEvidence(String(payload.evidenceId), env);
  if (kind === "transcription")
    return transcribe(String(payload.transcriptionId), env);
  if (kind === "payment_webhook") return reconcilePayment(payload, env);
  if (
    ["urgent_matter_alert", "matter_status", "assessment_ready"].includes(kind)
  )
    return sendMatterStatus(kind, payload, env);
  if (kind === "meta_status" || kind === "meta_inbound")
    return applyMetaEvent(payload, env);
  if (kind === "ai_intake_extraction") return extractIntake(payload, env);
  if (kind === "ai_guided_intake") return guidedIntake(payload, env);
  throw new Error("UnsupportedJobKind");
}

async function sendOtp(payload: Record<string, unknown>, env: Env) {
  const envelope = JSON.parse(
    await decrypt(String(payload.encrypted), env.FIELD_ENCRYPTION_KEY),
  ) as { channel: string; destination: string; code: string; locale: string };
  if (envelope.channel === "email") {
    if (!env.POSTMARK_SERVER_TOKEN || env.EMAIL_DELIVERY_ENABLED !== "true")
      throw new Error("EmailNotConfigured");
    await sendPostmark(
      env,
      envelope.destination,
      "Your Lex verification code",
      `Your Lex verification code is ${envelope.code}. It expires shortly. Do not share it.`,
    );
    return;
  }
  if (envelope.channel !== "whatsapp") throw new Error("UnsupportedOtpChannel");
  if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID)
    throw new Error("MetaNotConfigured");
  const response = await fetch(
    `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: envelope.destination,
        type: "template",
        template: {
          name: env.META_AUTH_TEMPLATE,
          language: { code: env.META_AUTH_LOCALE },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: envelope.code }],
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: envelope.code }],
            },
          ],
        },
      }),
    },
  );
  if (!response.ok) throw new Error("MetaOtpDeliveryFailed");
}

async function checkEvidence(evidenceId: string, env: Env) {
  const evidence = await env.DB.prepare(
    "SELECT object_key,content_type FROM evidence_items WHERE id=? AND status='quarantined'",
  )
    .bind(evidenceId)
    .first<{ object_key: string; content_type: string }>();
  if (!evidence) return;
  const object = await env.PRIVATE_EVIDENCE.get(evidence.object_key, {
    range: { offset: 0, length: 16 },
  });
  if (!object) throw new Error("EvidenceObjectMissing");
  const bytes = new Uint8Array(await object.arrayBuffer());
  const matches =
    evidence.content_type === "application/pdf"
      ? String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-"
      : evidence.content_type === "image/jpeg"
        ? bytes[0] === 0xff && bytes[1] === 0xd8
        : evidence.content_type === "image/png"
          ? bytes[0] === 0x89 &&
            String.fromCharCode(...bytes.slice(1, 4)) === "PNG"
          : evidence.content_type.startsWith("audio/");
  await env.DB.prepare(
    "UPDATE evidence_items SET status=?,updated_at=? WHERE id=? AND status='quarantined'",
  )
    .bind(matches ? "available_synthetic_only" : "rejected", now(), evidenceId)
    .run();
}

async function transcribe(transcriptionId: string, env: Env) {
  if (!env.OPENAI_API_KEY) throw new Error("OpenAINotConfigured");
  const record = await env.DB.prepare(
    "SELECT t.evidence_id,t.language,e.object_key,e.file_name,e.content_type,e.owner_user_id FROM transcriptions t JOIN evidence_items e ON e.id=t.evidence_id WHERE t.id=? AND t.status='queued'",
  )
    .bind(transcriptionId)
    .first<{
      evidence_id: string;
      language: string;
      object_key: string;
      file_name: string;
      content_type: string;
      owner_user_id: string;
    }>();
  if (!record) return;
  if (
    !(await optionalProcessingAllowed(
      env.DB,
      record.owner_user_id,
      "ai-routing-disclosure",
    ))
  ) {
    await env.DB.prepare(
      "UPDATE transcriptions SET status='consent_withdrawn',version=version+1,updated_at=? WHERE id=? AND status='queued'",
    )
      .bind(now(), transcriptionId)
      .run();
    return;
  }
  const object = await env.PRIVATE_EVIDENCE.get(record.object_key);
  if (!object) throw new Error("AudioObjectMissing");
  const form = new FormData();
  form.set("model", "gpt-4o-transcribe");
  form.set(
    "file",
    new File([await object.arrayBuffer()], record.file_name, {
      type: record.content_type,
    }),
  );
  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    },
  );
  const body = (await response.json()) as { text?: string };
  if (!response.ok || !body.text)
    throw new Error("TranscriptionProviderFailed");
  if (
    !(await optionalProcessingAllowed(
      env.DB,
      record.owner_user_id,
      "ai-routing-disclosure",
    ))
  ) {
    await env.DB.prepare(
      "UPDATE transcriptions SET status='consent_withdrawn',version=version+1,updated_at=? WHERE id=?",
    )
      .bind(now(), transcriptionId)
      .run();
    return;
  }
  await env.DB.prepare(
    "UPDATE transcriptions SET transcript=?,status='ready',model='gpt-4o-transcribe',version=version+1,updated_at=? WHERE id=?",
  )
    .bind(body.text, now(), transcriptionId)
    .run();
}

async function extractIntake(
  payload: Record<string, unknown>,
  env: Env,
): Promise<void> {
  if (!env.OPENAI_API_KEY) throw new Error("OpenAINotConfigured");
  const intakeId = String(payload.intakeId ?? "");
  const summaryVersion = Number(payload.version ?? 0);
  const intake = await env.DB.prepare(
    `SELECT i.client_user_id,i.narrative,i.desired_outcome,i.practice_area_code,i.client_type,
            COALESCE(i.language_v2,i.language) language,i.structured_summary_json
       FROM intakes i WHERE i.id=? AND i.summary_version=?`,
  )
    .bind(intakeId, summaryVersion)
    .first<{
      narrative: string | null;
      client_user_id: string;
      desired_outcome: string | null;
      practice_area_code: string | null;
      client_type: string | null;
      language: string;
      structured_summary_json: string | null;
    }>();
  if (!intake) return;
  if (
    !(await optionalProcessingAllowed(
      env.DB,
      intake.client_user_id,
      "ai-routing-disclosure",
    ))
  )
    return;
  const answers = await env.DB.prepare(
    "SELECT question_key,value_json FROM intake_answers WHERE intake_id=? ORDER BY question_key",
  )
    .bind(intakeId)
    .all<{ question_key: string; value_json: string }>();
  const runId = crypto.randomUUID();
  const started = Date.now();
  const model = env.OPENAI_INTAKE_MODEL || "gpt-5.6-terra";
  const input = {
    narrative: intake.narrative,
    desiredOutcome: intake.desired_outcome,
    practiceAreaCode: intake.practice_area_code,
    clientType: intake.client_type,
    clientLanguage: intake.language,
    answers: Object.fromEntries(
      answers.results.map((answer) => {
        try {
          return [answer.question_key, JSON.parse(answer.value_json)];
        } catch {
          return [answer.question_key, answer.value_json];
        }
      }),
    ),
  };
  const schema = {
    type: "object",
    additionalProperties: false,
    required: [
      "summary",
      "facts",
      "parties",
      "timeline",
      "missingInformation",
      "urgencySignals",
      "suggestedPracticeAreaCodes",
      "confidenceMillis",
      "requiresHumanReview",
    ],
    properties: {
      summary: { type: "string" },
      facts: { type: "array", items: { type: "string" } },
      parties: { type: "array", items: { type: "string" } },
      timeline: { type: "array", items: { type: "string" } },
      missingInformation: { type: "array", items: { type: "string" } },
      urgencySignals: { type: "array", items: { type: "string" } },
      suggestedPracticeAreaCodes: {
        type: "array",
        items: { type: "string" },
      },
      confidenceMillis: { type: "integer", minimum: 0, maximum: 1000 },
      requiresHumanReview: { type: "boolean" },
    },
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      safety_identifier: `lex-intake-${await hmac(intakeId, env.AUTH_HMAC_PEPPER)}`,
      instructions:
        "Extract only client-provided facts into an English legal-intake record. Do not give legal advice, predict outcomes, calculate legal deadlines, or choose a lawyer. Flag uncertainty, conflict, urgency, and missing information for human review.",
      input: JSON.stringify(input),
      text: {
        format: {
          type: "json_schema",
          name: "lex_intake_extraction_v1",
          strict: true,
          schema,
        },
      },
    }),
  });
  const body = (await response.json()) as {
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
    usage?: Record<string, unknown>;
  };
  if (!response.ok) throw new Error("OpenAIIntakeExtractionFailed");
  const outputText = body.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("OpenAIIntakeOutputMissing");
  if (
    !(await optionalProcessingAllowed(
      env.DB,
      intake.client_user_id,
      "ai-routing-disclosure",
    ))
  )
    return;
  const output = JSON.parse(outputText) as {
    confidenceMillis: number;
    requiresHumanReview: boolean;
  };
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO ai_runs
       (id,intake_id,purpose,model,prompt_version,schema_version,input_refs_json,output_json,confidence_millis,requires_human_review,token_use_json,latency_ms,created_at)
       VALUES (?,?,'intake_extraction',?,'intake-extraction-v1','intake-record-v1',?,?,?,?,?,?,?)`,
    ).bind(
      runId,
      intakeId,
      model,
      JSON.stringify({ intakeId, summaryVersion }),
      JSON.stringify(output),
      Math.max(0, Math.min(1000, output.confidenceMillis ?? 0)),
      output.requiresHumanReview === false &&
        (output.confidenceMillis ?? 0) >= 850
        ? 0
        : 1,
      JSON.stringify(body.usage ?? {}),
      Date.now() - started,
      timestamp,
    ),
    env.DB.prepare(
      "INSERT INTO audit_events (id,action,entity_type,entity_id,metadata_json,occurred_at) VALUES (?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      "ai.intake_extraction_recorded",
      "AIRun",
      runId,
      JSON.stringify({ intakeId, summaryVersion, humanReviewRequired: true }),
      timestamp,
    ),
  ]);
  // The deterministic client-visible summary remains unchanged. The AI output
  // is a suggestion for human/client review and cannot silently rewrite facts.
}

async function guidedIntake(
  payload: Record<string, unknown>,
  env: Env,
): Promise<void> {
  const conversationId = String(payload.conversationId ?? "");
  const clientTurnId = String(payload.clientTurnId ?? "");
  const conversation = await env.DB.prepare(
    "SELECT id,user_id,channel,language,state,version,ai_enabled FROM channel_conversations WHERE id=?",
  )
    .bind(conversationId)
    .first<{
      id: string;
      user_id: string;
      channel: string;
      language: string;
      state: string;
      version: number;
      ai_enabled: number;
    }>();
  if (
    !conversation ||
    ["completed", "deleted", "opted_out", "paused"].includes(conversation.state)
  )
    return;
  const existing = await env.DB.prepare(
    "SELECT id FROM conversation_turns WHERE ai_run_id=?",
  )
    .bind(`guided-${clientTurnId}`)
    .first();
  if (existing) return;

  const turns = await env.DB.prepare(
    `SELECT actor,body FROM conversation_turns
      WHERE conversation_id=? AND actor IN ('client','assistant')
      ORDER BY created_at DESC LIMIT 20`,
  )
    .bind(conversationId)
    .all<{ actor: string; body: string }>();
  const catalogue = await env.DB.prepare(
    "SELECT code,name,group_name,description FROM practice_areas WHERE active=1 ORDER BY group_name,sort_order",
  ).all<{
    code: string;
    name: string;
    group_name: string;
    description: string;
  }>();
  const chronologicalTurns = [...turns.results].reverse();
  const runId = crypto.randomUUID();
  const started = Date.now();
  const model = env.OPENAI_INTAKE_MODEL || "gpt-5.6-terra";
  let output: {
    response: string;
    suggestedPracticeAreaCodes: string[];
    knownFacts: string[];
    missingInformation: string[];
    urgencySignals: string[];
    readyToConfirm: boolean;
    requiresHumanReview: boolean;
    confidenceMillis: number;
  };
  let usage: Record<string, unknown> = {};

  const useProvider =
    Boolean(env.OPENAI_API_KEY) &&
    conversation.ai_enabled === 1 &&
    (await optionalProcessingAllowed(
      env.DB,
      conversation.user_id,
      "ai-routing-disclosure",
    ));
  if (!useProvider) {
    output = deterministicGuidedReply(chronologicalTurns);
  } else {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: [
        "response",
        "suggestedPracticeAreaCodes",
        "knownFacts",
        "missingInformation",
        "urgencySignals",
        "readyToConfirm",
        "requiresHumanReview",
        "confidenceMillis",
      ],
      properties: {
        response: { type: "string" },
        suggestedPracticeAreaCodes: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
        },
        knownFacts: { type: "array", items: { type: "string" } },
        missingInformation: { type: "array", items: { type: "string" } },
        urgencySignals: { type: "array", items: { type: "string" } },
        readyToConfirm: { type: "boolean" },
        requiresHumanReview: { type: "boolean" },
        confidenceMillis: { type: "integer", minimum: 0, maximum: 1000 },
      },
    };
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        safety_identifier: `lex-guided-${await hmac(conversation.user_id, env.AUTH_HMAC_PEPPER)}`,
        instructions:
          "You are Lex AI-assisted legal intake for Nigeria. Organize only the client's facts and ask at most one short, bounded clarification question per response. Never provide legal advice, predict outcomes, calculate deadlines, recommend a specific lawyer, or say a legal conclusion is certain. Detect emergencies, detention, violence, child safety, self-harm, and safeguarding risk and require human review. Suggest only catalogue codes provided. When the issue is sufficiently clear, summarize the likely category and ask the client to confirm or correct it. Reply in the client's requested language while keeping extracted facts in English.",
        input: JSON.stringify({
          language: conversation.language,
          turns: chronologicalTurns,
          practiceAreaCatalogue: catalogue.results,
        }),
        text: {
          format: {
            type: "json_schema",
            name: "lex_guided_intake_v1",
            strict: true,
            schema,
          },
        },
      }),
    });
    const body = (await response.json()) as {
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      usage?: Record<string, unknown>;
      error?: { message?: string; code?: string };
    };
    if (!response.ok) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "openai_guided_intake_failed",
          status: response.status,
          code: body.error?.code ?? "unknown",
        }),
      );
      output = deterministicGuidedReply(chronologicalTurns);
    } else {
      const outputText = body.output
        ?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === "output_text")?.text;
      if (!outputText) throw new Error("OpenAIGuidedOutputMissing");
      output = JSON.parse(outputText) as typeof output;
      usage = body.usage ?? {};
    }
  }

  const validCodes = new Set(catalogue.results.map((item) => item.code));
  if (
    useProvider &&
    !(await optionalProcessingAllowed(
      env.DB,
      conversation.user_id,
      "ai-routing-disclosure",
    ))
  )
    return;
  output.suggestedPracticeAreaCodes = output.suggestedPracticeAreaCodes.filter(
    (code) => validCodes.has(code),
  );
  const humanReview =
    output.requiresHumanReview ||
    output.urgencySignals.length > 0 ||
    output.confidenceMillis < 650;
  const nextState = humanReview
    ? "human_review"
    : output.readyToConfirm
      ? "awaiting_confirmation"
      : "active";
  const timestamp = now();
  const statements = [
    env.DB.prepare(
      `INSERT INTO ai_runs
       (id,purpose,model,prompt_version,schema_version,input_refs_json,output_json,confidence_millis,requires_human_review,token_use_json,latency_ms,created_at)
       VALUES (?,'guided_intake',?,'guided-intake-v1','guided-intake-output-v1',?,?,?,?,?,?,?)`,
    ).bind(
      runId,
      useProvider ? model : "deterministic-fallback-v1",
      JSON.stringify({ conversationId, clientTurnId }),
      JSON.stringify(output),
      Math.max(0, Math.min(1000, output.confidenceMillis)),
      humanReview ? 1 : 0,
      JSON.stringify(usage),
      Date.now() - started,
      timestamp,
    ),
    env.DB.prepare(
      `INSERT INTO conversation_turns
       (id,conversation_id,actor,body,ai_run_id,status,created_at)
       VALUES (?,?,'assistant',?,?,'needs_confirmation',?)`,
    ).bind(
      crypto.randomUUID(),
      conversationId,
      output.response,
      runId,
      timestamp,
    ),
    env.DB.prepare(
      "UPDATE channel_conversations SET state=?,classification_json=?,version=version+1,updated_at=? WHERE id=?",
    ).bind(
      nextState,
      JSON.stringify({
        suggestedPracticeAreaCodes: output.suggestedPracticeAreaCodes,
        knownFacts: output.knownFacts,
        missingInformation: output.missingInformation,
        urgencySignals: output.urgencySignals,
        readyToConfirm: output.readyToConfirm,
      }),
      timestamp,
      conversationId,
    ),
  ];
  if (humanReview) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO conversation_handoffs (id,conversation_id,reason,state,created_at) VALUES (?,?,'ai_safety_or_uncertainty','open',?)",
      ).bind(crypto.randomUUID(), conversationId, timestamp),
    );
  }
  await env.DB.batch(statements);
  if (conversation.channel === "whatsapp") {
    const contact = await env.DB.prepare(
      "SELECT phone_encrypted FROM users WHERE id=?",
    )
      .bind(conversation.user_id)
      .first<{ phone_encrypted: string | null }>();
    if (contact?.phone_encrypted) {
      const suggestions = catalogue.results
        .filter((item) => output.suggestedPracticeAreaCodes.includes(item.code))
        .map((item) => item.name)
        .join(", ");
      await sendWhatsAppText(
        env,
        await decrypt(contact.phone_encrypted, env.FIELD_ENCRYPTION_KEY),
        `${output.response}${suggestions ? `\nSuggested categories: ${suggestions}. Reply with the closest category to confirm or keep explaining.` : ""}`,
      );
    }
  }
}

async function queueGuidedIntake(
  env: Env,
  conversationId: string,
  clientTurnId: string,
) {
  const id = crypto.randomUUID();
  const timestamp = now();
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO jobs
     (id,kind,queue_name,idempotency_key,payload_json,state,attempts,available_at,created_at,updated_at)
     VALUES (?,'ai_guided_intake','jobs',?,?,'queued',0,?,?,?)`,
  )
    .bind(
      id,
      `ai-guided:${clientTurnId}`,
      JSON.stringify({ conversationId, clientTurnId }),
      timestamp,
      timestamp,
      timestamp,
    )
    .run();
  if ((inserted.meta.changes ?? 0) === 1)
    await env.JOBS_QUEUE.send({ jobId: id });
}

function deterministicGuidedReply(
  turns: Array<{ actor: string; body: string }>,
) {
  const clientTurns = turns.filter((turn) => turn.actor === "client");
  return {
    response:
      clientTurns.length < 2
        ? "Thank you. I can organize this for a lawyer, but I cannot give legal advice. What happened, where in Nigeria did it happen, and is anyone in immediate danger or detention?"
        : "I have organized what you shared. Please review the details and choose or confirm the closest legal issue from the catalogue. You can also request a human review.",
    suggestedPracticeAreaCodes: [] as string[],
    knownFacts: clientTurns.map((turn) => turn.body).slice(-5),
    missingInformation:
      clientTurns.length < 2
        ? ["location", "key dates", "desired outcome", "urgency"]
        : ["confirmed practice area"],
    urgencySignals: [] as string[],
    readyToConfirm: clientTurns.length >= 2,
    requiresHumanReview: false,
    confidenceMillis: clientTurns.length >= 2 ? 700 : 400,
  };
}

async function reconcilePayment(payload: Record<string, unknown>, env: Env) {
  const provider = String(payload.provider);
  const reference = String(payload.reference ?? "");
  if (!reference) return;
  const payment = await env.DB.prepare(
    "SELECT id,matter_id,engagement_id,invoice_id,amount_minor,state,version FROM payments WHERE provider=? AND (provider_reference=? OR internal_reference=?)",
  )
    .bind(provider, reference, reference)
    .first<{
      id: string;
      matter_id: string;
      engagement_id: string | null;
      invoice_id: string | null;
      amount_minor: number;
      state: string;
      version: number;
    }>();
  if (!payment || payment.state === "successful") return;
  let successful = false;
  let amountMinor = 0;
  let currency = "";
  if (provider === "paystack" && env.PAYSTACK_SECRET_KEY) {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } },
    );
    const body = (await response.json()) as {
      data?: { status: string; amount: number; currency: string };
    };
    successful = response.ok && body.data?.status === "success";
    amountMinor = body.data?.amount ?? 0;
    currency = body.data?.currency ?? "";
  } else if (provider === "flutterwave" && env.FLUTTERWAVE_SECRET_KEY) {
    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      { headers: { authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}` } },
    );
    const body = (await response.json()) as {
      data?: { status: string; amount: number; currency: string };
    };
    successful = response.ok && body.data?.status === "successful";
    amountMinor = Math.round((body.data?.amount ?? 0) * 100);
    currency = body.data?.currency ?? "";
  } else throw new Error("PaymentProviderNotConfigured");
  if (!successful || amountMinor !== payment.amount_minor || currency !== "NGN")
    throw new Error("PaymentVerificationMismatch");
  const timestamp = now();
  const dueAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "UPDATE payments SET state='successful',verified_at=?,version=version+1,updated_at=? WHERE id=? AND state='pending' AND version=?",
    ).bind(timestamp, timestamp, payment.id, payment.version),
    env.DB.prepare(
      "INSERT INTO audit_events (id,action,entity_type,entity_id,matter_id,metadata_json,occurred_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      "payment.verified",
      "Payment",
      payment.id,
      payment.matter_id,
      JSON.stringify({ provider, amountMinor, currency }),
      timestamp,
    ),
  ];
  if (payment.invoice_id && payment.engagement_id) {
    statements.push(
      env.DB.prepare(
        "UPDATE invoices SET state='paid',version=version+1,updated_at=? WHERE id=? AND payment_id=? AND state='payment_pending'",
      ).bind(timestamp, payment.invoice_id, payment.id),
      env.DB.prepare(
        "UPDATE representation_engagements SET state='active',activated_at=COALESCE(activated_at,?),version=version+1,updated_at=? WHERE id=? AND state='awaiting_invoice_payment'",
      ).bind(timestamp, timestamp, payment.engagement_id),
    );
  } else {
    statements.push(
      env.DB.prepare(
        "UPDATE matters SET state='consultation_scheduled',paid_at=?,information_complete_at=COALESCE(information_complete_at,?),due_at=?,version=version+1,updated_at=? WHERE id=? AND state='awaiting_payment'",
      ).bind(timestamp, timestamp, dueAt, timestamp, payment.matter_id),
    );
  }
  await env.DB.batch(statements);
}

async function sendMatterStatus(
  kind: string,
  payload: Record<string, unknown>,
  env: Env,
) {
  const matterId = String(payload.matterId ?? "");
  const row = await env.DB.prepare(
    `SELECT u.id user_id,u.phone_encrypted,u.email_encrypted,np.whatsapp,np.push,np.email
     FROM matters m JOIN users u ON u.id=m.client_user_id LEFT JOIN notification_preferences np ON np.user_id=u.id WHERE m.id=?`,
  )
    .bind(matterId)
    .first<{
      phone_encrypted: string | null;
      user_id: string;
      email_encrypted: string | null;
      whatsapp: number | null;
      push: number | null;
      email: number | null;
    }>();
  if (!row) return;
  if (
    !(await optionalProcessingAllowed(
      env.DB,
      row.user_id,
      "electronic-communications",
    ))
  )
    return;
  const body = `Lex update: ${kind.replaceAll("_", " ")} for matter ${matterId}. Open Lex for private details.`;
  const deliveries: Promise<void>[] = [];
  if (
    row.whatsapp !== 0 &&
    row.phone_encrypted &&
    env.META_ACCESS_TOKEN &&
    env.META_PHONE_NUMBER_ID
  )
    deliveries.push(
      sendWhatsAppStatus(
        env,
        await decrypt(row.phone_encrypted, env.FIELD_ENCRYPTION_KEY),
        kind,
        matterId,
      ),
    );
  if (
    row.email === 1 &&
    row.email_encrypted &&
    env.POSTMARK_SERVER_TOKEN &&
    env.EMAIL_DELIVERY_ENABLED === "true"
  )
    deliveries.push(
      sendPostmark(
        env,
        await decrypt(row.email_encrypted, env.FIELD_ENCRYPTION_KEY),
        "Lex matter update",
        body,
      ),
    );
  if (row.push === 1 && env.EXPO_ACCESS_TOKEN) {
    const devices = await env.DB.prepare(
      "SELECT token_encrypted FROM push_devices WHERE user_id=(SELECT client_user_id FROM matters WHERE id=?) AND revoked_at IS NULL",
    )
      .bind(matterId)
      .all<{ token_encrypted: string }>();
    for (const device of devices.results)
      deliveries.push(
        sendExpoPush(
          env,
          await decrypt(device.token_encrypted, env.FIELD_ENCRYPTION_KEY),
          body,
          matterId,
        ),
      );
  }
  // A provider being intentionally unconfigured is a recorded staging
  // capability gate, not a poison message that should fill the dead-letter
  // queue. The in-app timeline remains authoritative.
  if (deliveries.length === 0) return;
  await Promise.all(deliveries);
}

async function sendWhatsAppStatus(
  env: Env,
  destination: string,
  kind: string,
  matterId: string,
): Promise<void> {
  const response = await fetch(
    `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destination,
        type: "template",
        template: {
          name: env.META_STATUS_TEMPLATE,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: kind.replaceAll("_", " ") },
                { type: "text", text: matterId },
              ],
            },
          ],
        },
      }),
    },
  );
  if (!response.ok) throw new Error("MetaStatusDeliveryFailed");
}

async function sendPostmark(
  env: Env,
  to: string,
  subject: string,
  textBody: string,
): Promise<void> {
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "x-postmark-server-token": env.POSTMARK_SERVER_TOKEN!,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      From: env.POSTMARK_FROM_EMAIL,
      To: to,
      Subject: subject,
      TextBody: textBody,
      MessageStream: env.POSTMARK_MESSAGE_STREAM,
    }),
  });
  if (!response.ok) throw new Error("PostmarkDeliveryFailed");
}

async function sendExpoPush(
  env: Env,
  to: string,
  body: string,
  matterId: string,
): Promise<void> {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to,
      title: "Lex matter update",
      body,
      data: { matterId },
      sound: "default",
    }),
  });
  if (!response.ok) throw new Error("ExpoPushDeliveryFailed");
}

async function applyMetaEvent(payload: Record<string, unknown>, env: Env) {
  const providerEventId = String(payload.providerEventId ?? "");
  const message = payload.message as
    | {
        id?: string;
        from?: string;
        type?: string;
        text?: { body?: string };
        interactive?: {
          button_reply?: { id?: string; title?: string };
          list_reply?: { id?: string; title?: string };
        };
        audio?: { id?: string; mime_type?: string };
        image?: { id?: string; mime_type?: string; caption?: string };
        document?: {
          id?: string;
          mime_type?: string;
          filename?: string;
          caption?: string;
        };
      }
    | undefined;
  if (message?.id && message.from) await applyInboundWhatsApp(message, env);
  await env.DB.prepare(
    "UPDATE provider_events SET status='processed',processed_at=? WHERE id=?",
  )
    .bind(now(), providerEventId)
    .run();
}

type WhatsAppCursor = {
  clientType?: "adult_individual" | "minor" | "organization";
  stateCode?: string;
  practiceAreaCode?: string;
  narrative?: string;
  desiredOutcome?: string;
  aiConversationId?: string;
  pausedState?: string;
};

async function applyInboundWhatsApp(
  message: {
    id?: string;
    from?: string;
    type?: string;
    text?: { body?: string };
    interactive?: {
      button_reply?: { id?: string; title?: string };
      list_reply?: { id?: string; title?: string };
    };
    audio?: { id?: string; mime_type?: string };
    image?: { id?: string; mime_type?: string; caption?: string };
    document?: {
      id?: string;
      mime_type?: string;
      filename?: string;
      caption?: string;
    };
  },
  env: Env,
): Promise<void> {
  if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID)
    throw new Error("MetaNotConfigured");
  const e164 = `+${String(message.from).replace(/\D/gu, "")}`;
  const destinationHash = await hmac(e164, env.AUTH_HMAC_PEPPER);
  const timestamp = now();
  let user = await env.DB.prepare("SELECT id FROM users WHERE phone_hash=?")
    .bind(destinationHash)
    .first<{ id: string }>();
  if (!user) {
    user = { id: crypto.randomUUID() };
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id,role,status,phone_encrypted,phone_hash,phone_verified_at,preferred_language,preferred_language_v2,version,created_at,updated_at) VALUES (?,'client','active',?,?,?,'en','en',1,?,?)",
      ).bind(
        user.id,
        await encrypt(e164, env.FIELD_ENCRYPTION_KEY),
        destinationHash,
        timestamp,
        timestamp,
        timestamp,
      ),
      env.DB.prepare(
        "INSERT INTO notification_preferences (user_id,whatsapp,push,email,updated_at) VALUES (?,1,0,0,?)",
      ).bind(user.id, timestamp),
      env.DB.prepare(
        "INSERT INTO user_role_assignments (id,user_id,role,status,assignment_source,assigned_at) VALUES (?,?,'client','active','whatsapp_registration',?)",
      ).bind(crypto.randomUUID(), user.id, timestamp),
    ]);
  }
  const channelHash = await hmac(`whatsapp:${e164}`, env.AUTH_HMAC_PEPPER);
  let link = await env.DB.prepare(
    "SELECT id FROM channel_links WHERE channel='whatsapp' AND channel_subject_hash=? AND revoked_at IS NULL",
  )
    .bind(channelHash)
    .first<{ id: string }>();
  if (!link) {
    link = { id: crypto.randomUUID() };
    await env.DB.prepare(
      "INSERT INTO channel_links (id,user_id,channel,channel_subject_hash,status,linked_at) VALUES (?,?,'whatsapp',?,'active',?)",
    )
      .bind(link.id, user.id, channelHash, timestamp)
      .run();
  }
  const incomingText = (
    message.text?.body ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    ""
  ).trim();
  if (/^(stop|unsubscribe|opt ?out)$/iu.test(incomingText)) {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE channel_links SET status='revoked',revoked_at=? WHERE id=?",
      ).bind(timestamp, link.id),
      env.DB.prepare(
        "UPDATE notification_preferences SET whatsapp=0,updated_at=? WHERE user_id=?",
      ).bind(timestamp, user.id),
    ]);
    await sendWhatsAppText(
      env,
      e164,
      "You have opted out of Lex WhatsApp messages. Sign in to the Lex app to change communication preferences.",
    );
    return;
  }
  let session = await env.DB.prepare(
    "SELECT id,intake_id,state,locale,cursor_json,version FROM whatsapp_intake_sessions WHERE channel_link_id=? AND state NOT IN ('completed','expired') ORDER BY created_at DESC LIMIT 1",
  )
    .bind(link.id)
    .first<{
      id: string;
      intake_id: string | null;
      state: string;
      locale: string;
      cursor_json: string;
      version: number;
    }>();
  if (!session || /^(start|new|menu)$/iu.test(incomingText)) {
    if (session)
      await env.DB.prepare(
        "UPDATE whatsapp_intake_sessions SET state='expired',updated_at=? WHERE id=?",
      )
        .bind(timestamp, session.id)
        .run();
    session = {
      id: crypto.randomUUID(),
      intake_id: null,
      state: "choose_language",
      locale: "en",
      cursor_json: "{}",
      version: 1,
    };
    await env.DB.prepare(
      "INSERT INTO whatsapp_intake_sessions (id,channel_link_id,state,locale,cursor_json,last_provider_message_id,version,expires_at,created_at,updated_at) VALUES (?,?,'choose_language','en','{}',?,1,?,?,?)",
    )
      .bind(
        session.id,
        link.id,
        message.id ?? null,
        new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        timestamp,
        timestamp,
      )
      .run();
    await sendWhatsAppText(
      env,
      e164,
      "Welcome to Lex legal access. Choose language: 1 English, 2 Pidgin, 3 Hausa, 4 Yoruba, 5 Igbo. Reply STOP anytime to opt out.",
    );
    return;
  }
  const cursor = JSON.parse(session.cursor_json || "{}") as WhatsAppCursor;
  if (/^pause$/iu.test(incomingText)) {
    cursor.pausedState = session.state;
    await updateWhatsAppSession(
      env,
      session.id,
      "paused",
      session.locale,
      cursor,
      message.id,
    );
    await sendWhatsAppText(
      env,
      e164,
      "Your Lex enquiry is paused. Reply RESUME to continue, DELETE to request deletion review, or STOP to opt out.",
    );
    return;
  }
  if (session.state === "paused") {
    if (!/^resume$/iu.test(incomingText)) {
      await sendWhatsAppText(
        env,
        e164,
        "This enquiry is paused. Reply RESUME to continue.",
      );
      return;
    }
    await updateWhatsAppSession(
      env,
      session.id,
      cursor.pausedState ?? "choose_practice",
      session.locale,
      cursor,
      message.id,
    );
    await sendWhatsAppText(
      env,
      e164,
      "Your Lex enquiry has resumed. Continue in your own words.",
    );
    return;
  }
  if (/^human$/iu.test(incomingText) && cursor.aiConversationId) {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO conversation_handoffs (id,conversation_id,reason,state,created_at) VALUES (?,?,'whatsapp_client_requested_human','open',?)",
      ).bind(crypto.randomUUID(), cursor.aiConversationId, timestamp),
      env.DB.prepare(
        "UPDATE channel_conversations SET state='human_review',version=version+1,updated_at=? WHERE id=?",
      ).bind(timestamp, cursor.aiConversationId),
    ]);
    await sendWhatsAppText(
      env,
      e164,
      "Human review has been requested. Lex is not an emergency service; use appropriate local emergency or safety resources if anyone is in immediate danger.",
    );
    return;
  }
  if (/^delete$/iu.test(incomingText)) {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO privacy_requests (id,user_id,type,status,details,due_at,version,created_at,updated_at) VALUES (?,?,'deletion','open','WhatsApp DELETE command',?,1,?,?)",
      ).bind(
        crypto.randomUUID(),
        user.id,
        new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
        timestamp,
        timestamp,
      ),
      env.DB.prepare(
        "UPDATE whatsapp_intake_sessions SET state='expired',updated_at=? WHERE id=?",
      ).bind(timestamp, session.id),
      ...(cursor.aiConversationId
        ? [
            env.DB.prepare(
              "UPDATE channel_conversations SET state='deleted',version=version+1,updated_at=? WHERE id=?",
            ).bind(timestamp, cursor.aiConversationId),
          ]
        : []),
    ]);
    await sendWhatsAppText(
      env,
      e164,
      "Your deletion request is recorded for identity-checked human review. Records subject to legal retention may be restricted rather than immediately erased.",
    );
    return;
  }
  if (message.type && message.type !== "text" && !message.interactive) {
    await sendWhatsAppText(
      env,
      e164,
      "Your media message was received, but attach evidence after the legal category is selected. You can continue this matter in the Lex app using the same phone number.",
    );
    return;
  }
  if (session.state === "choose_language") {
    const locale = (
      {
        "1": "en",
        "2": "pcm",
        "3": "ha",
        "4": "yo",
        "5": "ig",
        english: "en",
        pidgin: "pcm",
        hausa: "ha",
        yoruba: "yo",
        igbo: "ig",
      } as Record<string, string>
    )[incomingText.toLowerCase()];
    if (!locale) {
      await sendWhatsAppText(
        env,
        e164,
        "Reply 1 English, 2 Pidgin, 3 Hausa, 4 Yoruba, or 5 Igbo.",
      );
      return;
    }
    await updateWhatsAppSession(
      env,
      session.id,
      "choose_client_type",
      locale,
      cursor,
      message.id,
    );
    await sendWhatsAppText(
      env,
      e164,
      wa(
        locale,
        "Who needs legal help? Reply 1 Adult, 2 Person under 18, or 3 Organization.",
        "Who need legal help? Reply 1 Adult, 2 Person wey never reach 18, or 3 Organisation.",
        "Wa ke bukatar taimakon shari'a? Amsa 1 Babba, 2 Kasa da shekara 18, ko 3 Kungiya.",
        "Ta ni o nilo iranlowo ofin? Dahun 1 Agbalagba, 2 Eni ti ko tii pe 18, tabi 3 Ajo.",
        "Onye choro enyemaka iwu? Zaa 1 Okenye, 2 Onye na-erubeghi 18, ma obu 3 Otu.",
      ),
    );
    return;
  }
  if (session.state === "choose_client_type") {
    const selectedClientType =
      incomingText === "2"
        ? "minor"
        : incomingText === "3"
          ? "organization"
          : incomingText === "1"
            ? "adult_individual"
            : null;
    if (!selectedClientType) {
      await sendWhatsAppText(
        env,
        e164,
        "Reply 1 Adult, 2 Person under 18, or 3 Organization.",
      );
      return;
    }
    cursor.clientType = selectedClientType;
    if (cursor.clientType !== "adult_individual") {
      await updateWhatsAppSession(
        env,
        session.id,
        "protected_account_gate",
        session.locale,
        cursor,
        message.id,
      );
      await sendWhatsAppText(
        env,
        e164,
        "For safety, Lex stores no detailed facts or evidence yet. Continue in the Lex app with this number to complete guardian or organization-authority verification. No lawyer sharing or payment is allowed before human approval.",
      );
      return;
    }
    await updateWhatsAppSession(
      env,
      session.id,
      "choose_state",
      session.locale,
      cursor,
      message.id,
    );
    await sendWhatsAppText(
      env,
      e164,
      "Reply with the Nigerian state name or two-letter code where the issue belongs, for example Lagos or LA, FCT or FC.",
    );
    return;
  }
  if (session.state === "choose_state") {
    const state = await env.DB.prepare(
      "SELECT state_code FROM service_jurisdictions WHERE country_code='NG' AND (UPPER(state_code)=UPPER(?) OR state_code='*') LIMIT 1",
    )
      .bind(incomingText.slice(0, 2))
      .first<{ state_code: string }>();
    const selectedStateCode =
      state?.state_code === "*"
        ? incomingText.trim().slice(0, 2).toUpperCase()
        : state?.state_code;
    if (!selectedStateCode || selectedStateCode.length !== 2) {
      await sendWhatsAppText(
        env,
        e164,
        "Please reply with a two-letter Nigerian state code, such as LA, FC, RI, KN or EN.",
      );
      return;
    }
    cursor.stateCode = selectedStateCode;
    await updateWhatsAppSession(
      env,
      session.id,
      "choose_practice",
      session.locale,
      cursor,
      message.id,
    );
    await sendWhatsAppText(
      env,
      e164,
      "What kind of legal issue is this? Type a category such as criminal defence, police and bail, divorce, custody, tenancy, land title, employment, business, debt recovery, tax, human rights, immigration, copyright, appeal, Not sure, or Other.",
    );
    return;
  }
  if (session.state === "choose_practice") {
    const query = incomingText
      .toLowerCase()
      .replace(/[^a-z0-9 ]/gu, "")
      .trim();
    const area = await env.DB.prepare(
      "SELECT code,name FROM practice_areas WHERE active=1 AND (LOWER(code)=? OR LOWER(name)=? OR LOWER(name) LIKE ?) ORDER BY CASE WHEN LOWER(name)=? THEN 0 ELSE 1 END,sort_order LIMIT 1",
    )
      .bind(query.replaceAll(" ", "-"), query, `%${query}%`, query)
      .first<{ code: string; name: string }>();
    if (!area) {
      const conversationId = cursor.aiConversationId ?? crypto.randomUUID();
      const clientTurnId = crypto.randomUUID();
      if (!cursor.aiConversationId) {
        cursor.aiConversationId = conversationId;
        await env.DB.prepare(
          `INSERT INTO channel_conversations
           (id,user_id,channel,language,state,ai_disclosure_version,ai_enabled,version,created_at,updated_at)
           VALUES (?,?,'whatsapp',?,'active','ai-routing-disclosure-whatsapp-v1-staging-draft',1,1,?,?)`,
        )
          .bind(conversationId, user.id, session.locale, timestamp, timestamp)
          .run();
      }
      await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO conversation_turns
           (id,conversation_id,actor,body,provider_message_id,client_message_id,status,created_at)
           VALUES (?,?,'client',?,?,?,'recorded',?)`,
        ).bind(
          clientTurnId,
          conversationId,
          incomingText,
          message.id ?? null,
          message.id ?? `whatsapp-${clientTurnId}`,
          timestamp,
        ),
        env.DB.prepare(
          "UPDATE whatsapp_intake_sessions SET cursor_json=?,last_provider_message_id=?,version=version+1,updated_at=? WHERE id=?",
        ).bind(
          JSON.stringify(cursor),
          message.id ?? null,
          timestamp,
          session.id,
        ),
      ]);
      await queueGuidedIntake(env, conversationId, clientTurnId);
      await sendWhatsAppText(
        env,
        e164,
        "Lex AI is organizing your description and will suggest a category for you to confirm. It is not legal advice. You can reply HUMAN for operations review, PAUSE, RESUME, DELETE, or STOP.",
      );
      return;
    }
    cursor.practiceAreaCode = area.code;
    const service = await env.DB.prepare(
      `SELECT sv.id service_version_id,sd.code service_code,
              COALESCE((SELECT id FROM workflows WHERE service_code=sd.code LIMIT 1),
                       (SELECT id FROM workflows WHERE id='workflow-ng-la-tenant-v1')) workflow_id
         FROM service_definitions sd JOIN service_versions sv ON sv.service_id=sd.id
        WHERE sd.practice_area_id=(SELECT id FROM practice_areas WHERE code=?) AND sv.status='published' ORDER BY sv.version DESC LIMIT 1`,
    )
      .bind(area.code)
      .first<{
        service_version_id: string;
        service_code: string;
        workflow_id: string;
      }>();
    if (!service?.workflow_id)
      throw new Error("WhatsAppServiceDefinitionMissing");
    const intakeId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO intakes (id,client_user_id,language,tenancy_role,country_code,state_code,source_channel,workflow_id,state,version,created_at,updated_at,client_type,practice_area_code,service_version_id,classification_status,language_v2)
       VALUES (?,?,?,'tenant','NG',?,'whatsapp',?,'draft',1,?,?,?,?,?,?,?)`,
    )
      .bind(
        intakeId,
        user.id,
        ["en", "pcm"].includes(session.locale) ? session.locale : "en",
        cursor.stateCode,
        service.workflow_id,
        timestamp,
        timestamp,
        cursor.clientType,
        area.code,
        service.service_version_id,
        ["not-sure", "other"].includes(area.code) ? "suggested" : "selected",
        session.locale,
      )
      .run();
    session.intake_id = intakeId;
    await env.DB.prepare(
      "UPDATE whatsapp_intake_sessions SET intake_id=?,state='collect_narrative',cursor_json=?,last_provider_message_id=?,version=version+1,updated_at=? WHERE id=?",
    )
      .bind(
        intakeId,
        JSON.stringify(cursor),
        message.id ?? null,
        timestamp,
        session.id,
      )
      .run();
    await sendWhatsAppText(
      env,
      e164,
      `Category recorded: ${area.name}. Describe what happened, the people or organizations involved, and important dates. Do not send payment details or account passwords.`,
    );
    return;
  }
  if (session.state === "collect_narrative" && session.intake_id) {
    if (incomingText.length < 10) {
      await sendWhatsAppText(
        env,
        e164,
        "Please add a little more detail so the lawyer can understand what happened.",
      );
      return;
    }
    cursor.narrative = incomingText;
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE intakes SET narrative=?,version=version+1,updated_at=? WHERE id=?",
      ).bind(incomingText, timestamp, session.intake_id),
      env.DB.prepare(
        "INSERT INTO intake_answers (intake_id,question_key,value_json,updated_at) VALUES (?,'issue_summary',?,?) ON CONFLICT(intake_id,question_key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at",
      ).bind(session.intake_id, JSON.stringify(incomingText), timestamp),
    ]);
    await updateWhatsAppSession(
      env,
      session.id,
      "collect_outcome",
      session.locale,
      cursor,
      message.id,
    );
    await sendWhatsAppText(
      env,
      e164,
      "What would you like the lawyer to help you achieve? Also say if anyone is in danger, detained, or facing a stated deadline.",
    );
    return;
  }
  if (session.state === "collect_outcome" && session.intake_id) {
    cursor.desiredOutcome = incomingText;
    const urgent =
      /danger|detain|arrest|police|violence|deadline|court today|hearing today|gaggawa|ewu|mberede/iu.test(
        `${cursor.narrative} ${incomingText}`,
      );
    const summary = {
      authoritativeLanguage: "en",
      originalLanguage: session.locale,
      summary: cursor.narrative,
      desiredOutcome: incomingText,
      facts: [cursor.narrative],
      parties: [],
      timeline: [],
      missingInformation: [],
      urgency: urgent ? "urgent" : "standard",
      requiresHumanReview: true,
      source: "whatsapp_client_confirmation",
    };
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE intakes SET desired_outcome=?,structured_summary_json=?,summary_version=version+1,state='awaiting_confirmation',version=version+1,updated_at=? WHERE id=?",
      ).bind(
        incomingText,
        JSON.stringify(summary),
        timestamp,
        session.intake_id,
      ),
      env.DB.prepare(
        "INSERT INTO intake_answers (intake_id,question_key,value_json,updated_at) VALUES (?,'desired_outcome',?,?) ON CONFLICT(intake_id,question_key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at",
      ).bind(session.intake_id, JSON.stringify(incomingText), timestamp),
    ]);
    await updateWhatsAppSession(
      env,
      session.id,
      "confirm_summary",
      session.locale,
      cursor,
      message.id,
    );
    await sendWhatsAppText(
      env,
      e164,
      `Review before lawyer sharing. Facts: ${cursor.narrative}\nDesired help: ${incomingText}\nReply YES to confirm, or NO to correct the facts. AI has not given legal advice.`,
    );
    return;
  }
  if (session.state === "confirm_summary" && session.intake_id) {
    if (/^no$/iu.test(incomingText)) {
      await updateWhatsAppSession(
        env,
        session.id,
        "collect_narrative",
        session.locale,
        cursor,
        message.id,
      );
      await sendWhatsAppText(
        env,
        e164,
        "Send the corrected account of what happened.",
      );
      return;
    }
    if (!/^yes$/iu.test(incomingText)) {
      await sendWhatsAppText(
        env,
        e164,
        "Reply YES to confirm the English record, or NO to correct it.",
      );
      return;
    }
    const intake = await env.DB.prepare(
      "SELECT workflow_id,state_code,service_version_id,practice_area_code,structured_summary_json FROM intakes WHERE id=? AND state='awaiting_confirmation'",
    )
      .bind(session.intake_id)
      .first<{
        workflow_id: string;
        state_code: string;
        service_version_id: string;
        practice_area_code: string;
        structured_summary_json: string;
      }>();
    if (!intake) return;
    const matterId = crypto.randomUUID();
    const reference = `LEX-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const urgency =
      JSON.parse(intake.structured_summary_json).urgency === "urgent"
        ? "urgent"
        : "standard";
    const matterState =
      urgency === "urgent" ? "urgent_operations_review" : "matching_assistance";
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE intakes SET confirmed_at=?,submitted_at=?,state='submitted',version=version+1,updated_at=? WHERE id=? AND state='awaiting_confirmation'",
      ).bind(timestamp, timestamp, timestamp, session.intake_id),
      env.DB.prepare(
        "INSERT INTO consent_records (id,user_id,intake_id,consent_type,content_version,language,accepted,recorded_at) VALUES (?,?,?,'lawyer_sharing','whatsapp-intake-v1',?,1,?)",
      ).bind(
        crypto.randomUUID(),
        user.id,
        session.intake_id,
        session.locale,
        timestamp,
      ),
      env.DB.prepare(
        "INSERT INTO matters (id,reference,client_user_id,intake_id,workflow_id,country_code,state_code,state,urgency,version,created_at,updated_at,service_version_id,client_type) VALUES (?,?,?, ?,?,'NG',?,?,?,1,?,?,?,?)",
      ).bind(
        matterId,
        reference,
        user.id,
        session.intake_id,
        intake.workflow_id,
        intake.state_code,
        matterState,
        urgency,
        timestamp,
        timestamp,
        intake.service_version_id,
        cursor.clientType ?? "adult_individual",
      ),
      env.DB.prepare(
        "INSERT OR IGNORE INTO operations_matching_requests (id,matter_id,practice_area_code,state_code,urgency,state,version,created_at,updated_at) VALUES (?,?,?,?,?,'open',1,?,?)",
      ).bind(
        crypto.randomUUID(),
        matterId,
        intake.practice_area_code,
        intake.state_code,
        urgency,
        timestamp,
        timestamp,
      ),
      env.DB.prepare(
        "UPDATE whatsapp_intake_sessions SET state='completed',last_provider_message_id=?,version=version+1,updated_at=? WHERE id=?",
      ).bind(message.id ?? null, timestamp, session.id),
      env.DB.prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,matter_id,metadata_json,occurred_at) VALUES (?,?, 'whatsapp.intake_submitted','Matter',?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        user.id,
        matterId,
        matterId,
        JSON.stringify({ reference, urgency, requiresOperationsReview: true }),
        timestamp,
      ),
    ]);
    await sendWhatsAppText(
      env,
      e164,
      `Your confirmed matter ${reference} is saved and linked to this phone number. Lex operations will review routing before any conflict check or payment. Sign in to the Lex app with the same number for the shared timeline.`,
    );
    return;
  }
  await sendWhatsAppText(
    env,
    e164,
    "This protected step must continue in the Lex app. Reply START to begin a new adult legal intake, or STOP to opt out.",
  );
}

async function updateWhatsAppSession(
  env: Env,
  id: string,
  state: string,
  locale: string,
  cursor: WhatsAppCursor,
  providerMessageId?: string,
): Promise<void> {
  await env.DB.prepare(
    "UPDATE whatsapp_intake_sessions SET state=?,locale=?,cursor_json=?,last_provider_message_id=?,version=version+1,updated_at=? WHERE id=?",
  )
    .bind(
      state,
      locale,
      JSON.stringify(cursor),
      providerMessageId ?? null,
      now(),
      id,
    )
    .run();
}

function wa(
  locale: string,
  en: string,
  pcm: string,
  ha: string,
  yo: string,
  ig: string,
): string {
  return ({ en, pcm, ha, yo, ig } as Record<string, string>)[locale] ?? en;
}

async function sendWhatsAppText(
  env: Env,
  destination: string,
  body: string,
): Promise<void> {
  const response = await fetch(
    `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destination,
        type: "text",
        text: { preview_url: false, body: body.slice(0, 4096) },
      }),
    },
  );
  if (!response.ok) throw new Error("MetaMessageDeliveryFailed");
}

async function runMaintenance(env: Env) {
  const timestamp = now();
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const recoverable = await env.DB.prepare(
    "SELECT id,queue_name FROM jobs WHERE state IN ('queued','retry') AND available_at<=? OR (state='processing' AND locked_at<?) LIMIT 100",
  )
    .bind(timestamp, stale)
    .all<{ id: string; queue_name: string }>();
  for (const job of recoverable.results)
    await (
      job.queue_name === "notifications"
        ? env.NOTIFICATIONS_QUEUE
        : env.JOBS_QUEUE
    ).send({ jobId: job.id });
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM auth_step_up_attempts WHERE window_start<?",
    ).bind(Math.floor(Date.now() / 300_000) - 288),
    env.DB.prepare(
      "UPDATE sessions SET revoked_at=? WHERE revoked_at IS NULL AND refresh_expires_at<=?",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "UPDATE auth_challenges SET superseded_at=COALESCE(superseded_at,?) WHERE consumed_at IS NULL AND expires_at<=?",
    ).bind(timestamp, timestamp),
  ]);
  const overdue = await env.DB.prepare(
    "SELECT id FROM matters WHERE state IN ('consultation_scheduled','consultation_active','awaiting_client','lawyer_review') AND due_at<=? LIMIT 100",
  )
    .bind(timestamp)
    .all<{ id: string }>();
  for (const matter of overdue.results) {
    const idempotencyKey = `sla-overdue:${matter.id}:${timestamp.slice(0, 13)}`;
    const id = crypto.randomUUID();
    const inserted = await env.DB.prepare(
      "INSERT OR IGNORE INTO jobs (id,kind,queue_name,idempotency_key,payload_json,state,attempts,available_at,created_at,updated_at) VALUES (?,'urgent_matter_alert','notifications',?,?,'queued',0,?,?,?)",
    )
      .bind(
        id,
        idempotencyKey,
        JSON.stringify({ matterId: matter.id }),
        timestamp,
        timestamp,
        timestamp,
      )
      .run();
    if ((inserted.meta.changes ?? 0) === 1)
      await env.NOTIFICATIONS_QUEUE.send({ jobId: id });
  }
  console.log(
    JSON.stringify({
      level: "info",
      event: "maintenance_complete",
      recovered: recoverable.results.length,
      overdue: overdue.results.length,
    }),
  );
}
