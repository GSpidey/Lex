# Codex Working Instructions

## Scope boundary

`C:\Users\ahmed\Applications\Lex` is the complete project scope. Do not inspect, edit, move, initialize, delete, or otherwise modify its parent directory, sibling folders, or unrelated projects unless the user explicitly expands the scope.

## Session startup

Before proposing or making project changes, read:

1. `README.md`
2. `PROJECT_CONTEXT.md`
3. `docs/MVP_PLAN.md`
4. `docs/DECISIONS.md`

Inspect the current project state and preserve existing work. State clearly when a result has not been tested or verified.

## Product guardrails

- Nigeria is the first launch jurisdiction; global expansion is country-by-country.
- Keep reusable platform services separate from jurisdiction-specific legal rules and workflows.
- Build a managed legal-access workflow, not just a lawyer directory.
- Keep the initial MVP narrow and controlled.
- Restrict initial AI use to intake, summarization, classification, drafting support, routing, and approved operational assistance.
- Do not implement unsupervised high-risk legal advice or imply lawyer review that did not occur.
- Do not assume a percentage commission, referral, fee-sharing, payment, or client-money model is legally acceptable.
- Require lawyer co-founder approval for legal workflows, templates, claims, disclosures, escalation rules, and commercial structures with professional-conduct implications.

## Current implementation state

Implementation follows the Cloudflare controlled-pilot plan in `docs/MVP_PLAN.md`. The active synthetic staging runtime uses only newly created `lex-staging-*` Workers, D1, R2, Queues, and Cron resources. Never reuse or change a pre-existing Cloudflare resource.

The pilot is Android-first, Lagos service-only, and English/Pidgin. WhatsApp is limited to OTP and status continuity until the deferred conversational phase. The legacy NestJS/PostgreSQL/Redis/MinIO code remains a portability fallback.

Consult `docs/DELIVERY_STATUS.md` and `docs/TEST_REPORT.md` before claiming completion. Keep provider calls in sandbox/test environments until credentials and public-launch approvals are explicitly supplied.
