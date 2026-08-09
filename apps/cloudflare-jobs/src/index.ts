import { decrypt, hmac } from "./crypto.js";

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
  META_ACCESS_TOKEN?: string;
  META_PHONE_NUMBER_ID?: string;
  OPENAI_API_KEY?: string;
  PAYSTACK_SECRET_KEY?: string;
  FLUTTERWAVE_SECRET_KEY?: string;
  EXPO_ACCESS_TOKEN?: string;
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
    await env.DB.prepare(
      "UPDATE jobs SET state='retry',locked_at=NULL,last_error=?,available_at=?,updated_at=? WHERE id=?",
    )
      .bind(
        error instanceof Error ? error.name : "job_error",
        new Date(Date.now() + 30_000).toISOString(),
        now(),
        jobId,
      )
      .run();
    throw error;
  }
}

async function dispatch(
  kind: string,
  payload: Record<string, unknown>,
  env: Env,
) {
  if (kind === "auth_otp") return sendOtp(payload, env);
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
  if (kind === "ai_intake_extraction") return;
  throw new Error("UnsupportedJobKind");
}

async function sendOtp(payload: Record<string, unknown>, env: Env) {
  if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID)
    throw new Error("MetaNotConfigured");
  const envelope = JSON.parse(
    await decrypt(String(payload.encrypted), env.FIELD_ENCRYPTION_KEY),
  ) as { channel: string; destination: string; code: string; locale: string };
  if (envelope.channel !== "whatsapp") throw new Error("EmailNotConfigured");
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
    "SELECT t.evidence_id,t.language,e.object_key,e.file_name,e.content_type FROM transcriptions t JOIN evidence_items e ON e.id=t.evidence_id WHERE t.id=? AND t.status='queued'",
  )
    .bind(transcriptionId)
    .first<{
      evidence_id: string;
      language: string;
      object_key: string;
      file_name: string;
      content_type: string;
    }>();
  if (!record) return;
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
  await env.DB.prepare(
    "UPDATE transcriptions SET transcript=?,status='ready',model='gpt-4o-transcribe',version=version+1,updated_at=? WHERE id=?",
  )
    .bind(body.text, now(), transcriptionId)
    .run();
}

async function reconcilePayment(payload: Record<string, unknown>, env: Env) {
  const provider = String(payload.provider);
  const reference = String(payload.reference ?? "");
  if (!reference) return;
  const payment = await env.DB.prepare(
    "SELECT id,matter_id,amount_minor,state,version FROM payments WHERE provider=? AND (provider_reference=? OR internal_reference=?)",
  )
    .bind(provider, reference, reference)
    .first<{
      id: string;
      matter_id: string;
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
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE payments SET state='successful',verified_at=?,version=version+1,updated_at=? WHERE id=? AND state='pending' AND version=?",
    ).bind(timestamp, timestamp, payment.id, payment.version),
    env.DB.prepare(
      "UPDATE matters SET state='active',paid_at=?,information_complete_at=COALESCE(information_complete_at,?),due_at=?,version=version+1,updated_at=? WHERE id=? AND state='awaiting_payment'",
    ).bind(timestamp, timestamp, dueAt, timestamp, payment.matter_id),
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
  ]);
}

async function sendMatterStatus(
  kind: string,
  payload: Record<string, unknown>,
  env: Env,
) {
  if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID)
    throw new Error("MetaNotConfigured");
  const matterId = String(payload.matterId ?? "");
  const row = await env.DB.prepare(
    "SELECT u.phone_encrypted,u.phone_hash FROM matters m JOIN users u ON u.id=m.client_user_id WHERE m.id=?",
  )
    .bind(matterId)
    .first<{ phone_encrypted: string | null; phone_hash: string | null }>();
  if (!row?.phone_encrypted) return;
  const destination = await decrypt(
    row.phone_encrypted,
    env.FIELD_ENCRYPTION_KEY,
  );
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

async function applyMetaEvent(payload: Record<string, unknown>, env: Env) {
  const providerEventId = String(payload.providerEventId ?? "");
  await env.DB.prepare(
    "UPDATE provider_events SET status='processed',processed_at=? WHERE id=?",
  )
    .bind(now(), providerEventId)
    .run();
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
      "UPDATE sessions SET revoked_at=? WHERE revoked_at IS NULL AND refresh_expires_at<=?",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "UPDATE auth_challenges SET superseded_at=COALESCE(superseded_at,?) WHERE consumed_at IS NULL AND expires_at<=?",
    ).bind(timestamp, timestamp),
  ]);
  const overdue = await env.DB.prepare(
    "SELECT id FROM matters WHERE state IN ('active','awaiting_client','lawyer_review') AND due_at<=? LIMIT 100",
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
