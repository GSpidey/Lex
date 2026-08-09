import { createHmac, timingSafeEqual } from "node:crypto";
import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PaymentInitialization, PaymentProvider } from "@lex/contracts";

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly name = "paystack" as const;
  private readonly secret?: string;
  constructor(config: ConfigService) { this.secret = config.get<string>("PAYSTACK_SECRET_KEY"); }

  async initialize(input: PaymentInitialization) {
    if (!this.secret) return { providerReference: `paystack_test_${input.internalReference}`, checkoutUrl: `lex://payment/paystack/${input.internalReference}` };
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email, amount: input.amountMinor, currency: input.currency, reference: input.internalReference, callback_url: input.callbackUrl, subaccount: input.lawyerSubaccount, bearer: "subaccount", metadata: input.metadata }),
    });
    const body = await response.json() as { status?: boolean; message?: string; data?: { reference: string; authorization_url: string } };
    if (!response.ok || !body.data) throw new BadGatewayException(body.message ?? "Paystack initialization failed");
    return { providerReference: body.data.reference, checkoutUrl: body.data.authorization_url };
  }

  async verify(providerReference: string) {
    if (!this.secret && providerReference.startsWith("paystack_test_")) return { successful: true, amountMinor: 1_000_000, currency: "NGN", raw: { domain: "local-test" } };
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(providerReference)}`, { headers: { Authorization: `Bearer ${this.secret}` } });
    const body = await response.json() as { data?: { status: string; amount: number; currency: string } };
    if (!response.ok || !body.data) throw new BadGatewayException("Paystack verification failed");
    return { successful: body.data.status === "success", amountMinor: body.data.amount, currency: body.data.currency, raw: body };
  }

  async refund(input: { providerReference: string; amountMinor?: number; reason: string }) {
    if (!this.secret) return { refundReference: `paystack_refund_${input.providerReference}`, status: "processed_test" };
    const response = await fetch("https://api.paystack.co/refund", { method: "POST", headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ transaction: input.providerReference, amount: input.amountMinor, merchant_note: input.reason }) });
    const body = await response.json() as { data?: { id: number; status: string } };
    if (!response.ok || !body.data) throw new BadGatewayException("Paystack refund failed");
    return { refundReference: String(body.data.id), status: body.data.status };
  }

  verifyWebhook(rawBody: Uint8Array, headers: Record<string, string | string[] | undefined>) {
    if (!this.secret) return process.env.NODE_ENV !== "production";
    const signature = headers["x-paystack-signature"];
    if (typeof signature !== "string") return false;
    return constantTimeEqual(createHmac("sha512", this.secret).update(rawBody).digest("hex"), signature);
  }
}

@Injectable()
export class FlutterwaveProvider implements PaymentProvider {
  readonly name = "flutterwave" as const;
  private readonly secret?: string;
  private readonly webhookSecret?: string;
  constructor(config: ConfigService) { this.secret = config.get<string>("FLUTTERWAVE_SECRET_KEY"); this.webhookSecret = config.get<string>("FLUTTERWAVE_WEBHOOK_SECRET"); }

  async initialize(input: PaymentInitialization) {
    if (!this.secret) return { providerReference: `flutterwave_test_${input.internalReference}`, checkoutUrl: `lex://payment/flutterwave/${input.internalReference}` };
    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tx_ref: input.internalReference, amount: input.amountMinor / 100, currency: input.currency, redirect_url: input.callbackUrl, customer: { email: input.email }, subaccounts: [{ id: input.lawyerSubaccount, transaction_charge_type: "percentage", transaction_charge: input.platformSharePercent }], meta: input.metadata, customizations: { title: "Lex tenancy assessment" } }),
    });
    const body = await response.json() as { status?: string; message?: string; data?: { link: string } };
    if (!response.ok || !body.data) throw new BadGatewayException(body.message ?? "Flutterwave initialization failed");
    return { providerReference: input.internalReference, checkoutUrl: body.data.link };
  }

  async verify(providerReference: string) {
    if (!this.secret && providerReference.startsWith("flutterwave_test_")) return { successful: true, amountMinor: 1_000_000, currency: "NGN", raw: { environment: "local-test" } };
    const response = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(providerReference)}`, { headers: { Authorization: `Bearer ${this.secret}` } });
    const body = await response.json() as { data?: { status: string; amount: number; currency: string } };
    if (!response.ok || !body.data) throw new BadGatewayException("Flutterwave verification failed");
    return { successful: body.data.status === "successful", amountMinor: Math.round(body.data.amount * 100), currency: body.data.currency, raw: body };
  }

  async refund(input: { providerReference: string; amountMinor?: number; reason: string }) {
    if (!this.secret) return { refundReference: `flutterwave_refund_${input.providerReference}`, status: "processed_test" };
    const response = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(input.providerReference)}/refund`, { method: "POST", headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: input.amountMinor ? input.amountMinor / 100 : undefined, comments: input.reason }) });
    const body = await response.json() as { data?: { id: number; status: string } };
    if (!response.ok || !body.data) throw new BadGatewayException("Flutterwave refund failed");
    return { refundReference: String(body.data.id), status: body.data.status };
  }

  verifyWebhook(rawBody: Uint8Array, headers: Record<string, string | string[] | undefined>) {
    if (!this.webhookSecret) return process.env.NODE_ENV !== "production";
    const signature = headers["flutterwave-signature"] ?? headers["verif-hash"];
    if (typeof signature !== "string") return false;
    const hmac = createHmac("sha256", this.webhookSecret).update(rawBody).digest("base64");
    return constantTimeEqual(hmac, signature) || constantTimeEqual(this.webhookSecret, signature);
  }
}

@Injectable()
export class PaymentProviderRegistry {
  constructor(private readonly paystack: PaystackProvider, private readonly flutterwave: FlutterwaveProvider) {}
  get(name: "paystack" | "flutterwave"): PaymentProvider { return name === "paystack" ? this.paystack : this.flutterwave; }
}
