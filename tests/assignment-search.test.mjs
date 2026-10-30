import test from 'node:test';
import assert from 'node:assert/strict';
import {searchAssignments,validSearchOptions} from '../src/assignment-search.ts';
import {mcpRequest} from '../src/mcp.ts';

test('search joins courses, excludes archives, searches Russian text and sorts UTC deadlines',async()=>{
  const original=globalThis.fetch, paths=[];
  globalThis.fetch=async url=>{
    const path=new URL(url).pathname;paths.push(path);
    if(path==='/v1/courses')return Response.json({courses:[{id:'a',name:'Базы данных'},{id:'b',name:'Сети'},{id:'old',name:'Архив',courseState:'ARCHIVED'}]});
    if(path.includes('/a/'))return Response.json({courseWork:[{id:'2',title:'SQL ПР2',description:'Расчёт',dueDate:{year:2026,month:10,day:31},dueTime:{hours:21}},{id:'3',title:'SQL ПР3'}]});
    return Response.json({courseWork:[{id:'1',title:'SQL ПР1',dueDate:{year:2026,month:10,day:30}}]});
  };
  try {
    const all=await searchAssignments('token',{query:'sql',limit:2});
    assert.deepEqual(all.assignments.map(a=>a.assignmentId),['1','2']);
    assert.equal(all.totalMatches,3);assert.equal(all.truncated,true);assert.equal(all.complete,true);
    assert.equal(all.assignments[0].dueAt,'2026-10-30T00:00:00.000Z');
    assert.ok(!paths.some(p=>p.includes('/old/')));
    const filtered=await searchAssignments('token',{course:'БАЗЫ',query:'расчет',dueFrom:'2026-10-31',dueTo:'2026-10-31'});
    assert.deepEqual(filtered.assignments.map(a=>a.assignmentId),['2']);
    assert.equal(filtered.submissionStatus,'not_available');
    const next=await searchAssignments('token',{query:'sql',limit:2,offset:2});
    assert.deepEqual(next.assignments.map(a=>a.assignmentId),['3']);assert.equal(next.nextOffset,null);
    const local=await searchAssignments('token',{dueFrom:'2026-11-01',dueTo:'2026-11-01',timezone:'Europe/Moscow'});
    assert.deepEqual(local.assignments.map(a=>a.assignmentId),['2']);
    const undated=await searchAssignments('token',{deadline:'without_deadline'});
    assert.deepEqual(undated.assignments.map(a=>a.assignmentId),['3']);
  } finally {globalThis.fetch=original;}
});
test('failed courses are explicitly reported without leaking upstream errors',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>String(url).includes('courseWork')?new Response('private upstream error',{status:403}):Response.json({courses:[{id:'x',name:'Subject'}]});
  try {const result=await searchAssignments('token',{});assert.equal(result.complete,false);assert.equal(result.coursesChecked,0);assert.equal(result.failedCourses.length,1);assert.doesNotMatch(JSON.stringify(result),/private upstream|token/);}
  finally {globalThis.fetch=original;}
});
test('MCP search rejects invalid filters before accessing credentials',async()=>{
  for(const args of [{dueFrom:'2026-02-30'},{dueFrom:'2026-11-01',dueTo:'2026-10-01'},{limit:101},{limit:1.5},{query:4},{includeArchived:'true'},{unexpected:true},{timezone:'Bad/Zone'},{offset:-1},{deadline:'submitted'}]) {
    const response=await mcpRequest(new Request('https://app.example/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_assignments',arguments:args}})}),{},{},['classroom:read']);
    assert.equal((await response.json()).error.code,-32602);
  }
  assert.equal(validSearchOptions({dueFrom:'2028-02-29',limit:100}),true);
});
