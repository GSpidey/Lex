PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN default_mobile_role TEXT;
ALTER TABLE users ADD COLUMN default_web_role TEXT;
ALTER TABLE sessions ADD COLUMN active_role TEXT;
ALTER TABLE sessions ADD COLUMN last_step_up_at TEXT;

CREATE TABLE user_role_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('client','lawyer','operations','owner')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  assigned_by TEXT REFERENCES users(id),
  assignment_source TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(user_id,role)
);
CREATE INDEX user_role_assignments_user_status_idx ON user_role_assignments(user_id,status);

INSERT OR IGNORE INTO user_role_assignments (id,user_id,role,status,assignment_source,assigned_at)
SELECT 'legacy-role-' || id, id,
  CASE role WHEN 'admin' THEN 'operations' WHEN 'super_admin' THEN 'owner' ELSE role END,
  'active','legacy_backfill',created_at
FROM users;

UPDATE users
SET default_mobile_role=CASE WHEN role='client' THEN 'client' ELSE CASE role WHEN 'admin' THEN 'operations' WHEN 'super_admin' THEN 'owner' ELSE role END END,
    default_web_role=CASE role WHEN 'admin' THEN 'operations' WHEN 'super_admin' THEN 'owner' ELSE role END
WHERE default_mobile_role IS NULL OR default_web_role IS NULL;

UPDATE sessions
SET active_role=(
  SELECT CASE users.role WHEN 'admin' THEN 'operations' WHEN 'super_admin' THEN 'owner' ELSE users.role END
  FROM users WHERE users.id=sessions.user_id
)
WHERE active_role IS NULL;

CREATE TABLE founder_bootstrap_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  contact_fingerprint TEXT NOT NULL,
  assigned_roles_json TEXT NOT NULL,
  verification_source TEXT NOT NULL,
  created_by TEXT,
  occurred_at TEXT NOT NULL,
  UNIQUE(contact_fingerprint)
);

