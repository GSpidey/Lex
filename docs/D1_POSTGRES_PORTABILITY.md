# D1 to PostgreSQL Portability Contract

Target architecture: domain services use repository interfaces and portable values. Current status on 2026-10-13: catalogue and public effective-policy reads are extracted to `@lex/platform-core`, with separate D1 and PostgreSQL policy adapters. Most authenticated Hono routes still use D1 statements and Cloudflare storage/queue types directly. The older NestJS/PostgreSQL stack is not a behavior-equivalent replacement. Full adapter separation and PostgreSQL parity remain unfinished; no client cutover has occurred.

## Current executable slice

`apps/node-api` uses Hono, `@hono/node-server` and parameterized `pg` repositories.
`infra/compose.lex.yml` starts only new Lex PostgreSQL/migration/API containers,
with no database host port and an API listener at loopback port 4180. Images run
production builds as a non-root user with a read-only root filesystem. Passwords
are mounted secrets, not committed environment values or image layers.

Migration 0001 creates `lex.users`, legal documents and versions, with stable text
IDs and immutable published-version triggers. Migrations are checksum-checked
under one PostgreSQL transaction/advisory lock; applied migrations cannot silently
change or disappear. Runtime public reads use a read-only connection. A separate
least-privilege application role is still required before authenticated writes or
external exposure; the foundation currently shares the local `lex` database role.

Health declares `migrationStage: public-read-port` and `cutoverReady: false`.
There is no automatic fallback proxy to Cloudflare. The catalogue and policy
queries have tests; other routes are explicitly unmigrated, and no existing mobile
or web endpoint has been changed to this slice.

`scripts/lex-docker-backup.mjs` encrypts streamed custom-format `pg_dump` output
with AES-256-GCM, stores a ciphertext checksum manifest and authenticates the full
archive before restoring into a new `lex_test_restore_*` database. The source
database is never overwritten; restore receipts and isolated databases are retained.
The key must be backed up separately. This is not yet an automated nightly or
independent off-machine backup, and does not include evidence objects.

The first restore contained one migration and zero users/documents/versions.
Real PostgreSQL contract tests separately create synthetic documents in a rolled-back
transaction and verify effective-version/language/private-draft isolation and
immutability. Neither check establishes full D1 migration or production recovery.

## Remaining migration contract

| Domain value                  | D1 representation                          | PostgreSQL target               |
| ----------------------------- | ------------------------------------------ | ------------------------------- |
| Identifier                    | UUID and stable seeded identifiers in `TEXT` | `TEXT` preserving every existing ID |
| Money                         | Integer minor units                        | `BIGINT` or checked integer     |
| Timestamp                     | UTC ISO-8601 string                        | `TIMESTAMPTZ`                   |
| Boolean                       | checked integer `0/1`                      | `BOOLEAN`                       |
| Enum                          | checked `TEXT` plus application validation | PostgreSQL enum or checked text |
| Structured immutable snapshot | Versioned JSON text                        | `JSONB`                         |
| String collection             | Normalized join table                      | Normalized join table           |
| Optimistic concurrency        | Integer `version`                          | Integer `version`               |

Exports use newline-delimited JSON with a manifest containing schema version, export timestamp, table counts, SHA-256 hashes, and jurisdiction metadata. Objects are exported separately with key, content type, size, hash, retention state, and matter reference. Secrets, OTP hashes, session-token hashes, and encryption keys are never exported as portable business data.

Migration to PostgreSQL must preserve identifiers, UTC timestamps, monetary units, audit ordering, content/workflow version references, provider idempotency keys, and object hashes. Domain behavior and public `/v1` routes must pass the same contract tests against both repository implementations before a production switch.

The export graph must preserve, in dependency order: users and protected subjects; organizations and authority reviews; practice areas, services and versions; intakes and evidence; matters, matches and conflicts; consultations and D1-authoritative messages; assessments; representation engagements, proposals, tasks, lawyer-confirmed deadlines and invoices; payments, allocations, refunds and disputes; provider/job ledgers; consents, privacy requests and immutable audits. Durable Object message caches are rebuildable coordination data and never override D1 message history.

Legal-review additions also require packets, version-bound content hashes, immutable review items/events, publication records and append-only consent events. Replace SQLite immutability triggers with tested PostgreSQL equivalents. Do not translate SQL by regular expression or silently coerce stable seeded IDs into UUIDs. Production migration acceptance requires a restore rehearsal, dependency/count/hash checks and authenticated behavior parity before changing client endpoints. Select one authoritative database for each environment and suspend writes only for an explicitly scheduled migration window.
