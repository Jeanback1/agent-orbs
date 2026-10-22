#!/usr/bin/env node
// Observation only: never emits a hook decision or agent output.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {readProcess,providerOf} from '../server/processes.mjs';
try {
  let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>1024*1024)process.exit(0);}
  const data=JSON.parse(input),provider=process.argv[2];
  const registry=JSON.parse(fs.readFileSync(path.join(process.env.AGENT_ORBS_STATE_DIR || path.join(os.homedir(),'.agent-orbs'),'server.json'),'utf8'));
  if(!['claude','codex'].includes(provider)||!Number.isInteger(registry.port)||registry.port<1||registry.port>65535||typeof registry.token!=='string')process.exit(0);
  let pid=process.ppid,terminal;
  for(let i=0;i<24 && pid>1;i++){
    const proc=readProcess(pid);if(!proc)break;
    // A shared daemon may serve another TUI; ancestry beyond it is ambiguous.
    if(provider==='codex' && proc.argv.includes('--managed-daemon'))break;
    if(providerOf(proc)===provider){terminal={pid:proc.pid,startTime:proc.startTime};break;}
    pid=proc.ppid;
  }
  const body=JSON.stringify({session_id:data.session_id,hook_event_name:data.hook_event_name,
    tool_name:typeof data.tool_name==='string'?data.tool_name.slice(0,100):undefined,
    notification_type:data.notification_type,reason:data.reason,terminal});
  await new Promise(resolve=>{
    const req=http.request({hostname:'127.0.0.1',port:registry.port,path:`/api/hooks/${provider}`,method:'POST',headers:{Authorization:`Bearer ${registry.token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:700},res=>{res.resume();res.on('end',resolve);});
    req.on('error',resolve);req.on('timeout',()=>{req.destroy();resolve();});req.end(body);
  });
}catch{}
process.exit(0);
