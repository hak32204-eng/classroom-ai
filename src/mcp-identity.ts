import { createRemoteJWKSet, jwtVerify, customFetch } from 'jose';
import { sha256hex } from './auth-storage.ts';

export interface IdentityConfig {
  issuer: string;
  audience: string;
  jwksUri: string;
}
// Only identities returned by this module may be used by the linking service.
const verified = new WeakSet<object>();
export interface VerifiedIdentity { readonly userId: string }
export function requireVerifiedIdentity(identity: VerifiedIdentity): string {
  if (!verified.has(identity)) throw new Error('Unverified MCP identity');
  return identity.userId;
}
export function createIdentityVerifier(config: IdentityConfig, fetcher: typeof fetch = fetch) {
  for (const value of [config.issuer, config.audience, config.jwksUri]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
      throw new Error('Invalid identity configuration');
  }
  // Configuration is operator-controlled, never taken from token headers.
  const keys = createRemoteJWKSet(new URL(config.jwksUri), { [customFetch]: fetcher });
  return async (request: Request): Promise<VerifiedIdentity> => {
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get('authorization') ?? '');
    if (!match || match[1].length > 16384) throw new Error('Unauthorized');
    const { payload } = await jwtVerify(match[1], keys, {
      issuer: config.issuer, audience: config.audience,
      algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat'],
      maxTokenAge: '1h',
    });
    if (!payload.sub || typeof payload.scope !== 'string' ||
        !payload.scope.split(' ').includes('classroom:read')) throw new Error('Unauthorized');
    const identity = Object.freeze({ userId: await sha256hex(JSON.stringify([config.issuer, payload.sub])) });
    verified.add(identity);
    return identity;
  };
}
