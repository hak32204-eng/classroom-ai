# Classroom AI

Google Classroom MCP connector for Cloudflare Workers and D1. A live test deployment runs from `deploy/google-oauth-test`, with Google restricted to the owner's approved test users. Real Google sign-in, courses, assignment details and MCP refresh passed on 2026-10-30. ChatGPT installation and live course listing also passed; Claude compatibility remains pending. This development branch defaults `AUTH_ENABLED` to `false`.

## Implemented

- OAuth server using pinned `@cloudflare/workers-oauth-provider`, dynamic client registration, resource discovery and mandatory PKCE S256.
- Browser-bound consent and callback, verified Google OIDC identity/nonce, AES-GCM encrypted refresh tokens and per-account credential versions.
- Tools: `connection_status`, `list_courses`, `search_assignments`, `list_assignments`, `get_assignment`, `get_course_teachers`, `get_workflow_options`, `prepare_assignment`, `disconnect_google` (requires `confirm: true`). No submissions or grading.
- `search_assignments` returns a compact overview across active courses, sorted by deadline with undated work last. Filters: `query`, `course`, inclusive `dueFrom`/`dueTo` in IANA `timezone` (default UTC), `deadline` (`any`, `with_deadline`, `without_deadline`), `includeArchived`, `limit` (1–100, default 30) and `offset`. Follow `nextOffset` with the same filters. Partial failures and truncation are explicit. No submission/completion status is inferred. More than 30 matching courses requires a narrower course filter.
- `get_workflow_options` and `prepare_assignment` provide a Russian preparation wizard: exact assignment context, separate teacher/personal deadlines, work/file type, teacher/custom/suggested/reference formatting, title-page fields, outline and checklist. The output is a brief and Markdown template, not an exported document. Real file creation depends on the host AI client's tools.
- Reference files are inspected by host document tools, not uploaded to or parsed by this server. Pass observed style in `referenceStyle`: font, size, spacing, margins, title-page layout, heading style and sections. Reuse the profile within the chat or save it through the host. No persistent profile storage or cross-chat memory is claimed. Another author's personal details are not copied.
- `get_course_teachers` and optional `autoTeacher` in the wizard use only actual Google display names. Multiple teachers require selection, and missing patronymics are never inferred. Additional Google roster permission is requested only when the user checks the optional consent box; default Google scopes are unchanged. The connector fetches only teacher IDs/names, not student rosters, email or photos. A denied lookup degrades to manual or confirmed-reference input without breaking assignment reading.

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
- «Покажи работы без срока сдачи».
- «Подготовь ПР5 как отчёт Word с титульным листом. Уточни недостающие данные».
- «Используй оформление прикреплённой работы, но мои ФИО и тему текущего задания».
- «Найди преподавателя в Classroom; если их несколько, дай выбрать».

The connector reads published assignments; it does not submit work, grade it or track personal completion.

See [PRODUCT.md](PRODUCT.md) for positioning, pilot metrics, release gates and a draft launch plan. Public source code is MIT-licensed; the service remains a closed Google test pilot, with no billing enabled.

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
