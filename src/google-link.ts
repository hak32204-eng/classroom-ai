import type { AuthDatabase } from './auth-storage.ts';
import { sha256hex, storeOauthState, consumeOauthState, saveRefreshToken } from './auth-storage.ts';
import type { VerifiedIdentity } from './mcp-identity.ts';
import { requireVerifiedIdentity } from './mcp-identity.ts';
import { generateOpaqueToken, pkceChallenge, googleAuthorizationUrl, exchangeGoogleCode } from './google-oauth.ts';
import type { OAuthConfiguration } from './google-oauth.ts';

/** Internal service only. No public routes until the authorization server and consent UI are reviewed. */
export async function beginGoogleLink(db: AuthDatabase, identity: VerifiedIdentity,
  key: string, config: OAuthConfiguration) {
  const userId = requireVerifiedIdentity(identity);
  const state = generateOpaqueToken(), browserSecret = generateOpaqueToken();
  const verifier = generateOpaqueToken(48);
  // Hashing both fields binds the one-time state to this browser as well as the user.
  await storeOauthState(db, await sha256hex(state + '.' + browserSecret), userId, verifier, key);
  return { state, browserSecret,
    authorizationUrl: googleAuthorizationUrl(config.clientId, config.redirectUri, state, await pkceChallenge(verifier)) };
}

export async function completeGoogleLink(db: AuthDatabase, identity: VerifiedIdentity,
  key: string, config: OAuthConfiguration, state: string, browserSecret: string, code: string) {
  const userId = requireVerifiedIdentity(identity);
  if (![state, browserSecret].every(v => /^[A-Za-z0-9_-]{43}$/.test(v)) || !code || code.length > 4096)
    throw new Error('Invalid OAuth callback');
  const transaction = await consumeOauthState(db, await sha256hex(state + '.' + browserSecret), userId, key);
  if (!transaction) throw new Error('Invalid or expired OAuth transaction');
  const tokens = await exchangeGoogleCode(code, transaction.verifier, config);
  // A new connection must include offline access; never silently reuse an old account's token.
  if (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token)
    throw new Error('Offline access was not granted');
  await saveRefreshToken(db, userId, tokens.refresh_token, key);
}
