# Lex Controlled-Pilot Verification Report

Date: 2026-08-09
Environment: isolated Cloudflare staging plus local Windows/physical Android testing; synthetic data only.

## Verified

- Work remained inside `C:\Users\ahmed\Applications\Lex`; no sibling project or pre-existing Cloudflare resource was modified or reused.
- New deployments are live at `lex-staging-api.wispy-silence-1cb0.workers.dev`, `lex-staging-jobs.wispy-silence-1cb0.workers.dev`, and `lex-staging-web.wispy-silence-1cb0.workers.dev`.
- New EU D1 `lex-staging-db` has 28 tables after two Wrangler migrations and a synthetic tenant/landlord seed. Migrations also apply from empty locally.
- New private EU R2 `lex-staging-private-eu` is empty and has no public development URL. An accidental, newly-created empty global bucket namespace was detected and removed; the intended EU bucket was retained and rebound explicitly with `jurisdiction = eu`.
- New `lex-staging-jobs`, `lex-staging-notifications`, and `lex-staging-dead-letter` queues are attached to consumers, bounded retries, and a five-minute maintenance Cron.
- Generated Wrangler bindings, strict TypeScript checks, four Worker/D1 integration tests, seven existing domain/provider tests, static web production build, and all three deployment dry-runs pass.
- API health and OpenAPI return HTTP 200 remotely; web returns HTTP 200 with security policy headers and exact-origin CORS.
- The controlled staging number `+2348000000001` completed request and verification against the live Worker and returned a client session. A different number returned HTTP 503 because Meta is not configured. The six-digit test code exists only as the `STAGING_TEST_OTP_CODE` Worker secret and the normal five-attempt, expiry, supersession, destination, IP, and device controls still apply.
- The Android sign-in interface defaults to Nigeria and provides a country/calling-code selector for Nigeria, Ghana, Kenya, South Africa, Uganda, Rwanda, the United Kingdom, the United States/Canada, the United Arab Emirates, and India.
- Representative deployed startup time reported 27-52 ms for the API and 4-5 ms for jobs. The Free plan rejected a paid-only explicit CPU limit, so no plan upgrade was made and platform defaults remain enforced.
- A fresh Gradle `assembleRelease --no-parallel` APK (98,732,152 bytes; SHA-256 `C02C61187A3F5CB1AA9A984248859D0D052B88F7B41BA722381DC12F050AB9A8`) was installed on device `R3CW70E87KD`. Serial assembly avoided a transient parallel CMake collision in Reanimated; the isolated failed task and full serial build both passed.
- Android confirmed `com.lexnigeria.test.MainActivity` in the foreground. The rendered country selector and all ten choices were checked, the controlled OTP was entered, and the authenticated client home screen was reached without Metro or a development server.

## Still gated

- Real Meta WhatsApp test-number OTP and status delivery require Meta test credentials and an approved authentication template. Only the exact synthetic staging client number bypasses delivery; every other number returns an explicit unavailable response.
- The OpenAI secret is configured on both Lex staging Workers, but the account currently has no credit. No billed request has been made; transcription remains provider-unverified. Intake extraction/drafting still requires implementation beyond the credential.
- Paystack/Flutterwave sandbox settlement/refunds, push delivery, and email require their test credentials.
- Remote R2 matter-access, queue failure/replay, payment-webhook replay, and an isolated D1 Time Travel restore drill remain to be exercised.
- Pidgin legal copy, seeded legal workflows, pricing, commission treatment, disclosures, and public claims require recorded lawyer-co-founder review.
- The current Android release uses local test signing. Production signing, iOS signing, a custom domain, production credentials, and public distribution are intentionally absent.

## Safety boundary

This proves a deployed synthetic staging foundation and a physical-device client artifact. The controlled login is a temporary staging aid, not a substitute for WhatsApp verification, and must be disabled before any production build. It does not establish provider-account readiness, legal approval, production security accreditation, or pilot readiness with real clients or money.
