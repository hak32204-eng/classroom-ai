import { createRemoteJWKSet, jwtVerify } from 'jose';
import { encryptSecret, decryptSecret, sha256hex } from './auth-storage.ts';
import { generateOpaqueToken, CLASSROOM_READ_SCOPES } from './google-oauth.ts';
import type { GoogleTokenResponse } from './google-oauth.ts';
import { googleConfig } from './env.ts';
import type { Env, AccountProps } from './env.ts';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function googleSubject(tokens:GoogleTokenResponse,nonce:string,clientId:string) {
  if (!tokens.id_token) throw new Error('Google identity missing');
  const {payload}=await jwtVerify(tokens.id_token,googleKeys,{
    issuer:['https://accounts.google.com','accounts.google.com'],audience:clientId,
    algorithms:['RS256'],requiredClaims:['sub','exp','iat'],maxTokenAge:'10m',
  });
  if (payload.nonce!==nonce || !payload.sub || (payload.azp!==undefined && payload.azp!==clientId)) throw new Error('Google identity invalid');
  return sha256hex(JSON.stringify(['https://accounts.google.com',payload.sub]));
}
export function checkGoogleScopes(tokens:GoogleTokenResponse) {
  const scopes=new Set(tokens.scope?.split(' ') ?? []);
  if (!CLASSROOM_READ_SCOPES.every(s=>scopes.has(s))) throw new Error('Required Google permissions missing');
}
export async function connectAccount(env:Env,userId:string,tokens:GoogleTokenResponse):Promise<AccountProps> {
  checkGoogleScopes(tokens);
  if (!tokens.refresh_token) throw new Error('Offline access was not granted');
  const version=generateOpaqueToken();
  const cipher=await encryptSecret(tokens.refresh_token,env.TOKEN_ENCRYPTION_KEY!);
  await env.DB.prepare('INSERT INTO google_credentials (user_id,refresh_token_ciphertext,updated_at,credential_version) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET refresh_token_ciphertext=excluded.refresh_token_ciphertext,updated_at=excluded.updated_at,credential_version=excluded.credential_version')
    .bind(userId,cipher,Math.floor(Date.now()/1000),version).run();
  return {userId,version};
}
export async function accountExists(env:Env,props:AccountProps) {
  if (!props || typeof props.userId!=='string' || typeof props.version!=='string' || !props.version) return false;
  return !!await env.DB.prepare('SELECT user_id FROM google_credentials WHERE user_id = ? AND credential_version = ?')
    .bind(props.userId,props.version).first();
}
export async function accountAccessToken(env:Env,props:AccountProps):Promise<string> {
  if (!props || !props.version) throw new Error('Google is disconnected; reconnect the connector');
  const row=await env.DB.prepare('SELECT refresh_token_ciphertext FROM google_credentials WHERE user_id = ? AND credential_version = ?')
    .bind(props.userId,props.version).first<{refresh_token_ciphertext:string}>();
  if (!row) throw new Error('Google is disconnected; reconnect the connector');
  const refresh=await decryptSecret(row.refresh_token_ciphertext,env.TOKEN_ENCRYPTION_KEY!);
  const config=googleConfig(env);
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh,client_id:config.clientId,client_secret:config.clientSecret}),
    signal:AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    if (response.status===400) {
      const data=await response.json() as {error?:string};
      if (data.error==='invalid_grant') {
        await env.DB.prepare('DELETE FROM google_credentials WHERE user_id = ? AND credential_version = ?').bind(props.userId,props.version).run();
        throw new Error('Google authorization was revoked; reconnect the connector');
      }
    }
    throw new Error('Google is temporarily unavailable; try again later');
  }
  const data=await response.json() as GoogleTokenResponse;
  if (!data.access_token || data.token_type!=='Bearer' || !Number.isFinite(data.expires_in) || data.expires_in<=0) throw new Error('Invalid Google token response');
  if (data.scope && !CLASSROOM_READ_SCOPES.every(s=>data.scope!.split(' ').includes(s))) throw new Error('Google permissions changed; reconnect');
  if (data.refresh_token) {
    const cipher=await encryptSecret(data.refresh_token,env.TOKEN_ENCRYPTION_KEY!);
    await env.DB.prepare('UPDATE google_credentials SET refresh_token_ciphertext = ? WHERE user_id = ? AND credential_version = ?')
      .bind(cipher,props.userId,props.version).run();
  }
  // Do not return a token if the user disconnected while the refresh was in flight.
  if (!await accountExists(env,props)) throw new Error('Google is disconnected; reconnect the connector');
  return data.access_token;
}
export async function disconnectAccount(env:Env,props:AccountProps) {
  const row=await env.DB.prepare('DELETE FROM google_credentials WHERE user_id = ? AND credential_version = ? RETURNING refresh_token_ciphertext')
    .bind(props.userId,props.version).first<{refresh_token_ciphertext:string}>();
  // Remove browser sessions too. MCP tokens with this version immediately lose data access.
  await env.DB.prepare('DELETE FROM web_sessions WHERE user_id = ? AND credential_version = ?').bind(props.userId,props.version).run();
  let googleRevoked=!row;
  if(row) {
    try {
      const token=await decryptSecret(row.refresh_token_ciphertext,env.TOKEN_ENCRYPTION_KEY!);
      const response=await fetch('https://oauth2.googleapis.com/revoke',{
        method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({token}),signal:AbortSignal.timeout(15000),
      });
      googleRevoked=response.ok;
    } catch { /* Local removal succeeds even if Google is offline. */ }
  }
  return {disconnected:true,googleRevoked,
    message:googleRevoked?'Google disconnected and local credentials deleted.':'Local credentials deleted. Remove Classroom AI in Google account permissions to finish remote revocation.'};
}
