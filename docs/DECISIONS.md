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

## External prerequisites

- Meta test number/app credentials, approved templates and webhook subscription.
- OpenAI account credit for transcription/extraction tests.
- Paystack and Flutterwave sandbox keys and verified lawyer test subaccounts.
- Postmark Developer token/sender and Expo push credentials.
- Apple credentials for iOS signing.
- Recorded lawyer-co-founder, privacy and native-language approvals.
