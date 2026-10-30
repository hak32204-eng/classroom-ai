import test from "node:test";
import assert from "node:assert/strict";
import {encryptSecret, decryptSecret, sha256hex, storeOauthState, consumeOauthState, saveRefreshToken, loadRefreshToken, disconnectGoogle} from "../src/auth-storage.ts";
import {generateOpaqueToken} from "../src/google-oauth.ts";

const key = btoa(String.fromCharCode(...Uint8Array.from({length:32},(_,i)=>i+1)));
class FakeDB {
  constructor() { this.states=new Map(); this.tokens=new Map(); }
  prepare(sql) {
    return {
      bind: (...args) => ({
        run: async () => {
          if(sql.startsWith("INSERT INTO oauth_states")) {
            if(this.states.has(args[0])) throw new Error("Duplicate state");
            this.states.set(args[0], {user_id:args[1],verifier_ciphertext:args[2],expires_at:args[3]});
          } else if(sql.startsWith("INSERT INTO google_credentials")) {
            this.tokens.set(args[0],args[1]);
          } else if(sql.startsWith("DELETE FROM google_credentials")) {
            this.tokens.delete(args[0]);
          } else throw new Error("Unexpected SQL");
          return {meta:{changes:1}};
        },
        first: async () => {
          if(sql.startsWith("DELETE FROM oauth_states")) {
            const row=this.states.get(args[0]);
            if(!row || row.user_id !== args[1] || row.expires_at <= args[2]) return null;
            this.states.delete(args[0]);
            return row;
          }
          if(sql.startsWith("SELECT refresh_token_ciphertext")) {
            const cipher=this.tokens.get(args[0]);
            return cipher ? {refresh_token_ciphertext:cipher} : null;
          }
          throw new Error("Unexpected SQL");
        }
      })
    };
  }
}
test("AES-GCM credentials encrypt, decrypt and randomize nonces",async()=>{
  const a=await encryptSecret("top-secret",key);
  const b=await encryptSecret("top-secret",key);
  assert.notEqual(a,b);
  assert.equal(await decryptSecret(a,key),"top-secret");
  assert.doesNotMatch(a,/top-secret/);
  await assert.rejects(()=>decryptSecret(a,btoa("wrong key")),/32 bytes/);
});
test("OAuth state is one-time, tied to user, and expires",async()=>{
  const db=new FakeDB(), state=generateOpaqueToken(), verifier=generateOpaqueToken(48);
  await storeOauthState(db,state,"user-1",verifier,key,0);
  assert.equal(await consumeOauthState(db,state,"user-2",key,1),null);
  assert.equal((await consumeOauthState(db,state,"user-1",key,1000)).verifier,verifier);
  assert.equal(await consumeOauthState(db,state,"user-1",key,1000),null);
  const state2=generateOpaqueToken();
  await storeOauthState(db,state2,"user-1",verifier,key,0);
  assert.equal(await consumeOauthState(db,state2,"user-1",key,601000),null);
  assert.equal(db.states.has(await sha256hex(state)),false);
});
test("refresh tokens are isolated between users and deletable",async()=>{
  const db=new FakeDB();
  await saveRefreshToken(db,"a","credential-A",key);
  await saveRefreshToken(db,"b","credential-B",key);
  assert.equal(await loadRefreshToken(db,"a",key),"credential-A");
  assert.equal(await loadRefreshToken(db,"b",key),"credential-B");
  await disconnectGoogle(db,"a");
  assert.equal(await loadRefreshToken(db,"a",key),null);
  assert.equal(await loadRefreshToken(db,"b",key),"credential-B");
});
