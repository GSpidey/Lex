PRAGMA foreign_keys = ON;

CREATE TABLE practice_areas (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, group_name TEXT NOT NULL, name TEXT NOT NULL,
  description TEXT NOT NULL, urgent INTEGER NOT NULL DEFAULT 0 CHECK (urgent IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)), sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX practice_areas_group_sort_idx ON practice_areas(group_name,sort_order);

CREATE TABLE service_definitions (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, practice_area_id TEXT NOT NULL REFERENCES practice_areas(id),
  country_code TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE service_versions (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES service_definitions(id), version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','review','approved','published','retired')),
  authoritative_language TEXT NOT NULL DEFAULT 'en', definition_json TEXT NOT NULL,
  price_minor INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'NGN', sla_hours INTEGER NOT NULL,
  approved_by TEXT REFERENCES users(id), approved_at TEXT, effective_at TEXT, retired_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(service_id,version)
);
CREATE TABLE service_jurisdictions (
  service_version_id TEXT NOT NULL REFERENCES service_versions(id), country_code TEXT NOT NULL, state_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','intake_only','active','suspended')),
  rules_json TEXT NOT NULL DEFAULT '{}', PRIMARY KEY(service_version_id,country_code,state_code)
);

ALTER TABLE users ADD COLUMN preferred_language_v2 TEXT;
UPDATE users SET preferred_language_v2=preferred_language WHERE preferred_language_v2 IS NULL;
ALTER TABLE intakes ADD COLUMN client_type TEXT NOT NULL DEFAULT 'adult_individual';
ALTER TABLE intakes ADD COLUMN client_subject_id TEXT;
ALTER TABLE intakes ADD COLUMN practice_area_code TEXT;
ALTER TABLE intakes ADD COLUMN service_version_id TEXT REFERENCES service_versions(id);
ALTER TABLE intakes ADD COLUMN issue_role TEXT;
ALTER TABLE intakes ADD COLUMN classification_status TEXT NOT NULL DEFAULT 'selected';
ALTER TABLE intakes ADD COLUMN language_v2 TEXT;
UPDATE intakes SET practice_area_code='tenancy', language_v2=language, issue_role=tenancy_role WHERE practice_area_code IS NULL;
CREATE INDEX intakes_practice_state_idx ON intakes(practice_area_code,state_code,state);

ALTER TABLE matters ADD COLUMN service_version_id TEXT REFERENCES service_versions(id);
ALTER TABLE matters ADD COLUMN client_type TEXT NOT NULL DEFAULT 'adult_individual';
ALTER TABLE matters ADD COLUMN client_subject_id TEXT;
ALTER TABLE matters ADD COLUMN consultation_id TEXT;
CREATE INDEX matters_service_state_idx ON matters(service_version_id,state_code,state);

CREATE TABLE minor_profiles (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), display_name_encrypted TEXT NOT NULL,
  date_of_birth_encrypted TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'guardian_pending',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id)
);
CREATE TABLE guardian_links (
  id TEXT PRIMARY KEY, minor_profile_id TEXT NOT NULL REFERENCES minor_profiles(id), guardian_user_id TEXT NOT NULL REFERENCES users(id),
  relationship TEXT NOT NULL, identity_evidence_id TEXT REFERENCES evidence_items(id), relationship_evidence_id TEXT REFERENCES evidence_items(id),
  status TEXT NOT NULL DEFAULT 'pending', consent_version TEXT NOT NULL, consent_at TEXT,
  reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(minor_profile_id,guardian_user_id)
);
CREATE TABLE age_verifications (
  id TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, method TEXT NOT NULL,
  outcome TEXT NOT NULL, evidence_id TEXT REFERENCES evidence_items(id), reviewer_id TEXT REFERENCES users(id),
  verified_at TEXT, expires_at TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE TABLE safeguarding_reviews (
  id TEXT PRIMARY KEY, minor_profile_id TEXT REFERENCES minor_profiles(id), intake_id TEXT REFERENCES intakes(id), matter_id TEXT REFERENCES matters(id),
  reason_code TEXT NOT NULL, restricted_notes_encrypted TEXT, state TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT REFERENCES users(id), resolved_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX safeguarding_state_idx ON safeguarding_reviews(state,created_at);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY, legal_name TEXT NOT NULL, registration_number TEXT NOT NULL, organization_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'authority_review', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(registration_number)
);
CREATE TABLE organization_memberships (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id,user_id)
);
CREATE TABLE authority_reviews (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
  evidence_id TEXT REFERENCES evidence_items(id), decision TEXT NOT NULL DEFAULT 'pending', reason TEXT,
  reviewer_id TEXT REFERENCES users(id), decided_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE operations_matching_requests (
  id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES matters(id), practice_area_code TEXT NOT NULL, state_code TEXT NOT NULL,
  urgency TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'open', assigned_to TEXT REFERENCES users(id), resolution_note TEXT,
  resolved_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(matter_id)
);

CREATE TABLE consultations (
  id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES matters(id), lawyer_id TEXT NOT NULL REFERENCES lawyer_profiles(id),
  state TEXT NOT NULL DEFAULT 'requested', mode TEXT NOT NULL DEFAULT 'live_text', scheduled_start TEXT, scheduled_end TEXT,
  time_zone TEXT, started_at TEXT, ended_at TEXT, realtime_room_key TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(matter_id)
);
CREATE TABLE consultation_sessions (
  id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id), started_at TEXT NOT NULL, ended_at TEXT,
  ended_reason TEXT, connection_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE consultation_participants (
  consultation_id TEXT NOT NULL REFERENCES consultations(id), user_id TEXT NOT NULL REFERENCES users(id),
  participant_role TEXT NOT NULL, joined_at TEXT, last_seen_at TEXT, removed_at TEXT,
  PRIMARY KEY(consultation_id,user_id)
);
CREATE TABLE realtime_tokens (
  id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id), user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL
);
ALTER TABLE messages ADD COLUMN consultation_id TEXT REFERENCES consultations(id);
ALTER TABLE messages ADD COLUMN client_message_id TEXT;
CREATE UNIQUE INDEX messages_client_id_uq ON messages(consultation_id,client_message_id) WHERE client_message_id IS NOT NULL;

