import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SessionStore} from '../server/store.mjs';
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
