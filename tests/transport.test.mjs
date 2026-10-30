import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpRequest } from '../src/mcp.ts';
test('invalid JSON-RPC bodies return controlled errors',async()=>{
  for(const body of ['null','[]','5','{"jsonrpc":"2.0","method":"ping","id":{}}']) {
    const result=await mcpRequest(new Request('https://app.example/mcp',{method:'POST',body}),{}, {}, ['classroom:read']);
    assert.equal(result.status,400);
    assert.equal((await result.json()).error.code,-32600);
  }
});