CREATE TABLE representation_engagements (
  id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES matters(id), client_user_id TEXT NOT NULL REFERENCES users(id),
  lawyer_id TEXT NOT NULL REFERENCES lawyer_profiles(id), state TEXT NOT NULL DEFAULT 'proposal_draft', engagement_version INTEGER NOT NULL DEFAULT 1,
  accepted_proposal_id TEXT, conflict_reconfirmed_at TEXT, activated_at TEXT, completed_at TEXT, terminated_at TEXT,
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE engagement_proposals (
  id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL REFERENCES representation_engagements(id), version INTEGER NOT NULL,
  scope TEXT NOT NULL, exclusions TEXT NOT NULL, fee_basis TEXT NOT NULL, fee_summary TEXT NOT NULL,
  expected_expenses TEXT NOT NULL, cancellation_terms TEXT NOT NULL, client_responsibilities TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft', lawyer_attested_at TEXT NOT NULL, offered_at TEXT, accepted_at TEXT,
  consent_version TEXT, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(engagement_id,version)
);
CREATE TABLE milestones (
  id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL REFERENCES representation_engagements(id), title TEXT NOT NULL,
  description TEXT, state TEXT NOT NULL DEFAULT 'pending', position INTEGER NOT NULL, amount_minor INTEGER,
  due_at TEXT, completed_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE engagement_tasks (
  id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL REFERENCES representation_engagements(id), milestone_id TEXT REFERENCES milestones(id),
  title TEXT NOT NULL, assignee_user_id TEXT REFERENCES users(id), state TEXT NOT NULL DEFAULT 'open',
  due_at TEXT, due_at_confirmed_by_lawyer INTEGER NOT NULL DEFAULT 0 CHECK (due_at_confirmed_by_lawyer IN (0,1)),
  completed_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE deadlines (
  id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL REFERENCES representation_engagements(id), title TEXT NOT NULL,
  due_at TEXT NOT NULL, source TEXT NOT NULL, lawyer_confirmed_by TEXT NOT NULL REFERENCES users(id), lawyer_confirmed_at TEXT NOT NULL,
  notes TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE invoices (
  id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL REFERENCES representation_engagements(id), milestone_id TEXT REFERENCES milestones(id),
  invoice_number TEXT NOT NULL UNIQUE, description TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'NGN', state TEXT NOT NULL DEFAULT 'draft', due_at TEXT, payment_id TEXT,
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
ALTER TABLE payments ADD COLUMN engagement_id TEXT REFERENCES representation_engagements(id);
ALTER TABLE payments ADD COLUMN invoice_id TEXT REFERENCES invoices(id);
CREATE UNIQUE INDEX payments_invoice_uq ON payments(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE TABLE payment_allocations (
  id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id), allocation_type TEXT NOT NULL,
  recipient_reference TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0), basis_points INTEGER NOT NULL,
  fee_bearer INTEGER NOT NULL DEFAULT 0 CHECK (fee_bearer IN (0,1)), snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(payment_id,allocation_type,recipient_reference)
);
CREATE TABLE engagement_disputes (
  id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL REFERENCES representation_engagements(id), invoice_id TEXT REFERENCES invoices(id),
  opened_by TEXT NOT NULL REFERENCES users(id), reason_code TEXT NOT NULL, details TEXT, state TEXT NOT NULL DEFAULT 'open',
  resolution TEXT, resolved_by TEXT REFERENCES users(id), resolved_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE channel_links (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), channel TEXT NOT NULL, channel_subject_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', linked_at TEXT NOT NULL, revoked_at TEXT, UNIQUE(channel,channel_subject_hash)
);
CREATE TABLE whatsapp_intake_sessions (
  id TEXT PRIMARY KEY, channel_link_id TEXT NOT NULL REFERENCES channel_links(id), intake_id TEXT REFERENCES intakes(id),
  state TEXT NOT NULL, locale TEXT NOT NULL, cursor_json TEXT NOT NULL DEFAULT '{}', last_provider_message_id TEXT,
  version INTEGER NOT NULL DEFAULT 1, expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

UPDATE matters SET client_type='adult_individual' WHERE client_type IS NULL;

INSERT OR IGNORE INTO practice_areas (id,code,group_name,name,description,urgent,active,sort_order,created_at,updated_at)
SELECT 'practice-tenancy','tenancy','Property','Tenancy','Tenant and landlord legal issues',1,1,10,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z';
INSERT OR IGNORE INTO service_definitions (id,code,practice_area_id,country_code,name,status,created_at,updated_at)
VALUES ('service-ng-tenancy','ng-tenancy-consult-assess','practice-tenancy','NG','Tenancy consultation and assessment','published','2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z');
INSERT OR IGNORE INTO service_versions (id,service_id,version,status,authoritative_language,definition_json,price_minor,currency,sla_hours,created_at,updated_at)
VALUES ('service-ng-tenancy-v1','service-ng-tenancy',1,'published','en','{"legacyWorkflows":["workflow-ng-la-tenant-v1","workflow-ng-la-landlord-v1"],"legalApprovalRequired":true}',1000000,'NGN',48,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z');
UPDATE intakes SET service_version_id='service-ng-tenancy-v1' WHERE service_version_id IS NULL AND practice_area_code='tenancy';
UPDATE matters SET service_version_id='service-ng-tenancy-v1' WHERE service_version_id IS NULL;

INSERT OR IGNORE INTO practice_areas (id,code,group_name,name,description,urgent,active,sort_order,created_at,updated_at) VALUES
('practice-criminal-defence','criminal-defence','Crime and safety','Criminal defence','Criminal defence intake and assessment',1,1,20,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-police-detention-bail','police-detention-bail','Crime and safety','Police, detention and bail','Police, detention and bail intake and assessment',1,1,21,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-cybercrime-digital-fraud','cybercrime-digital-fraud','Crime and safety','Cybercrime and digital fraud','Cybercrime and fraud intake and assessment',1,1,22,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-domestic-violence-protection','domestic-violence-protection','Family and protection','Domestic violence and protection','Protected safety intake and assessment',1,1,30,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-divorce-separation','divorce-separation','Family and protection','Divorce and separation','Divorce and separation intake and assessment',0,1,31,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-custody-child-support','custody-child-support','Family and protection','Custody and child support','Custody and child support intake and assessment',1,1,32,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-adoption-guardianship','adoption-guardianship','Family and protection','Adoption and guardianship','Adoption and guardianship intake and assessment',0,1,33,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-wills-probate-estates','wills-probate-estates','Estates','Wills, probate and estate administration','Estate intake and assessment',0,1,40,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-succession','succession','Estates','Succession','Succession intake and assessment',0,1,41,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-land-title','land-title','Property','Land title','Land title intake and assessment',0,1,51,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-conveyancing','conveyancing','Property','Conveyancing','Conveyancing intake and assessment',0,1,52,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-real-estate-transactions','real-estate-transactions','Property','Real-estate transactions','Real-estate intake and assessment',0,1,53,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-property-disputes','property-disputes','Property','Property disputes','Property dispute intake and assessment',0,1,54,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-employment','employment','Work','Employment','Employment intake and assessment',0,1,60,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-labour-trade-unions','labour-trade-unions','Work','Labour and trade unions','Labour intake and assessment',0,1,61,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-workplace-discrimination-harassment','workplace-discrimination-harassment','Work','Workplace discrimination and harassment','Workplace rights intake and assessment',1,1,62,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-corporate-governance','corporate-governance','Business','Corporate formation and governance','Corporate intake and assessment',0,1,70,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-startups-smes','startups-smes','Business','Startups and SMEs','Startup and SME intake and assessment',0,1,71,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-regulatory-compliance-licensing','regulatory-compliance-licensing','Business','Regulatory compliance and licensing','Compliance intake and assessment',0,1,72,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-commercial-contracts','commercial-contracts','Business','Commercial contracts','Contract intake and assessment',0,1,73,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-debt-recovery','debt-recovery','Business','Debt recovery','Debt recovery intake and assessment',0,1,74,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-insolvency-restructuring','insolvency-restructuring','Business','Insolvency and restructuring','Insolvency intake and assessment',0,1,75,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-tax','tax','Finance','Tax','Tax intake and assessment',0,1,80,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-banking-fintech','banking-fintech','Finance','Banking and fintech','Banking and fintech intake and assessment',0,1,81,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-insurance','insurance','Finance','Insurance','Insurance intake and assessment',0,1,82,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z');
INSERT OR IGNORE INTO practice_areas (id,code,group_name,name,description,urgent,active,sort_order,created_at,updated_at) VALUES
('practice-consumer-protection','consumer-protection','People and claims','Consumer protection','Consumer intake and assessment',0,1,90,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-personal-injury','personal-injury','People and claims','Personal injury','Personal injury intake and assessment',1,1,91,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-medical-negligence','medical-negligence','People and claims','Medical negligence','Medical negligence intake and assessment',1,1,92,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-civil-claims','civil-claims','People and claims','Civil claims','Civil claim intake and assessment',0,1,93,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-defamation-media','defamation-media','People and claims','Defamation and media','Defamation intake and assessment',0,1,94,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-human-rights','human-rights','Public rights','Human rights','Human rights intake and assessment',1,1,100,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-constitutional-law','constitutional-law','Public rights','Constitutional law','Constitutional intake and assessment',0,1,101,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-public-administrative-law','public-administrative-law','Public rights','Public and administrative law','Public law intake and assessment',0,1,102,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-immigration-citizenship','immigration-citizenship','Mobility','Immigration and citizenship','Immigration intake and assessment',0,1,110,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-trademarks','trademarks','Ideas and technology','Trademarks','Trademark intake and assessment',0,1,120,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-copyright','copyright','Ideas and technology','Copyright','Copyright intake and assessment',0,1,121,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-patents-ip','patents-ip','Ideas and technology','Patents and other intellectual property','Patent and IP intake and assessment',0,1,122,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-technology-privacy-data','technology-privacy-data','Ideas and technology','Technology, privacy and data protection','Technology and privacy intake and assessment',0,1,123,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z');
INSERT OR IGNORE INTO practice_areas (id,code,group_name,name,description,urgent,active,sort_order,created_at,updated_at) VALUES
('practice-education','education','Sectors','Education','Education intake and assessment',0,1,130,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-environmental-law','environmental-law','Sectors','Environmental law','Environmental intake and assessment',0,1,131,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-energy-oil-gas-mining','energy-oil-gas-mining','Sectors','Energy, oil, gas and mining','Energy and extractives intake and assessment',0,1,132,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-maritime-aviation-transport','maritime-aviation-transport','Sectors','Maritime, aviation and transport','Transport intake and assessment',0,1,133,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-election-political-law','election-political-law','Public life','Election and political law','Election intake and assessment',1,1,140,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-ngos-charities-associations','ngos-charities-associations','Organizations','NGOs, charities and associations','Nonprofit intake and assessment',0,1,150,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-professional-disciplinary','professional-disciplinary','Professional','Professional and disciplinary matters','Professional discipline intake and assessment',0,1,160,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-arbitration-mediation-adr','arbitration-mediation-adr','Resolution','Arbitration, mediation and other ADR','ADR intake and assessment',0,1,170,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-appeals','appeals','Resolution','Appeals','Appeal intake and assessment',1,1,171,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-judgment-enforcement','judgment-enforcement','Resolution','Judgment enforcement','Enforcement intake and assessment',0,1,172,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-cross-border','cross-border','Resolution','Cross-border matters','Cross-border intake and assessment',0,1,173,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-not-sure','not-sure','Help me classify','Not sure','Client-confirmed classification intake',0,1,180,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('practice-other','other','Help me classify','Other','Other legal issue intake',0,1,181,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z');

INSERT OR IGNORE INTO service_definitions (id,code,practice_area_id,country_code,name,status,created_at,updated_at)
SELECT 'service-ng-' || code, 'ng-' || code || '-consult-assess', id, 'NG', name || ': consultation and assessment', 'published',
  '2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z' FROM practice_areas;
INSERT OR IGNORE INTO service_versions (id,service_id,version,status,authoritative_language,definition_json,price_minor,currency,sla_hours,created_at,updated_at)
SELECT service_definitions.id || '-v1', service_definitions.id, 1, 'published', 'en',
  '{"syntheticStaging":true,"legalApprovalRequired":true,"languages":["en","pcm","ha","yo","ig"]}',
  1000000, 'NGN', 48, '2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z' FROM service_definitions;

INSERT OR IGNORE INTO workflows (id,country_code,state_code,service_code,tenancy_role,version,status,authoritative_language,definition_json,created_at,updated_at)
SELECT 'workflow-compat-' || sd.code || '-v1','NG','ALL',sd.code,'tenant',1,'review','en',
  '{"compatibilityShell":true,"authoritativeServiceVersion":"' || sd.id || '-v1"}',
  '2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z' FROM service_definitions sd WHERE sd.code <> 'ng-tenancy-consult-assess';

INSERT OR IGNORE INTO service_jurisdictions (service_version_id,country_code,state_code,status,rules_json)
SELECT sv.id,'NG','*','active','{"syntheticStaging":true,"coverage":"all_36_states_and_fct"}' FROM service_versions sv;
