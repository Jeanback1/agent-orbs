import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {type RenderMetrics} from './renderer';
import {Scene} from './Scene';
import {type Session,type Status,statusLabels,providerLabels,visualKey} from './types';
import {playWave,unlockAudio} from './sound';
import './style.css';

function useSessions(){
 const [sessions,setSessions]=useState<Session[]>([]),[connected,setConnected]=useState(false),[received,setReceived]=useState(false);
 useEffect(()=>{
  const events=new EventSource('/api/events');
  events.addEventListener('snapshot',e=>{try{const data=JSON.parse((e as MessageEvent).data);if(Array.isArray(data.sessions)){setSessions(data.sessions);setReceived(true);setConnected(true);}}catch{}});
  events.onopen=()=>setConnected(true);events.onerror=()=>setConnected(false);
  return()=>events.close();
 },[]);
 return {sessions,connected,received};
}
function demoSession(i:number):Session{
 const provider=(['claude','codex','grok'] as const)[i%3];
 const titles=['Diseño del observatorio','API de sesiones','Exploración del proyecto','Pruebas de integración','Documentación','Refactor del cliente','Análisis del repositorio','Revisión de componentes'];
 return {id:`demo-${i}`,provider,title:titles[i%titles.length],cwd:`~/proyectos/${['observatorio','backend','portfolio','laboratorio'][i%4]}`,status:(['working','waiting','responding','attention'] as Status[])[i%4],activity:i%4===0?'Leyendo archivos':i%4===2?'Ejecutando pruebas':'',pid:900000+i,startedAt:Date.now()-((i+1)*127000),updatedAt:Date.now(),provisional:false,sessionId:`demo-${i}`};
}
function App(){
 const {sessions:realSessions,connected,received}=useSessions();
 const [demo,setDemo]=useState<Session[]|null>(null),[selected,setSelected]=useState<string|null>(null),[zoom,setZoom]=useState(1),[panel,setPanel]=useState(false);
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[graphics,setGraphics]=useState(true),[clock,setClock]=useState(new Date());
 const [metrics,setMetrics]=useState<RenderMetrics>({fps:0,particles:0,quality:2});
 const [sound,setSound]=useState(()=>{try{return localStorage.getItem('agent-orbs:sound')!=='off';}catch{return true;}});
 const statuses=useRef(new Map<string,Status>()),chimedAt=useRef(0);
 const sessions=demo??realSessions,active=sessions.find(s=>visualKey(s)===selected);
 const closeRef=useRef<HTMLButtonElement>(null),menuRef=useRef<HTMLButtonElement>(null),previousFocus=useRef<HTMLElement|null>(null);
 const closePanel=()=>{setPanel(false);setSelected(null);(previousFocus.current?.isConnected?previousFocus.current:menuRef.current)?.focus();};
 useEffect(()=>{const tick=setInterval(()=>setClock(new Date()),1000);return()=>clearInterval(tick);},[]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&panel){closePanel();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[panel]);
 useEffect(()=>{if(panel)closeRef.current?.focus();},[panel,selected]);
 // Audio may only start after a gesture; any click or key unlocks it.
 useEffect(()=>{window.addEventListener('pointerdown',unlockAudio);window.addEventListener('keydown',unlockAudio);return()=>{window.removeEventListener('pointerdown',unlockAudio);window.removeEventListener('keydown',unlockAudio);};},[]);
 useEffect(()=>{
  const previous=statuses.current,pids=new Set(sessions.map(s=>s.pid));let finished:Session|undefined;
  for(const s of sessions)if(previous.get(visualKey(s))==='working'&&(s.status==='responding'||s.status==='waiting'))finished??=s;
  statuses.current=new Map(sessions.map(s=>[visualKey(s),s.status]));
  // One chime per burst, even when several agents finish together.
  if(finished&&sound&&Date.now()-chimedAt.current>600){chimedAt.current=Date.now();playWave(!!finished.parentPid&&pids.has(finished.parentPid));}
 },[sessions,sound]);
 const toggleSound=()=>{const next=!sound;setSound(next);try{localStorage.setItem('agent-orbs:sound',next?'on':'off');}catch{}if(next){unlockAudio();setTimeout(()=>playWave(),50);}};
 const select=(key:string)=>{previousFocus.current=document.activeElement as HTMLElement;setSelected(key);setPanel(true);};
 const resizeDemo=(n:number)=>{setDemo(old=>Array.from({length:n},(_,i)=>old?.[i]??demoSession(i)));};
 return <main className={reduced?'reduced-motion':''}>
  <section className="field" aria-label="Observatorio">
   <Scene sessions={sessions} selected={panel?selected:null} onSelect={select} zoom={zoom} reduced={reduced} onGraphicsChange={setGraphics} onMetrics={setMetrics}/>
   <time className="clock" dateTime={clock.toISOString()} aria-label="Hora local">{clock.toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit',hour12:false})}</time>
   <button className={`menu-toggle ${demo?'demo-active':''}`} ref={menuRef} aria-label={panel?'Cerrar panel':'Abrir panel'} aria-expanded={panel} aria-controls="session-panel" title="Panel" onClick={()=>{if(panel)closePanel();else{previousFocus.current=menuRef.current;setPanel(true);}}}><span aria-hidden="true">···</span></button>
   {panel&&<aside id="session-panel" className="control-panel" aria-label={active?'Detalles de la sesión':'Panel de sesiones'}>
    <div className="panel-heading"><h2>{active?'Sesión':'Sesiones'}</h2><button className="icon-button" ref={closeRef} aria-label="Cerrar panel" onClick={closePanel}>×</button></div>
    {active?<>
     <button className="back-button" onClick={()=>setSelected(null)}>← Todas las sesiones</button>
     <h3 className="detail-title">{active.title}</h3>
     <dl><div><dt>Ubicación</dt><dd>{active.cwd}</dd></div></dl>
    </>:<>
     <p className="panel-status" role="status">{demo?'Demostración · datos simulados':connected?'Conectado al servicio local':'Reconectando · los estados pueden estar desactualizados'}</p>
     <div className="session-list">{sessions.map(s=><button className="session-row" key={visualKey(s)} onClick={()=>select(visualKey(s))}><i className={`provider-dot ${s.provider}`}/><span><strong>{s.title}</strong><small>{providerLabels[s.provider]}{s.parentPid&&sessions.some(p=>p.pid===s.parentPid)?' · Subagente':''} · {statusLabels[s.status]}</small></span><span aria-hidden="true">›</span></button>)}</div>
     {!sessions.length&&<p className="panel-note">{demo?'Sin sesiones simuladas.':received?'No hay sesiones abiertas. Abre Claude Code, Codex o Grok en una terminal.':'Esperando conexión con el servicio local.'}</p>}
     {graphics&&<div className="panel-section"><span>Fluidez</span><span className="performance-value">{metrics.fps?`${metrics.fps} FPS`:'Midiendo…'}</span></div>}
     <div className="panel-section"><span>Zoom</span><div className="inline-controls"><button className="icon-button" aria-label="Alejar" disabled={zoom<=.6} onClick={()=>setZoom(z=>Math.max(.6,z-.15))}>−</button><button className="zoom-value" aria-label="Restablecer zoom" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button className="icon-button" aria-label="Acercar" disabled={zoom>=1.9} onClick={()=>setZoom(z=>Math.min(2,z+.15))}>+</button></div></div>
     <div className="panel-section"><span>Sonido al terminar</span><button className={`switch ${sound?'enabled':''}`} role="switch" aria-label="Sonido al terminar" aria-checked={sound} onClick={toggleSound}><i/></button></div>
     <div className="panel-section"><span>Reducir movimiento</span><button className={`switch ${reduced?'enabled':''}`} role="switch" aria-label="Reducir movimiento" aria-checked={reduced} onClick={()=>setReduced(v=>!v)}><i/></button></div>
     <div className="panel-section"><span>Demostración</span><button className="text-button" onClick={()=>{setDemo(d=>d?null:[demoSession(0),demoSession(1)]);setSelected(null);setZoom(1);}}>{demo?'Salir de demo':'Explorar demo'}</button></div>
     {demo&&<div className="demo-controls" aria-label="Controles de demostración">{[1,2,4,8,20].map(n=><button key={n} className={sessions.length===n?'chosen':''} onClick={()=>resizeDemo(n)}>{n}</button>)}<button aria-label="Quitar sesión de demo" disabled={!sessions.length} onClick={()=>resizeDemo(Math.max(0,sessions.length-1))}>−</button><button aria-label="Añadir sesión de demo" disabled={sessions.length>=40} onClick={()=>resizeDemo(sessions.length+1)}>+</button><button aria-label="Añadir subagente de demo" title="Subagente" disabled={!sessions.length||sessions.length>=40} onClick={()=>setDemo(items=>items&&[...items,{...demoSession(items.length),parentPid:items[0].pid,status:'working',title:'Subagente'}])}>◐</button></div>}
     {demo&&<div className="animation-controls" aria-label="Animaciones de demostración">{(['waiting','working','responding'] as Status[]).map(status=><button key={status} aria-label={`Demo: ${statusLabels[status]}`} aria-pressed={demo.every(s=>s.status===status)} onClick={()=>setDemo(items=>items?.map(s=>({...s,status,activity:status==='responding'?'Respuesta final':status==='working'?'Procesando':''}))??null)}>{statusLabels[status]}</button>)}</div>}
     {!graphics&&<p className="panel-note">Vista simplificada: WebGL no está disponible.</p>}
    </>}
   </aside>}
  </section>
 </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
