// Shared, deterministic geometry: upload once, animate entirely in vertex shaders.
export function neuralGeometry(count = 12000) {
  let state=0x4f524253;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const nodes=Array.from({length:12},(_,i)=>{
    const y=1-2*(i+.5)/12,a=i*2.39996323,r=Math.sqrt(1-y*y);
    return [Math.cos(a)*r,y,Math.sin(a)*r];
  });
  const edges=[];
  for(let i=0;i<nodes.length;i++){
    const nearby=nodes.map((p,j)=>({j,d:p.reduce((s,v,k)=>s+(v-nodes[i][k])**2,0)})).filter(v=>v.j!==i).sort((a,b)=>a.d-b.d).slice(0,3);
    for(const {j} of nearby)if(!edges.some(([a,b])=>a===j&&b===i))edges.push([i,j]);
  }
  // Interleaved: from.xyz, to.xyz, progress/lane/strength/kind.
  const points=new Float32Array(count*10);
  for(let i=0;i<count;i++){
    let from,to,kind;
    if(i<nodes.length){from=to=nodes[i];kind=2;}
    else if(i%10<5){const edge=edges[Math.floor(random()*edges.length)];from=nodes[edge[0]];to=nodes[edge[1]];kind=1;}
    else{const y=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-y*y);from=[Math.cos(a)*r,y,Math.sin(a)*r];to=from;kind=i%19===0?4:0;}
    points.set([...from,...to,random(),random()*2-1,.45+random()*.55,kind],i*10);
  }
  const lines=[];
  for(const [a,b] of edges)for(let lane=0;lane<2;lane++)for(let step=0;step<36;step++)for(const t of [step/36,(step+1)/36]){
    lines.push(...nodes[a],...nodes[b],t,(lane-.5)*.7,.6,3);
  }
  return {points,lines:new Float32Array(lines),nodeCount:nodes.length};
}