CREATE TABLE privileged_action_requests (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  requested_by TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','executed','rejected','expired','cancelled')),
  expires_at TEXT NOT NULL,
  executed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX privileged_action_requests_state_idx ON privileged_action_requests(state,created_at);

CREATE TABLE privileged_action_approvals (
  request_id TEXT NOT NULL REFERENCES privileged_action_requests(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  decided_at TEXT NOT NULL,
  PRIMARY KEY(request_id,owner_user_id)
);

CREATE TABLE professional_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  legal_name TEXT NOT NULL,
  public_name TEXT NOT NULL,
  professional_email TEXT NOT NULL,
  professional_phone TEXT NOT NULL,
  date_of_birth_encrypted TEXT,
  supreme_court_number TEXT NOT NULL,
  year_of_call INTEGER NOT NULL,
  jurisdiction_of_call TEXT NOT NULL DEFAULT 'Nigeria',
  firm_name TEXT,
  office_address TEXT,
  website TEXT,
  biography TEXT NOT NULL,
  languages_json TEXT NOT NULL,
  state_codes_json TEXT NOT NULL,
  practice_area_codes_json TEXT NOT NULL,
  consultation_modes_json TEXT NOT NULL,
  weekly_capacity INTEGER NOT NULL DEFAULT 5,
  urgent_available INTEGER NOT NULL DEFAULT 0 CHECK (urgent_available IN (0,1)),
  conduct_declaration INTEGER NOT NULL DEFAULT 0 CHECK (conduct_declaration IN (0,1)),
  disciplinary_disclosure TEXT,
  terms_version TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','information_requested','under_review','approved','declined','withdrawn')),
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES users(id),
  review_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX professional_applications_state_idx ON professional_applications(state,created_at);

CREATE TABLE professional_credentials (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES professional_applications(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL,
  identifier TEXT,
  evidence_object_key TEXT,
  issued_at TEXT,
  expires_at TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','verified','expired','rejected','revoked')),
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  verification_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX professional_credentials_application_idx ON professional_credentials(application_id,state);

CREATE TABLE professional_verification_reviews (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES professional_applications(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('information_requested','approved','declined','suspended','renewed')),
  reason TEXT NOT NULL,
  evidence_reference TEXT,
  licence_expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  audience TEXT NOT NULL,
  required_at TEXT,
  optional INTEGER NOT NULL DEFAULT 0 CHECK (optional IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE legal_document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  version INTEGER NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','legal_review','approved','published','superseded','retired')),
  content_markdown TEXT NOT NULL,
  company_placeholder_present INTEGER NOT NULL DEFAULT 1 CHECK (company_placeholder_present IN (0,1)),
  effective_at TEXT,
  approved_by TEXT REFERENCES users(id),
  approval_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(document_id,version,language)
);
CREATE INDEX legal_document_versions_status_idx ON legal_document_versions(status,updated_at);

CREATE TABLE legal_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  document_version_id TEXT NOT NULL REFERENCES legal_document_versions(id),
  accepted INTEGER NOT NULL CHECK (accepted IN (0,1)),
  channel TEXT NOT NULL,
  language TEXT NOT NULL,
  device_hash TEXT,
  source_ip_hash TEXT,
  accepted_at TEXT NOT NULL,
  withdrawn_at TEXT,
  UNIQUE(user_id,document_version_id,channel)
);

CREATE TABLE cookie_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  essential INTEGER NOT NULL DEFAULT 1 CHECK (essential=1),
  analytics INTEGER NOT NULL DEFAULT 0 CHECK (analytics IN (0,1)),
  preferences INTEGER NOT NULL DEFAULT 0 CHECK (preferences IN (0,1)),
  marketing INTEGER NOT NULL DEFAULT 0 CHECK (marketing IN (0,1)),
  policy_version TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE channel_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  intake_id TEXT REFERENCES intakes(id),
  channel TEXT NOT NULL CHECK (channel IN ('mobile','web','whatsapp')),
  language TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','paused','awaiting_confirmation','human_review','completed','opted_out','deleted')),
  ai_disclosure_version TEXT NOT NULL,
  ai_enabled INTEGER NOT NULL DEFAULT 1 CHECK (ai_enabled IN (0,1)),
  classification_json TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX channel_conversations_user_state_idx ON channel_conversations(user_id,state,updated_at);

CREATE TABLE conversation_turns (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES channel_conversations(id) ON DELETE CASCADE,
  actor TEXT NOT NULL CHECK (actor IN ('client','assistant','operations','system')),
  body TEXT NOT NULL,
  provider_message_id TEXT,
  client_message_id TEXT,
  ai_run_id TEXT REFERENCES ai_runs(id),
  status TEXT NOT NULL DEFAULT 'recorded',
  created_at TEXT NOT NULL,
  UNIQUE(conversation_id,client_message_id),
  UNIQUE(provider_message_id)
);
CREATE INDEX conversation_turns_conversation_idx ON conversation_turns(conversation_id,created_at);

CREATE TABLE conversation_handoffs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES channel_conversations(id),
  reason TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','assigned','resolved','cancelled')),
  assigned_to TEXT REFERENCES users(id),
  resolution TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE conversation_links (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES channel_conversations(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO legal_documents (id,code,title,audience,required_at,optional,created_at,updated_at) VALUES
('legal-terms','platform-terms','Platform Terms and Conditions','all','account_creation',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-privacy','privacy-notice','Privacy Notice','all','account_creation',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-cookies','cookie-notice','Cookie Notice and Preferences','web','web_visit',1,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-eula','mobile-eula','Mobile End User Licence Agreement','client','account_creation',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-marketplace','marketplace-disclosure','Client Marketplace and Legal Services Disclosure','client','matter_submission',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-lawyer','lawyer-participation','Lawyer Participation Terms','lawyer','professional_application',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-consultation','consultation-assessment','Consultation and Assessment Terms','client,lawyer','payment',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-representation','representation-engagement','Representation Engagement Terms','client,lawyer','representation_acceptance',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-payments','payments-refunds','Payments, Cancellations, Refunds and Settlement Policy','client,lawyer','payment',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-ai','ai-routing-disclosure','AI-Assisted Intake and Automated Routing Disclosure','client','ai_intake',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-comms','electronic-communications','Electronic Communications Consent','all','notification_opt_in',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-protected','protected-accounts','Minor, Guardian, Safeguarding and Organization Terms','protected_accounts','protected_account',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-use','acceptable-use','Acceptable Use Policy','all','account_creation',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-complaints','complaints-disputes','Complaints and Dispute Resolution Procedure','all',NULL,0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-retention','data-rights-retention','Data Rights and Retention Policy','all',NULL,0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-accessibility','accessibility','Accessibility Statement','all',NULL,0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-ip','copyright-ip','Copyright and Intellectual Property Notice','all',NULL,0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-emergency','emergency-outcomes','Emergency and No-Outcome-Guarantee Disclaimer','client','matter_submission',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'),
('legal-cross-border','cross-border-subprocessors','Cross-Border Processing and Subprocessors Notice','all','account_creation',0,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z');

INSERT OR IGNORE INTO legal_document_versions
(id,document_id,version,language,status,content_markdown,company_placeholder_present,created_at,updated_at)
SELECT id || '-en-v1',id,1,'en','draft',
  '# ' || title || char(10) || char(10) ||
  '> SYNTHETIC STAGING DRAFT - LEGAL REVIEW REQUIRED' || char(10) || char(10) ||
  'Lex is currently operated under the placeholder legal entity [PARENT_COMPANY_LEGAL_NAME]. This draft is provided for controlled product testing and must not be treated as approved production legal text.' || char(10) || char(10) ||
  'This document applies to the audience and product stage identified in the Lex Legal Centre. It must be read together with the Privacy Notice, marketplace disclosures, safety limitations, and any separately accepted lawyer engagement.' || char(10) || char(10) ||
  'Lex is a managed legal-access technology platform. Lex is not a law firm, does not provide emergency services, does not guarantee outcomes, and does not replace advice delivered and attested by an independently verified legal practitioner.' || char(10) || char(10) ||
  'Users must provide accurate information, protect account access, avoid uploading unrelated secrets or payment credentials, and review all AI-organized information before it is shared. Automated output is not legal advice and may be corrected or challenged.' || char(10) || char(10) ||
  'Questions, complaints, privacy requests, and accessibility requests will be handled through the authenticated Lex support and privacy workflows. Governing-law, registered-address, merchant, controller, and formal contact clauses remain pending partner and company review.',
  1,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z'
FROM legal_documents;
