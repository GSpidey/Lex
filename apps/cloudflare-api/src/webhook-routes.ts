import { Hono } from "hono";
import { constantTimeEqual, hmacBytes, sha256 } from "./crypto.js";
import { now, recordJobBeforePublish } from "./repository.js";
import type { Env, Variables } from "./types.js";

const webhooks = new Hono<{ Bindings: Env; Variables: Variables }>();

webhooks.get("/meta", (context) => {
  const mode = context.req.query("hub.mode");
  const token = context.req.query("hub.verify_token");
  const challenge = context.req.query("hub.challenge");
  if (
    !context.env.META_VERIFY_TOKEN ||
    mode !== "subscribe" ||
    !constantTimeEqual(token ?? "", context.env.META_VERIFY_TOKEN)
  )
    return context.text("Invalid verification challenge", 403);
  return context.text(challenge ?? "", 200);
});

webhooks.post("/meta", async (context) => {
  if (!context.env.META_APP_SECRET)
    return context.json({ message: "Meta webhook is not configured" }, 503);
  const raw = await context.req.arrayBuffer();
  const signature = context.req.header("x-hub-signature-256") ?? "";
  const expected = `sha256=${await hmacBytes(raw, context.env.META_APP_SECRET, "SHA-256", "hex")}`;
  if (!constantTimeEqual(signature, expected))
    return context.json({ message: "Invalid webhook signature" }, 401);
  const payloadText = new TextDecoder().decode(raw);
  const payload = JSON.parse(payloadText) as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            id?: string;
            from?: string;
            type?: string;
            text?: { body?: string };
            audio?: { id?: string; mime_type?: string };
            image?: { id?: string; mime_type?: string; caption?: string };
            document?: {
              id?: string;
              mime_type?: string;
              filename?: string;
              caption?: string;
            };
            interactive?: {
              button_reply?: { id?: string; title?: string };
              list_reply?: { id?: string; title?: string };
            };
          }>;
          statuses?: Array<{ id?: string; status?: string }>;
        };
      }>;
    }>;
  };
  for (const entry of payload.entry ?? [])
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? [])
        if (status.id)
          await storeProviderEvent(
            context.env,
            "meta",
            `status:${status.id}:${status.status ?? "unknown"}`,
            payloadText,
            { kind: "meta_status", status },
          );
      for (const message of change.value?.messages ?? [])
        if (message.id)
          await storeProviderEvent(
            context.env,
            "meta",
            `message:${message.id}`,
            payloadText,
            { kind: "meta_inbound", message },
          );
    }
  return context.json({ received: true });
});

for (const provider of ["paystack", "flutterwave"] as const)
  webhooks.post(`/${provider}`, async (context) => {
    const raw = await context.req.arrayBuffer();
    const rawText = new TextDecoder().decode(raw);
    const secret =
      provider === "paystack"
        ? (context.env.PAYSTACK_WEBHOOK_SECRET ??
          context.env.PAYSTACK_SECRET_KEY)
        : context.env.FLUTTERWAVE_WEBHOOK_SECRET;
    if (!secret)
      return context.json(
        { message: `${provider} webhook is not configured` },
        503,
      );
    const signature =
      provider === "paystack"
        ? (context.req.header("x-paystack-signature") ?? "")
        : (context.req.header("flutterwave-signature") ??
          context.req.header("verif-hash") ??
          "");
    const expected =
      provider === "paystack"
        ? await hmacBytes(raw, secret, "SHA-512", "hex")
        : await hmacBytes(raw, secret, "SHA-256", "base64");
    if (
      !constantTimeEqual(signature, expected) &&
      !(provider === "flutterwave" && constantTimeEqual(signature, secret))
    )
      return context.json({ message: "Invalid webhook signature" }, 401);
    const body = JSON.parse(rawText) as {
      event?: string;
      id?: string | number;
      data?: { id?: string | number; reference?: string; tx_ref?: string };
    };
    const reference =
      provider === "paystack" ? body.data?.reference : body.data?.tx_ref;
    const eventKey = String(
      body.id ??
        body.data?.id ??
        `${body.event ?? "unknown"}:${reference ?? (await sha256(raw))}`,
    );
    const result = await storeProviderEvent(
      context.env,
      provider,
      eventKey,
      rawText,
      {
        kind: "payment_webhook",
        provider,
        eventKey,
        reference,
        eventType: body.event ?? "unknown",
      },
    );
    return context.json({ received: true, duplicate: !result });
  });

async function storeProviderEvent(
  env: Env,
  provider: string,
  eventKey: string,
  rawPayload: string,
  jobPayload: unknown,
): Promise<boolean> {
  const id = crypto.randomUUID();
  const timestamp = now();
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO provider_events (id,provider,event_key,signature_valid,raw_payload,status,received_at) VALUES (?,?,?,1,?,'received',?)",
  )
    .bind(id, provider, eventKey, rawPayload, timestamp)
    .run();
  if ((result.meta.changes ?? 0) === 0) return false;
  await recordJobBeforePublish(env, {
    kind: (jobPayload as { kind: string }).kind,
    queueName: "jobs",
    idempotencyKey: `provider:${provider}:${eventKey}`,
    payload: { ...(jobPayload as object), providerEventId: id },
  });
  return true;
}

export default webhooks;
