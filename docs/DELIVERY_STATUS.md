# Nationwide Test-Release Delivery Status

Statuses: `not_started`, `implemented_unverified`, `local_verified`, `provider_verified`, `legal_approved`, `pilot_ready`.

| Capability                                        | Status                 | Evidence or remaining gate                                                                                                 |
| ------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Full-spectrum product contract                    | local_verified         | README, context, MVP plan and decision register describe nationwide managed legal access; tenancy is one module            |
| Searchable legal catalogue                        | local_verified         | 52 practice-area records, grouped search API, mobile search and service definitions                                        |
| Portable D1 schema and tenancy backfill           | provider_verified      | Migration 0003 applies from empty and is live on isolated EU D1; targeted pre-migration export saved                       |
| Nationwide adult intake                           | local_verified         | All 36 states and FCT use active synthetic service coverage and general/category addenda                                   |
| Minor/guardian safeguards                         | local_verified         | Minimal profile, guardian evidence/review, detailed-data gate and restricted safeguarding ledger implemented               |
| Organization authority safeguards                 | local_verified         | Organization, membership, evidence/review and pre-sharing gate implemented                                                 |
| Nationwide verified-lawyer matching               | local_verified         | Practice, state, language, licence, availability, urgency and workload filters; operations-assistance fallback             |
| Consultation scheduling/live text                 | local_verified         | D1-authoritative messages plus new Durable Object Worker, short-lived tokens and reconnecting app/workspace clients        |
| Voice notes/transcription                         | implemented_unverified | Upload/transcription/confirmation code exists; OpenAI account credit and provider run remain pending                       |
| Lawyer assessment                                 | local_verified         | Only the assigned lawyer can attest and deliver; AI cannot mark work lawyer-reviewed                                       |
| Representation engagements                        | local_verified         | Separate proposals, consent, conflict reconfirmation, milestones, tasks, lawyer-confirmed deadlines, invoices and disputes |
| Paystack/Flutterwave initial and invoice payments | implemented_unverified | Direct split snapshots, invoice allocation and reconciliation code compile; sandbox credentials and provider tests pending |
| Refunds/chargebacks                               | implemented_unverified | Full/partial refund request and audited dispute states exist; provider processing tests remain pending                     |
| Typed WhatsApp intake/linking                     | implemented_unverified | Five-language typed state machine creates the same phone-linked client and matter; Meta test credentials are pending       |
| WhatsApp media/voice retrieval                    | not_started            | Webhook contracts identify media, but authenticated retrieval, R2 persistence and provider tests remain required           |
| Email and push                                    | implemented_unverified | Postmark and Expo delivery adapters are capability-gated; credentials and provider tests pending                           |
| Mobile client                                     | provider_verified      | Gradle APK 0.2.0 is live-staging connected, installed and foreground-rendered on Android device `R3CW70E87KD`              |
| Lawyer/operations web workspace                   | local_verified         | General applications, matter work, consultation, representation, matching, safeguarding and authority controls type-check  |
| Cloudflare staging deployment                     | provider_verified      | Nationwide API/jobs/web and new realtime Worker deployed; API/D1/realtime health and remote 52-area catalogue pass         |
| Legal/native-language approvals                   | not_started            | Test content is synthetic; recorded lawyer-co-founder and native-language/privacy approval required                        |

No row may become `provider_verified`, `legal_approved`, or `pilot_ready` without saved evidence for that exact gate.
