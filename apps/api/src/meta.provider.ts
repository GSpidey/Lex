import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MessagingProvider, OutboundMessage } from "@lex/contracts";

@Injectable()
export class MetaWhatsAppProvider implements MessagingProvider {
  constructor(private readonly config: ConfigService) {}

  verifyChallenge(mode?: string, token?: string, challenge?: string) {
    return mode === "subscribe" && token === this.config.get<string>("META_VERIFY_TOKEN") ? challenge : null;
  }

  verifyWebhook(rawBody: Uint8Array, signature?: string) {
    const secret = this.config.get<string>("META_APP_SECRET");
    if (!secret) return process.env.NODE_ENV !== "production";
    if (!signature?.startsWith("sha256=")) return false;
    const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    const a = Buffer.from(expected); const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async send(message: OutboundMessage) {
    const token = this.config.get<string>("META_ACCESS_TOKEN");
    const phoneId = this.config.get<string>("META_PHONE_NUMBER_ID");
    if (!token || !phoneId) return { providerMessageId: `meta_local_${message.idempotencyKey}`, status: "queued_local_test" };
    const version = this.config.get<string>("META_GRAPH_VERSION") ?? "v24.0";
    const payload = message.templateName
      ? { messaging_product: "whatsapp", to: message.recipient, type: "template", template: { name: message.templateName, language: { code: message.locale ?? "en" }, components: [{ type: "body", parameters: [{ type: "text", text: message.body }] }] } }
      : { messaging_product: "whatsapp", to: message.recipient, type: "text", text: { body: message.body } };
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json() as { messages?: Array<{ id: string }> };
    if (!response.ok || !body.messages?.[0]) throw new Error("Meta message delivery failed");
    return { providerMessageId: body.messages[0].id, status: "sent" };
  }

  async markRead(providerMessageId: string) {
    const token = this.config.get<string>("META_ACCESS_TOKEN");
    const phoneId = this.config.get<string>("META_PHONE_NUMBER_ID");
    if (!token || !phoneId) return;
    const version = this.config.get<string>("META_GRAPH_VERSION") ?? "v24.0";
    await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: providerMessageId }) });
  }
}
