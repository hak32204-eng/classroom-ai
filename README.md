# Classroom AI

Google Classroom MCP connector for Cloudflare Workers and D1. A live test deployment runs from `deploy/google-oauth-test`, with Google restricted to the owner's approved test users. Real Google sign-in, courses, assignment details and MCP refresh passed on 2026-10-30. ChatGPT installation and live course listing also passed; Claude compatibility remains pending. This development branch defaults `AUTH_ENABLED` to `false`.

## Implemented

- OAuth server using pinned `@cloudflare/workers-oauth-provider`, dynamic client registration, resource discovery and mandatory PKCE S256.
- Browser-bound consent and callback, verified Google OIDC identity/nonce, AES-GCM encrypted refresh tokens and per-account credential versions.
- Tools: `connection_status`, `list_courses`, `search_assignments`, `list_assignments`, `get_assignment`, `disconnect_google` (requires `confirm: true`). No submissions or grading.
- `search_assignments` returns a compact overview across active courses, sorted by deadline with undated work last. Optional filters: `query` (title/description), `course` (name/section), `dueFrom`/`dueTo` (inclusive UTC dates), `includeArchived` and `limit` (1–100, default 30). It reports truncation and unavailable courses explicitly. No submission/completion status is inferred. For local-day questions, clients must convert boundaries to UTC and inspect `dueAt`. More than 30 matching courses requires a narrower course filter.

 - Classroom data is fetched on demand; attachment contents are not downloaded. No coursework, AI responses or Google access tokens are persisted.
 - Additional MCP clients can connect to the same Google account concurrently. Disconnect deletes local Google credentials and browser sessions, attempts Google revocation and denies all existing MCP grants data access/refresh. Reconnecting after revocation creates a new credential version and never restores access to the old grants.
 - Public privacy/deletion pages, bounded requests, rate limits and daily expired-record cleanup.

MCP: `https://classroom-ai.hak32204.workers.dev/mcp`. Google callback: `https://classroom-ai.hak32204.workers.dev/auth/google/callback`.

## Everyday requests

Select Classroom AI in ChatGPT and ask, for example:

- «Покажи ближайшие дедлайны по всем предметам».
- «Найди ПР5 по компьютерным сетям».
- «Покажи задания по SQL».
- «Что задано на завтра? Мой часовой пояс — Москва».
- «Покажи работы без срока сдачи» (the client filters the returned overview by `dueAt: null`; check truncation).

The connector reads published assignments; it does not submit work, grade it or track personal completion.

## Development

Use Node.js 24 (native TypeScript stripping, module hooks and SQLite in tests).

```sh
npm ci --no-audit --no-fund
npm run check
npm test
npx wrangler deploy --dry-run
```

Tests use the real OAuth provider and SQLite SQL with mocked Google HTTP/JWK responses: two-account isolation, PKCE, browser binding, nonce checks, concurrent callback/code protection, refresh, browser CSRF, revocation, validation and fail-closed setup. A separate local workerd smoke check passed for real D1 migrations, unauthorized MCP, discovery, DCR and browser consent. These checks do not prove real Google consent, remote D1 concurrency or client compatibility. See [AUTH-SETUP.md](AUTH-SETUP.md) for the release checklist.

## Limits and retention

Testing-stage connector, not a verified public Google application. Google testing restrictions, Cloudflare quotas and AI client requirements still apply. There is no paid AI API; free-tier quotas do not guarantee zero hosting cost at arbitrary traffic.

Stateless JSON Streamable HTTP; GET streaming is not implemented. DCR is supported; CIMD is disabled. List operations stop after 20 pages of 100 items, with a controlled error rather than silent truncation. Google requests time out after 15 seconds with no automatic quota retries. Each data tool refreshes its access token.

MCP access tokens last 15 minutes, refresh grants/registrations seven days, browser sessions 24 hours and consent transactions ten minutes. Daily cron removes expired technical records; backups have separate Cloudflare retention. Google credentials remain until disconnect or invalid-grant. Successful token redemptions have a replay fence; a lost response can require reconnection.

`src/google-link.ts` and `src/mcp-identity.ts` remain independently tested earlier helpers. Active HTTP routes use `authorization.ts`, `google-account.ts` and the official provider instead of accepting external identity JWTs.

Never put secrets, private coursework or personal data in GitHub Issues or chat.
