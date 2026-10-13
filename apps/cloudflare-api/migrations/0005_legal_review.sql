ALTER TABLE legal_documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','owners'));
ALTER TABLE legal_documents ADD COLUMN acceptance_kind TEXT NOT NULL DEFAULT 'agreement' CHECK (acceptance_kind IN ('agreement','acknowledgement','optional_consent','notice'));
ALTER TABLE legal_document_versions ADD COLUMN content_hash TEXT;
ALTER TABLE legal_document_versions ADD COLUMN unresolved_fields_json TEXT NOT NULL DEFAULT '[]';
CREATE TABLE auth_step_up_attempts (
 user_id TEXT NOT NULL REFERENCES users(id), window_start INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(user_id,window_start)
);
CREATE TABLE legal_review_packets (
 id TEXT PRIMARY KEY,
 requested_by TEXT NOT NULL REFERENCES users(id),
 reviewer_id TEXT NOT NULL REFERENCES users(id),
 packet_hash TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','changes_requested','revoked')),
 token_hash TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 claimed_at TEXT,
 created_at TEXT NOT NULL,
 CHECK(requested_by<>reviewer_id)
);
CREATE TABLE legal_review_items (
 packet_id TEXT NOT NULL REFERENCES legal_review_packets(id),
 document_version_id TEXT NOT NULL REFERENCES legal_document_versions(id),
 content_hash TEXT NOT NULL,
 PRIMARY KEY(packet_id,document_version_id)
);
CREATE TABLE legal_review_events (
 id TEXT PRIMARY KEY,
 packet_id TEXT NOT NULL REFERENCES legal_review_packets(id),
 actor_user_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK (kind IN ('comment','approved','changes_requested','revoked','published')),
 body TEXT NOT NULL,
 signed_name TEXT,
 packet_hash TEXT NOT NULL,
 occurred_at TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 UNIQUE(packet_id,actor_user_id,idempotency_key)
);
CREATE TABLE legal_consent_events (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 document_version_id TEXT NOT NULL REFERENCES legal_document_versions(id),
 kind TEXT NOT NULL CHECK (kind IN ('accepted','acknowledged','withdrawn')),
 language TEXT NOT NULL,
 channel TEXT NOT NULL,
 device_hash TEXT NOT NULL,
 source_ip_hash TEXT NOT NULL,
 occurred_at TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX legal_review_recipient_idx ON legal_review_packets(reviewer_id,state);
CREATE INDEX legal_consent_user_idx ON legal_consent_events(user_id,occurred_at);
INSERT INTO legal_consent_events (id,user_id,document_version_id,kind,language,channel,device_hash,source_ip_hash,occurred_at,idempotency_key)
 SELECT 'legacy-accepted-'||id,user_id,document_version_id,'accepted',language,channel,COALESCE(device_hash,'legacy-unavailable'),COALESCE(source_ip_hash,'legacy-unavailable'),accepted_at,'legacy-accepted-'||id FROM legal_acceptances;
INSERT INTO legal_consent_events (id,user_id,document_version_id,kind,language,channel,device_hash,source_ip_hash,occurred_at,idempotency_key)
 SELECT 'legacy-withdrawn-'||id,user_id,document_version_id,'withdrawn',language,channel,COALESCE(device_hash,'legacy-unavailable'),COALESCE(source_ip_hash,'legacy-unavailable'),withdrawn_at,'legacy-withdrawn-'||id FROM legal_acceptances WHERE withdrawn_at IS NOT NULL;
CREATE TRIGGER legal_packet_identity_locked BEFORE UPDATE OF requested_by,reviewer_id,packet_hash,created_at ON legal_review_packets BEGIN SELECT RAISE(ABORT,'Immutable review identity'); END;
CREATE TRIGGER legal_version_no_delete BEFORE DELETE ON legal_document_versions WHEN OLD.status IN ('published','superseded','retired') OR EXISTS(SELECT 1 FROM legal_review_items WHERE document_version_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Retain reviewed legal versions'); END;
CREATE TRIGGER legal_version_no_unpublish BEFORE UPDATE OF status ON legal_document_versions WHEN OLD.status IN ('published','superseded','retired') AND NEW.status NOT IN ('published','superseded','retired') BEGIN SELECT RAISE(ABORT,'Create a new draft instead of unpublishing'); END;
CREATE TRIGGER legal_version_content_locked BEFORE UPDATE OF content_markdown,content_hash,language,document_id,version,unresolved_fields_json ON legal_document_versions
 WHEN EXISTS(SELECT 1 FROM legal_review_items WHERE document_version_id=OLD.id) OR OLD.status IN ('published','superseded','retired')
 BEGIN SELECT RAISE(ABORT,'Reviewed legal content is immutable; create a new version'); END;
CREATE TRIGGER legal_review_items_no_update BEFORE UPDATE ON legal_review_items BEGIN SELECT RAISE(ABORT,'Immutable review item'); END;
CREATE TRIGGER legal_review_items_no_delete BEFORE DELETE ON legal_review_items BEGIN SELECT RAISE(ABORT,'Immutable review item'); END;
CREATE TRIGGER legal_review_events_no_update BEFORE UPDATE ON legal_review_events BEGIN SELECT RAISE(ABORT,'Append-only review history'); END;
CREATE TRIGGER legal_review_events_no_delete BEFORE DELETE ON legal_review_events BEGIN SELECT RAISE(ABORT,'Append-only review history'); END;
CREATE TRIGGER legal_consent_events_no_update BEFORE UPDATE ON legal_consent_events BEGIN SELECT RAISE(ABORT,'Append-only consent history'); END;
CREATE TRIGGER legal_consent_events_no_delete BEFORE DELETE ON legal_consent_events BEGIN SELECT RAISE(ABORT,'Append-only consent history'); END;
UPDATE legal_documents SET acceptance_kind='acknowledgement' WHERE code='privacy-notice';
UPDATE legal_documents SET acceptance_kind='optional_consent' WHERE code IN ('electronic-communications','ai-routing-disclosure','cookie-notice');
UPDATE legal_documents SET acceptance_kind='notice' WHERE code IN ('accessibility','copyright-ip','emergency-disclaimer','subprocessors','data-rights-retention','complaints-disputes');
