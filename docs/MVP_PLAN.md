# Lex Nationwide Full-Spectrum Legal-Access Test Release

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
