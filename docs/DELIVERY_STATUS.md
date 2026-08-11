# Nationwide Test-Release Delivery Status

## 2026-08-11 experience increment

- Implemented and deployed: additive multi-role schema and legacy backfill, rotating active-role sessions, protected founder bootstrap, professional application/evidence workflows, two-owner approval records, Legal Centre versioning, Ask Lex conversations and AI queue work, Owner provider/AI diagnostics, progressive mobile accordions, grouped catalogue, responsive web role switching, and iOS/TestFlight guards.
- OpenAI: a real synthetic guided-intake run completed through the deployed Queue consumer using `gpt-5.6-terra`; model, prompt/schema versions, latency and token use are recorded. Transcription remains independently unverified.
- Founder records: both authorized staging accounts are bootstrapped with the requested assigned roles and preverified contact timestamps. Founder-authorized numbers can use the controlled staging OTP while Meta is unavailable; the primary founder's real-number smoke entered Client with assigned Client/Owner roles. Contact details remain encrypted/hashed and uncommitted. MFA enrollment is still required before privileged access.
- Legal text: the controlled drafting pack is in `docs/LEGAL_CENTRE_DRAFTS.md`; production remains blocked pending company details and lawyer-co-founder review.
- iOS: source and validation are prepared; no TestFlight upload or App Store record action is authorized.

Statuses: `not_started`, `implemented_unverified`, `local_verified`, `provider_verified`, `legal_approved`, `pilot_ready`.

| Capability                                        | Status                 | Evidence or remaining gate                                                                                                 |
| ------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Full-spectrum product contract                    | local_verified         | README, context, MVP plan and decision register describe nationwide managed legal access; tenancy is one module            |
| Searchable legal catalogue                        | local_verified         | 52 practice-area records, grouped search API, mobile search and service definitions                                        |
| Portable D1 schema and tenancy backfill           | provider_verified      | Migrations 0003 and additive 0004 apply from empty and are live on isolated EU D1; pre-0004 Time Travel bookmark recorded  |
| Multi-role accounts and founder bootstrap         | provider_verified      | Requested Client/Owner and Owner/Lawyer assignments confirmed remotely; public role assignment remains server-controlled   |
| Professional onboarding and verification          | local_verified         | Complete application, quarantined credential evidence, recorded review, role grant and disabled-by-default visibility      |
| Privileged dual control                           | local_verified         | Recent MFA step-up and a distinct second owner are required to approve recorded sensitive-action requests                  |
| Nationwide adult intake                           | local_verified         | All 36 states and FCT use active synthetic service coverage and general/category addenda                                   |
| Minor/guardian safeguards                         | local_verified         | Minimal profile, guardian evidence/review, detailed-data gate and restricted safeguarding ledger implemented               |
| Organization authority safeguards                 | local_verified         | Organization, membership, evidence/review and pre-sharing gate implemented                                                 |
| Nationwide verified-lawyer matching               | local_verified         | Practice, state, language, licence, availability, urgency and workload filters; operations-assistance fallback             |
| Consultation scheduling/live text                 | local_verified         | D1-authoritative messages plus new Durable Object Worker, short-lived tokens and reconnecting app/workspace clients        |
| Ask Lex guided intake                             | provider_verified      | Real synthetic Responses API run completed and stored with strict schema, safety boundary, usage and human-review state    |
| Voice notes/transcription                         | implemented_unverified | Upload/transcription/confirmation code exists; a real `gpt-4o-transcribe` provider run remains pending                     |
| Lawyer assessment                                 | local_verified         | Only the assigned lawyer can attest and deliver; AI cannot mark work lawyer-reviewed                                       |
| Representation engagements                        | local_verified         | Separate proposals, consent, conflict reconfirmation, milestones, tasks, lawyer-confirmed deadlines, invoices and disputes |
| Paystack/Flutterwave initial and invoice payments | implemented_unverified | Direct split snapshots, invoice allocation and reconciliation code compile; sandbox credentials and provider tests pending |
| Refunds/chargebacks                               | implemented_unverified | Full/partial refund request and audited dispute states exist; provider processing tests remain pending                     |
| Typed WhatsApp intake/linking                     | implemented_unverified | AI-guided/fallback state machine, commands and phone-linked continuity compile; Meta test credentials remain pending       |
| WhatsApp media/voice retrieval                    | not_started            | Webhook contracts identify media, but authenticated retrieval, R2 persistence and provider tests remain required           |
| Email and push                                    | implemented_unverified | Postmark and Expo delivery adapters are capability-gated; credentials and provider tests pending                           |
| Mobile client                                     | provider_verified      | Gradle APK 0.3.0 is staging-connected, installed, cold-launched and visually inspected on Android device `R3CW70E87KD`     |
| Lawyer/operations web workspace                   | local_verified         | General applications, matter work, consultation, representation, matching, safeguarding and authority controls type-check  |
| Cloudflare staging deployment                     | provider_verified      | API `f8eefa71`, jobs `b9091ce7`, web `f3ae508e`; API/D1 and web remote health checks pass                                  |
| Legal/native-language approvals                   | not_started            | Test content is synthetic; recorded lawyer-co-founder and native-language/privacy approval required                        |

No row may become `provider_verified`, `legal_approved`, or `pilot_ready` without saved evidence for that exact gate.
