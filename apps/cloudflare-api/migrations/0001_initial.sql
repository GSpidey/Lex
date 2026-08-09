PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('client','lawyer','admin','super_admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  phone_encrypted TEXT, phone_hash TEXT UNIQUE, phone_verified_at TEXT,
  email_encrypted TEXT, email_hash TEXT UNIQUE, email_verified_at TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','pcm')),
  mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0,1)), mfa_secret_encrypted TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email')),
  purpose TEXT NOT NULL, destination_hash TEXT NOT NULL, destination_encrypted TEXT NOT NULL, code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5, expires_at TEXT NOT NULL,
  consumed_at TEXT, superseded_at TEXT, request_ip_hash TEXT, device_hash TEXT, created_at TEXT NOT NULL
);
CREATE INDEX auth_destination_created_idx ON auth_challenges(destination_hash, created_at);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL UNIQUE REFERENCES auth_challenges(id), user_id TEXT NOT NULL REFERENCES users(id), access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL UNIQUE, device_name TEXT, device_hash TEXT, expires_at TEXT NOT NULL,
  refresh_expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id), whatsapp INTEGER NOT NULL DEFAULT 1 CHECK (whatsapp IN (0,1)),
  push INTEGER NOT NULL DEFAULT 0 CHECK (push IN (0,1)), email INTEGER NOT NULL DEFAULT 0 CHECK (email IN (0,1)), updated_at TEXT NOT NULL
);
CREATE TABLE push_devices (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE, token_encrypted TEXT NOT NULL,
  platform TEXT NOT NULL, consent_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE workflows (
  id TEXT PRIMARY KEY, country_code TEXT NOT NULL, state_code TEXT NOT NULL, service_code TEXT NOT NULL,
  tenancy_role TEXT NOT NULL CHECK (tenancy_role IN ('tenant','landlord')), version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','review','approved','published','retired')),
  authoritative_language TEXT NOT NULL DEFAULT 'en', definition_json TEXT NOT NULL, approved_by TEXT REFERENCES users(id),
  approved_at TEXT, effective_at TEXT, retired_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(country_code,state_code,service_code,tenancy_role,version)
);
CREATE TABLE intakes (
  id TEXT PRIMARY KEY, client_user_id TEXT NOT NULL REFERENCES users(id), language TEXT NOT NULL CHECK (language IN ('en','pcm')),
  tenancy_role TEXT NOT NULL CHECK (tenancy_role IN ('tenant','landlord')), country_code TEXT NOT NULL, state_code TEXT NOT NULL,
  source_channel TEXT NOT NULL, workflow_id TEXT NOT NULL REFERENCES workflows(id), state TEXT NOT NULL DEFAULT 'draft', narrative TEXT,
  desired_outcome TEXT, structured_summary_json TEXT, summary_version INTEGER, confirmed_at TEXT, submitted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX intakes_client_idx ON intakes(client_user_id);
CREATE TABLE intake_answers (
  intake_id TEXT NOT NULL REFERENCES intakes(id) ON DELETE CASCADE, question_key TEXT NOT NULL, value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY(intake_id,question_key)
);
CREATE TABLE consent_records (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), intake_id TEXT REFERENCES intakes(id), consent_type TEXT NOT NULL,
  content_version TEXT NOT NULL, language TEXT NOT NULL, accepted INTEGER NOT NULL CHECK (accepted IN (0,1)),
  recorded_at TEXT NOT NULL, withdrawn_at TEXT, source_ip_hash TEXT
);
CREATE TABLE matters (
  id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, client_user_id TEXT NOT NULL REFERENCES users(id), intake_id TEXT NOT NULL UNIQUE REFERENCES intakes(id),
  workflow_id TEXT NOT NULL REFERENCES workflows(id), country_code TEXT NOT NULL, state_code TEXT NOT NULL, state TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'standard', selected_lawyer_id TEXT, paid_at TEXT, information_complete_at TEXT, due_at TEXT, closed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX matters_client_idx ON matters(client_user_id);
CREATE INDEX matters_state_due_idx ON matters(state,due_at);
CREATE TABLE lawyer_profiles (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id), display_name TEXT NOT NULL, supreme_court_number TEXT NOT NULL UNIQUE,
  year_of_call INTEGER NOT NULL, firm_name TEXT, bio TEXT NOT NULL, verification_status TEXT NOT NULL DEFAULT 'pending', verification_expires_at TEXT,
  available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0,1)), urgent_available INTEGER NOT NULL DEFAULT 0 CHECK (urgent_available IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE lawyer_capabilities (
  lawyer_id TEXT NOT NULL REFERENCES lawyer_profiles(id) ON DELETE CASCADE, kind TEXT NOT NULL, value TEXT NOT NULL,
  PRIMARY KEY(lawyer_id,kind,value)
);
CREATE TABLE payout_accounts (
  id TEXT PRIMARY KEY, lawyer_id TEXT NOT NULL REFERENCES lawyer_profiles(id), provider TEXT NOT NULL CHECK (provider IN ('paystack','flutterwave')),
  subaccount_encrypted TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(lawyer_id,provider)
);
CREATE TABLE lawyer_matches (
  id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES matters(id), lawyer_id TEXT NOT NULL REFERENCES lawyer_profiles(id),
  position INTEGER NOT NULL, score INTEGER NOT NULL, selected_at TEXT, expires_at TEXT, created_at TEXT NOT NULL, UNIQUE(matter_id,lawyer_id)
);
CREATE TABLE conflict_checks (
  id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES matters(id), lawyer_id TEXT NOT NULL REFERENCES lawyer_profiles(id), decision TEXT NOT NULL,
  reason_code TEXT NOT NULL, private_note_encrypted TEXT, decided_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, UNIQUE(matter_id,lawyer_id)
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES matters(id), sender_user_id TEXT REFERENCES users(id), channel TEXT NOT NULL,
  body TEXT NOT NULL, message_type TEXT NOT NULL DEFAULT 'message', provider_idempotency_key TEXT UNIQUE, created_at TEXT NOT NULL
);
CREATE INDEX messages_matter_idx ON messages(matter_id,created_at);
CREATE TABLE evidence_items (
  id TEXT PRIMARY KEY, matter_id TEXT REFERENCES matters(id), intake_id TEXT REFERENCES intakes(id), owner_user_id TEXT NOT NULL REFERENCES users(id),
  object_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
  sha256 TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'quarantined', retention_until TEXT, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX evidence_matter_idx ON evidence_items(matter_id);
CREATE TABLE assessments (
  id TEXT PRIMARY KEY, matter_id TEXT NOT NULL UNIQUE REFERENCES matters(id), lawyer_id TEXT NOT NULL REFERENCES lawyer_profiles(id), title TEXT NOT NULL,
  body TEXT NOT NULL, limitations TEXT NOT NULL, next_steps_json TEXT NOT NULL, ai_draft_run_id TEXT, lawyer_attested_at TEXT NOT NULL,
  delivered_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE payments (
  id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES matters(id), provider TEXT NOT NULL CHECK (provider IN ('paystack','flutterwave')),
  internal_reference TEXT NOT NULL UNIQUE, provider_reference TEXT, state TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'NGN', platform_share_bps INTEGER NOT NULL, lawyer_share_bps INTEGER NOT NULL, fee_bearer TEXT NOT NULL,
  workflow_id TEXT NOT NULL REFERENCES workflows(id), lawyer_id TEXT NOT NULL REFERENCES lawyer_profiles(id), snapshot_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, verified_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(provider,provider_reference)
);
CREATE INDEX payments_matter_idx ON payments(matter_id);
CREATE TABLE refunds (
  id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id), provider_reference TEXT UNIQUE, reason TEXT NOT NULL,
  amount_minor INTEGER NOT NULL, state TEXT NOT NULL, requested_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE provider_events (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, event_key TEXT NOT NULL, signature_valid INTEGER NOT NULL CHECK (signature_valid IN (0,1)),
  raw_payload TEXT NOT NULL, status TEXT NOT NULL, received_at TEXT NOT NULL, processed_at TEXT, error TEXT, UNIQUE(provider,event_key)
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, queue_name TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL,
  state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL, locked_at TEXT, completed_at TEXT, last_error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX jobs_state_available_idx ON jobs(state,available_at);
CREATE TABLE privacy_requests (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL, status TEXT NOT NULL, details TEXT,
  response_object_key TEXT, due_at TEXT NOT NULL, completed_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id), action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  matter_id TEXT REFERENCES matters(id), metadata_json TEXT NOT NULL DEFAULT '{}', request_id TEXT, occurred_at TEXT NOT NULL
);
CREATE INDEX audit_entity_idx ON audit_events(entity_type,entity_id,occurred_at);
CREATE INDEX audit_matter_idx ON audit_events(matter_id,occurred_at);
CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY, matter_id TEXT REFERENCES matters(id), intake_id TEXT REFERENCES intakes(id), purpose TEXT NOT NULL, model TEXT NOT NULL,
  prompt_version TEXT NOT NULL, schema_version TEXT NOT NULL, input_refs_json TEXT NOT NULL, output_json TEXT, confidence_millis INTEGER,
  requires_human_review INTEGER NOT NULL DEFAULT 0 CHECK (requires_human_review IN (0,1)), reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT,
  token_use_json TEXT, latency_ms INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE transcriptions (
  id TEXT PRIMARY KEY, intake_id TEXT NOT NULL REFERENCES intakes(id), evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence_items(id),
  language TEXT NOT NULL, status TEXT NOT NULL, transcript TEXT, confirmed_transcript TEXT, confidence_millis INTEGER, model TEXT,
  confirmed_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
