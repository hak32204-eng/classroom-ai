# Classroom AI

Google Classroom MCP connector for Cloudflare Workers and D1. This branch implements authorization and read-only tools. **Production activation and real ChatGPT/Claude compatibility are still pending.** `AUTH_ENABLED` defaults to `false`.

## Implemented

- OAuth server using pinned `@cloudflare/workers-oauth-provider`, dynamic client registration, resource discovery and mandatory PKCE S256.
- Browser-bound consent and callback, verified Google OIDC identity/nonce, AES-GCM encrypted refresh tokens and per-account credential versions.
- Tools: `connection_status`, `list_courses`, `list_assignments`, `get_assignment`, `disconnect_google` (requires `confirm: true`). No submissions or grading.
- Classroom data is fetched on demand; attachment contents are not downloaded. No coursework, AI responses or Google access tokens are persisted.
- Disconnect deletes local Google credentials and browser sessions, attempts Google revocation and denies existing MCP grants data access/refresh. Reconnecting invalidates previous client connections, which must authorize again.
- Public privacy/deletion pages, bounded requests, rate limits and daily expired-record cleanup.

MCP: `https://classroom-ai.hak32204.workers.dev/mcp`. Google callback: `https://classroom-ai.hak32204.workers.dev/auth/google/callback`.

## Development

Use Node.js 24 (native TypeScript stripping, module hooks and SQLite in tests).

```sh
npm install --no-audit --no-fund
npm run check
npm test
npx wrangler deploy --dry-run
```

Tests use the real OAuth provider and SQLite SQL with mocked Google HTTP/JWK responses: two-account isolation, PKCE, browser binding, nonce checks, concurrent callback protection, code replay, refresh, revocation, validation and fail-closed setup. They do not prove real Google consent, Cloudflare runtime behavior or client compatibility. See [AUTH-SETUP.md](AUTH-SETUP.md) for the release checklist.

## Limits and retention

Testing-stage connector, not a verified public Google application. Google testing restrictions, Cloudflare quotas and AI client requirements still apply. There is no paid AI API; free-tier quotas do not guarantee zero hosting cost at arbitrary traffic.

Stateless JSON Streamable HTTP; GET streaming is not implemented. DCR is supported; CIMD is disabled. List operations stop after 20 pages of 100 items, with a controlled error rather than silent truncation. Google requests time out after 15 seconds with no automatic quota retries. Each data tool refreshes its access token.

MCP access tokens last 15 minutes, refresh grants/registrations seven days, browser sessions 24 hours and consent transactions ten minutes. Daily cron removes expired technical records; backups have separate Cloudflare retention. Google credentials remain until disconnect or invalid-grant. Successful token redemptions have a replay fence; a lost response can require reconnection.

`src/google-link.ts` and `src/mcp-identity.ts` remain independently tested earlier helpers. Active HTTP routes use `authorization.ts`, `google-account.ts` and the official provider instead of accepting external identity JWTs.

Never put secrets, private coursework or personal data in GitHub Issues or chat.
