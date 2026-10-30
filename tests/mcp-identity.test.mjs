import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createIdentityVerifier, requireVerifiedIdentity } from '../src/mcp-identity.ts';
import { beginGoogleLink } from '../src/google-link.ts';

test('forged identities never reach storage', async () => {
  assert.throws(() => requireVerifiedIdentity({userId:'victim'}));
  await assert.rejects(() => beginGoogleLink(null, {userId:'victim'}, '', {}));
});
test('JWT verifies signature, expiry, issuer, audience and scope', async () => {
  const {publicKey, privateKey} = await generateKeyPair('ES256');
  const jwk = {...await exportJWK(publicKey), kid:'test'};
  const config = {issuer:'https://issuer.example', audience:'https://classroom.example/mcp', jwksUri:'https://issuer.example/keys'};
  const verify = createIdentityVerifier(config, async () => Response.json({keys:[jwk]}));
  async function request(overrides={}, key=privateKey) {
    const token = await new SignJWT({sub:'alice',scope:'classroom:read', ...overrides})
      .setProtectedHeader({alg:'ES256',kid:'test'}).setIssuedAt()
      .setIssuer(overrides.iss ?? config.issuer).setAudience(overrides.aud ?? config.audience)
      .setExpirationTime(overrides.exp ?? '5m').sign(key);
    return new Request(config.audience, {headers:{authorization:'Bearer '+token}});
  }
  const identity = await verify(await request());
  assert.match(requireVerifiedIdentity(identity), /^[a-f0-9]{64}$/);
  assert.equal((await verify(await request())).userId, identity.userId);
  for (const fields of [{iss:'https://evil.example'}, {aud:'other'}, {exp:1}, {scope:'openid'}])
    await assert.rejects(() => request(fields).then(verify));
  const other = await generateKeyPair('ES256');
  await assert.rejects(() => request({},other.privateKey).then(verify));
  await assert.rejects(() => verify(new Request(config.audience)));
  assert.notEqual((await verify(await request({sub:'bob'}))).userId, identity.userId);
});
