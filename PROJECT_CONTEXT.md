# Project Context

## Latest implementation handoff 2026-10-13

The approved conversation/scales icon and legal-review increment remain on isolated Cloudflare staging. The continuation adds public mobile policies, signed-in web/mobile consent controls, explicit Ask Lex consent, and account-wide AI/notification withdrawal enforcement. No legal document was approved or published by the agent. The Legal Centre has 20 substantive unapproved drafts; private invitations, MFA review and distinct-owner publication remain available. The owner selected their existing Resend account instead of Postmark. A selectable HTTP email adapter is implemented; Resend sender/key verification is pending and sending remains inactive. One earlier authorized Postmark test was API-accepted but rejected by the recipient's DMARC policy, not delivered. Postmark credentials were rotated and retained unused. No partner email was sent.

Lex will have its own domain, purchased and managed through Cloudflare, not a permanent GoldenEpic subdomain. Domain selection, availability, price approval and purchase remain pending. Do not reuse the existing unrelated Resend project domains/keys. No Postmark DNS record, domain transfer, paid plan or sending-approval request was submitted. Future sender authentication records stay in Cloudflare and require exact-record approval before changes.

The current Hono port now has runtime-neutral catalogue/public-policy services, separate D1/PostgreSQL repositories, and an isolated `lex-docker` Compose deployment at loopback port 4180. This is a **public-read migration slice**, not full parity: `cutoverReady: false`, unmigrated routes return 501, and Cloudflare remains authoritative for the app. PostgreSQL contract tests and an encrypted empty-foundation restore succeeded. The old NestJS Compose stack is not the target. Next work is authenticated repository/service extraction, complete migration/export/import, Redis/jobs, private storage/scanning, realtime and full restore/rollback parity. Exact checks and deployment versions belong in docs/TEST_REPORT.md. Do not claim production preparation or store readiness is finished.

## Current implementation focus (2026-10-13)

The approved continuation is production preparation: substantive legal documents and paperless partner review, Nigerian operator Golden Epic Limited plus Canadian technology provider GoldenEpic Solutions Inc., and current Hono feature parity on an isolated Docker stack. Preserve existing Cloudflare staging while the Docker migration is verified. The owner selected icon concept 2 (conversation and scales). Apple enrollment is currently Individual; prepare organization conversion but do not submit an account-wide change. Full plan and outstanding evidence remain in the existing MVP plan and delivery matrix.

The nationwide full-spectrum contract now includes assigned multi-role Owner, Operations and Lawyer workspaces; approval-controlled professional onboarding; progressive client intake; visible Ask Lex AI assistance; a versioned Legal Centre; guided WhatsApp architecture; and iOS/TestFlight readiness without upload. Administration remains a separate responsive web workspace. Role switching is limited to server-assigned roles and public registration remains Client-only.

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

Staging uses synthetic data. OpenAI guided intake is provider-verified; transcription still needs its own provider exercise. Meta, Paystack, Flutterwave, Resend, and Expo/FCM/APNs tests require their own credentials and evidence. iOS distribution requires Apple credentials. Public launch additionally requires the lawyer co-founder's recorded legal/commercial approvals and native-language/privacy review.
