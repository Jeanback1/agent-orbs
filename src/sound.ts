// Synthesized "wave" chime for finished tasks: no audio files, all Web Audio.
let ctx:AudioContext|null=null;
let noise:AudioBuffer|null=null;

/** Browsers only start audio after a user gesture; call from one. */
export function unlockAudio(){
  try{
    ctx??=new AudioContext();
    if(ctx.state==='suspended')void ctx.resume();
  }catch{ctx=null;}
}

export function playWave(moon=false){
  const c=ctx;if(!c||c.state!=='running')return;
  const t=c.currentTime,base=moon?330:196;
  const out=c.createGain();out.gain.value=moon?.07:.13;out.connect(c.destination);
  // Space: a damped feedback echo behind the dry sound.
  const delay=c.createDelay(1),feedback=c.createGain(),damp=c.createBiquadFilter(),wet=c.createGain();
  delay.delayTime.value=.31;feedback.gain.value=.38;damp.type='lowpass';damp.frequency.value=1800;wet.gain.value=.5;
  delay.connect(damp).connect(feedback).connect(delay);damp.connect(wet).connect(out);
  const bus=c.createGain();bus.connect(out);bus.connect(delay);
  const nodes:AudioNode[]=[out,delay,feedback,damp,wet,bus];
  // Soft bell: fifth and octave partials that fade faster than the root, gliding slightly down.
  [[1,1],[1.5,.45],[2.01,.25],[3,.1]].forEach(([ratio,gain],i)=>{
    const osc=c.createOscillator(),env=c.createGain(),lfo=c.createOscillator(),depth=c.createGain();
    const end=t+3.4/(1+i*.6);
    osc.frequency.setValueAtTime(base*ratio,t);osc.frequency.exponentialRampToValueAtTime(base*ratio*.985,t+3.4);
    lfo.frequency.value=.6+i*.17;depth.gain.value=6;lfo.connect(depth).connect(osc.detune);
    env.gain.setValueAtTime(0,t);env.gain.linearRampToValueAtTime(gain,t+.07);env.gain.exponentialRampToValueAtTime(.0001,end);
    osc.connect(env).connect(bus);osc.start(t);lfo.start(t);osc.stop(end+.05);lfo.stop(end+.05);
    nodes.push(osc,env,lfo,depth);
  });
  // The "wave": filtered noise sweeping from bright to dark.
  if(!noise){noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
  const src=c.createBufferSource(),band=c.createBiquadFilter(),swell=c.createGain();
  src.buffer=noise;band.type='bandpass';band.Q.value=1.2;
  band.frequency.setValueAtTime(moon?4200:3000,t);band.frequency.exponentialRampToValueAtTime(moon?600:300,t+1.4);
  swell.gain.setValueAtTime(0,t);swell.gain.linearRampToValueAtTime(.22,t+.35);swell.gain.exponentialRampToValueAtTime(.0001,t+1.6);
  src.connect(band).connect(swell).connect(bus);src.start(t);src.stop(t+1.7);
  nodes.push(src,band,swell);
  // Release the graph once the echo tail has died out.
  setTimeout(()=>{for(const n of nodes)n.disconnect();},6000);
}
