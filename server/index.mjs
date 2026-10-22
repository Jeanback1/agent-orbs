import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {SessionStore} from './store.mjs';
import {listProcesses} from './processes.mjs';
import {TranscriptIndex,TranscriptTail} from './transcripts.mjs';
if(process.platform!=='linux'){console.error('Agent Orbs necesita Linux: detecta las sesiones a través de /proc.');process.exit(1);}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stateDir=process.env.AGENT_ORBS_STATE_DIR || path.join(os.homedir(),'.agent-orbs');
fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
const token=randomBytes(32).toString('hex');
const app=Fastify({logger:false,bodyLimit:16*1024});
const store=new SessionStore(),index=new TranscriptIndex(),tail=new TranscriptTail();
const clients=new Set();let revision=0,last='';
const port=Number(process.env.PORT || 3210);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT debe ser un puerto válido');
app.addHook('onRequest',async(req,reply)=>{
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return reply.code(403).send({error:'Host no permitido'});
  const origin=req.headers.origin;
  if(origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173'].includes(origin))return reply.code(403).send({error:'Origen no permitido'});
  reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');
  if(!req.url.startsWith('/api/'))reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
});
const snapshot=()=>({sessions:store.snapshot(),revision,observedAt:Date.now()});
function publish(){
  const current=JSON.stringify(store.snapshot());if(current===last)return;
  last=current;revision++;
  const data=`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`;
  for(const res of clients){if(res.writableLength>512*1024){res.destroy();clients.delete(res);}else res.write(data);}
}
function reconcile(){
  const candidates=index.scan();store.reconcile(listProcesses(),candidates);
  readActivity();
}
// Activity is separate from process/metadata discovery. Only bound files are tailed.
function readActivity(){
  for(const candidate of index.candidates)if(store.sessions.has(`${candidate.provider}:${candidate.sessionId}`))tail.read(candidate,(p,e)=>store.apply(p,e));
  store.advance();publish();
}
app.get('/api/health',async()=>({ok:true,app:'agent-orbs',version:'1.0.0'}));
app.get('/api/sessions',async()=>snapshot());
app.get('/api/events',(req,reply)=>{
  if(clients.size>=16)return reply.code(429).send({error:'Demasiadas conexiones'});
  reply.hijack();const res=reply.raw;
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
  clients.add(res);res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
  req.raw.on('close',()=>clients.delete(res));
});
app.post('/api/hooks/:provider',async(req,reply)=>{
  const supplied=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from(`Bearer ${token}`);
  if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected))return reply.code(401).send({error:'No autorizado'});
  const provider=req.params.provider,e=req.body;
  if(!['claude','codex'].includes(provider)||!e||typeof e.session_id!=='string'||e.session_id.length>200||typeof e.hook_event_name!=='string')return reply.code(400).send({error:'Evento inválido'});
  // A hook may announce a thread a daemon-backed Codex terminal just switched to.
  store.reconcile(listProcesses(),index.scan(false,1000));
  const accepted=store.apply(provider,e);publish();return {ok:true,matched:accepted};
});
if(fs.existsSync(path.join(root,'dist')))await app.register(fastifyStatic,{root:path.join(root,'dist')});
reconcile();
const timer=setInterval(reconcile,1500);
const activityTimer=setInterval(readActivity,200);
const heartbeat=setInterval(()=>{for(const res of clients)res.write(': heartbeat\n\n');},15000);
try{await app.listen({host:'127.0.0.1',port});}catch(e){clearInterval(timer);clearInterval(activityTimer);clearInterval(heartbeat);throw e;}
const registry=path.join(stateDir,'server.json');
fs.writeFileSync(registry,JSON.stringify({port,pid:process.pid,token}),{mode:0o600});
console.log(`Agent Orbs · http://127.0.0.1:${port}`);
async function close(){
  clearInterval(timer);clearInterval(activityTimer);clearInterval(heartbeat);for(const res of clients)res.end();
  try{const reg=JSON.parse(fs.readFileSync(registry));if(reg.pid===process.pid)fs.unlinkSync(registry);}catch{}
  await app.close();
}
process.once('SIGINT',()=>close());process.once('SIGTERM',()=>close());
