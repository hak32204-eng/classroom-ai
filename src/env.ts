import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { AuthDatabase } from './auth-storage.ts';
import type { D1OAuthStore } from './d1-kv.ts';
export const ORIGIN='https://classroom-ai.hak32204.workers.dev';
export const RESOURCE=ORIGIN+'/mcp';
export interface Env {
  DB: AuthDatabase & { withSession?(constraint:string): AuthDatabase };
  AUTH_ENABLED?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  OAUTH_PROVIDER: OAuthHelpers;
  OAUTH_KV: D1OAuthStore;
}
export interface AccountProps { userId:string; version:string }
export function googleConfig(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.TOKEN_ENCRYPTION_KEY) throw new Error('Configuration unavailable');
  return {clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,redirectUri:ORIGIN+'/auth/google/callback'};
}
