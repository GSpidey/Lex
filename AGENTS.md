# Codex Working Instructions

## Scope boundary

`C:\Users\ahmed\Applications\Lex` is the complete project scope. Never inspect, edit, move, initialize, delete, or modify its parent, siblings, unrelated projects, or non-Lex Cloudflare resources.

## Session startup

Read `README.md`, `PROJECT_CONTEXT.md`, `docs/MVP_PLAN.md`, `docs/DECISIONS.md`, `docs/DELIVERY_STATUS.md`, and `docs/TEST_REPORT.md`. Verify the current path and working tree before edits. Preserve unrelated user changes and distinguish implementation from verification.

## Current product contract

- Nationwide full-spectrum Nigerian legal access for adult individuals, safeguarded minors, and approved organizations.
- Tenancy is one migrated service module, not the product identity.
- Reusable global services are separated from versioned jurisdiction/service legal content.
- Matching is eligibility-based and approval-controlled; no bidding, bought ranking, or unverified public listing.
- Urgent, safeguarding, unsupported-coverage, and low-confidence cases route to human operations.
- AI supports intake, transcription, extraction, summarization, translation, routing, and lawyer drafting only. It never provides unsupervised legal advice or lawyer attestation.
- Consultation supports scheduled in-app live text, secure messages, voice notes, and evidence; native audio/video calls are out of scope.
- Representation tracking is a separate accepted engagement. Lex does not calculate legal deadlines, file, appear, guarantee outcomes, or claim to hold client money.
- All price/split behavior is sandbox-only pending lawyer-co-founder approval.

## Staging boundary

Use only isolated `lex-staging-*` Cloudflare resources. Existing unrelated Workers, domains, buckets, databases, queues, and servers remain untouched. Provider calls stay in test environments. Never weaken security to meet a Free-plan limit; request approval for an upgrade if measurements require it.
