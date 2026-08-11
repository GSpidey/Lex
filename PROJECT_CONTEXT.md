# Project Context

## Founding contract

The lawyer co-founder originated the Nigerian legal-access idea and has more than 15 years of practice experience. The user is improving the concept and leading the build. Lex launches in Nigeria first and expands through separately reviewed country packages.

Lex serves people and organizations with any legal issue. It is a managed access system—not a directory, lead-selling page, bidding market, law firm, or autonomous legal-advice product. Tenancy is retained as the first migrated module, not as Lex's identity.

## Product journey

1. Choose individual adult, minor, or organization context and a supported language.
2. Describe the legal issue, or choose `Not sure` / `Other` for confirmed classification.
3. Complete shared intake plus a versioned practice-area addendum; add evidence and voice notes.
4. Confirm the English structured record and consent before lawyer sharing.
5. Route urgent and safeguarding matters to restricted operations review.
6. Match 3-5 verified eligible lawyers, or create operations-assisted matching when coverage is missing.
7. Let the chosen lawyer clear conflicts before any payment.
8. Pay in sandbox, schedule secure text consultation, exchange messages/evidence, and receive a lawyer-attested assessment.
9. Optionally accept a separate representation proposal and track milestones, invoices, tasks, documents, disputes, and termination.

## Accounts and safety

- Adults can use the full client journey.
- A minor can create only a minimal profile until a verified linked guardian supplies consent. Detailed facts, documents, lawyer sharing, and payment remain blocked.
- Suspected abuse, guardian conflict, vital-interest, and court-related cases bypass normal guardian sharing and enter restricted safeguarding review.
- Organization representatives require identity/registration and authority evidence plus operations approval before lawyer sharing, matching, or payment.
- Time-critical detention, criminal, domestic-violence, child-safety, and similar matters enter operations review before matching or payment; Lex never promises emergency response.

## Architecture boundary

Identity, intake, matters, evidence, messaging, payments, consultation, representation tracking, notification, matching, consent, audit, and AI orchestration are reusable global services. Legal questions, service scope, terminology, evidence requirements, urgency rules, disclosures, pricing, SLAs, matching constraints, and templates live in versioned jurisdiction/service packages.

Nigeria is Jurisdiction 1. Every Nigerian state/FCT is enabled in synthetic staging. Future countries add reviewed packages without changing the global core.

## AI boundary

Approved uses: classification suggestions, missing-question suggestions, transcription, fact extraction, summarization, client-confirmation translation, safe routing support, and lawyer drafting assistance. AI cannot publish advice, guarantee or predict outcomes, calculate legal deadlines, select a final lawyer, negotiate, file, represent, or claim lawyer review. Client confirmation and human review remain explicit.

## External gates

Staging uses synthetic data. Real provider tests require Meta, OpenAI credit, Paystack, Flutterwave, Postmark, and Expo/FCM/APNs credentials. iOS distribution requires Apple credentials. Public launch additionally requires the lawyer co-founder's recorded legal/commercial approvals and native-language/privacy review.
