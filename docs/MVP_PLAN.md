# Nigeria MVP Implementation Plan

## Product

- Adult individual tenants and landlords.
- Nationwide Nigeria intake; Lagos is initially `active`, other states are `intake_only`.
- Separate tenant and landlord workflow versions.
- Lawyer-reviewed tenancy assessment, NGN 10,000 test price, 48-hour delivery target.
- Open lawyer applications; admin verification; 3-5 eligible matches; conflict acceptance before payment.
- Paystack default and Flutterwave fallback, both fully exercised in test mode.
- Mobile app plus responsive lawyer/admin workspace and a shared WhatsApp matter channel.
- English, Pidgin, Hausa, Yoruba, and Igbo intake; English authoritative legal record.
- OpenAI is limited to intake, transcription, summarization, classification, drafting support, and routing.

## Architecture

- Strict TypeScript pnpm/Turborepo monorepo.
- Expo/React Native client, Next.js web workspace, NestJS API and worker.
- PostgreSQL/Prisma, Redis/BullMQ, S3-compatible private storage.
- Provider-neutral adapters for AI, transcription, messaging, payments, object storage, jurisdiction resolution, and professional verification.
- Versioned jurisdiction/service workflows and immutable audit history.
- Docker Compose locally and on a new isolated Hetzner staging server.

## Delivery sequence

1. Foundation, contracts, environment validation, local infrastructure.
2. Identity, permissions, consent, sessions, and audit controls.
3. Jurisdiction engine, tenant/landlord intake, urgent escalation, matching.
4. Client mobile app and channel-neutral WhatsApp workflow.
5. Lawyer application, verification, conflict, assessment, and admin operations.
6. Paystack/Flutterwave payments, splits, reconciliation, reassignment, refunds.
7. Security hardening, backups, restore tests, and Hetzner staging.
8. Passing automated tests and a signed installable Android APK.

## Public-launch gates

Provider test credentials are sufficient for development. Before public launch, the lawyer co-founder reviews legal content, disclosures, engagement formation, commission handling, payments, conflicts, assessment templates, urgent handling, privacy, and public claims. Native-language reviewers approve fixed translations.
