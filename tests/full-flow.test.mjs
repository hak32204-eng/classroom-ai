import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair,exportJWK,SignJWT } from 'jose';
import worker from '../src/index.ts';
import { D1OAuthStore } from '../src/d1-kv.ts';
import { ORIGIN,RESOURCE } from '../src/env.ts';
import { CLASSROOM_READ_SCOPES,generateOpaqueToken,pkceChallenge } from '../src/google-oauth.ts';
import { database } from './sql-db.mjs';

const context=()=>({waitUntil(){},passThroughOnException(){},props:{}});
function environment(db){return {DB:db,AUTH_ENABLED:'true',GOOGLE_CLIENT_ID:'google-client',GOOGLE_CLIENT_SECRET:'google-secret',TOKEN_ENCRYPTION_KEY:btoa('s'.repeat(32))};}
function jar(){const cookies=new Map();return {
  header(){return [...cookies].map(([k,v])=>k+'='+v).join('; ');},
  collect(response){for(const c of response.headers.getSetCookie()) {const [kv]=c.split(';'),i=kv.indexOf('=');if(/Max-Age=0(?:;|$)/i.test(c))cookies.delete(kv.slice(0,i));else cookies.set(kv.slice(0,i),kv.slice(i+1));}},
};}
async function send(env,path,options={},cookies){
  const headers=new Headers(options.headers);
  if(cookies?.header())headers.set('cookie',cookies.header());
  const response=await worker.fetch(new Request(ORIGIN+path,{...options,headers}),env,context());
  cookies?.collect(response);return response;
}
const form=(data)=>({method:'POST',headers:{origin:ORIGIN,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});
async function register(env){
  const response=await send(env,'/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Test <client>',redirect_uris:['https://client.example/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});
  assert.equal(response.status,201,await response.clone().text());return response.json();
}
async function start(env,client,cookies){
  const verifier=generateOpaqueToken(48);
  const query=new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:'https://client.example/callback',scope:'classroom:read offline_access',state:'client-state',resource:RESOURCE,code_challenge:await pkceChallenge(verifier),code_challenge_method:'S256'});
  const consent=await send(env,'/authorize?'+query,{},cookies);
  assert.equal(consent.status,200,await consent.clone().text());
  const html=await consent.text();assert.ok(html.includes('Test &#60;client&#62;'));
  assert.equal(consent.headers.get('x-frame-options'),'DENY');
  const handle=/name="handle" value="([^"]+)"/.exec(html)[1];
  const approved=await send(env,'/authorize',form({decision:'approve',handle}),cookies);
  assert.equal(approved.status,302,await approved.clone().text());
  const google=new URL(approved.headers.get('location'));
  assert.equal(google.origin,'https://accounts.google.com');
  assert.ok(google.searchParams.get('scope').startsWith('openid '));
  return {verifier,google};
}
async function redeem(env,client,flow,code){
  const response=await send(env,'/oauth/token',form({grant_type:'authorization_code',client_id:client.client_id,code,code_verifier:flow.verifier,redirect_uri:'https://client.example/callback',resource:RESOURCE}));
  assert.equal(response.status,200,await response.clone().text());return response.json();
}
async function tool(env,token,name,args={}){return send(env,'/mcp',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});}

