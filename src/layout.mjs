/** Deterministic anchors; positions are in CSS pixels relative to the scene. */
export function constellation(count, width, height, zoom=1) {
  if (!count) return [];
  const positions=[];
  // Horizontal and vertical room are separate: a single row needs little height.
  let extent=1.8,extentY;
  if(count===1){positions.push([0,0]);extent=extentY=1.5;}
  else if(count===2){positions.push([-1.55,0],[1.55,0]);extent=3.1;extentY=1.5;}
  else if(count===3){positions.push([0,-1.85],[-1.9,1.45],[1.9,1.45]);extent=3.6;}
  else if(count===4){positions.push([0,-2.7],[-2.8,0],[2.8,0],[0,2.7]);extent=4.6;}
  else {
    let remaining=count,ring=0;
    while(remaining>0){
      const capacity=8+ring*4, slots=Math.min(remaining,capacity),radius=3.4+ring*3.4;
      for(let i=0;i<slots;i++){
        const angle=-Math.PI/2+2*Math.PI*i/slots+(ring%2?Math.PI/slots:0);
        positions.push([Math.cos(angle)*radius,Math.sin(angle)*radius]);
      }
      remaining-=slots;extent=radius+1.9;ring++;
    }
  }
  const radius=Math.max(18,Math.min(count===1?300:count===2?240:116,(width-60)/(extent*2),(height-150)/((extentY??extent)*2)))*zoom;
  const anchors=positions.map(([x,y],i)=>({x:width/2+x*radius,y:height/2+y*radius,radius,seed:i*7.713+1.5}));
  return anchors;
}
export function spring(value, velocity, target, dt) {
  // Analytic critically damped spring; stable after long/suspended frames.
  const omega=5.6,delta=value-target,decay=Math.exp(-omega*dt),c=velocity+omega*delta;
  return {value:target+(delta+c*dt)*decay,velocity:(velocity-omega*c*dt)*decay};
}
