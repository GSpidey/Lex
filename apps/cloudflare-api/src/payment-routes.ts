import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { initializePaymentSchema } from "@lex/contracts";
import { z } from "zod";
import { decrypt, encrypt } from "./crypto.js";
import { audit, now } from "./repository.js";
import { requireAuth, requireRole } from "./middleware.js";
import type { Env, Variables } from "./types.js";

const payments = new Hono<{ Bindings: Env; Variables: Variables }>();
payments.use("/*", requireAuth);

payments.post(
  "/initialize",
  zValidator("json", initializePaymentSchema),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    const providerSecret =
      input.provider === "paystack"
        ? context.env.PAYSTACK_SECRET_KEY
        : context.env.FLUTTERWAVE_SECRET_KEY;
    if (!providerSecret)
      return context.json(
        {
          capability: input.provider,
          status: "unconfigured",
          message: `${input.provider} sandbox credentials are not configured`,
        },
        503,
      );
    const matter = await context.env.DB.prepare(
      "SELECT m.*,u.email_encrypted,u.email_verified_at,p.subaccount_encrypted FROM matters m JOIN users u ON u.id=m.client_user_id JOIN payout_accounts p ON p.lawyer_id=m.selected_lawyer_id AND p.provider=? AND p.active=1 WHERE m.id=? AND m.client_user_id=? AND m.state='awaiting_payment'",
    )
      .bind(input.provider, input.matterId, user.id)
      .first<{
        id: string;
        workflow_id: string;
        selected_lawyer_id: string;
        version: number;
        email_encrypted: string | null;
        email_verified_at: string | null;
        subaccount_encrypted: string;
      }>();
    if (!matter)
      return context.json(
        {
          message:
            "Matter is not ready for payment or the lawyer payout account is unavailable",
        },
        409,
      );
    if (!matter.email_encrypted || !matter.email_verified_at)
      return context.json(
        { message: "A verified email address is required before payment" },
        422,
      );
    const paymentId = crypto.randomUUID();
    const internalReference = `LEX-${crypto.randomUUID()}`;
    const timestamp = now();
    const email = await decrypt(
      matter.email_encrypted,
      context.env.FIELD_ENCRYPTION_KEY,
    );
    const subaccount = await decrypt(
      matter.subaccount_encrypted,
      context.env.FIELD_ENCRYPTION_KEY,
    );
    const amountMinor = 1_000_000;
    const providerResult =
      input.provider === "paystack"
        ? await initializePaystack(providerSecret, {
            email,
            amountMinor,
            reference: internalReference,
            callbackUrl: input.callbackUrl,
            subaccount,
            matterId: matter.id,
          })
        : await initializeFlutterwave(providerSecret, {
            email,
            amountMinor,
            reference: internalReference,
            callbackUrl: input.callbackUrl,
            subaccount,
            matterId: matter.id,
          });
    const snapshot = {
      amountMinor,
      currency: "NGN",
      platformShareBps: 2_000,
      lawyerShareBps: 8_000,
      feeBearer: "lawyer",
      provider: input.provider,
      lawyerId: matter.selected_lawyer_id,
      workflowId: matter.workflow_id,
    };
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO payments (id,matter_id,provider,internal_reference,provider_reference,state,amount_minor,currency,platform_share_bps,lawyer_share_bps,fee_bearer,workflow_id,lawyer_id,snapshot_json,version,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,'NGN',2000,8000,'lawyer',?,?,?,1,?,?)",
      ).bind(
        paymentId,
        matter.id,
        input.provider,
        internalReference,
        providerResult.reference,
        amountMinor,
        matter.workflow_id,
        matter.selected_lawyer_id,
        JSON.stringify(snapshot),
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,matter_id,metadata_json,request_id,occurred_at) VALUES (?,?,?,?,?,?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        user.id,
        "payment.initialized",
        "Payment",
        paymentId,
        matter.id,
        JSON.stringify(snapshot),
        context.get("requestId"),
        timestamp,
      ),
    ]);
    return context.json(
      {
        paymentId,
        internalReference,
        providerReference: providerResult.reference,
        checkoutUrl: providerResult.checkoutUrl,
        amountMinor,
        currency: "NGN",
      },
      201,
    );
  },
);

