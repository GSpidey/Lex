# Lex

Lex is a Nigeria-first managed legal-access platform designed for country-by-country expansion. It guides adult tenants and landlords from structured intake through evidence, verified-lawyer matching, conflict review, sandbox payment, lawyer-reviewed assessment, and resolution. It is not a lawyer directory and it does not provide autonomous legal advice.

## Current delivery target

The controlled pilot is Android-first, Lagos-only for paid service, and supports English and reviewed Pidgin. Nationwide Nigerian intake remains available, but non-Lagos matters stop at an intake-only waitlist.

The active staging direction is Cloudflare-native:

- Hono Workers for `/v1` API and provider webhooks.
- D1 with Drizzle-compatible portable SQL.
- Private EU-restricted R2 for synthetic evidence.
- Queues plus Cron Triggers for background and SLA work.
- A static lawyer/operations web workspace on Workers Static Assets.
- `workers.dev` addresses until a dedicated Lex domain is approved.

The existing NestJS/PostgreSQL/Redis/MinIO implementation remains in the repository as a production-portability fallback until Cloudflare behavior parity is proven. No existing Cloudflare project, domain, Worker, database, queue, or bucket may be reused.

## Pilot guardrails

- WhatsApp is limited initially to OTP, recovery/status notices, information requests, and assessment-ready links. Full conversational WhatsApp intake is deferred.
- English is the authoritative lawyer-facing legal record. Pidgin supports client intake and confirmation.
- AI may assist intake, transcription, extraction, summarization, classification, drafting, and routing. Only a lawyer can approve or deliver a legal assessment.
- The NGN 10,000 price and 20/80 split are sandbox configuration only pending lawyer-co-founder approval.
- Staging uses synthetic data only. Real clients, production money, and public legal claims are prohibited.
- Until Meta OTP is configured, staging client access is limited to the synthetic number `+2348000000001` and a six-digit code held only as a Cloudflare secret. This bypass is unavailable for lawyer/admin roles and must be disabled before production.
- Start on the Cloudflare Workers Free plan. Any paid feature or upgrade requires the user's approval.

## Project documents

- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) - durable product context and legal/technical guardrails.
- [docs/MVP_PLAN.md](docs/MVP_PLAN.md) - controlled-pilot implementation plan.
- [docs/DECISIONS.md](docs/DECISIONS.md) - locked decisions and approval gates.
- [docs/DELIVERY_STATUS.md](docs/DELIVERY_STATUS.md) - evidence-based implementation status.
- [docs/DEFERRED_ROADMAP.md](docs/DEFERRED_ROADMAP.md) - explicitly deferred work.
- [docs/D1_POSTGRES_PORTABILITY.md](docs/D1_POSTGRES_PORTABILITY.md) - database portability contract.
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md) - verification record and external-test boundaries.
- [AGENTS.md](AGENTS.md) - scope and continuity instructions.

## Local development

Prerequisites are Node.js 24+, pnpm 11+, Java 17+, and Android SDK. Docker remains optional for the fallback server architecture and is not required for Cloudflare staging.

```powershell
pnpm.cmd install
pnpm.cmd cf:types
pnpm.cmd cf:db:local
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd cf:dry-run
```

The isolated Workers/D1/R2/Queues staging foundation is deployed and the staging Gradle APK has been installed on a physical Android device. The client sign-in page defaults to Nigeria and includes a multi-country calling-code selector. Provider-backed WhatsApp, AI, payment, push, and email tests remain gated by test credentials. See `docs/TEST_REPORT.md` for exact evidence and limitations.

Never place secrets in source, environment examples, APKs, logs, or browser-visible configuration.
