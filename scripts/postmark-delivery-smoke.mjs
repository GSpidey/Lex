// One expressly authorized provider test. Credentials arrive on stdin, never
// command-line arguments, logs, source files or a browser-visible response.
// Example invocation: node scripts/postmark-delivery-smoke.mjs --send-one
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  if (process.argv[2] !== "--send-one") throw new Error("ExplicitSendRequired");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 4096) throw new Error("InputTooLarge");
  }
  const { token, mailbox, expectedServerId } = JSON.parse(input);
  input = "";
  if (
    typeof token !== "string" ||
    !/^[a-f0-9-]{36}$/iu.test(token) ||
    typeof mailbox !== "string" ||
    !/^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/u.test(mailbox) ||
    !Number.isSafeInteger(expectedServerId)
  )
    throw new Error("InvalidSmokeConfiguration");
  const headers = {
    "X-Postmark-Server-Token": token,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const serverResponse = await fetch("https://api.postmarkapp.com/server", {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!serverResponse.ok)
    throw new Error(`ServerCheckHTTP${serverResponse.status}`);
  const server = await serverResponse.json();
  if (server.ID !== expectedServerId || server.Name !== "Lex Staging")
    throw new Error("UnexpectedServer");
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      From: `Lex <${mailbox}>`,
      To: mailbox,
      Subject: "Lex email setup — delivery test",
      TextBody:
        "This is the single delivery test you authorized for Lex.\n\nThe transactional email connection is being checked. This message contains no client legal information and does not approve or publish any legal document.\n\nNo action is required. Your partner's secure document-review invitation will be a separate message.\n\nLex",
      HtmlBody:
        "<p>This is the single delivery test you authorized for <strong>Lex</strong>.</p><p>The transactional email connection is being checked. This message contains no client legal information and does not approve or publish any legal document.</p><p>No action is required. Your partner's secure document-review invitation will be a separate message.</p><p>Lex</p>",
      MessageStream: "outbound",
      TrackOpens: false,
      TrackLinks: "None",
      Tag: "lex-authorized-setup-test",
    }),
  });
  const result = await response.json();
  if (
    !response.ok ||
    result.ErrorCode !== 0 ||
    typeof result.MessageID !== "string"
  )
    throw new Error(
      `PostmarkRejectedHTTP${response.status}Code${Number(result.ErrorCode) || "unknown"}`,
    );
  const receipt = {
    event: "postmark_test_accepted",
    serverId: expectedServerId,
    messageId: result.MessageID,
    submittedAt: result.SubmittedAt,
    recipient: "owner-authorized-mailbox",
    messageStream: "outbound",
    trackingEnabled: false,
    deliveryConfirmed: false,
    scope:
      "One provider API test; not yet Worker queue or partner delivery verification",
  };
  await mkdir(resolve(root, "artifacts/verification"), { recursive: true });
  await writeFile(
    resolve(
      root,
      "artifacts/verification",
      `postmark-${result.MessageID}.json`,
    ),
    JSON.stringify(receipt, null, 2),
    { flag: "wx" },
  );
  console.info(JSON.stringify(receipt));
} catch (error) {
  // Only local controlled error labels, never provider response bodies/headers.
  const label = error instanceof Error ? error.message : "UnknownFailure";
  console.error(
    JSON.stringify({
      event: "postmark_test_failed",
      reason: /^[A-Za-z0-9]+$/u.test(label)
        ? label
        : "RequestOrLocalWriteFailed",
      retryAutomatically: false,
    }),
  );
  process.exitCode = 1;
}
