# Lex

Lex is a Nigeria-first managed legal-access platform designed for country-by-country expansion.

The system guides a client from plain-language problem intake through evidence collection, verified lawyer selection, conflict review, payment, service delivery, progress tracking, and resolution. It is not merely a lawyer directory.

## Current status

The approved Nigeria-first MVP is implemented as a local test system: an Expo Android/iOS client, a responsive lawyer/admin workspace, a NestJS API and worker, PostgreSQL, Redis/BullMQ, private S3-compatible storage, and provider adapters for Meta WhatsApp, OpenAI, Paystack, and Flutterwave.

The first service-enabled jurisdiction is Lagos. Nationwide intake remains available, while unsupported states stop at an intake-only waitlist.

## Product principles

- Launch in Nigeria first while keeping the platform reusable across jurisdictions.
- Separate global platform services from country- and state-specific legal rules.
- Keep qualified lawyers responsible for legal judgment and client representation.
- Use AI only for structured intake, transcription, summarization, classification, drafting support, and routing.
- Do not provide unsupervised high-risk legal advice or imply lawyer review that did not occur.
- Treat privacy, consent, security, auditability, and professional ethics as product requirements.

## Project documents

- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) - durable product context and guardrails.
- [docs/MVP_PLAN.md](docs/MVP_PLAN.md) - approved implementation plan.
- [docs/DECISIONS.md](docs/DECISIONS.md) - locked product decisions and external prerequisites.
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md) - verified behavior and explicit external-test boundaries.
- [AGENTS.md](AGENTS.md) - scope and continuity instructions for future Codex sessions.

## Development

Prerequisites: Node.js 24+, pnpm 11+, Docker, Java 17+, and the Android SDK.

```powershell
pnpm.cmd install
Copy-Item .env.example .env
pnpm.cmd infra:up
pnpm.cmd db:migrate
pnpm.cmd db:seed
pnpm.cmd build
pnpm.cmd smoke
```

Run individual built services with `pnpm.cmd --filter @lex/api start`, `pnpm.cmd --filter @lex/worker start`, and `pnpm.cmd --filter @lex/web start`. Provider integrations remain in local fallback or sandbox/test mode. The lawyer co-founder's review remains the public-launch approval gate for legal workflows, templates, claims, pricing structure, commission handling, and AI behavior.
