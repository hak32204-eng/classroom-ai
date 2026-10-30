# OAuth milestone progress

- A Google OAuth web client, test audience, and redirect URL have been configured by the project owner in Google Cloud.
- Cloudflare Worker is deployed at `https://classroom-ai.hak32204.workers.dev`.
- `src/google-oauth.ts` provides parameter validation, cryptographic PKCE helpers, Google authorization URL construction, and server-side code exchange.
- `src/classroom.ts` provides read-only Google Classroom courses and coursework fetching with pagination.

**These helpers are not wired to public routes or MCP tools. Google OAuth is NOT yet operational.**

## Security blockers before activating the flow

1. Separate MCP client authentication (the user in ChatGPT/Claude) from Google authorization.
2. Store OAuth state, verifier, expiration and user/session binding in a secure one-time store with atomic consume (Durable Object/D1 transaction). Do not rely on eventually consistent KV for one-time replay protection.
3. Securely encrypt per-user refresh tokens at rest, with a rotation strategy and account disconnection.
4. Handle authorization denial, session fixation, state replay, PKCE validation, revoked tokens, rate limits.
5. Add tests with mocks of Google token exchange and Classroom API.
6. Wire `/auth/google/callback` only after the session layer exists.
7. Update Cloudflare encrypted secrets via Dashboard; never commit client secret or downloaded JSON.

## Intended callback

`https://classroom-ai.hak32204.workers.dev/auth/google/callback`

## Read-only scopes

- `https://www.googleapis.com/auth/classroom.courses.readonly`
- `https://www.googleapis.com/auth/classroom.coursework.me.readonly`

Google Cloud may require API scope approval and OAuth app verification for public use.
