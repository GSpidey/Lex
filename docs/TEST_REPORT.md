# Lex Controlled-Pilot Verification Report

Date: 2026-08-09
Environment: isolated Cloudflare staging plus local Windows/physical Android testing; synthetic data only.

## Verified

- Work remained inside `C:\Users\ahmed\Applications\Lex`; no sibling project or pre-existing Cloudflare resource was modified or reused.
- New deployments are live at `lex-staging-api.wispy-silence-1cb0.workers.dev`, `lex-staging-jobs.wispy-silence-1cb0.workers.dev`, and `lex-staging-web.wispy-silence-1cb0.workers.dev`.
- New EU D1 `lex-staging-db` has 28 tables after two Wrangler migrations and a synthetic tenant/landlord seed. Migrations also apply from empty locally.
- New private EU R2 `lex-staging-private-eu` is empty and has no public development URL. An accidental, newly-created empty global bucket namespace was detected and removed; the intended EU bucket was retained and rebound explicitly with `jurisdiction = eu`.
- New `lex-staging-jobs`, `lex-staging-notifications`, and `lex-staging-dead-letter` queues are attached to consumers, bounded retries, and a five-minute maintenance Cron.
- Generated Wrangler bindings, strict TypeScript checks, three Worker/D1 integration tests, seven existing domain/provider tests, static web production build, and all three deployment dry-runs pass.
- API health and OpenAPI return HTTP 200 remotely; web returns HTTP 200 with security policy headers and exact-origin CORS.
- Representative deployed startup time reported 27-52 ms for the API and 4-5 ms for jobs. The Free plan rejected a paid-only explicit CPU limit, so no plan upgrade was made and platform defaults remain enforced.
- A fresh Gradle `assembleRelease` APK (98,728,676 bytes; SHA-256 `56682DD0FB4F960E9B10CFE72F57AEE695D9D8370239AD8BF38488CC83212CB2`) was installed on device `R3CW70E87KD`.
- Android confirmed `com.lexnigeria.test.MainActivity` in the foreground. The rendered staging screen was visually checked without Metro or a development server.

## Still gated

- Meta WhatsApp test-number OTP and status delivery require Meta test credentials and an approved authentication template. The API currently returns an explicit unavailable response instead of simulating delivery.
- OpenAI transcription/extraction, Paystack/Flutterwave sandbox settlement/refunds, push delivery, and email require their test credentials.
- Remote R2 matter-access, queue failure/replay, payment-webhook replay, and an isolated D1 Time Travel restore drill remain to be exercised.
- Pidgin legal copy, seeded legal workflows, pricing, commission treatment, disclosures, and public claims require recorded lawyer-co-founder review.
- The current Android release uses local test signing. Production signing, iOS signing, a custom domain, production credentials, and public distribution are intentionally absent.

## Safety boundary

This proves a deployed synthetic staging foundation and a physical-device client artifact. It does not establish provider-account readiness, legal approval, production security accreditation, or pilot readiness with real clients or money.
