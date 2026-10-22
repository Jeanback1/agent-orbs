export const vertex = `#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
// Lightweight analytic sky: no layered noise sampled for every screen pixel.
export const background = `#version 300 es
precision highp float;
in vec2 uv;out vec4 frag;uniform vec2 resolution;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec2 p=(uv-.5)*vec2(resolution.x/resolution.y,1.);
 vec3 col=vec3(.009,.016,.024);
 col+=exp(-dot(p-vec2(-.4,.1),p-vec2(-.4,.1))*2.5)*vec3(.004,.009,.012);
 vec2 cell=floor(p*300.),q=fract(p*300.)-.5;
 col+=smoothstep(.07,0.,length(q))*step(.989,hash(cell))*vec3(.28,.36,.39);
 frag=vec4(col,1.);
}`;
export const particleVertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 aFrom;
layout(location=1) in vec3 aTo;
layout(location=2) in vec4 aData;
uniform vec2 resolution,center;
uniform float radius,dpr,phase,seed,working,responding,opacity,provider,selected;
uniform vec3 nodes[12];
out vec3 color;out float alpha;flat out float kind;
vec3 deform(vec3 p){
 float t=phase*.17+seed;
 p+=.035*vec3(sin(p.y*4.+t),sin(p.z*4.-t*.8),sin(p.x*4.+t*.7));
 return normalize(p);
}
// Each neuron fires on its own rhythm; returns the time since its last spike (0..1 of its cycle).
float since(vec3 n){
 float h=fract(sin(dot(n,vec3(12.9898,78.233,37.719)))*43758.5453);
 return fract(phase*(.2+.18*fract(h*7.13))+h*5.+seed*.37);
}
// Impulse travelling down an axon: bright head plus a fading trail behind it.
float impulse(float t,float s){
 float d=s-t,head=exp(-d*d*260.);
 return (head+step(0.,d)*exp(-d*7.)*.45)*(1.-smoothstep(.95,1.5,s));
}
void main(){
 kind=aData.w;float t=aData.x;vec3 p;
 float act=clamp(working+responding,0.,1.),signal=0.,spike=0.,wave=0.,spark=0.;
 if(kind==1. || kind==3.){
   if(kind==1.)t=fract(t+phase*.075);
   signal=act*(impulse(t,since(aFrom)*2.6)+impulse(1.-t,since(aTo)*2.6));
   vec3 a=deform(aFrom),b=deform(aTo),side=normalize(cross(a,b));
   float envelope=sin(t*3.14159265);
   float curl=.28*sin(t*6.2831853+phase*.12)+.13*sin(t*12.5663706);
   float zap=act*.035*sin(t*47.+phase*3.1)*sin(t*19.-phase*1.3);
   // A passing impulse pulls the lane together into a bright beam.
   p=normalize(mix(a,b,t)+side*envelope*(curl+zap+aData.y*.095*(1.-.8*min(signal,1.))));
 }else{
   p=deform(aFrom);
   if(kind==2.){float l=since(aFrom);spike=act*(exp(-l*12.)+.25*exp(-l*3.));}
   if(kind==0.||kind==4.){
     if(act>.01)for(int i=0;i<12;i++){
       float l=since(nodes[i]),d=acos(clamp(dot(aFrom,nodes[i]),-1.,1.));
       wave+=exp(-pow((d-l*2.2)*9.,2.))*(1.-l)*(1.-l);
     }
     wave*=act;
     spark=act*step(.992,fract(sin(aData.x*917.3+floor(phase*4.+aData.y*3.)*13.7)*43758.5453));
     float swirl=.18*sin(p.y*5.+phase*.3+seed);
     p.xz=mat2(cos(swirl),-sin(swirl),sin(swirl),cos(swirl))*p.xz;
     float emit=fract(aData.x*3.7+phase*.12);
     p*=kind==4.?1.08+.13*aData.x+act*emit*.45:.94+.08*aData.x;
     p*=1.+wave*.07;
     if(kind==4.)spark=act*(1.-emit);
   }
 }
 float ry=phase*.0375+seed,rx=.23*sin(phase*.03+seed);
 p.xz=mat2(cos(ry),-sin(ry),sin(ry),cos(ry))*p.xz;
 p.yz=mat2(cos(rx),-sin(rx),sin(rx),cos(rx))*p.yz;
 float perspective=2.8/(2.8-p.z*.22);
 vec2 pixel=center+vec2(p.x,-p.y)*radius*perspective;
 gl_Position=vec4(pixel/resolution*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
 float depth=.35+.65*(p.z*.5+.5);
 vec3 base=mix(vec3(.82,.27,.065),vec3(.055,.58,.31),provider);
 vec3 light=mix(vec3(1.,.72,.38),vec3(.43,1.,.71),provider);
 vec3 hot=mix(vec3(1.,.95,.86),vec3(.86,1.,.93),provider);
 float front=pow(max(0.,p.z),3.);
 float pulse=.72+.28*sin(t*24.-phase*1.7+seed);
 float gain=1.+working*.65+responding*1.8;
 float energy=min(signal+spike+wave+spark,1.5);
 color=mix(mix(base,light,(kind==2.?.6:.08)+responding*.20+front*.09+wave*.5),hot,min(energy*.45,.7));
 alpha=opacity*depth*aData.z*gain;
 float size=(1.9+aData.z*1.0)*pow(max(radius,12.)/116.,.35);
 if(kind==0.){alpha*=.48*(1.+wave*4.+spark*6.);size*=1.+wave*.6+spark*1.5;}
 if(kind==1.){size*=.85*(1.+signal*1.3);alpha*=(.9+.6*pulse)*(1.+signal*2.2);}
 if(kind==2.){size=13.+working*5.+responding*10.+spike*26.;alpha*=1.5*(1.+spike*2.5);}
 if(kind==3.)alpha*=.025+working*.035+responding*.07+signal*.9;
 if(kind==4.){size*=.75*(1.+spark*.8);alpha*=(.3+working*.3+responding*.45)*(1.+spark*2.);}
 alpha*=1.+selected*.12;
 gl_PointSize=max(1.,size*dpr*(1.+working*.12+responding*.22));
}`;
export const particleFragment = `#version 300 es
precision highp float;
in vec3 color;in float alpha;flat in float kind;out vec4 frag;
void main(){
 if(kind==3.){frag=vec4(color,alpha);return;}
 vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);
 if(r>1.)discard;
 float glow=exp(-r*(kind==2.?5.5:4.5));
 frag=vec4(color,glow*alpha);
}`;