test('official OAuth provider + D1: consent, Google identity, tokens, isolation, refresh and disconnect',async()=>{
  const {sql,db}=database(),env=environment(db),cookies=jar();
  const {publicKey,privateKey}=await generateKeyPair('RS256');
  const jwk={...await exportJWK(publicKey),kid:'google-test',alg:'RS256',use:'sig'};
  const original=globalThis.fetch;
  const nonces=new Map();let exchanges=0;
  globalThis.fetch=async(input,options)=>{
    const url=String(input);
    if(url==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[jwk]});
    if(url==='https://oauth2.googleapis.com/token'){
      const body=new URLSearchParams(options.body);
      if(body.get('grant_type')==='authorization_code'){
        exchanges++;const subject=body.get('code');
        const id=await new SignJWT({nonce:nonces.get(subject)}).setProtectedHeader({alg:'RS256',kid:'google-test'}).setIssuer('https://accounts.google.com').setAudience('google-client').setSubject(subject).setIssuedAt().setExpirationTime('5m').sign(privateKey);
        return Response.json({access_token:'access-'+subject,refresh_token:'refresh-'+subject,id_token:id,scope:'openid '+CLASSROOM_READ_SCOPES.join(' '),token_type:'Bearer',expires_in:3600});
      }
      return Response.json({access_token:body.get('refresh_token').replace('refresh-','access-'),token_type:'Bearer',expires_in:3600});
    }
    if(url==='https://oauth2.googleapis.com/revoke')return new Response(null,{status:200});
    if(url.startsWith('https://classroom.googleapis.com/v1/courses')){
      const subject=options.headers.authorization.replace('Bearer access-','');
      if(url.includes('/courseWork/'))return Response.json({id:'assignment',courseId:'course',title:'Assignment '+subject,description:'Untrusted classroom content',materials:[{link:{url:'https://example.com/material'}}]});
      return Response.json({courses:[{id:'course',name:'Only '+subject}]});
    }
    throw new Error('Unexpected network request '+url);
  };
  try{
    const unauthorized=await send(env,'/mcp');assert.equal(unauthorized.status,401);assert.match(unauthorized.headers.get('www-authenticate'),/resource_metadata/);
    const metadata=await (await send(env,'/.well-known/oauth-protected-resource/mcp')).json();assert.equal(metadata.resource,RESOURCE);
    const client=await register(env),flow=await start(env,client,cookies);
    nonces.set('alice',flow.google.searchParams.get('nonce'));
    const callback='/auth/google/callback?'+new URLSearchParams({code:'alice',state:flow.google.searchParams.get('state')});
    assert.equal((await send(env,callback)).status,400);assert.equal(exchanges,0);
    const callbackCookie=cookies.header();
    const responses=await Promise.all([1,2].map(()=>send(env,callback,{headers:{cookie:callbackCookie}})));
    assert.deepEqual(responses.map(r=>r.status).sort(),[302,400]);assert.equal(exchanges,1);
    const completed=responses.find(r=>r.status===302);cookies.collect(completed);
    const redirect=new URL(completed.headers.get('location'));assert.equal(redirect.searchParams.get('state'),'client-state');
    const code=redirect.searchParams.get('code');
    const redemptions=await Promise.all([1,2].map(()=>send(env,'/oauth/token',form({grant_type:'authorization_code',client_id:client.client_id,code,code_verifier:flow.verifier,redirect_uri:'https://client.example/callback',resource:RESOURCE}))));
    assert.deepEqual(redemptions.map(r=>r.status).sort(),[200,400]);
    const token=await redemptions.find(r=>r.status===200).json();
    assert.equal((await send(env,'/oauth/token',form({grant_type:'authorization_code',client_id:client.client_id,code,code_verifier:flow.verifier,redirect_uri:'https://client.example/callback'}))).status,400);
    const courses=await (await tool(env,token.access_token,'list_courses')).json();assert.match(courses.result.content[0].text,/Only alice/);
    const assignment=await (await tool(env,token.access_token,'get_assignment',{courseId:'course',assignmentId:'assignment'})).json();assert.match(assignment.result.content[0].text,/Assignment alice/);
    const otherClient=await register(env),otherJar=jar(),otherFlow=await start(env,otherClient,otherJar);
    nonces.set('bob',otherFlow.google.searchParams.get('nonce'));
    const bobCallback=await send(env,'/auth/google/callback?'+new URLSearchParams({code:'bob',state:otherFlow.google.searchParams.get('state')}),{},otherJar);
    const bobToken=await redeem(env,otherClient,otherFlow,new URL(bobCallback.headers.get('location')).searchParams.get('code'));
    const bobCourses=await (await tool(env,bobToken.access_token,'list_courses')).json();assert.match(bobCourses.result.content[0].text,/Only bob/);assert.doesNotMatch(bobCourses.result.content[0].text,/alice/);
    const badJar=jar(),badFlow=await start(env,client,badJar);
    nonces.set('mallory','wrong-nonce');
    const badCallback=await send(env,'/auth/google/callback?'+new URLSearchParams({code:'mallory',state:badFlow.google.searchParams.get('state')}),{},badJar);
    assert.equal(badCallback.status,503);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM google_credentials').get().n,2);
    const refreshed=await send(env,'/oauth/token',form({grant_type:'refresh_token',client_id:client.client_id,refresh_token:token.refresh_token,resource:RESOURCE}));assert.equal(refreshed.status,200,await refreshed.clone().text());
    const freshToken=await refreshed.json();
    const badArgs=await (await tool(env,freshToken.access_token,'list_courses',{userId:'bob'})).json();assert.equal(badArgs.error.code,-32602);
    const inheritedArgs=await (await tool(env,freshToken.access_token,'list_courses',{constructor:'bad'})).json();assert.equal(inheritedArgs.error.code,-32602);
    const noConfirm=await (await tool(env,freshToken.access_token,'disconnect_google')).json();assert.equal(noConfirm.error.code,-32602);
    const disconnected=await (await tool(env,freshToken.access_token,'disconnect_google',{confirm:true})).json();assert.match(disconnected.result.content[0].text,/"disconnected":true/);
    const accessAfter=await (await tool(env,token.access_token,'list_courses')).json();assert.equal(accessAfter.result.isError,true);
    const afterRefresh=await send(env,'/oauth/token',form({grant_type:'refresh_token',client_id:client.client_id,refresh_token:freshToken.refresh_token}));assert.equal(afterRefresh.status,400);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM google_credentials').get().n,1);
    const storage=JSON.stringify(sql.prepare('SELECT * FROM oauth_kv').all())+JSON.stringify(sql.prepare('SELECT * FROM google_credentials').all());
    assert.doesNotMatch(storage,/refresh-alice|refresh-bob|Only alice|Only bob|Assignment alice/);
    const bobAfter=await (await tool(env,bobToken.access_token,'list_courses')).json();assert.match(bobAfter.result.content[0].text,/Only bob/);
    const accountPage=await send(env,'/account',{},otherJar);assert.equal(accountPage.status,200);
    const csrf=/name="csrf" value="([^"]+)"/.exec(await accountPage.text())[1];
    assert.equal((await send(env,'/account/disconnect',form({csrf:'forged'}),otherJar)).status,403);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM google_credentials').get().n,1);
    assert.equal((await send(env,'/account/disconnect',form({csrf}),otherJar)).status,200);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM google_credentials').get().n,0);
    const bobRemoved=await (await tool(env,bobToken.access_token,'list_courses')).json();assert.equal(bobRemoved.result.isError,true);
  }finally{globalThis.fetch=original;sql.close();}
});

