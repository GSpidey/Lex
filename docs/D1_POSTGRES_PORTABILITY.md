# D1 to PostgreSQL Portability Contract

Target architecture: domain services use repository interfaces and portable values. Current status on 2026-10-13: the active Hono routes still use D1 statements and Cloudflare storage/queue types directly. The older NestJS/PostgreSQL stack is not a behavior-equivalent replacement. The adapter separation and PostgreSQL parity work remain unfinished; no Docker cutover has occurred.

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
