import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {TranscriptTail} from '../server/transcripts.mjs';
test('tail tolerates partial JSONL writes and emits lifecycle without message or arguments',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbs-tail-')),file=path.join(root,'session.jsonl'),tail=new TranscriptTail(),events=[];
 const candidate={file,provider:'codex',sessionId:'test'};
 const start=JSON.stringify({type:'event_msg',payload:{type:'task_started',message:'private'}})+'\n';
 const end=JSON.stringify({type:'event_msg',payload:{type:'task_complete',message:'private'}})+'\n';
 try{
  fs.writeFileSync(file,start+end.slice(0,20));tail.read(candidate,(p,e)=>events.push(e));assert.equal(events.length,1);
  fs.appendFileSync(file,end.slice(20));tail.read(candidate,(p,e)=>events.push(e));
  assert.equal(events.length,2);assert.equal(events[1].hook_event_name,'Stop');assert.ok(!JSON.stringify(events).includes('private'));
  tail.read(candidate,(p,e)=>events.push(e));assert.equal(events.length,2);
 }finally{fs.rmSync(root,{recursive:true});}
});
test('Codex final_answer is distinguished from commentary; no response content is forwarded',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbs-final-')),file=path.join(root,'session.jsonl'),tail=new TranscriptTail(),events=[];
 const c={file,provider:'codex',sessionId:'test'};
 try{
  fs.writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id:'test'}})+'\n');tail.read(c,()=>{});
  const message=phase=>JSON.stringify({type:'response_item',payload:{type:'message',role:'assistant',phase,content:[{type:'output_text',text:'private response'}]}})+'\n';
  fs.appendFileSync(file,message('commentary'));tail.read(c,(p,e)=>events.push(e));assert.equal(events.length,0);
  fs.appendFileSync(file,message('final_answer'));tail.read(c,(p,e)=>events.push(e));assert.equal(events[0].hook_event_name,'FinalResponse');assert.equal(events[0].historical,false);
  assert.ok(!JSON.stringify(events).includes('private response'));
 }finally{fs.rmSync(root,{recursive:true});}
});
test('Claude end_turn text is final, while thinking and tool_use commentary are not',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbs-claude-final-')),file=path.join(root,'session.jsonl'),tail=new TranscriptTail(),events=[];
 const c={file,provider:'claude',sessionId:'test'};
 try{
  fs.writeFileSync(file,'{}\n');tail.read(c,()=>{});
  const msg=(stop_reason,content)=>JSON.stringify({type:'assistant',message:{stop_reason,content}})+'\n';
  fs.appendFileSync(file,msg('tool_use',[{type:'text',text:'private commentary'}]));tail.read(c,(p,e)=>events.push(e));assert.equal(events.length,0);
  fs.appendFileSync(file,msg('end_turn',[{type:'thinking',thinking:'private thinking'}]));tail.read(c,(p,e)=>events.push(e));assert.notEqual(events.at(-1).hook_event_name,'FinalResponse');
  fs.appendFileSync(file,msg('end_turn',[{type:'text',text:'private final'}]));tail.read(c,(p,e)=>events.push(e));assert.equal(events.at(-1).hook_event_name,'FinalResponse');
  assert.ok(!JSON.stringify(events).includes('private'));
 }finally{fs.rmSync(root,{recursive:true});}
});
