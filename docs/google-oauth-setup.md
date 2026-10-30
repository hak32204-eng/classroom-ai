# Google Classroom OAuth integration — implementation checklist

Status: **NOT IMPLEMENTED**. This document defines the next milestone. Do not register production secrets or allow real users until the server code and authorization tests are complete.

## Cloudflare origin
`https://classroom-ai.hak32204.workers.dev`

## Proposed Google OAuth redirect URI
`https://classroom-ai.hak32204.workers.dev/auth/google/callback`

This is an intentional target path **not yet implemented in the deployed Worker**. The URL can be registered in Google Cloud in advance, but Google sign-in will not work until the callback exists.

## Security requirements
- Google OAuth web application with consent screen configured; authorized test users only while testing.
- User login must be authenticated and bound to an isolated session before starting Google OAuth.
- OAuth authorization code flow with state, nonce where appropriate, PKCE, short-lived CSRF session state, and exact redirect matching.
- Request minimal read-only Classroom scopes for courses and coursework; verify exact Google API scope names in implementation.
- Exchange codes server-side only. Never expose the client secret, access tokens, or refresh tokens to the browser/ChatGPT/Claude.
- Encrypt any persisted Google refresh tokens and implement logout/revoke/delete.
- Implement separate MCP client authorization (ChatGPT/Claude -> MCP server) instead of assuming Google OAuth itself authenticates MCP clients.
- Validate Google API access through test accounts and handle revoked consent, pagination, API limits, and token refresh.
- Provide privacy policy and security review before public release.

## Future environment bindings
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Cloudflare encrypted secrets), secure state/session storage binding, and encrypted token storage binding. Do not commit their values.

## Acceptance criteria
- An unauthorized MCP caller cannot access any course data.
- Different users see only their own Classroom data.
- Revoking Google authorization stops data access.
- A replayed or invalid OAuth callback state is rejected.
- Automated tests pass and Google authorization works for a consented test user.
