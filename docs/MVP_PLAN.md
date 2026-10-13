# Lex Nationwide Legal Access — Production Preparation

## Approved update — 2026-10-13

This is the continuation of the existing full-spectrum plan, not a replacement product. Golden Epic Limited (Nigeria, RC 1538879) is the proposed platform contracting entity and merchant. GoldenEpic Solutions Inc. (Canada, corporation 1641963-1) provides technology and may publish the apps subject to store eligibility. Responsibilities require an intercompany agreement; no IP transfer or corporate parent/subsidiary relationship is assumed.

The owner confirmed the supplied corporate records are current. The Canadian certificate date is 2024-10-24; the D&B screenshot's 2024-10-23 date must be reconciled. Sensitive source documents, identity details, bank data and credentials must not be committed.

Delivery order:
1. Replace generic policy seeds with substantive, versioned review drafts; implement public effective-policy access, append-only acceptance history, immutable review packets, recipient-bound invitations, MFA decisions and downloadable receipts.
2. Port current Hono behavior into runtime-independent services and Node adapters for PostgreSQL, private S3-compatible storage, BullMQ and consultation WebSockets. Preserve Cloudflare staging until parity, migration and rollback are demonstrated.
3. Run an isolated Lex Docker deployment with health checks, quarantine/malware scanning, secret injection and backup/restore tooling. Local production builds do not imply public availability or verified provider execution.
4. Complete Paystack/Flutterwave, Meta, transactional email, OpenAI and push setup where credentials permit. Request only the missing provider input; no unrelated feature shutdown.
5. Integrate owner-approved conversation/scales icon concept; prepare private Android signing/AAB and iOS release metadata. Prepare Apple Individual-to-organization conversion without submitting an account-wide change.
6. Test cross-runtime authorization, migration integrity, provider failure/replay, policy publication/review, device journeys and restore. Commit and deploy verified scoped increments, recording incomplete work accurately.

Email the partner's already-authorized private address only when a working authenticated review packet and sender exist. A link visit is not approval. Document changes invalidate the packet's approval for publication. Distinct-owner release approval remains required. Corporate, privacy, fee-sharing, store billing and translation review applies to the affected action, not unrelated working functionality.

Domain purchase is owner-operated later; retain temporary Lex URLs. No public release, store upload, new server purchase, production payment or unrelated-resource mutation is authorized by this preparation.

## Product contract

Lex provides nationwide Nigerian intake and synthetic service testing across a granular catalogue of legal practice areas. The common lifecycle is intake, client confirmation, safety review where necessary, eligibility-based matching, lawyer conflict clearance, sandbox payment, consultation, lawyer-attested assessment, and optional separately accepted representation tracking.

## Delivery workstreams

1. Generalize contracts, catalogue, state machines, and legal-content versions while preserving tenancy IDs and behavior.
2. Add adult/minor/guardian/organization context, authority review, safeguarding, and isolation rules.
3. Add nationwide intake, category-specific addenda, confirmed classification, urgent operations routing, and matching assistance.
4. Expand lawyer capabilities by practice area, state, language, consultation capacity, workload, and verified licence expiry.
5. Add consultation scheduling, Durable Object live text coordination, D1-authoritative messages, voice notes, and lawyer assessment delivery.
6. Add separate representation proposals, engagements, milestones, tasks, lawyer-confirmed deadlines, invoices, disputes, refunds, and termination.
7. Generalize Paystack/Flutterwave sandbox payments and immutable allocation snapshots.
8. Complete app/WhatsApp continuity and five-language typed/voice intake; connect Postmark and Expo Push through provider adapters.
9. Rebuild the client home and lawyer/operations workspace around general legal access with no dead navigation.
10. Verify migrations, authorization, idempotency, replay handling, R2 privacy, queues/DLQ, realtime reconnect, provider contracts, accessibility, Gradle APK, and iOS-ready configuration.
11. Add assigned multi-role accounts, complete legal-professional verification, Owner provider diagnostics, Legal Centre drafts and dual-control production gates.
12. Convert the client entry journey to progressive accessible accordions and expose Ask Lex with correction, confirmation, fallback and human review.
13. Prepare internal, TestFlight and production EAS profiles plus iOS privacy/metadata validation without uploading a build.

## Cloudflare staging

Only these isolated resources are in scope: `lex-staging-api`, `lex-staging-jobs`, `lex-staging-web`, new `lex-staging-realtime`, `lex-staging-db`, `lex-staging-private-eu`, and the three existing Lex staging queues. Worker-to-Worker communication uses bindings; D1 is authoritative; R2 stays private; secrets stay in Wrangler secret storage. The Free plan remains the default until measured requirements justify a user-approved upgrade.

## Acceptance rule

A route or screen is not provider-verified merely because an adapter or mock exists. Provider, device, legal, translation, and production gates are reported separately. No real client data, money, legal advice, public claim, or unrelated Cloudflare resource is used.
