# Lex UX, Roles, AI and Legal-Centre Verification Report

## 2026-10-13 production preparation increment

Implementation: 20 substantive review drafts, private intercompany document, immutable review packets/events, recipient-bound single-use invitations, explicit MFA/typed-name approval, distinct-owner publication, public effective-policy routes, append-only consent history, responsive review UI and approved icon concept 2 exports. Default internal Android signing is retained; store/production artifacts require private signing inputs.

Local evidence: API integration tests include account-scoped MFA throttling, owner isolation, invitation expiry/rotation/replay, explicit approval, content immutability, unresolved-field publication refusal, effective-version selection and consent history. API/jobs/mobile TypeScript checks and the Next.js static build are exercised separately. Current runtime tests fall back to 2026-03-10; that does not prove exact production-runtime parity.

Wrangler 4.120.0 deploy dry-runs pass. API startup profiling is blocked because its installed profiler runtime supports 2026-08-08, one day older than the configured compatibility date. A Wrangler update encountered repeated package-registry download failures; the attempted dependency lock changes were reverted without changing application behavior. No startup-time/Free-plan CPU claim is made.

Remote changes are deployed in order: additive migration 0005 using a scoped migration directory; new API protecting private drafts; migration 0006 inserting the substantive drafts; jobs and web. This avoids exposing the private intercompany draft through the legacy endpoint during rollout. Recovery bookmark captured before rollout: `000048d1-00000000-00005103-fa198ec0284053ac734652ed9c803f47`. A bookmark is not a completed restore drill.

Still outstanding: Node/PostgreSQL Docker parity and migration rehearsal, malware scanning/backups/restore drills, actual provider/payment/email/push tests, lawyer/native-language approval, final company contact/retention/commercial schedules, signed store artifacts and physical-device acceptance. No email, legal approval, Apple conversion or store upload is represented as completed.

Deployment and native-resource results are recorded below after execution.

Date: 2026-08-11
Scope: `C:\Users\ahmed\Applications\Lex` only; synthetic data only.

## Experience increment evidence

- Full monorepo TypeScript check passed across 12 packages. The full test run passed: 8 Cloudflare API integration tests, 2 contract state-machine tests, 3 jurisdiction tests, 1 realtime Worker test and 2 legacy payment-provider unit tests; packages without test files exited successfully.
- Wrangler generated binding types and deploy dry-runs pass. Final dry-run sizes are API 598.39 KiB (136.12 KiB gzip), jobs 35.86 KiB (11.07 KiB gzip), realtime 3.42 KiB (1.51 KiB gzip), plus static web assets.
- Next.js static production build passes. Native Expo Android and iOS exports pass independently; the mobile project intentionally does not install `react-native-web` because the web workspace is separate.
- Additive D1 migration 0004 applies from empty locally and is live remotely. D1 reports no pending migrations. Pre-migration Time Travel bookmark: `000001c9-00000000-000050c4-de6e847a8fa41f17660be9cffe3d977b`.
- Remote founder bootstrap confirms `Primary owner` has only Client and Owner, while `Partner owner-lawyer` has only Owner and Lawyer. Both remain MFA-unenrolled until first privileged sign-in; the partner remains unavailable for matching until professional evidence, expiry and payout gates are complete.
- A real synthetic guided-intake request completed through OpenAI model `gpt-5.6-terra` with prompt `guided-intake-v1`, schema `guided-intake-output-v1`, 1,787 ms latency and recorded token usage. This proves guided intake only, not voice transcription.
- Deployed versions: API `5ee727df-e344-4312-8204-6aa65407ab7a`, jobs `b9091ce7-e1fb-450d-9e14-49b0e9a8baba`, web `32bacb02-e7d6-4114-9c90-80ce349f20cf`; realtime remains the previously verified deployment because it was unchanged.
- The live web login accepts country-specific national numbers, with Nigeria as the default and explicit Canada (`+1`) and United Kingdom (`+44`) options. Founder-number examples were removed and replaced with generic instructions. The web Worker now proxies relative API and realtime paths through service bindings, preventing static production builds from embedding `localhost`; the web build now fails if a local, emulator or reserved-invalid endpoint is present. A live synthetic OTP request reached `Check WhatsApp` with zero browser errors.
- Founder-login regression: the API now recognizes only bootstrap-audited founders in addition to the generic test identity. A real request using the primary founder's authorized number issued an active Client session with `client,owner` assignments; the verification session was then revoked. The privileged Owner role still requires MFA.
- Channel-aware founder authorization is covered by regression tests: mobile defaults the primary founder to Client, while the web workspace returns MFA setup/verification before activating the default Owner role. The web production build and remote HTTP health check pass.
- Remote `/v1/health` reports `ok` with D1 reachable, and the staging web workspace returns HTTP 200.
- Gradle APK 0.3.0 (version code 3) is 98,777,656 bytes with SHA-256 `446DDDDF13458D329C0CD65C0471164EAD794F60AFBA8EFBB1621F37201FBDB7`. It installed over the prior build on Android device `R3CW70E87KD`, cold-launched without Metro, became the top resumed activity and was visually inspected. The initial screenshot exposed an invisible Ask Lex outline; contrast was fixed, rebuilt and reverified.

## Nationwide baseline evidence retained

- Branch: `agent/full-spectrum-legal-access`, preserving `master` as the tenancy migration baseline.
- Additive D1 migration 0003 applies from empty locally and seeds 52 practice areas, versioned services and nationwide synthetic coverage while retaining tenancy identifiers.
- Direct strict TypeScript checks pass for contracts, jurisdictions, legacy API fallback, Cloudflare API/jobs/realtime, mobile and web at the latest recorded run.
- Contract/jurisdiction tests pass. Cloudflare Worker/D1 integration tests pass for health, single-use controlled OTP, non-bypass numbers, 52-area search, nationwide Hausa intake and protected minor-data gating.
- Realtime Worker health test passes. A full Durable Object socket test remains required against deployed service bindings.
- Current API implements general intake/matching, protected accounts, consultation, representation, direct-split payment snapshots, typed WhatsApp intake and versioned content controls.
- Current app/workspace builds type-check with the general catalogue and end-to-end user controls.
- Migration 0003 remains applied beneath additive migration 0004. Its nationwide catalogue and tenancy-backfill verification evidence is preserved.

## Prior isolated staging evidence retained

The existing Lex-only API/jobs/web Workers, EU D1, private EU R2 and three queues were previously deployed and health-checked. The prior tenancy APK was installed and reached the controlled staging login on Android device `R3CW70E87KD`. That evidence proves the baseline infrastructure, not the current nationwide release.

## Outstanding verification

- Exercise authenticated realtime sockets, queue retry/DLQ, provider webhook replay and isolated D1 Time Travel recovery remotely.
- Provider-level Meta, Paystack, Flutterwave, Postmark and Expo tests still need credentials. OpenAI transcription needs a real audio test. No emulator or mock is reported as provider verification.
- Complete the authenticated provider-backed journey on the installed APK after Meta/payment credentials are available. The existing server-held controlled OTP differed from the local test value; one remote attempt was rejected and was not retried.
- Run accessibility/security/dependency checks and save the final consolidated evidence.
- Obtain lawyer-co-founder and native-language/privacy approvals before any real-client or public use.

## Safety boundary

Nothing here establishes legal approval, provider readiness, production security accreditation or permission to use real matters or money. The 20/80 split, all legal text and all language copy remain synthetic test inputs.
