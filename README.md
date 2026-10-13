# Lex

Lex is a Nigeria-first, nationwide managed legal-access platform for people and organizations with legal problems. It is not a lawyer directory, and tenancy is one service module within a searchable full-spectrum legal catalogue.

The test release guides a client from typed or voice intake through client-confirmed classification, verified-lawyer matching, conflict clearance, sandbox payment, scheduled secure consultation, lawyer-written assessment, and—where separately agreed—representation tracking.

## Test-release scope

- Android client plus iOS-ready Expo source and Gradle-native Android project.
- Responsive lawyer and operations workspace.
- Assigned Client, Lawyer, Operations and Owner roles with MFA-protected web workspace switching.
- Progressive collapsible intake, visible Ask Lex AI assistance and a versioned Legal Centre.
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
- `packages/platform-core`: runtime-neutral catalogue and public-policy services.
- `apps/node-api`: the current Hono-to-Node migration slice, not yet a complete backend replacement.

The legacy NestJS/PostgreSQL implementation remains a portability reference. No existing non-Lex Cloudflare resource may be inspected, reused, renamed, or modified.

## Isolated Docker migration environment

Run `pnpm.cmd docker:init`, then `pnpm.cmd docker:up`. This uses **only**
`infra/compose.lex.yml` and the `lex-docker` Compose project. Random database and
backup secrets stay in the ignored `.secrets/docker` directory; initialization
preserves existing values. Do not use the legacy root Compose stack for this port.

The Node API is available at `http://127.0.0.1:4180/v1/health`. It currently serves
the catalogue and effective public policies through typed PostgreSQL repositories.
Health explicitly reports `cutoverReady: false`; unmigrated routes return 501 and
do not forward writes to Cloudflare. The existing app remains on Cloudflare.

Run `pnpm.cmd docker:check` for transactional PostgreSQL contract tests. Run
`node scripts/lex-docker-backup.mjs backup` for an encrypted schema/data backup,
then `node scripts/lex-docker-backup.mjs restore-test <backup-filename>` for an
isolated restore. Restored test databases are retained; these commands never
replace the live `lex` database. Keep the encryption key separately backed up.
See the [portability contract](docs/D1_POSTGRES_PORTABILITY.md) for remaining work.

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

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), [docs/MVP_PLAN.md](docs/MVP_PLAN.md), [docs/LEGAL_CENTRE_DRAFTS.md](docs/LEGAL_CENTRE_DRAFTS.md), [docs/DELIVERY_STATUS.md](docs/DELIVERY_STATUS.md), and [docs/TEST_REPORT.md](docs/TEST_REPORT.md). Never place credentials in source, APK configuration, logs, or committed environment files.