test('D1 store preserves metadata, paginates, expires and atomically consumes transactions',async()=>{
  const {sql,db}=database(),store=new D1OAuthStore(db);
  try{
    await store.put('prefix:a','one',{expirationTtl:60,metadata:{clientId:'client'}});
    await store.put('prefix:b','two',{expirationTtl:60});
    await store.put('prefix:expired','gone',{expiration:1});
    const first=await store.list({prefix:'prefix:',limit:1});assert.equal(first.list_complete,false);assert.deepEqual(first.keys[0].metadata,{clientId:'client'});
    const second=await store.list({prefix:'prefix:',cursor:first.cursor});assert.equal(second.keys.length,1);assert.equal(second.keys[0].name,'prefix:b');
    assert.equal(await store.get('prefix:expired'),null);
    await store.put('transaction:test','secret',{expirationTtl:60});
    const values=await Promise.all([store.get('transaction:test'),store.get('transaction:test')]);assert.deepEqual(values.sort(),['secret',null].sort());
  }finally{sql.close();}
});

test('configuration fails closed; origin, request size and registration rate are bounded',async()=>{
  const {sql,db}=database(),env=environment(db);
  try{
    assert.equal((await worker.fetch(new Request(RESOURCE),{})).status,503);
    assert.equal((await send(env,'/mcp',{headers:{origin:'https://evil.example'}})).status,403);
    assert.equal((await send(env,'/mcp',{method:'POST',body:'x'.repeat(70000)})).status,413);
    for(let n=0;n<10;n++)assert.equal((await send(env,'/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,400);
    assert.equal((await send(env,'/oauth/register',{method:'POST',body:'{}'})).status,429);
    const privacy=await worker.fetch(new Request(ORIGIN+'/privacy'),{});assert.equal(privacy.status,200);assert.match(privacy.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  }finally{sql.close();}
});
