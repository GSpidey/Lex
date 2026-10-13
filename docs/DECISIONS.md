# Decision Register

| Decision          | Status                          | Contract                                                                                                                                                   |
| ----------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product           | Approved                        | Lex is a managed legal-access platform for people and organizations with any legal issue; tenancy is one service module                                    |
| Geography         | Approved for synthetic test     | Nationwide Nigeria across all states and FCT; jurisdiction/service content remains versioned and legally gated                                             |
| Catalogue         | Approved                        | 52 searchable granular practice areas including Not sure and Other                                                                                         |
| Clients           | Approved with safeguards        | Adults, verified organization representatives and protected minor accounts with guardian/safeguarding controls                                             |
| Languages         | Approved for test               | English, Pidgin, Hausa, Yoruba and Igbo input; English is authoritative; fixed safety/consent copy needs native review                                     |
| Channels          | Approved                        | Mobile and full typed WhatsApp intake share phone-linked identity and matter continuity; media/voice provider work remains a gate                          |
| Consultation      | Approved                        | Scheduled live in-app text, secure messages, voice notes and evidence; no native audio/video calling                                                       |
| Representation    | Approved as separate engagement | Lawyer/firm proposals, scope, exclusions, milestones, invoices and tracking; Lex does not represent, file, calculate legal deadlines or guarantee outcomes |
| Matching order    | Approved                        | Verified eligibility, 3-5 rotating shortlist where possible, client selection, lawyer conflict clearance, then payment                                     |
| Missing coverage  | Approved                        | `matching_assistance`; no payment before operations locates and verifies an eligible lawyer                                                                |
| Urgent matters    | Approved                        | Restricted human operations review before shortlist/payment; no emergency-response promise                                                                 |
| Price/SLA         | Sandbox only                    | Versioned NGN 10,000 default and 48 hours after verified payment plus complete information                                                                 |
| Commercial split  | Sandbox only                    | Configurable 20/80 direct provider split with lawyer-borne gateway fees; production requires recorded legal approval                                       |
| AI                | Approved within boundary        | Intake, transcription, extraction, classification and drafting assistance only; no advice, outcomes, deadlines, final lawyer choice or attestation         |
| Mobile foundation | Approved                        | Expo/React Native with checked-in Android Gradle project and direct Gradle APK build; iOS-ready Expo/EAS source                                            |
| Hosting           | Approved staging                | Only isolated `lex-staging-*` Cloudflare Workers, D1, private EU R2, Queues, Cron, Static Assets and Durable Objects                                       |
| Cloudflare spend  | Approved                        | Free plan first; no paid upgrade without explicit user approval                                                                                            |
| Data              | Synthetic staging only          | No real client facts, production money or public legal claims pending cross-border/privacy/legal review                                                    |
| Publication       | Gated                           | Legal content requires recorded lawyer-co-founder approval; translations require native review; public launch requires all provider/legal gates            |
| Administration    | Approved                        | One responsive web codebase exposes distinct Owner, Operations and Lawyer workspaces; dense privileged work does not move into the client app              |
| Assigned roles    | Approved                        | Public accounts receive Client only; Lawyer follows approval; Owner and Operations are assigned only; switching rotates sessions and never creates a role  |
| Founder staging   | Approved exception              | Primary founder is Client plus Owner; partner is Owner plus Lawyer, but professional marketplace eligibility remains separately gated                      |
| AI visibility     | Approved                        | Ask Lex and WhatsApp show AI assistance, client correction and confirmation, deterministic fallback, human review and routing challenge                    |
| iOS preparation   | Approved without upload         | TestFlight profiles, privacy manifest, metadata and release guards may be prepared; no App Store record or upload is authorized                            |

## Production preparation decisions recorded 2026-10-13

- Golden Epic Limited is the proposed Nigerian operator, contracting entity and payment merchant. GoldenEpic Solutions Inc. is the technology provider and proposed publisher, subject to store eligibility and the intercompany agreement. Common ownership does not transfer IP or establish a corporate hierarchy.
- Canadian incorporation date is 24 October 2024 from the certificate; the D&B display of 23 October needs correction. Nigerian RC 1538879 and incorporation on 5 November 2018 were verified from the supplied certificate. Current addresses/directors/ownership were owner-confirmed.
- Docker is the new deployment target, but the existing Cloudflare staging remains authoritative until the Hono/PostgreSQL/queue/storage port passes migration and behavior parity. The legacy NestJS Compose stack is not that port.
- Icon concept 2, conversation and scales, was approved by the owner. Platform exports are based on that exact artwork.
- The Apple membership conversion is preparation only: no account-wide request, store upload or public release without the owner's next authorization.
- Electronic legal review is version-bound and authenticated with MFA. Distinct-owner publication is separate. No email opening, AI draft, or synthetic test constitutes approval.
- Docker uses the separate `lex-docker` project and `infra/compose.lex.yml`, with loopback-only API access. Incremental routes share runtime-neutral services; unmigrated routes do not proxy into Cloudflare or create split authoritative writes.
- Optional-processing withdrawal applies across channels and policy versions. Already-sent data cannot be recalled; queued work checks current permission before provider use and AI results are checked again before persistence. Withdrawing optional notifications does not disable authentication or in-app access. Re-consent does not silently reactivate old AI conversations or push registrations.
- Backup recovery is accepted in layers: an authenticated encrypted PostgreSQL restore proves that mechanism only; full source counts, relationships, evidence hashes and real workflow parity remain separate migration acceptance.

## External prerequisites carried forward

- Meta test number/app credentials, approved templates and webhook subscription.
- OpenAI guided intake is provider-verified with synthetic data; transcription still needs a separate real provider test.
- Paystack and Flutterwave sandbox keys and verified lawyer test subaccounts.
- Postmark Developer token/sender and Expo push credentials.
- Apple credentials for iOS signing.
- Recorded lawyer-co-founder, privacy and native-language approvals.
