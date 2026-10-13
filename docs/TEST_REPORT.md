# Lex UX, Roles, AI and Legal-Centre Verification Report

## 2026-10-13 Docker foundation and consent continuation

Scope remains the Lex repository, the new `lex-docker` Compose project and existing isolated Lex staging Workers only. No client endpoint cutover, legal publication, partner signature, production money, APK/AAB assembly or store upload occurred.

- API integration: 19 passing tests (9 retained journeys, 10 legal/security tests). Added account-wide optional withdrawal across channels and policy versions, a network-disabled queued AI fallback check, notification-preference withdrawal and retained authenticated/in-app access. These are local tests, not actual provider evidence. The installed test runtime falls back to compatibility date 2026-03-10.
- Shared core and Node: four unit tests pass. PostgreSQL has nine real-database contract checks: migration rerun, stable IDs, effective versions, draft/private/future isolation, language isolation, immutable content, no deletion/unpublication and transaction rollback. All test records roll back; existing data is not reset.
- Strict TypeScript checks pass for API, jobs, mobile, web, Node and the shared core. Next.js static production build and endpoint scan pass. Worker dry-runs pass; exact deployment results are recorded below after rollout.
- Local Docker runs PostgreSQL 17 and the production-built Node 24/Hono read-only slice. `/v1/health` is reachable on `127.0.0.1:4180`, reports healthy and explicitly `cutoverReady: false`. Only catalogue and public-policy functionality has been ported. API runs as UID 1000 with read-only filesystem; the database password is a secret file, not a password environment value.
- Encrypted backup `lex-2026-10-13T19-29-11.630Z-dcd28f23.pgdump.aesgcm` was authenticated and restored to isolated `lex_test_restore_bf23563b5ea3b053`. Receipt at 2026-10-13T19:29:27.688Z records one migration and zero users/documents/versions. The restore database is retained. This proves the new foundation's encrypted backup mechanism, **not** full source-data or document recovery.
- Public policies are now accessible before mobile sign-in; signed-in mobile/web choices use the append-only ledger. Ask Lex requests a deliberate choice before external processing. AI withdrawal stops future optional provider work and preserves deterministic typed intake; notification withdrawal preserves authentication/in-app access. Re-consent does not silently restore old AI conversations or revoked push devices. Existing contextual staging consent remains where no formal decision exists; required service/engagement agreements remain separate work.
- No real provider calls were used to test withdrawal. The owner created a new Postmark account during this continuation; its new default server was named `Lex Staging` (21111756), retaining disabled open/link tracking. Provider test mode restricts sending to verified domains and 100 messages. Sender/account confirmation, server-token installation and delivery testing are separate pending steps. A truthful low-volume transactional approval request is prepared, not yet submitted; no review email was sent and no plan upgrade was selected.

Deployment evidence:

- Current API `ff906b85-5274-476f-9824-2922c187692f`, jobs `76308597-2642-4da6-9dcd-670637e18952`, web `7f14c8ca-2971-4925-99ca-9073465006b7`. Reported startup times 94 ms / 2 ms / 1 ms are not per-request CPU measurements. No D1 migration was needed for this continuation.
- Same-origin deployed health is healthy/staging with D1 reachable. Both deployed Cloudflare and local Docker return the same 52-area catalogue (JSON parity checked). Public policies expose zero unpublished drafts; anonymous consent-history requests return 401. Unmigrated Docker auth returns the expected 501, without forwarding to staging.
- Latest Docker image rebuild completed and both API/PostgreSQL containers are healthy; PostgreSQL contract checks passed again inside the rebuilt API container. Local API remains loopback-only.
- The first manual endpoint-validator invocation used the wrong script path and failed; the actual checked-in `scripts/validate-web-endpoints.mjs` was then run against `apps/web/out` and passed. Docker build dependency downloads needed retries; the final build succeeded. Neither warning was treated as successful verification before retry.

Remaining: complete authenticated Node repositories/services, separate least-privilege application database role, web/Redis/queue/S3/scanner/realtime Compose services, versioned D1/R2 exports/imports, nonempty full-graph restore and rollback, external HTTPS, provider tests, legal/translation approval and physical-device acceptance. Queue delivery/conversation result idempotency needs a dedicated concurrency/replay audit before full migration acceptance. Local unit/health checks do not establish those results.

