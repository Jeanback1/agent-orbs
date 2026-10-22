import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){for(let i=0;i<80;i++){try{const value=await fn();if(value)return value;}catch{}await delay(100);}throw new Error(`No se cumplió: ${label}`);}
async function stop(child){if(!child || child.exitCode!==null || child.signalCode!==null)return;const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
test('isolated collectors: exact hook binding, activity, SSE, restart and independent abrupt closure',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbs-integration-'));
 const allocator=net.createServer();allocator.listen(0,'127.0.0.1');await once(allocator,'listening');const port=allocator.address().port;await new Promise(r=>allocator.close(r));
 const env={...process.env,PORT:String(port),AGENT_ORBS_STATE_DIR:path.join(root,'state'),CLAUDE_CONFIG_DIR:path.join(root,'claude-home'),CODEX_HOME:path.join(root,'codex-home')};
 const hook=path.resolve('scripts/hook.mjs');
 const fixture=path.join(root,'fixture.mjs');
 fs.writeFileSync(fixture,`import fs from 'node:fs';import readline from 'node:readline';import {spawnSync} from 'node:child_process';
 const [provider,id,file,hook]=process.argv.slice(2);const fd=fs.openSync(file,'r');
 const emit=event=>spawnSync(process.execPath,[hook,provider],{input:JSON.stringify({session_id:id,hook_event_name:event,tool_name:'FixtureTool'}),env:process.env,timeout:2000});
 emit('SessionStart');readline.createInterface({input:process.stdin}).on('line',emit);setInterval(()=>{},10000);`);
 const records={claude:JSON.stringify({sessionId:'fixture-claude',cwd:root}),codex:JSON.stringify({type:'session_meta',payload:{id:'fixture-codex',cwd:root}})};
 const children=[],files={};let backend;
 const start=()=>spawn(process.execPath,['server/index.mjs'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
 const get=()=>fetch(`http://127.0.0.1:${port}/api/sessions`).then(r=>r.json()).then(d=>d.sessions);
 const find=(sessions,p)=>sessions.find(s=>s.sessionId===`fixture-${p}`);
 try{
  backend=start();await until(()=>fetch(`http://127.0.0.1:${port}/api/health`).then(r=>r.ok),'server readiness');
  for(const provider of ['claude','codex']){
   const exe=path.join(root,provider);fs.symlinkSync(process.execPath,exe);
   const dir=path.join(env[provider==='claude'?'CLAUDE_CONFIG_DIR':'CODEX_HOME'],provider==='claude'?'projects/project':'sessions/2026/10/22');fs.mkdirSync(dir,{recursive:true});
   const file=path.join(dir,`fixture-${provider}.jsonl`);files[provider]=file;fs.writeFileSync(file,records[provider]+'\n');
   const child=spawn(exe,[fixture,provider,`fixture-${provider}`,file,hook],{cwd:root,env,stdio:['pipe','pipe','pipe']});children.push(child);
  }

  await until(async()=>{const s=await get();return ['claude','codex'].every(p=>find(s,p)?.status==='waiting');},'both hooks bind');
  children[1].stdin.write('PreToolUse\n');await until(async()=>find(await get(),'codex')?.status==='working','tool event');
  children[0].stdin.write('PermissionRequest\n');await until(async()=>find(await get(),'claude')?.status==='attention','permission event');
  children[1].stdin.write('Stop\n');await until(async()=>find(await get(),'codex')?.status==='waiting','stop event');
  const controller=new AbortController(),stream=await fetch(`http://127.0.0.1:${port}/api/events`,{signal:controller.signal});const reader=stream.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value),/event: snapshot/);controller.abort();
  await stop(backend);backend=start();await until(async()=>{const s=await get();return find(s,'claude')&&!find(s,'claude').provisional&&find(s,'codex')&&!find(s,'codex').provisional;},'identity recovery from open descriptors');
  // Seed the tails after the restart before appending current events.
  await delay(300);
  const began=Date.now();
  fs.appendFileSync(files.codex,JSON.stringify({type:'response_item',payload:{type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'fixture only'}]}})+'\n'+JSON.stringify({type:'event_msg',payload:{type:'task_complete'}})+'\n');
  await until(async()=>find(await get(),'codex')?.status==='responding','live final-response detection');
  assert.ok(Date.now()-began<1200,'Activity should not wait for the 1.5-second process scan');
  await until(async()=>find(await get(),'codex')?.status==='waiting','final glow fades to idle');
  await stop(children[1]);await until(async()=>{const s=await get();return !find(s,'codex')&&!!find(s,'claude');},'only closed terminal disappears');
 }finally{
  await Promise.all(children.map(stop));await stop(backend);fs.rmSync(root,{recursive:true});
 }
});
