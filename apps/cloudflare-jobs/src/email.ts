// HTTP-only adapter: also usable by the future Node worker without CF bindings.
export interface EmailConfiguration {
  EMAIL_PROVIDER?: string;
  EMAIL_DELIVERY_ENABLED: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  POSTMARK_SERVER_TOKEN?: string;
  POSTMARK_FROM_EMAIL?: string;
  POSTMARK_MESSAGE_STREAM?: string;
}

export function emailConfigured(config: EmailConfiguration): boolean {
  if (config.EMAIL_DELIVERY_ENABLED !== "true") return false;
  switch (config.EMAIL_PROVIDER ?? "postmark") {
    case "resend":
      return Boolean(config.RESEND_API_KEY && config.RESEND_FROM_EMAIL);
    case "postmark":
      return Boolean(
        config.POSTMARK_SERVER_TOKEN && config.POSTMARK_FROM_EMAIL,
      );
    default:
      return false;
  }
}

export async function sendEmail(
  config: EmailConfiguration,
  to: string,
  subject: string,
  text: string,
  deliveryKey: string,
): Promise<void> {
  if (!emailConfigured(config)) throw new Error("EmailNotConfigured");
  const html = `<div>${text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "<br>")}</div>`;
  if (config.EMAIL_PROVIDER === "resend") {
    // The same durable job always uses the same key and content on retry.
    // Resend retains these keys for 24h; this is not indefinite exactly-once delivery.
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        authorization: `Bearer ${config.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": `lex-email/${deliveryKey}`,
      },
      body: JSON.stringify({
        from: config.RESEND_FROM_EMAIL,
        to: [to],
        subject,
        text,
        html,
      }),
    });
    if (!response.ok) throw new Error("ResendSubmissionFailed");
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== "object" ||
      !("id" in result) ||
      typeof result.id !== "string" ||
      !result.id
    )
      throw new Error("ResendSubmissionFailed");
    // Acceptance by the API is not proof of inbox delivery.
    return;
  }
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "x-postmark-server-token": config.POSTMARK_SERVER_TOKEN!,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      From: config.POSTMARK_FROM_EMAIL,
      To: to,
      Subject: subject,
      TextBody: text,
      HtmlBody: html,
      MessageStream: config.POSTMARK_MESSAGE_STREAM ?? "outbound",
      TrackOpens: false,
      TrackLinks: "None",
    }),
  });
  if (!response.ok) throw new Error("PostmarkDeliveryFailed");
  const result = await response.json<{
    ErrorCode: number;
    MessageID?: string;
  }>();
  if (result.ErrorCode !== 0 || !result.MessageID)
    throw new Error("PostmarkDeliveryFailed");
}
