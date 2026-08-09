# Delivery Status

Allowed statuses: `not_started`, `implemented_unverified`, `local_verified`, `provider_verified`, `legal_approved`, and `pilot_ready`.

| Capability                             | Status                 | Evidence / next gate                                                                                                 |
| -------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Cloudflare documentation baseline      | provider_verified      | Isolated resources and live URLs are recorded; no pre-existing resource was reused                                   |
| Worker API runtime                     | provider_verified      | Live health/OpenAPI, generated types, integration tests, dry-run, and deployment passed                              |
| D1 schema and migrations               | provider_verified      | Two migrations plus synthetic seed applied locally and to new EU `lex-staging-db`                                    |
| Private R2 evidence                    | local_verified         | New private EU bucket is bound; local matter authorization tests pass; remote object test is pending                 |
| Queues, job ledger, retries, DLQ, Cron | provider_verified      | New queues, consumers, DLQ, and five-minute Cron are deployed; remote failure drill is pending                       |
| Android client                         | provider_verified      | Fresh Gradle APK installed, launched, and completed controlled client login on device `R3CW70E87KD`                  |
| Controlled staging client login        | provider_verified      | Exact synthetic number and server-held OTP complete a live Worker client session; other numbers remain unavailable   |
| Country calling-code selector          | local_verified         | Sign-in defaults to Nigeria and offers ten country/calling-code choices without changing the server E.164 contract   |
| English/Pidgin questionnaires          | local_verified         | Versioned tenant/landlord questionnaires render in the device build; legal-language review remains pending           |
| Voice transcription confirmation       | implemented_unverified | OpenAI secret is configured on both staging Workers; provider call awaits account credit and end-to-end verification |
| WhatsApp OTP                           | implemented_unverified | Local behavior exists; real Meta template delivery not verified                                                      |
| Full WhatsApp conversational intake    | not_started            | Deferred roadmap item, not a pilot acceptance requirement                                                            |
| Lawyer workspace                       | local_verified         | Static production build and live deployment pass; provider-backed full journey remains pending                       |
| Operations workspace                   | local_verified         | Static production build and live deployment pass; provider-backed full journey remains pending                       |
| Paystack/Flutterwave                   | implemented_unverified | Adapters and local tests exist; sandbox provider evidence required                                                   |
| AI safety boundary                     | local_verified         | Contracts prohibit autonomous legal delivery; evaluation set still required                                          |
| Legal content                          | implemented_unverified | Seed content is test-only; lawyer-co-founder approval required                                                       |
| Physical staging journey               | provider_verified      | Staging APK completed live Worker client login on a physical device; real WhatsApp/payment/AI remains gated          |

Update a row only when its stated evidence exists. `pilot_ready` requires all technical, provider, device, privacy, and legal gates applicable to that capability.
