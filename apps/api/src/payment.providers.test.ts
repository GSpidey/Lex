import { createHmac } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { FlutterwaveProvider, PaystackProvider } from "./payment.providers.js";

describe("payment provider security contracts", () => {
  it("verifies local Paystack and Flutterwave references only outside production", async () => {
    const config = new ConfigService({});
    expect((await new PaystackProvider(config).verify("paystack_test_LEX-1")).successful).toBe(true);
    expect((await new FlutterwaveProvider(config).verify("flutterwave_test_LEX-1")).successful).toBe(true);
  });
  it("validates Paystack webhook signatures in constant-time-compatible form", () => {
    const raw = Buffer.from('{"event":"charge.success"}'); const secret = "test-secret";
    const provider = new PaystackProvider(new ConfigService({ PAYSTACK_SECRET_KEY: secret }));
    expect(provider.verifyWebhook(raw, { "x-paystack-signature": createHmac("sha512", secret).update(raw).digest("hex") })).toBe(true);
    expect(provider.verifyWebhook(raw, { "x-paystack-signature": "invalid" })).toBe(false);
  });
});
