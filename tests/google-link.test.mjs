import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createIdentityVerifier } from '../src/mcp-identity.ts';
import { beginGoogleLink, completeGoogleLink } from '../src/google-link.ts';
import { loadRefreshToken } from '../src/auth-storage.ts';
import { GOOGLE_REDIRECT_URI } from '../src/google-oauth.ts';

test('SQL-backed linking rejects wrong user/browser and replay; persists encrypted credentials', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_auth.sql',import.meta.url),'utf8'));
  const db = {prepare(query) {return {bind(...args) {return {
    async run() {return {meta:sql.prepare(query).run(...args)};},
    async first() {return sql.prepare(query).get(...args) ?? null;}
  };}};}};
  const {publicKey,privateKey} = await generateKeyPair('ES256');
  const verify = createIdentityVerifier({issuer:'https://issuer.example',audience:'https://app.example/mcp',jwksUri:'https://issuer.example/keys'},
    async () => Response.json({keys:[{...await exportJWK(publicKey),kid:'key'}]}));
  async function identity(sub) {
    const token = await new SignJWT({sub,scope:'classroom:read'}).setProtectedHeader({alg:'ES256',kid:'key'})
      .setIssuer('https://issuer.example').setAudience('https://app.example/mcp').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    return verify(new Request('https://app.example/mcp',{headers:{authorization:'Bearer '+token}}));
  }
  const alice=await identity('alice'), bob=await identity('bob');
  const key=btoa('x'.repeat(32)), config={clientId:'test',clientSecret:'secret',redirectUri:GOOGLE_REDIRECT_URI};
  const flow=await beginGoogleLink(db,alice,key,config);
  let calls=0;
  const original=globalThis.fetch;
  globalThis.fetch=async () => {calls++; return Response.json({access_token:'access',refresh_token:'refresh-secret',expires_in:3600,token_type:'Bearer'});};
  try {
    await assert.rejects(() => completeGoogleLink(db,bob,key,config,flow.state,flow.browserSecret,'code'));
    await assert.rejects(() => completeGoogleLink(db,alice,key,config,flow.state,'a'.repeat(43),'code'));
    assert.equal(calls,0);
    await completeGoogleLink(db,alice,key,config,flow.state,flow.browserSecret,'code');
    assert.equal(await loadRefreshToken(db,alice.userId,key),'refresh-secret');
    assert.equal(await loadRefreshToken(db,bob.userId,key),null);
    assert.doesNotMatch(sql.prepare('SELECT refresh_token_ciphertext FROM google_credentials').get().refresh_token_ciphertext,/refresh-secret/);
    await assert.rejects(() => completeGoogleLink(db,alice,key,config,flow.state,flow.browserSecret,'code'));
    assert.equal(calls,1);
  } finally {globalThis.fetch=original;sql.close();}
});