payments.get("/:id", async (context) => {
  const user = context.get("user");
  const payment = await context.env.DB.prepare(
    "SELECT p.id,p.matter_id,p.provider,p.internal_reference,p.provider_reference,p.state,p.amount_minor,p.currency,p.platform_share_bps,p.lawyer_share_bps,p.fee_bearer,p.verified_at,p.created_at,p.updated_at FROM payments p JOIN matters m ON m.id=p.matter_id WHERE p.id=? AND (m.client_user_id=? OR ? IN ('admin','super_admin') OR EXISTS(SELECT 1 FROM lawyer_profiles l WHERE l.id=m.selected_lawyer_id AND l.user_id=?))",
  )
    .bind(context.req.param("id"), user.id, user.role, user.id)
    .first();
  if (!payment) return context.json({ message: "Payment not found" }, 404);
  return context.json(payment);
});

payments.put(
  "/lawyer/payout",
  requireRole("lawyer"),
  zValidator(
    "json",
    z.object({
      provider: z.enum(["paystack", "flutterwave"]),
      subaccountCode: z.string().min(3).max(200),
    }),
  ),
  async (context) => {
    const input = context.req.valid("json");
    const user = context.get("user");
    const timestamp = now();
    const lawyer = await context.env.DB.prepare(
      "SELECT id FROM lawyer_profiles WHERE user_id=?",
    )
      .bind(user.id)
      .first<{ id: string }>();
    if (!lawyer)
      return context.json({ message: "Lawyer profile not found" }, 404);
    await context.env.DB.prepare(
      "INSERT INTO payout_accounts (id,lawyer_id,provider,subaccount_encrypted,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(lawyer_id,provider) DO UPDATE SET subaccount_encrypted=excluded.subaccount_encrypted,active=1,updated_at=excluded.updated_at",
    )
      .bind(
        crypto.randomUUID(),
        lawyer.id,
        input.provider,
        await encrypt(input.subaccountCode, context.env.FIELD_ENCRYPTION_KEY),
        timestamp,
        timestamp,
      )
      .run();
    await audit(context.env, {
      actorUserId: user.id,
      action: "lawyer.payout_updated",
      entityType: "LawyerProfile",
      entityId: lawyer.id,
      requestId: context.get("requestId"),
      metadata: { provider: input.provider },
    });
    return context.json({ provider: input.provider, configured: true });
  },
);

async function initializePaystack(
  secret: string,
  input: {
    email: string;
    amountMinor: number;
    reference: string;
    callbackUrl: string;
    subaccount: string;
    matterId: string;
  },
) {
  const response = await fetch(
    "https://api.paystack.co/transaction/initialize",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor,
        currency: "NGN",
        reference: input.reference,
        callback_url: input.callbackUrl,
        subaccount: input.subaccount,
        bearer: "subaccount",
        metadata: { matterId: input.matterId },
      }),
    },
  );
  const body = (await response.json()) as {
    message?: string;
    data?: { reference: string; authorization_url: string };
  };
  if (!response.ok || !body.data)
    throw new Error(body.message ?? "Paystack initialization failed");
  return {
    reference: body.data.reference,
    checkoutUrl: body.data.authorization_url,
  };
}

async function initializeFlutterwave(
  secret: string,
  input: {
    email: string;
    amountMinor: number;
    reference: string;
    callbackUrl: string;
    subaccount: string;
    matterId: string;
  },
) {
  const response = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: input.reference,
      amount: input.amountMinor / 100,
      currency: "NGN",
      redirect_url: input.callbackUrl,
      customer: { email: input.email },
      subaccounts: [
        {
          id: input.subaccount,
          transaction_charge_type: "percentage",
          transaction_charge: 20,
        },
      ],
      meta: { matterId: input.matterId },
      customizations: { title: "Lex tenancy assessment" },
    }),
  });
  const body = (await response.json()) as {
    message?: string;
    data?: { link: string };
  };
  if (!response.ok || !body.data)
    throw new Error(body.message ?? "Flutterwave initialization failed");
  return { reference: input.reference, checkoutUrl: body.data.link };
}

export default payments;
