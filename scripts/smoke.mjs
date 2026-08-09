import { createHmac } from "node:crypto";

const base = process.env.PUBLIC_API_URL ?? "http://localhost:4000/v1";

function assert(condition, message) { if (!condition) throw new Error(`Assertion failed: ${message}`); }
async function request(path, { token, method = "GET", body, expected } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json().catch(() => ({}));
  if (expected !== undefined) { assert(response.status === expected, `${path} expected ${expected}, got ${response.status}`); return value; }
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(value)}`);
  return value;
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = []; for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret) {
  const counter = Math.floor(Date.now() / 30_000); const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest(); const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function otpSession(channel, destination) {
  const challenge = await request("/auth/otp/request", { method: "POST", body: { channel, ...(channel === "email" ? { email: destination } : { phone: destination }), purpose: "sign_in", locale: "en" } });
  assert(challenge.devCode, "development OTP echo must be enabled for local smoke");
  return request("/auth/otp/verify", { method: "POST", body: { challengeId: challenge.challengeId, code: challenge.devCode, deviceName: "automated smoke" } });
}

async function staffSession(email) {
  const pre = await otpSession("email", email); assert(pre.preAuthToken, `${email} should require MFA`);
  if (!pre.mfaSetupRequired) throw new Error(`${email} test seed must be reset before smoke so MFA setup can be exercised`);
  const setup = await request("/auth/mfa/setup", { method: "POST", token: pre.preAuthToken });
  return request("/auth/mfa/verify", { method: "POST", token: pre.preAuthToken, body: { code: totp(setup.secret), deviceName: "automated smoke" } });
}

async function verifiedClient(phone, email) {
  const session = await otpSession("whatsapp", phone); assert(session.user.role === "CLIENT", "phone OTP should create a client");
  const emailChallenge = await request("/auth/email/request", { method: "POST", token: session.accessToken, body: { email } });
  await request("/auth/email/verify", { method: "POST", token: session.accessToken, body: { challengeId: emailChallenge.challengeId, code: emailChallenge.devCode } });
  return session;
}

async function completedIntake(session, { role = "tenant", stateCode = "LA", language = "en", urgent = false } = {}) {
  let intake = await request("/intakes", { method: "POST", token: session.accessToken, body: { language, tenancyRole: role, countryCode: "NG", stateCode, sourceChannel: "mobile" } });
  intake = await request(`/intakes/${intake.id}`, { method: "PATCH", token: session.accessToken, body: { narrative: `I am the ${role}. A tenancy disagreement began on 4 August 2026 after a written notice. I need a lawyer-reviewed assessment of my options.`, desiredOutcome: "A clear written assessment and practical next steps.", answers: [{ questionKey: role === "tenant" ? "locked_out" : "self_help_action", value: urgent }, { questionKey: "threats_or_violence", value: false }, { questionKey: "notice_received", value: true }] } });
  await request(`/intakes/${intake.id}/summarize`, { method: "POST", token: session.accessToken });
  return request(`/intakes/${intake.id}/confirm`, { method: "POST", token: session.accessToken, body: { summaryConfirmed: true, consentAccepted: true, consentVersion: "test-consent-v1" } });
}

const suffix = String(Date.now()).slice(-8);
const client = await verifiedClient(`+23480${suffix}`, `client-${suffix}@lex.test`);
const lagos = await completedIntake(client, { role: "tenant", stateCode: "LA" });
assert(lagos.matter.state === "MATCHING", "Lagos intake should enter matching");
assert(lagos.matter.matches.length >= 3 && lagos.matter.matches.length <= 5, "shortlist must contain 3-5 lawyers");
assert(!lagos.matter.matches.some((match) => /Rejected|Expired|Unavailable/u.test(match.lawyer.displayName)), "ineligible lawyers must never enter the shortlist");

const selectedMatch = lagos.matter.matches[0];
const lawyerEmails = { "Amina Yusuf": "amina@lex.test", "Chidi Okafor": "chidi@lex.test", "Tola Adeyemi": "tola@lex.test", "Bisi Johnson": "bisi@lex.test", "Musa Ibrahim": "musa@lex.test" };
await request(`/matters/${lagos.matter.id}/matches/${selectedMatch.lawyer.id}/select`, { method: "POST", token: client.accessToken });
let state = await request(`/matters/${lagos.matter.id}`, { token: client.accessToken }); assert(state.state === "CONFLICT_REVIEW", "selection must enter conflict review before payment");
const lawyer = await staffSession(lawyerEmails[selectedMatch.lawyer.displayName]);
await request(`/lawyer/matters/${lagos.matter.id}/conflict`, { method: "POST", token: lawyer.accessToken, body: { decision: "accepted", reasonCode: "clear" } });
state = await request(`/matters/${lagos.matter.id}`, { token: client.accessToken }); assert(state.state === "AWAITING_PAYMENT", "accepted conflict check should unlock payment");

const payment = await request("/payments/initialize", { method: "POST", token: client.accessToken, body: { matterId: lagos.matter.id, provider: "paystack", callbackUrl: "lex://payment-result" } });
const verified = await request(`/payments/${payment.id}/verify`, { method: "POST", token: client.accessToken });
assert(verified.status === "SUCCESSFUL", "Paystack local test verification should succeed");
assert(verified.split.platformAmountMinor === 200_000 && verified.split.lawyerAmountMinor === 800_000, "NGN 10,000 must snapshot the 20/80 split");
state = await request(`/matters/${lagos.matter.id}`, { token: client.accessToken }); assert(state.state === "ACTIVE" && state.slaStartedAt && state.dueAt, "verified payment and complete information must start the SLA");

await request(`/lawyer/matters/${lagos.matter.id}/assessment/draft`, { method: "POST", token: lawyer.accessToken, body: { instructions: "Organize a conservative draft from confirmed facts." } });
await request(`/lawyer/matters/${lagos.matter.id}/assessment/deliver`, { method: "POST", token: lawyer.accessToken, body: { title: "Lawyer-reviewed tenancy assessment", body: "This assessment is based only on the confirmed facts supplied by the client. The lawyer has reviewed the intake, considered the stated tenancy issue, and recommends preserving all notices and payment records while following the practical next steps below. This private test document does not guarantee an outcome.", limitations: "This limited assessment does not include court representation, filing, negotiation, emergency response, or facts not supplied and confirmed by the client.", nextSteps: ["Preserve the tenancy agreement and notices", "Keep proof of payment", "Seek tailored representation if the dispute escalates"], lawyerAttestation: true } });
state = await request(`/matters/${lagos.matter.id}`, { token: client.accessToken }); assert(state.state === "DELIVERED" && state.assessments[0].lawyerAttestedAt, "only lawyer-attested output should be delivered");

const webhookPayload = { id: `smoke-${suffix}`, event: "charge.success", data: { reference: payment.providerReference } };
const firstWebhook = await request("/webhooks/paystack", { method: "POST", body: webhookPayload }); const replay = await request("/webhooks/paystack", { method: "POST", body: webhookPayload });
assert(firstWebhook.received && replay.duplicate, "replayed payment webhook must be idempotent");

const refund = await request(`/payments/matters/${lagos.matter.id}/refund-request`, { method: "POST", token: client.accessToken, body: { reason: "smoke_test_failed_delivery_choice" } });
const admin = await staffSession("admin@lex.test");
await request(`/admin/refunds/${refund.id}/process`, { method: "POST", token: admin.accessToken });
state = await request(`/matters/${lagos.matter.id}`, { token: client.accessToken }); assert(state.state === "REFUNDED", "full local test refund should close the payment state");

const fallbackMatter = await completedIntake(client, { role: "landlord", stateCode: "LA", language: "ha" });
const fallbackMatch = fallbackMatter.matter.matches.find((match) => match.lawyer.displayName !== selectedMatch.lawyer.displayName) ?? fallbackMatter.matter.matches[0];
assert(fallbackMatch, "Flutterwave test matter requires an eligible lawyer");
await request(`/matters/${fallbackMatter.matter.id}/matches/${fallbackMatch.lawyer.id}/select`, { method: "POST", token: client.accessToken });
const fallbackLawyer = await staffSession(lawyerEmails[fallbackMatch.lawyer.displayName]);
await request(`/lawyer/matters/${fallbackMatter.matter.id}/conflict`, { method: "POST", token: fallbackLawyer.accessToken, body: { decision: "accepted", reasonCode: "clear" } });
const fallbackPayment = await request("/payments/initialize", { method: "POST", token: client.accessToken, body: { matterId: fallbackMatter.matter.id, provider: "flutterwave", callbackUrl: "lex://payment-result" } });
const fallbackVerified = await request(`/payments/${fallbackPayment.id}/verify`, { method: "POST", token: client.accessToken });
assert(fallbackVerified.status === "SUCCESSFUL" && fallbackVerified.split.platformAmountMinor === 200_000, "Flutterwave fallback must verify the same payment contract");
const flutterPayload = { id: `flutter-${suffix}`, event: "payment.completed", data: { tx_ref: fallbackPayment.providerReference } };
await request("/webhooks/flutterwave", { method: "POST", body: flutterPayload });
const flutterReplay = await request("/webhooks/flutterwave", { method: "POST", body: flutterPayload });
assert(flutterReplay.duplicate, "replayed Flutterwave webhook must be idempotent");

const outsideLagos = await completedIntake(client, { role: "landlord", stateCode: "FC", language: "pcm" });
assert(outsideLagos.matter.state === "INTAKE_ONLY" && outsideLagos.matter.matches.length === 0, "non-Lagos intake must not match or sell a service");

const otherClient = await otpSession("whatsapp", `+23481${suffix}`);
await request(`/matters/${lagos.matter.id}`, { token: otherClient.accessToken, expected: 403 });

const applicants = await request("/admin/lawyers?status=pending", { token: admin.accessToken }); assert(applicants.length >= 50, "seed should contain at least 50 pending applicants");
const health = await fetch("http://localhost:4000/health").then((response) => response.json()); assert(health.status === "ok", "health endpoint should report ok");

console.log(JSON.stringify({ status: "passed", matter: lagos.matter.reference, shortlist: lagos.matter.matches.length, paystack: "verified", flutterwave: "verified", split: "20/80", refund: "successful", webhookReplay: "blocked", nonLagos: "intake_only", pendingApplicants: applicants.length, providers: health.providers }, null, 2));
