-- Library KV storage backed by the existing D1 database. No new cloud service.
CREATE TABLE IF NOT EXISTS oauth_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT 'null',
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_kv_expiry ON oauth_kv(expires_at);
CREATE TABLE IF NOT EXISTS oauth_replays (
  key TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS request_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS web_sessions (
  session_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
ALTER TABLE google_credentials ADD COLUMN credential_version TEXT NOT NULL DEFAULT '';
