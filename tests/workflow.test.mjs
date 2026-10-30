import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAssignment,validWorkOptions} from '../src/workflow.ts';
import {mcpRequest} from '../src/mcp.ts';

test('wizard preserves teacher context and separates target date, title page and real export',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    assert.match(String(url),/\/courses\/c1\/courseWork\/a1$/);
    assert.equal(options.headers.authorization,'Bearer private-token');
    return Response.json({id:'a1',courseId:'c1',title:'SQL: ПР1',description:'Вариант 7: создать таблицы',dueDate:{year:2026,month:11,day:1},materials:[{link:{url:'https://example.com/instructions'}}]});
  };
  try {
    const initial=await prepareAssignment('private-token',{courseId:'c1',assignmentId:'a1'});
    assert.equal(initial.stage,'needs_preferences');assert.ok(initial.missingPreferences.includes('titlePage'));
    assert.equal(initial.source.instructions,'Вариант 7: создать таблицы');
    assert.equal(initial.source.materialContentsLoaded,false);
    const ready=await prepareAssignment('private-token',{courseId:'c1',assignmentId:'a1',workType:'practical',outputFormat:'docx',formatting:'standard',targetDate:'2026-10-31',titlePage:true,
      titlePageData:{institution:'Колледж',student:'Студент',group:'Группа 1',teacher:'Преподаватель',subject:'БД',city:'Москва',year:'2026'}});
    assert.equal(ready.stage,'ready_for_draft');assert.deepEqual(ready.missingPreferences,[]);
    assert.equal(ready.source.dueAt,'2026-11-01T00:00:00.000Z');assert.equal(ready.personalTargetDate,'2026-10-31');
    assert.match(ready.titlePage,/Колледж/);assert.match(ready.draftTemplate,/Ход выполнения/);
    assert.equal(ready.formatting.status,'suggested_not_institution_verified');
    assert.ok(ready.limitations.some(s=>s.includes('not an exported')));
    assert.doesNotMatch(JSON.stringify(ready),/private-token/);
    const incomplete=await prepareAssignment('private-token',{courseId:'c1',assignmentId:'a1',formatting:'teacher',titlePage:true,titlePageData:{student:'Known'}});
    assert.ok(incomplete.missingPreferences.includes('formattingRequirements'));
    assert.ok(incomplete.missingPreferences.includes('titlePageData.institution'));
    assert.ok(!incomplete.missingPreferences.includes('titlePageData.student'));
  } finally {globalThis.fetch=original;}
});
test('reference formatting and actual teacher names populate a new template without copying author identity',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>String(url).includes('/teachers?') ? Response.json({teachers:[{userId:'t1',profile:{name:{fullName:'Иванов Иван Иванович'}}}]}) :
    Response.json({id:'a1',title:'New assignment'});
  try {
    const result=await prepareAssignment('token',{courseId:'c1',assignmentId:'a1',workType:'report',outputFormat:'docx',formatting:'reference',titlePage:true,autoTeacher:true,
      titlePageData:{institution:'College',student:'Current student',group:'G1',subject:'Subject',city:'City',year:'2026'},
      referenceStyle:{name:'Approved sample',sourceType:'docx',accuracy:'observed',fontFamily:'Arial',fontSizePt:12,lineSpacing:1.15,marginsCm:{left:2,right:2,top:2,bottom:2},titlePageLayout:'Institution top; title centered; author right; city bottom',sections:['Задание','Решение','Вывод']}});
    assert.equal(result.stage,'ready_for_draft');assert.equal(result.resolvedTitlePageData.teacher,'Иванов Иван Иванович');
    assert.match(result.titlePage,/Current student/);assert.equal(result.formatting.profile.fontFamily,'Arial');
    assert.deepEqual(result.sections,['Задание','Решение','Вывод']);
    assert.equal(result.teacherLookup.source,'google_classroom');
    globalThis.fetch=async url=>String(url).includes('/teachers?') ? Response.json({teachers:[{userId:'t1',profile:{name:{fullName:'One'}}},{userId:'t2',profile:{name:{fullName:'Two'}}}]}) : Response.json({id:'a1',title:'Task'});
    const ambiguous=await prepareAssignment('token',{courseId:'c1',assignmentId:'a1',titlePage:true,autoTeacher:true});
    assert.equal(ambiguous.teacherLookup.status,'selection_required');assert.equal(ambiguous.resolvedTitlePageData.teacher,undefined);
    const chosen=await prepareAssignment('token',{courseId:'c1',assignmentId:'a1',autoTeacher:true,teacherUserId:'t2'});
    assert.equal(chosen.resolvedTitlePageData.teacher,'Two');
    globalThis.fetch=async url=>String(url).includes('/teachers?') ? new Response('private upstream message',{status:403}) : Response.json({id:'a1',title:'Task'});
    const denied=await prepareAssignment('token',{courseId:'c1',assignmentId:'a1',autoTeacher:true});
    assert.equal(denied.teacherLookup.status,'permission_required');assert.doesNotMatch(JSON.stringify(denied),/private upstream message/);
  } finally {globalThis.fetch=original;}
});
test('wizard validates nested preferences before Google/network access',async()=>{
  for(const extra of [{workType:'fake'},{outputFormat:'exe'},{titlePageData:{secret:'bad'}},{titlePageData:[]},{titlePageData:{student:123}},{additionalContext:'x'.repeat(8001)},{targetDate:'2026-02-30'},{titlePage:'yes'},{referenceStyle:{fontSizePt:0}},{referenceStyle:{student:'friend'}},{referenceStyle:{marginsCm:{left:-1}}},{teacherUserId:'../x'}]) {
    const args={courseId:'c1',assignmentId:'a1',...extra};assert.equal(validWorkOptions(args),false);
    const response=await mcpRequest(new Request('https://app.example/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'prepare_assignment',arguments:args}})}),{},{},['classroom:read']);
    assert.equal((await response.json()).error.code,-32602);
  }
});
