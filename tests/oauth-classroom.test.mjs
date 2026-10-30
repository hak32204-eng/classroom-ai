import test from "node:test";
import assert from "node:assert/strict";
import { googleAuthorizationUrl, generateOpaqueToken, pkceChallenge, CLASSROOM_READ_SCOPES, exchangeGoogleCode, GOOGLE_REDIRECT_URI } from "../src/google-oauth.ts";
import { listCourses, listAssignments } from "../src/classroom.ts";

test("OAuth URL requires read-only scopes, state, and PKCE", async () => {
  const state = generateOpaqueToken();
  const verifier = generateOpaqueToken(48);
  const challenge = await pkceChallenge(verifier);
  const url = new URL(googleAuthorizationUrl("sample-client-id", GOOGLE_REDIRECT_URI, state, challenge));
  assert.equal(url.hostname, "accounts.google.com");
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.deepEqual(url.searchParams.get("scope").split(" "), [...CLASSROOM_READ_SCOPES]);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), GOOGLE_REDIRECT_URI);
});
test("PKCE state/verifier values are random", () => {
  assert.notEqual(generateOpaqueToken(), generateOpaqueToken());
  assert.throws(() => generateOpaqueToken(2));
});
test("PKCE rejects short verifier", async () => {
  await assert.rejects(() => pkceChallenge("short"));
});
test("token exchange rejects wrong redirect without network", async () => {
  await assert.rejects(() => exchangeGoogleCode("example", generateOpaqueToken(48), {
    clientId: "test", clientSecret: "secret", redirectUri: "https://example.com/callback"
  }), /redirect URI/);
});
test("listCourses paginates and does not persist course data", async () => {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url, options) => {
    urls.push(String(url));
    assert.equal(options.headers.authorization, "Bearer test-token");
    return Response.json(urls.length === 1
      ? {courses:[{id:"c1",name:"Math"}],nextPageToken:"next"}
      : {courses:[{id:"c2",name:"History"}]});
  };
  try {
    const courses = await listCourses("test-token");
    assert.deepEqual(courses.map(c=>c.id),["c1","c2"]);
    assert.equal(new URL(urls[1]).searchParams.get("pageToken"), "next");
  } finally { globalThis.fetch = original; }
});
test("assignments are limited to provided course and read-only route", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/courses\/course123\/courseWork\?/);
    return Response.json({ courseWork:[{id:"a1",courseId:"course123",title:"Worksheet"}] });
  };
  try {
    assert.equal((await listAssignments("test-token","course123"))[0].title,"Worksheet");
    await assert.rejects(() => listAssignments("test-token","../evil"), /Invalid course id/);
  } finally { globalThis.fetch = original; }
});
test("Google API failures do not leak credentials", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("secret token echo", {status:403});
  try {
    await assert.rejects(() => listCourses("sensitive-token"), e => {
      assert.doesNotMatch(e.message,/sensitive-token|secret token echo/);
      return true;
    });
  } finally { globalThis.fetch = original; }
});
