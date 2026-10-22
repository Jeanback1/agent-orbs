import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const clean = x => typeof x === 'string' ? x.replace(/\s+/g,' ').trim().slice(0,160) : '';
function records(file) {
  let fd;
  try {
    fd = fs.openSync(file,'r');
    const size = fs.fstatSync(fd).size, n = Math.min(size, 96*1024);
    const head = Buffer.alloc(n); fs.readSync(fd,head,0,n,0);
    const tail = Buffer.alloc(Math.min(Math.max(0,size-n),96*1024));
    if (tail.length) fs.readSync(fd,tail,0,tail.length,size-tail.length);
    return (head.toString()+'\n'+tail.toString()).split('\n').flatMap(line => {try{return [JSON.parse(line)];}catch{return [];}});
  } catch {return [];} finally {if(fd!==undefined) fs.closeSync(fd);}
}
export class TranscriptIndex {
  cache = new Map(); candidates = []; lastScan = 0;
  constructor(home = os.homedir()) { this.home = home; }
  scan(force = false, maxAge = 10000) {
    if (!force && Date.now()-this.lastScan < maxAge) return this.candidates;
    this.lastScan=Date.now(); const files=[];
    const walk=(dir,provider,depth=0)=>{
      if(depth>5) return;
      try {for(const e of fs.readdirSync(dir,{withFileTypes:true})){
        const file=path.join(dir,e.name);
        if(e.isDirectory() && e.name!=='subagents') walk(file,provider,depth+1);
        else if(e.isFile() && e.name.endsWith('.jsonl') && !e.name.startsWith('agent-')){
          const stat=fs.statSync(file); files.push({file,provider,mtime:stat.mtimeMs});
        }
      }}catch{}
    };
    const codexDir=process.env.CODEX_HOME || path.join(this.home,'.codex');
    walk(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(this.home,'.claude'),'projects'),'claude');
    walk(path.join(codexDir,'sessions'),'codex');
    const titles=new Map();
    try {
      const db=fs.readdirSync(codexDir).filter(n=>/^state_\d+\.sqlite$/.test(n)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]))[0];
      if(db) for(const row of JSON.parse(execFileSync('sqlite3',['-readonly','-json',path.join(codexDir,db),"SELECT id, COALESCE(NULLIF(name,''), title) AS title FROM threads ORDER BY updated_at DESC LIMIT 2000;"],{encoding:'utf8',timeout:1000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','ignore']}))) titles.set(row.id,clean(row.title));
    }catch{}
    try {for(const line of fs.readFileSync(path.join(codexDir,'session_index.jsonl'),'utf8').split('\n')) {
      try{const r=JSON.parse(line);if(clean(r.thread_name))titles.set(r.id,clean(r.thread_name));}catch{}
    }}catch{}
    this.candidates=files.sort((a,b)=>b.mtime-a.mtime).slice(0,500).flatMap(({file,provider,mtime})=>{
      let meta=this.cache.get(file);
      if(!meta || meta.mtime!==mtime){
        const rows=records(file);
        const first=rows.find(r=>provider==='codex'?r.type==='session_meta':r.sessionId && r.cwd);
        const info=provider==='codex'?first?.payload:first;
        if(!info || first.isSidechain || info.source?.subagent) return [];
        const sessionId=provider==='codex'?info.id:info.sessionId;
        if(typeof sessionId!=='string' || typeof info.cwd!=='string')return [];
        // Claude writes /rename as custom-title and its generated name as ai-title, repeating both
        // through the file; only the head and tail are read, so keep the last ones seen.
        let customTitle=meta?.customTitle||'', aiTitle=meta?.aiTitle||'';
        for(const row of rows){
          if(row.type==='custom-title' && clean(row.customTitle))customTitle=clean(row.customTitle);
          if(row.type==='ai-title' && clean(row.aiTitle))aiTitle=clean(row.aiTitle);
        }
        meta={file,provider,mtime,sessionId,cwd:info.cwd,createdAt:Date.parse(info.timestamp)||undefined,originator:typeof info.originator==='string'?info.originator:undefined,customTitle,aiTitle,title:customTitle || aiTitle || path.basename(info.cwd) || 'Sesión'};
        this.cache.set(file,meta);
      }
      return [{...meta,title:titles.get(meta.sessionId)||meta.title}];
    });
    const keep=new Set(files.slice(0,500).map(f=>f.file));
    for(const key of this.cache.keys())if(!keep.has(key))this.cache.delete(key);
    return this.candidates;
  }
}
export class TranscriptTail {
  offsets=new Map();
  read(candidate, apply) {
    const {file,provider,sessionId}=candidate;
    try {
      const size=fs.statSync(file).size, previous=this.offsets.get(file);
      if(previous?.size===size)return;
      const start=previous && size>=previous.size ? previous.offset : Math.max(0,size-128*1024);
      const length=Math.min(size-start,256*1024);
      const fd=fs.openSync(file,'r'),buf=Buffer.alloc(length);
      try{fs.readSync(fd,buf,0,length,start);}finally{fs.closeSync(fd);}
      const end=buf.lastIndexOf(10);if(end<0)return;
      let lines=buf.subarray(0,end).toString().split('\n');if(!previous && start>0)lines.shift();
      this.offsets.set(file,{size:start+length,offset:start+end+1});
      for(const line of lines){
        let r;try{r=JSON.parse(line);}catch{continue;}
        let event;
        if(provider==='codex'){
          if(r.type==='event_msg') {
            const type=r.payload?.type;
            if(['task_started','turn_started','user_message'].includes(type))event={hook_event_name:'UserPromptSubmit'};
            if(['task_complete','task_completed','turn_complete','turn_aborted'].includes(type))event={hook_event_name:'Stop'};
          }
          if(r.type==='response_item' && r.payload?.type==='message' && r.payload.role==='assistant' && ['final','final_answer'].includes(r.payload.phase) && r.payload.content?.some?.(x=>x.type==='output_text' && typeof x.text==='string' && x.text.trim()))event={hook_event_name:'FinalResponse'};
          if(r.type==='event_msg' && r.payload?.type==='agent_message' && ['final','final_answer'].includes(r.payload.phase))event={hook_event_name:'FinalResponse'};
          if(r.type==='response_item' && ['function_call','custom_tool_call'].includes(r.payload?.type)) event={hook_event_name:'PreToolUse',tool_name:clean(r.payload.name)};
        } else {
          if(r.isSidechain)continue;
          if(r.type==='user')event={hook_event_name:'UserPromptSubmit'};
          if(r.type==='assistant'){
            const tool=r.message?.content?.find?.(x=>x.type==='tool_use');
            if(tool)event={hook_event_name:'PreToolUse',tool_name:clean(tool.name)};
            else if(r.message?.stop_reason==='end_turn')event={hook_event_name:r.message.content?.some?.(x=>x.type==='text' && typeof x.text==='string' && x.text.trim())?'FinalResponse':'Stop'};
          }
          if(r.type==='system' && r.subtype==='turn_duration')event={hook_event_name:'Stop'};
        }
        if(event)apply(provider,{...event,session_id:sessionId,historical:!previous});
      }
    }catch{}
  }
}