## 2026-10-13 production preparation increment

Implementation: 20 substantive review drafts, private intercompany document, immutable review packets/events, recipient-bound single-use invitations, explicit MFA/typed-name approval, distinct-owner publication, public effective-policy routes, append-only consent history, responsive review UI and approved icon concept 2 exports. Default internal Android signing is retained; store/production artifacts require private signing inputs.

Local evidence: API integration tests include account-scoped MFA throttling, owner isolation, invitation expiry/rotation/replay, explicit approval, content immutability, unresolved-field publication refusal, effective-version selection and consent history. API/jobs/mobile TypeScript checks and the Next.js static build are exercised separately. Current runtime tests fall back to 2026-03-10; that does not prove exact production-runtime parity.

Wrangler 4.120.0 deploy dry-runs pass. API startup profiling is blocked because its installed profiler runtime supports 2026-08-08, one day older than the configured compatibility date. A Wrangler update encountered repeated package-registry download failures; the attempted dependency lock changes were reverted without changing application behavior. No startup-time/Free-plan CPU claim is made.

Remote changes are deployed in order: additive migration 0005 using a scoped migration directory; new API protecting private drafts; migration 0006 inserting the substantive drafts; jobs and web. This avoids exposing the private intercompany draft through the legacy endpoint during rollout. Recovery bookmark captured before rollout: `000048d1-00000000-00005103-fa198ec0284053ac734652ed9c803f47`. A bookmark is not a completed restore drill.

Still outstanding: Node/PostgreSQL Docker parity and migration rehearsal, malware scanning/backups/restore drills, actual provider/payment/email/push tests, lawyer/native-language approval, final company contact/retention/commercial schedules, signed store artifacts and physical-device acceptance. No email, legal approval, Apple conversion or store upload is represented as completed.

The append-only legal-acceptance API is implemented and tested, but document-specific acceptance is not yet wired into every required client/engagement entry point. Optional-processing withdrawal must also be verified against the affected AI/notification operations, not only against the new ledger. Full authenticated browser review and real-recipient delivery remain separate acceptance work.

Completed deployment and verification:

- Commit `8b823f9` pushed to the existing full-spectrum branch and draft PR. No unrelated repository or Cloudflare resource was changed.
- All 17 API integration tests pass (9 existing journeys, 8 legal/security tests). API, jobs, mobile and web TypeScript checks pass; static web production build and endpoint scan pass. Test fixtures are synthetic, not a real partner signature.
- D1 migrations 0005 and 0006 applied in the two-step order above, with no pending migrations. Remote checks find 20 documents, 20 hashed version-2 drafts, one owner-only document, zero recorded approvals. Existing users/matters were not migrated or replaced.
- Deployed API version `b1acf1ae-6911-4c81-a8b8-3182e733d881`, jobs `5303938e-b567-4cb3-bb0e-3d0c76f2fa61`, web `1da6d604-abe3-4e04-9fab-fe266b2f2e90`. Cloudflare reported startup times of 53 ms, 2 ms and 2 ms respectively. These are startup measurements, not per-request CPU or complete load-testing evidence.
- Final web revision `acbf92a4-cd71-4479-8e6f-b5635027be60` preserves a reviewer's unsent comment when renewing MFA. Its rebuilt static export/typecheck passed and Cloudflare reported 3 ms startup.
- Live same-origin health is healthy/staging. Public policies return no unpublished drafts; anonymous private-review access returns 401. The deployed public Legal Centre and authenticated-review entry render correctly in the internal browser. Authenticated real-owner signing was not performed or bypassed.
- Expo public configuration validates. Android `:app:processReleaseResources` passes, including the approved adaptive icon resources and JS/assets bundle. The first offline attempt needed an uncached Gradle plugin; the normal online retry succeeded. No new APK/AAB was assembled, signed, installed or submitted. No iOS build/upload occurred.
- The Postmark secret-name check confirms no server token on the jobs Worker. Review invitation email was not sent. The recipient-bound private invitation-link alternative is locally tested and deployed; sending it manually remains an owner action.

Browser paths: `/legal/`, `/legal/review/`, `/support/`, `/account-deletion/`. Public-support and privacy contacts still need verified values before these URLs are ready for store submission.

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
