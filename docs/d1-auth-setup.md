# Google OAuth D1 storage setup (not live yet)

The Google OAuth integration requires two pieces that have NOT been implemented:
(1) OAuth authorization of ChatGPT/Claude as MCP clients and an authenticated user session;
(2) routing Google OAuth start and callback to the new storage utilities.

Until these exist, do NOT paste OAuth credentials into the worker or expose coursework.

## Provision Cloudflare D1

Cloudflare Dashboard -> Storage & databases -> D1 -> Create database:
`classroom-ai-auth`.

Use Wrangler to apply `migrations/0001_auth.sql` to the D1 database.
The resulting D1 database ID must be added to `wrangler.toml` via
`[[d1_databases]] binding = "DB"` and `database_id = "..." `.
Do not guess database IDs. This binds state and encrypted credentials to
Cloudflare's storage.

## Secret names (DO NOT share their values)

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY` (32 random bytes, standard base64)

Set as encrypted Cloudflare Worker secrets. DO NOT store secrets in git,
Wrangler vars or screenshots. Rotate Google Client Secret if ever exposed.

## Privacy and costs

Database contains ONLY opaque user identifiers, one-time OAuth session
state, and AES-256-GCM encrypted Google refresh tokens. It does not store
coursework or generated answers. D1 has free quotas; monitor actual usage.

## Security guarantees and limitations

- D1 atomic DELETE RETURNING protects OAuth state from replay.
- OAuth verifier and refresh token encrypted at rest.
- Strict user ID isolation is required at every caller: caller-supplied user
  IDs MUST NOT be trusted.
- The encryption key must be retained safely across deployments. Losing it
  makes stored credentials unrecoverable; rotate through a migration plan.
- A persistent user-session system, CSRF protection, MFA account policy and
  standards-compliant MCP authorization MUST be implemented and verified
  before these helpers can be used with real Google accounts.
- This branch is deliberately a draft and has NOT been deployed.
