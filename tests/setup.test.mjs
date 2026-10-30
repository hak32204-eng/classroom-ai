import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
test('public setup offers one endpoint and secret-free configurations while MCP remains protected',async()=>{
  for(const path of ['/connect','/connect/chatgpt','/connect/lmstudio','/connect/openwebui']) {
    const response=await worker.fetch(new Request('https://classroom-ai.hak32204.workers.dev'+path),{});
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
    const html=await response.text();assert.match(html,/https:\/\/classroom-ai\.hak32204\.workers\.dev\/mcp/);
    assert.doesNotMatch(html,/GOOGLE_CLIENT_SECRET|TOKEN_ENCRYPTION_KEY/);
  }
  const config=await worker.fetch(new Request('https://classroom-ai.hak32204.workers.dev/connect/lmstudio.json'),{});
  assert.match(config.headers.get('content-disposition'),/attachment/);
  assert.deepEqual(await config.json(),{mcpServers:{'classroom-ai':{url:'https://classroom-ai.hak32204.workers.dev/mcp'}}});
  const protectedResult=await worker.fetch(new Request('https://classroom-ai.hak32204.workers.dev/mcp'),{});
  assert.equal(protectedResult.status,503);
  const health=await (await worker.fetch(new Request('https://classroom-ai.hak32204.workers.dev/health'),{})).json();
  assert.equal(health.configured,false);assert.equal(health.authEnabled,false);
});

import {lmStudioInstallUrl} from '../src/setup.ts';
test('LM Studio one-click install contains only the public remote-server URL',()=>{
 const url=new URL(lmStudioInstallUrl);assert.equal(url.protocol,'lmstudio:');assert.equal(url.hostname,'add_mcp');assert.equal(url.searchParams.get('name'),'classroom-ai');
 assert.deepEqual(JSON.parse(atob(url.searchParams.get('config'))),{url:'https://classroom-ai.hak32204.workers.dev/mcp'});
});
