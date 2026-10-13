-- Explicit PostgreSQL schema, never a runtime translation of D1 SQL.
-- This is the first migration slice, not the full application data graph.
CREATE TABLE lex.users (
 id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('client','lawyer','admin','super_admin')),
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
 phone_encrypted TEXT, phone_hash TEXT UNIQUE, phone_verified_at TIMESTAMPTZ,
 email_encrypted TEXT, email_hash TEXT UNIQUE, email_verified_at TIMESTAMPTZ,
 preferred_language TEXT NOT NULL DEFAULT 'en', preferred_language_v2 TEXT,
 mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE, mfa_secret_encrypted TEXT,
 display_name TEXT, default_mobile_role TEXT, default_web_role TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE lex.legal_documents (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, audience TEXT NOT NULL,
 required_at TEXT, optional BOOLEAN NOT NULL DEFAULT FALSE,
 visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','owners')),
 acceptance_kind TEXT NOT NULL DEFAULT 'agreement' CHECK(acceptance_kind IN ('agreement','acknowledgement','optional_consent','notice')),
 created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE lex.legal_document_versions (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES lex.legal_documents(id),
 version INTEGER NOT NULL CHECK(version>0), language TEXT NOT NULL DEFAULT 'en',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','legal_review','approved','published','superseded','retired')),
 content_markdown TEXT NOT NULL, company_placeholder_present BOOLEAN NOT NULL DEFAULT TRUE,
 effective_at TIMESTAMPTZ, approved_by TEXT REFERENCES lex.users(id), approval_reference TEXT,
 content_hash TEXT, unresolved_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(unresolved_fields_json)='array'),
 created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 UNIQUE(document_id,version,language)
);
CREATE INDEX legal_version_effective_idx ON lex.legal_document_versions(document_id,language,status,effective_at,version);
CREATE FUNCTION lex.protect_published_legal_version() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('published','superseded','retired') THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retain published legal versions'; END IF;
  IF NEW.status NOT IN ('published','superseded','retired') THEN RAISE EXCEPTION 'Create a new draft instead of unpublishing'; END IF;
  IF ROW(NEW.content_markdown,NEW.content_hash,NEW.language,NEW.document_id,NEW.version,NEW.unresolved_fields_json)
      IS DISTINCT FROM ROW(OLD.content_markdown,OLD.content_hash,OLD.language,OLD.document_id,OLD.version,OLD.unresolved_fields_json)
      THEN RAISE EXCEPTION 'Published legal content is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER legal_version_immutable BEFORE UPDATE OR DELETE ON lex.legal_document_versions
 FOR EACH ROW EXECUTE FUNCTION lex.protect_published_legal_version();
