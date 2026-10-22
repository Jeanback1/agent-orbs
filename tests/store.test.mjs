import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SessionStore} from '../server/store.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {claudeSessionOf, processOwnsSession} from '../server/processes.mjs';
const proc=(pid,provider='codex',startTime='100')=>({pid,provider,startTime,cwd:'/same',argv:[provider]});
const event=(session_id,hook_event_name,terminal)=>({session_id,hook_event_name,terminal});
test('same folder has two independent provisional orbs, never guessed identities',()=>{
 const store=new SessionStore({owns:()=>false});store.reconcile([proc(1),proc(2)],[{provider:'codex',sessionId:'old',cwd:'/same'}]);
 assert.equal(store.snapshot().length,2);assert.ok(store.snapshot().every(s=>s.provisional));
 assert.equal(store.apply('codex',event('old','PreToolUse')),false);
});
test('exact hook process binds only its own orb and preserves visual lifetime',()=>{
 const store=new SessionStore({owns:()=>false,now:()=>500});store.reconcile([proc(1),proc(2)]);
 const before=store.snapshot().find(s=>s.pid===2);
 assert.ok(store.apply('codex',event('thread-two','SessionStart',{pid:2,startTime:'100'})));
 const after=store.snapshot().find(s=>s.pid===2);
 assert.equal(after.sessionId,'thread-two');assert.equal(after.startedAt,before.startedAt);assert.equal(after.status,'waiting');
 assert.ok(store.snapshot().find(s=>s.pid===1).provisional);
});
test('reused PID does not inherit another process identity',()=>{
 const store=new SessionStore({owns:()=>false});store.reconcile([proc(1)]);
 store.apply('codex',event('first','SessionStart',{pid:1,startTime:'100'}));
 store.reconcile([proc(1,'codex','200')]);store.reconcile([proc(1,'codex','200')]);
 assert.equal(store.snapshot().length,1);assert.ok(store.snapshot()[0].provisional);
 assert.equal(store.apply('codex',event('stale','PreToolUse',{pid:1,startTime:'100'})),false);
});
test('closing one same-folder session leaves the other alive, with grace for transient scans',()=>{
 const store=new SessionStore({owns:()=>false});store.reconcile([proc(1),proc(2)]);
 store.reconcile([proc(2)]);assert.equal(store.snapshot().length,2);
 store.reconcile([proc(2)]);assert.deepEqual(store.snapshot().map(s=>s.pid),[2]);
});
test('provider IDs isolate session IDs and states',()=>{
 const store=new SessionStore({owns:(p,id)=>id==='shared'});store.reconcile([proc(1),proc(2,'claude')],[{provider:'codex',sessionId:'shared'},{provider:'claude',sessionId:'shared'}]);
 store.apply('claude',event('shared','PermissionRequest'));store.apply('codex',event('shared','PreToolUse'));
 assert.equal(store.snapshot().find(s=>s.provider==='claude').status,'attention');
 assert.equal(store.snapshot().find(s=>s.provider==='codex').status,'working');
 store.apply('codex',event('shared','Stop'));assert.equal(store.snapshot().find(s=>s.provider==='codex').status,'waiting');
});
test('daemon-only events never create orbs; subagent IDs cannot replace their parent',()=>{
 const store=new SessionStore({owns:()=>false});assert.equal(store.apply('codex',event('orphan','SessionStart')),false);
 store.reconcile([proc(1)]);store.apply('codex',event('parent','SessionStart',{pid:1,startTime:'100'}));
 assert.equal(store.apply('codex',event('child','PreToolUse',{pid:1,startTime:'100'})),false);
 assert.equal(store.snapshot()[0].sessionId,'parent');
});
test('final response has its own state, survives Stop briefly and settles back to idle',()=>{
 let now=10000;const store=new SessionStore({owns:()=>true,now:()=>now});
 store.reconcile([proc(1)],[{provider:'codex',sessionId:'response'}]);
 store.apply('codex',event('response','PreToolUse'));assert.equal(store.snapshot()[0].status,'working');
 store.apply('codex',event('response','FinalResponse'));assert.equal(store.snapshot()[0].status,'responding');
 store.apply('codex',event('response','Stop'));assert.equal(store.snapshot()[0].status,'responding');
 now+=2300;store.advance();assert.equal(store.snapshot()[0].status,'waiting');
});
test('historical final responses do not flash; a new turn or permission cancels the response effect',()=>{
 const store=new SessionStore({owns:()=>true});store.reconcile([proc(1)],[{provider:'codex',sessionId:'response'}]);
 store.apply('codex',{...event('response','FinalResponse'),historical:true});assert.equal(store.snapshot()[0].status,'waiting');
 store.apply('codex',event('response','FinalResponse'));store.apply('codex',event('response','UserPromptSubmit'));assert.equal(store.snapshot()[0].status,'working');
 store.apply('codex',event('response','FinalResponse'));store.apply('codex',event('response','PermissionRequest'));assert.equal(store.snapshot()[0].status,'attention');
});
test('agents launched from another agent process tree become its subagents',async()=>{
 const {agentAncestor}=await import('../server/processes.mjs');
 const byPid=new Map([[10,{pid:10,ppid:1}],[11,{pid:11,ppid:10}],[12,{pid:12,ppid:11}],[20,{pid:20,ppid:1}]]),agents=new Set([10,12,20]);
 assert.equal(agentAncestor(byPid.get(12),byPid,agents),10);
 assert.equal(agentAncestor(byPid.get(10),byPid,agents),undefined);assert.equal(agentAncestor(byPid.get(20),byPid,agents),undefined);
 const store=new SessionStore({owns:()=>false});store.reconcile([proc(10),{...proc(12),parentPid:10}]);
 assert.equal(store.snapshot().find(s=>s.pid===12).parentPid,10);assert.equal(store.snapshot().find(s=>s.pid===10).parentPid,undefined);
});
test('daemon-backed Codex terminal follows the thread it last wrote, including resumed ones',()=>{
 const store=new SessionStore({owns:()=>false}),thread=(sessionId,createdAt,mtime)=>({provider:'codex',sessionId,cwd:'/same',createdAt,mtime,originator:'codex-tui'});
 store.reconcile([{...proc(1),startedMs:10000}],[thread('idle',1000,5000),thread('resumed',2000,14000),thread('fresh',12000,13000)]);
 assert.equal(store.snapshot()[0].sessionId,'resumed');
 assert.ok(store.apply('codex',event('resumed','UserPromptSubmit')));assert.equal(store.snapshot()[0].status,'working');
 store.reconcile([{...proc(1),startedMs:10000}],[thread('resumed',2000,14000),thread('fresh',12000,15000)]);
 assert.equal(store.snapshot()[0].sessionId,'fresh');assert.equal(store.snapshot().length,1);
 store.reconcile([{...proc(1),startedMs:10000}],[{...thread('app',12000,16000),originator:'codex_desktop'},thread('fresh',12000,15000)]);
 assert.equal(store.snapshot()[0].sessionId,'fresh');
});
test('daemon-backed Codex terminals started together in one folder stay provisional',()=>{
 const store=new SessionStore({owns:()=>false});
 store.reconcile([{...proc(1),startedMs:10000},{...proc(2),startedMs:12000}],[{provider:'codex',sessionId:'t',cwd:'/same',createdAt:13000}]);
 assert.ok(store.snapshot().every(s=>s.provisional));
});
test('agents launched by a daemon-backed Codex thread become moons of that terminal',()=>{
 const store=new SessionStore({owns:(p,id)=>p.pid===1&&id==='mine'});
 store.reconcile([proc(1),{...proc(2,'claude'),parentThread:'mine'}],[{provider:'codex',sessionId:'mine',cwd:'/same'}]);
 assert.equal(store.snapshot().find(s=>s.pid===2).parentPid,1);
});
test('only processes under the Codex daemon read their thread from the environment',async()=>{
 const {codexParentThread}=await import('../server/processes.mjs'),fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbs-proc-'));
 for(const pid of [12,22]){fs.mkdirSync(path.join(root,String(pid)));fs.writeFileSync(path.join(root,String(pid),'environ'),'A=1\0CODEX_THREAD_ID=mine\0');}
 const byPid=new Map([[10,{pid:10,ppid:1,argv:['codex','app-server','--managed-daemon']}],[11,{pid:11,ppid:10,argv:['zsh']}],[12,{pid:12,ppid:11,argv:['claude']}],[20,{pid:20,ppid:1,argv:['zsh']}],[22,{pid:22,ppid:20,argv:['claude']}]]);
 assert.equal(codexParentThread(byPid.get(12),byPid,root),'mine');assert.equal(codexParentThread(byPid.get(22),byPid,root),undefined);
 fs.rmSync(root,{recursive:true});
});
test('Claude sessions are read from sessions/<pid>.json only when procStart matches',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orbs-claude-sessions-'));
 try{
  fs.writeFileSync(path.join(dir,'42.json'),JSON.stringify({pid:42,sessionId:'abc',procStart:'1000'}));
  assert.equal(claudeSessionOf({pid:42,startTime:'1000'},dir),'abc');
  assert.equal(claudeSessionOf({pid:42,startTime:'2000'},dir),undefined);
  assert.equal(claudeSessionOf({pid:43,startTime:'1000'},dir),undefined);
  assert.ok(processOwnsSession({pid:42,argv:['claude'],sessionFiles:[],claudeSession:'abc'},'abc'));
 }finally{fs.rmSync(dir,{recursive:true});}
});
