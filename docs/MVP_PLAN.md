# Lex Cloudflare-Native Controlled Pilot Plan

## Product contract

- Adult individual tenants and landlords.
- Nationwide Nigeria intake; Lagos is `active`, every other state is `intake_only`.
- Separate, versioned tenant and landlord tenancy questionnaires.
- Lawyer-reviewed tenancy assessment at a sandbox price of NGN 10,000 with a 48-hour target after verified payment and complete required information.
- Open lawyer applications, operations verification, 3-5 eligible matches, and conflict acceptance before payment.
- Android is the first physical-device platform. The lawyer and operations workspace is responsive and static-hostable.
- English and reviewed Pidgin are the controlled-pilot client languages; English is the authoritative legal record.
- WhatsApp provides OTP and status continuity. Full conversational intake is deferred.
- AI is limited to intake, transcription, summarization, extraction, classification, drafting support, and routing, with human-review boundaries.

## Active staging architecture

| Deployment                        | Responsibility                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `lex-staging-api`                 | Hono `/v1` API, authentication, authorization, R2 streaming, provider webhooks, queue publishing |
| `lex-staging-jobs`                | Queue consumers, dead-letter inspection, five-minute maintenance/SLA Cron                        |
| `lex-staging-web`                 | Static lawyer and operations frontend                                                            |
| `lex-staging-db`                  | EU-jurisdiction D1 database containing synthetic staging records                                 |
| `lex-staging-private-eu`          | Private EU-restricted R2 evidence bucket                                                         |
| `lex-staging-jobs` queue          | AI, transcription, reconciliation, evidence, and maintenance jobs                                |
| `lex-staging-notifications` queue | WhatsApp, push, and future email delivery                                                        |
| `lex-staging-dead-letter` queue   | Exhausted job and notification messages                                                          |

The current NestJS, PostgreSQL, Prisma, Redis/BullMQ, and MinIO code remains as a fallback. Cloudflare business services depend on repository, storage, queue, cryptography, and provider contracts rather than Worker globals or binding names.

## Delivery sequence

1. Correct documents and establish an evidence-based delivery-status matrix.
2. Preserve existing API behavior with contract and state-transition tests.
3. Add Worker packages, `wrangler.jsonc` configuration, generated binding types, and local simulations.
4. Add portable D1 schema, migrations, synthetic seed, idempotency keys, and optimistic versions.
5. Port authentication, intake, matters, matching, payments, privacy, messaging, and operations behind interfaces.
6. Add private R2 upload/download, Queue consumers, job ledger, retries, dead-letter handling, and Cron recovery.
7. Complete English/Pidgin Android and lawyer/operations user flows without dead navigation.
8. Run local migrations, type checks, tests, bundle/startup checks, and Wrangler dry-runs.
9. Create only the approved `lex-staging-*` resources in the current Cloudflare account.
10. Deploy to `workers.dev`, migrate and seed synthetic data, then build the Gradle APK against the approved staging URL.
11. Add Meta, OpenAI, Paystack, Flutterwave, and push test secrets only when credentials are provided securely.
12. Run provider, physical-device, recovery, replay, authorization, and end-to-end acceptance tests.

## Acceptance boundary

No feature is described as complete merely because its screen, route, adapter, or test double exists. Status is tracked in `docs/DELIVERY_STATUS.md`. Provider-dependent items require provider-level evidence; physical-device items require device evidence; legal content and commercial structures require recorded lawyer-co-founder approval.

If secure representative Worker endpoints cannot stay within the Free plan's CPU limit, implementation pauses for approval of the paid Workers plan. Security controls must not be weakened to fit the Free plan.
