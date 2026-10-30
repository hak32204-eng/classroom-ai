import OAuthProvider, { OAuthError } from '@cloudflare/workers-oauth-provider';
import { D1OAuthStore } from './d1-kv.ts';
import { ORIGIN, RESOURCE } from './env.ts';
import type { Env, AccountProps } from './env.ts';
import { authorizationRoutes } from './authorization.ts';
import { infoPage } from './pages.ts';
import { mcpRequest } from './mcp.ts';
import { accountExists } from './google-account.ts';
import { sha256hex } from './auth-storage.ts';

const provider = new OAuthProvider<Env>({
  apiRoute: '/mcp', authorizeEndpoint: '/authorize', tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  scopesSupported: ['classroom:read', 'offline_access'], requiredScopes: ['classroom:read'],
  resourceMetadata: { resource: RESOURCE, authorization_servers: [ORIGIN] },
  accessTokenTTL: 900, refreshTokenTTL: 604800, clientRegistrationTTL: 604800,
  clientIdMetadataDocumentEnabled: false,
  apiHandler: { async fetch(request, env, ctx) {
    const context = ctx as typeof ctx & { props: AccountProps; auth: { scope: string[] } };
    return mcpRequest(request, env, context.props, context.auth?.scope ?? []);
  } },
  defaultHandler: { fetch: authorizationRoutes },
  tokenExchangeCallback: async ({ env, props }) => {
    if (!await accountExists(env, props as AccountProps)) throw new OAuthError('invalid_grant', { description: 'Google account disconnected; authorize again' });
  },
  onError: () => undefined,
});

async function boundedRequest(request: Request): Promise<Request | null> {
  if (request.method !== 'POST' || !request.body) return request;
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let text = '', size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 65536) { await reader.cancel(); return null; }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return new Request(request, { body: text });
}
async function limited(request: Request, env: Env): Promise<boolean> {
  const path = new URL(request.url).pathname;
  const maximum = path === '/oauth/register' ? 10 : path === '/authorize' ? 30 : 120;
  const window = path === '/oauth/register' ? 3600 : 60;
  const now = Math.floor(Date.now() / 1000), bucket = Math.floor(now / window);
  const key = await sha256hex((request.headers.get('cf-connecting-ip') ?? 'local') + ':' + path + ':' + bucket);
  const row = await env.DB.prepare('INSERT INTO request_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count')
    .bind(key, (bucket + 1) * window).first<{ count: number }>();
  return !!row && row.count <= maximum;
}
export default {
  async fetch(request: Request, rawEnv: Partial<Env>, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return Response.json({ ok: true, authEnabled: rawEnv.AUTH_ENABLED === 'true' }, { headers: { 'cache-control': 'no-store' } });
    if (request.method === 'GET') { const info = infoPage(url.pathname); if (info) return info; }
    if (rawEnv.AUTH_ENABLED !== 'true' || !rawEnv.DB || !rawEnv.GOOGLE_CLIENT_ID || !rawEnv.GOOGLE_CLIENT_SECRET || !rawEnv.TOKEN_ENCRYPTION_KEY)
      return new Response('Connector setup is incomplete', { status: 503, headers: { 'cache-control': 'no-store' } });
    if (url.origin !== ORIGIN) return new Response('Unknown origin', { status: 421 });
    const origin = request.headers.get('origin');
    if (origin && origin !== ORIGIN) return new Response('Origin not allowed', { status: 403 });
    if (!['GET', 'POST', 'OPTIONS'].includes(request.method)) return new Response(null, { status: 405 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: 'GET, POST, OPTIONS' } });
    const primary = rawEnv.DB.withSession?.('first-primary') ?? rawEnv.DB;
    const env = { ...rawEnv, DB: primary, OAUTH_KV: new D1OAuthStore(primary) } as Env;
    let replayKey: string | undefined;
    let keepReplay = false;
    try {
      if (!await limited(request, env)) return new Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } });
      const bounded = await boundedRequest(request);
      if (!bounded) return new Response('Request too large', { status: 413 });
      request = bounded;
      if (url.pathname === '/mcp' && request.method === 'POST' && !request.headers.get('content-type')?.startsWith('application/json')) return new Response('Expected application/json', { status: 415 });
      if (url.pathname === '/oauth/token' && request.method === 'POST') {
        const form = await request.clone().formData(), grantType = form.get('grant_type');
        const secret = grantType === 'authorization_code' ? form.get('code') : grantType === 'refresh_token' ? form.get('refresh_token') : null;
        if (typeof secret === 'string' && secret) {
          replayKey = 'redeem:' + await sha256hex(secret);
          const lock = await primary.prepare('INSERT OR IGNORE INTO oauth_replays (key,expires_at) VALUES (?,?) RETURNING key')
            .bind(replayKey, Math.floor(Date.now() / 1000) + 600).first();
          if (!lock) { replayKey = undefined; return Response.json({ error: 'invalid_grant' }, { status: 400 }); }
        }
      }
      const response = await provider.fetch(request, env, ctx!);
      keepReplay = response.ok;
      const secured = new Response(response.body, response);
      secured.headers.set('cache-control', 'no-store');
      // no-referrer makes browsers send Origin: null for ordinary form POSTs.
      secured.headers.set('referrer-policy', secured.headers.get('content-type')?.startsWith('text/html') ? 'same-origin' : 'no-referrer');
      secured.headers.set('x-content-type-options', 'nosniff');
      return secured;
    } catch {
      return new Response('Connector temporarily unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
    } finally {
      if (replayKey && !keepReplay) await primary.prepare('DELETE FROM oauth_replays WHERE key = ?').bind(replayKey).run().catch(() => {});
    }
  },
  async scheduled(_event: unknown, env: Env) {
    const now = Math.floor(Date.now() / 1000);
    for (const table of ['oauth_states', 'oauth_kv', 'oauth_replays', 'request_limits', 'web_sessions'])
      await env.DB.prepare('DELETE FROM ' + table + ' WHERE expires_at <= ?').bind(now).run();
  },
};
