# Classroom AI

Free Google Classroom MCP connector for ChatGPT and Claude — **early prototype**.

## What works now

A stateless Cloudflare Worker implementing a small subset of MCP (Streamable HTTP JSON-RPC): `initialize`, `ping`, `tools/list`, and `tools/call`. Two tools exist: `connection_status` and `list_courses`. The latter explicitly reports that Google is **not connected**.

**This is not yet a functioning Google Classroom integration.** It does not access anyone's courses, implement authentication, store tokens, or send assignments. Do not use it with real users until OAuth and authorization security have been implemented and verified.

## Development

Requirements: Node.js 20+ and a Cloudflare account.

```bash
npm install
npm run check
npm run dev
```

Local endpoints: `http://localhost:8787/health` and `http://localhost:8787/mcp`.

Example request:

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

After testing, `npm run deploy` deploys a **nonfunctional Classroom placeholder** to Cloudflare Workers. Do not mistake a successful deployment for successful integration with ChatGPT, Claude, or Google.

## Privacy and security principles

- Never collect Google passwords or commit OAuth credentials to GitHub.
- Request only necessary Google Classroom read-only scopes at first.
- No permanent storage of coursework, grades, attachments, or AI answers.
- Minimal encrypted authorization/session state if necessary; explicit account disconnection.
- Strong per-user authorization and OAuth/PKCE + state validation are mandatory before real Classroom access.
- No unconfirmed submission of student work.

## Roadmap

1. Implement standards-compliant MCP auth/OAuth discovery and secure user sessions.
2. Configure Google Cloud OAuth and Classroom read-only permissions.
3. Add real `list_courses`, `list_assignments`, `get_assignment` with pagination, retries and per-user isolation.
4. Add integration/security tests and compatibility checks in ChatGPT and Claude.
5. Deploy and prepare a privacy policy; pursue any needed Google verification.
6. Consider optional background polling later, after a separate cost/security review.
