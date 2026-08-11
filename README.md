# Lex

Lex is a Nigeria-first, nationwide managed legal-access platform for people and organizations with legal problems. It is not a lawyer directory, and tenancy is one service module within a searchable full-spectrum legal catalogue.

The test release guides a client from typed or voice intake through client-confirmed classification, verified-lawyer matching, conflict clearance, sandbox payment, scheduled secure consultation, lawyer-written assessment, and—where separately agreed—representation tracking.

## Test-release scope

- Android client plus iOS-ready Expo source and Gradle-native Android project.
- Responsive lawyer and operations workspace.
- All 36 states and the FCT, with a catalogue of 30+ granular practice areas.
- Adult individual, safeguarded minor, and verified-organization account contexts.
- English, Pidgin, Hausa, Yoruba, and Igbo intake; English is the authoritative lawyer-facing record.
- App and WhatsApp channel continuity, including voice notes and documents.
- Scheduled in-app live text consultation through a consultation-scoped Durable Object.
- Lawyer-attested written assessment and optional representation proposals, milestones, invoices, tasks, and lawyer-confirmed deadlines.
- Paystack default and Flutterwave fallback in sandbox only.
- Cloudflare-native staging using only isolated `lex-staging-*` resources.

## Safety and launch gates

AI may classify, extract, summarize, translate intake confirmations, transcribe, and assist lawyer drafting. It cannot provide autonomous legal advice, calculate court deadlines, select the final lawyer, or mark work lawyer-reviewed. Urgent matters, safeguarding cases, and unsupported matching always route to people before payment.

The NGN 10,000 default and configurable 20/80 split are synthetic sandbox settings. Production activation remains blocked pending recorded lawyer-co-founder approval of legal content, engagement terms, fee-sharing/client-money implications, privacy, safeguarding, translations, and public claims. Provider-backed features remain unverified until their test credentials and real provider evidence exist.

## Architecture

- `apps/cloudflare-api`: Hono REST/OpenAPI API, authorization, D1, R2, webhooks.
- `apps/cloudflare-jobs`: Queue consumers, provider work, reconciliation, Cron.
- `apps/cloudflare-realtime`: consultation-scoped Durable Object and WebSocket coordination.
- `apps/cloudflare-web`: static delivery Worker for the lawyer/operations build.
- `apps/mobile`: Expo/React Native client with checked-in Gradle Android project.
- `apps/web`: responsive lawyer/operations interface.
- `packages/contracts`: channel-neutral domain and provider contracts.
- `packages/jurisdictions`: versioned Nigerian catalogue and service workflows.
- `packages/d1`: portable D1/SQLite schema definitions.

The legacy NestJS/PostgreSQL implementation remains a portability reference. No existing non-Lex Cloudflare resource may be inspected, reused, renamed, or modified.

## Local verification

```powershell
pnpm.cmd install
pnpm.cmd cf:types
pnpm.cmd cf:db:local
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd cf:dry-run
pnpm.cmd apk
```

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), [docs/MVP_PLAN.md](docs/MVP_PLAN.md), [docs/DELIVERY_STATUS.md](docs/DELIVERY_STATUS.md), and [docs/TEST_REPORT.md](docs/TEST_REPORT.md). Never place credentials in source, APK configuration, logs, or committed environment files.
