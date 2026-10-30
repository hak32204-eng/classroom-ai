-- Apply only after adding a Cloudflare D1 binding called DB.
-- Stores only opaque user identifiers and encrypted credentials.
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  verifier_ciphertext TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS google_credentials (
  user_id TEXT PRIMARY KEY,
  refresh_token_ciphertext TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
