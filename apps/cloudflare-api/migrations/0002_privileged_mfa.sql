CREATE TABLE pre_auth_tokens (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), challenge_id TEXT NOT NULL REFERENCES auth_challenges(id), token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('mfa_setup','mfa_verify')), expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL
);
