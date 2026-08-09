# Project Context

## Founding context

- The user's partner is a lawyer with more than 15 years of practice experience and originated the Nigeria legal-access product idea.
- The user is improving the concept and leading the build.
- The product launches in Nigeria first and expands one separately reviewed jurisdiction at a time.
- The lawyer co-founder is the legal-domain authority. Product and technical workflows preserve explicit legal approval and version history.

## Product definition

Lex is a managed legal-access marketplace, not merely a searchable directory or open bidding system.

The client journey is:

1. Describe the problem in a supported language through the app or WhatsApp.
2. Complete guided intake and provide evidence.
3. Confirm the transcript, facts, parties, timeline, and desired outcome.
4. Receive safe triage and routing with uncertainty and urgent escalation made visible.
5. Choose from a shortlist of appropriately qualified and available verified lawyers.
6. Allow the chosen lawyer to complete a conflict check and accept.
7. Pay for a fixed-scope lawyer-reviewed assessment.
8. Track communication, work, delivery, payments, and closure.

## Architecture boundary

### Reusable global core

Identity, professional verification, intake, matters, documents, secure messaging, payments, notifications, matching, administration, localization, consent, permissions, audit logs, and AI orchestration are reusable platform capabilities.

### Jurisdiction packages

Legal rules are versioned separately by country and, where necessary, state or territory. A package contains supported issue types, eligibility questions, required evidence, legal terminology, qualification rules, workflows, templates, urgent flags, disclosures, retention rules, pricing, and escalation.

Nigeria is Jurisdiction 1. Nationwide intake is available, Lagos is initially active, and other states remain intake-only until approved. Another country must add a separately reviewed package and must never silently reuse Nigerian law.

## AI boundary

Approved initial uses are intake, transcription, fact extraction, summarization, classification, missing-information prompts, translation for intake confirmation, lawyer-reviewed drafting support, and routing assistance.

AI cannot publish legal opinions, predict outcomes definitively, activate a jurisdiction, select the final lawyer, negotiate, file, represent a client, or label work as lawyer-reviewed. Low-confidence, conflicting, urgent, and unsupported results route to human review.

## MVP contract

- Adult individual tenants and landlords.
- Separate tenant-side and landlord-side tenancy workflows.
- Nationwide Nigeria intake; Lagos is the only initially service-enabled state.
- Lawyer-reviewed tenancy assessment delivered within 48 hours after verified payment and complete information.
- Open lawyer applications, admin verification, and a matched shortlist of 3-5 eligible lawyers.
- Fixed NGN 10,000 test price with a configurable 20 percent platform / 80 percent lawyer split; lawyer share bears gateway fees.
- English, Pidgin, Hausa, Yoruba, and Igbo intake; English is the authoritative lawyer record.
- Android and iOS client code, responsive lawyer/admin web, and full WhatsApp continuity.

The lawyer co-founder must approve legal content, engagement formation, commercial structure, privacy, translations, and public claims before public launch.
