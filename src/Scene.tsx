import {useEffect,useRef,useState} from 'react';
import {OrbRenderer,type RenderOrb,type RenderMetrics} from './renderer';
import {constellation,spring} from './layout.mjs';
import {type Session,providerLabels,statusLabels,visualKey} from './types';
interface Moving extends RenderOrb {key:string;vx:number;vy:number;vr:number;targetX:number;targetY:number;targetR:number;alive:boolean;parent?:string;moonIndex:number;moonCount:number}
const hash=(s:string)=>Array.from(s).reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,0)%1000/31;
interface Props {sessions:Session[];selected:string|null;onSelect:(key:string)=>void;zoom:number;reduced:boolean;onGraphicsChange:(ok:boolean)=>void;onMetrics:(metrics:RenderMetrics)=>void}
export function Scene(props:Props){
 const area=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),hits=useRef(new Map<string,HTMLDivElement>());
 const live=useRef(props);live.current=props;const [fallback,setFallback]=useState(false);
 useEffect(()=>{
  const container=area.current!,surface=canvas.current!;let renderer:OrbRenderer|undefined;
  try{renderer=new OrbRenderer(surface);live.current.onGraphicsChange(true);}catch{setFallback(true);live.current.onGraphicsChange(false);}
  const moving=new Map<string,Moving>();let raf=0,last=performance.now(),time=0,quality=2;
  let sampleAt=last,frames=0,visibleMs=0,particles=0,badWindows=0,goodWindows=0;
  let width=container.clientWidth,height=container.clientHeight,layoutKey='',anchors=constellation(0,width,height);
  const resize=new ResizeObserver(entries=>{width=entries[0].contentRect.width;height=entries[0].contentRect.height;});resize.observe(container);
  function frame(now:number){
   const elapsed=(now-last)/1000,dt=Math.min(elapsed,.06);last=now;
   if(!document.hidden){
    const {sessions,selected,zoom,reduced}=live.current;
    if(!reduced)time+=dt;
    // Subagents orbit their root agent as moons and never take a constellation slot.
    const byPid=new Map(sessions.map(s=>[s.pid,s])),rootOf=(s:Session)=>{let r=s;for(let i=0;i<8&&r.parentPid&&byPid.has(r.parentPid);i++)r=byPid.get(r.parentPid)!;return r;};
    const mains=sessions.filter(s=>rootOf(s)===s),slot=new Map(mains.map((s,i)=>[visualKey(s),i])),moons=new Map<string,number>();
    const nextKey=`${mains.length}:${width}:${height}:${zoom}`;
    if(nextKey!==layoutKey){anchors=constellation(mains.length,width,height,zoom);layoutKey=nextKey;}
    for(const o of moving.values())o.alive=false;
    sessions.forEach(s=>{
     const key=visualKey(s),root=visualKey(rootOf(s)),parent=root===key?undefined:root,anchor=anchors[slot.get(root)!];let o=moving.get(key);
     const moonIndex=parent?moons.get(parent)??0:0;if(parent)moons.set(parent,moonIndex+1);
     const start=parent?moving.get(parent):undefined;
     if(!o){o={key,x:start?.x??width/2,y:start?.y??height/2,radius:0,vx:0,vy:0,vr:0,seed:hash(key),phase:hash(key),working:0,responding:0,opacity:0,selected:false,provider:s.provider,targetX:anchor.x,targetY:anchor.y,targetR:anchor.radius,alive:true,moonIndex:0,moonCount:1};moving.set(key,o);}
     Object.assign(o,{targetX:anchor.x,targetY:anchor.y,targetR:anchor.radius*(parent?.2:1),selected:key===selected,alive:true,parent,moonIndex});
     const blend=1-Math.exp(-dt*4.5);
     const working=s.status==='working'?1:s.status==='attention'?.25:0,responding=s.status==='responding'?1:0;
     o.working+=(working-o.working)*blend;o.responding+=(responding-o.responding)*blend;
     // Integrate phase: changing activity never jumps particle positions.
     if(!reduced)o.phase+=dt*(.8+o.working*1.45+o.responding*2.1);
    });
    for(const o of moving.values())if(o.parent)o.moonCount=moons.get(o.parent)??1;
    const draws:RenderOrb[]=[],placed=new Map<string,RenderOrb>();
    // Moons last: their orbit follows where the parent orb is drawn this frame.
    for(const [key,o] of [...moving].sort(([,a],[,b])=>Number(!!a.parent)-Number(!!b.parent))){
     if(!o.alive)o.targetR=0;
     const host=o.parent?placed.get(o.parent):undefined;let depth=0;
     if(host){
      const angle=time*.4+o.moonIndex/o.moonCount*Math.PI*2+host.seed,orbit=host.radius*.58;
      o.targetX=host.x+Math.cos(angle)*orbit;o.targetY=host.y+Math.sin(angle)*orbit*.38;depth=Math.sin(angle);
     }
     if(reduced){o.x=o.targetX;o.y=o.targetY;o.radius=o.targetR;o.opacity=o.alive?1:0;}
     else{
      const x=spring(o.x,o.vx,o.targetX,dt),y=spring(o.y,o.vy,o.targetY,dt),r=spring(o.radius,o.vr,o.targetR,dt);
      o.x=x.value;o.vx=x.velocity;o.y=y.value;o.vy=y.velocity;o.radius=r.value;o.vr=r.velocity;
      o.opacity+=((o.alive?1:0)-o.opacity)*(1-Math.exp(-dt*4));
     }
     if(!o.alive&&o.radius<.5){moving.delete(key);continue;}
     const amp=o.parent?0:Math.min(o.radius*.14,22);
     const dx=reduced?0:(Math.sin(time*.31+o.seed)+Math.sin(time*.57+o.seed*2)*.25)*amp;
     const dy=reduced?0:(Math.cos(time*.25+o.seed)+Math.sin(time*.43+o.seed)*.2)*amp*.8;
     const pulse=reduced?1:1+Math.sin(time*(.8+o.working*.6+o.responding*.8)+o.seed)*(.012+o.working*.008+o.responding*.012);
     const draw={...o,x:o.x+dx,y:o.y+dy,radius:o.radius*pulse*(1+depth*.12),opacity:o.opacity*(.75+depth*.25)};draws.push(draw);placed.set(key,draw);
     const hit=hits.current.get(key);
     if(hit){hit.style.transform=`translate3d(${draw.x}px,${draw.y}px,0)`;hit.style.opacity=String(o.opacity);hit.style.setProperty('--radius',`${draw.radius}px`);}
    }
    particles=renderer?.draw(width,height,time,draws,quality)||0;
    frames++;visibleMs+=Math.min(elapsed*1000,250);
    if(now-sampleAt>=1000){
      const fps=visibleMs?frames*1000/visibleMs:0;
      surface.dataset.fps=fps.toFixed(1);surface.dataset.particles=String(particles);
      live.current.onMetrics({fps:Math.round(fps),particles,quality});
      // Reduce workload only after sustained missed frames; recover quality too.
      if(fps<48){badWindows++;goodWindows=0;}else if(fps>57){goodWindows++;badWindows=0;}
      if(badWindows>=3){quality=Math.max(.75,quality-.25);badWindows=0;}
      if(goodWindows>=8){quality=Math.min(2,quality+.25);goodWindows=0;}
      frames=0;visibleMs=0;sampleAt=now;
    }
   }else{frames=0;visibleMs=0;sampleAt=now;}
   raf=requestAnimationFrame(frame);
  }
  raf=requestAnimationFrame(frame);
  const loss=(event:Event)=>{event.preventDefault();setFallback(true);live.current.onGraphicsChange(false);renderer=undefined;};surface.addEventListener('webglcontextlost',loss);
  return()=>{cancelAnimationFrame(raf);resize.disconnect();surface.removeEventListener('webglcontextlost',loss);renderer?.dispose();};
 },[]);
 return <div className={`scene ${fallback?'fallback':''}`} ref={area} aria-label="Constelación de sesiones">
  <canvas ref={canvas} aria-hidden="true"/>
  {props.sessions.map(s=>{const key=visualKey(s);return <div className={`orb-anchor ${s.provider} ${s.status} ${s.parentPid&&props.sessions.some(p=>p.pid===s.parentPid)?'moon':''}`} key={key} ref={node=>{if(node)hits.current.set(key,node);else hits.current.delete(key);}}>
   <button className={`orb-hit ${props.selected===key?'selected':''}`} aria-label={`${providerLabels[s.provider]}: ${s.title}. ${statusLabels[s.status]}`} aria-pressed={props.selected===key} onClick={()=>props.onSelect(key)}>
    {fallback&&<span className="fallback-sphere" aria-hidden="true"/>}
    <span className="orb-title" aria-hidden="true">{s.title}</span>
   </button>
  </div>;})}
 </div>;
}
