# Decision Register

Approved product decisions are implementation inputs. Legal, provider, and production approvals remain distinct gates.

| Decision                  | Status                         | Owner / approval                                          | Decision                                                                                   |
| ------------------------- | ------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Product name              | Approved                       | Founders                                                  | Lex                                                                                        |
| First clients             | Approved                       | Founders                                                  | Adult individual tenants and landlords                                                     |
| First service             | Approved for controlled test   | Founders; legal text pending partner review               | Lawyer-reviewed tenancy assessment                                                         |
| Intake reach              | Approved                       | Founders                                                  | Nationwide Nigeria intake                                                                  |
| Service-enabled geography | Approved                       | Founders                                                  | Lagos only initially                                                                       |
| Pilot languages           | Approved                       | Founders                                                  | English and reviewed Pidgin; English authoritative                                         |
| Deferred languages        | Approved roadmap               | Founders                                                  | Hausa, Yoruba, and Igbo after native-language review                                       |
| WhatsApp pilot scope      | Approved                       | Founders                                                  | OTP, recovery/status notices, requests, and ready links through Meta test number           |
| Temporary staging access  | Approved for synthetic staging | User                                                      | One client-only test number uses a server-secret OTP until Meta setup; never production    |
| Full WhatsApp intake      | Deferred                       | Founders                                                  | Separate future state machine and acceptance plan                                          |
| Mobile priority           | Approved                       | Founders                                                  | Android physical-device pilot first; Expo/React Native source with Gradle APK              |
| Marketplace               | Approved                       | Founders                                                  | Open applications; only verified eligible lawyers appear; shortlist of 3-5                 |
| Matching/payment order    | Approved                       | Founders                                                  | Client chooses, lawyer clears conflict and accepts, then client pays                       |
| Price/SLA                 | Approved for sandbox           | Founders; partner approval before pilot with real clients | NGN 10,000 and 48 hours after verified payment plus complete information                   |
| Commercial split          | Sandbox only                   | Founders; lawyer co-founder review required               | Configurable 20 percent Lex / 80 percent lawyer; lawyer share bears gateway fees           |
| Payment providers         | Approved for sandbox           | Founders                                                  | Paystack default, Flutterwave exercised fallback                                           |
| AI                        | Approved within boundary       | Founders                                                  | Intake, transcription, extraction, summary, classification, drafting support, routing only |
| Urgent matters            | Approved                       | Founders                                                  | Human escalation; no emergency-service guarantee                                           |
| Hosting                   | Approved staging direction     | Founders                                                  | Isolated Cloudflare Workers/D1/R2/Queues/Static Assets using `lex-staging-*` names         |
| Cloudflare plan           | Approved                       | User                                                      | Free plan first; any paid upgrade requires explicit approval                               |
| Cloudflare data use       | Approved for synthetic staging | Founders                                                  | EU-restricted D1/R2; globally distributed compute; no real client data pending review      |
| Public launch             | Gated                          | Lawyer co-founder                                         | Legal, commercial, privacy, translation, provider, and claims review required              |

## External prerequisites

- Meta Business/WhatsApp test credentials and an approved authentication template.
- OpenAI test project key.
- Paystack and Flutterwave sandbox keys and test subaccounts.
- Push-notification credentials for provider-level delivery tests.
- A future transactional email provider or explicit Workers Paid approval where needed.
- Lawyer-co-founder approval records for legal content, engagement, privacy, conflicts, commercial structure, and public claims.
- Native review of Pidgin fixed consent and safety text before client pilot.
