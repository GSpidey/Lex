import { fetchMock } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emailConfigured, sendEmail } from "../../cloudflare-jobs/src/email.js";

const config = {
  EMAIL_PROVIDER: "resend",
  EMAIL_DELIVERY_ENABLED: "true",
  RESEND_API_KEY: "synthetic-never-send",
  RESEND_FROM_EMAIL: "Lex <sender@example.invalid>",
};
beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.deactivate());

describe("Selectable transactional email", () => {
  it("submits plain text and escaped HTML with a stable retry key", async () => {
    fetchMock
      .get("https://api.resend.com")
      .intercept({
        path: "/emails",
        method: "POST",
        headers: {
          "idempotency-key": "lex-email/synthetic-job",
          authorization: "Bearer synthetic-never-send",
        },
        body: (body) => {
          const input = JSON.parse(String(body));
          return (
            input.from === config.RESEND_FROM_EMAIL &&
            input.to[0] === "recipient@example.invalid" &&
            input.text === "Hello <reader>\nReview your documents" &&
            input.html ===
              "<div>Hello &lt;reader&gt;<br>Review your documents</div>"
          );
        },
      })
      .reply(200, { id: "synthetic-accepted-email" })
      .times(2);
    for (let retry = 0; retry < 2; retry++) {
      await sendEmail(
        config,
        "recipient@example.invalid",
        "Lex review",
        "Hello <reader>\nReview your documents",
        "synthetic-job",
      );
    }
    fetchMock.assertNoPendingInterceptors();
  });

  it("does not use retained Postmark credentials when Resend is selected", async () => {
    const missing = {
      ...config,
      RESEND_API_KEY: "",
      POSTMARK_SERVER_TOKEN: "retained",
      POSTMARK_FROM_EMAIL: "sender@example.invalid",
    };
    expect(emailConfigured(missing)).toBe(false);
    await expect(
      sendEmail(missing, "recipient@example.invalid", "test", "test", "job"),
    ).rejects.toThrow("EmailNotConfigured");
    expect(emailConfigured({ ...config, EMAIL_PROVIDER: "unknown" })).toBe(
      false,
    );
    expect(
      emailConfigured({ ...config, EMAIL_DELIVERY_ENABLED: "false" }),
    ).toBe(false);
  });

  it("rejects HTTP failures and malformed success without exposing provider content", async () => {
    fetchMock
      .get("https://api.resend.com")
      .intercept({ path: "/emails", method: "POST" })
      .reply(429, { message: "Sensitive provider diagnostic" });
    await expect(
      sendEmail(config, "recipient@example.invalid", "test", "test", "job"),
    ).rejects.toThrow("ResendSubmissionFailed");
    fetchMock
      .get("https://api.resend.com")
      .intercept({ path: "/emails", method: "POST" })
      .reply(200, { id: 123 });
    await expect(
      sendEmail(config, "recipient@example.invalid", "test", "test", "job"),
    ).rejects.toThrow("ResendSubmissionFailed");
    fetchMock.assertNoPendingInterceptors();
  });
});
