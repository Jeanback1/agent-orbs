import {background,particleFragment,particleVertex,vertex} from './shaders';
import {neuralGeometry} from './particles.mjs';
export interface RenderOrb {x:number;y:number;radius:number;seed:number;phase:number;working:number;responding:number;opacity:number;selected:boolean;provider:string}
export interface RenderMetrics {fps:number;particles:number;quality:number}
type Uniforms=Record<string,WebGLUniformLocation|null>;
export class OrbRenderer {
  gl:WebGL2RenderingContext;bg:WebGLProgram;particles:WebGLProgram;
  bgVao:WebGLVertexArrayObject;pointVao:WebGLVertexArrayObject;lineVao:WebGLVertexArrayObject;
  buffers:WebGLBuffer[]=[];uniforms:Uniforms;bgResolution:WebGLUniformLocation|null;lineCount:number;
  constructor(public canvas:HTMLCanvasElement){
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'high-performance'});
    if(!gl)throw new Error('WebGL2 no disponible');this.gl=gl;
    this.bg=this.program(vertex,background);this.particles=this.program(particleVertex,particleFragment);
    this.bgVao=gl.createVertexArray()!;
    const geometry=neuralGeometry();
    this.pointVao=this.upload(geometry.points);this.lineVao=this.upload(geometry.lines);this.lineCount=geometry.lines.length/10;
    this.uniforms=Object.fromEntries(['resolution','center','radius','dpr','phase','seed','working','responding','opacity','provider','selected'].map(n=>[n,gl.getUniformLocation(this.particles,n)]));
    this.bgResolution=gl.getUniformLocation(this.bg,'resolution');
  }
  program(vert:string,frag:string){
    const gl=this.gl,p=gl.createProgram()!;
    for(const [type,source] of [[gl.VERTEX_SHADER,vert],[gl.FRAGMENT_SHADER,frag]] as const){
      const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader');
      gl.attachShader(p,s);gl.deleteShader(s);
    }
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'WebGL');return p;
  }
  upload(data:Float32Array){
    const gl=this.gl,vao=gl.createVertexArray()!,buffer=gl.createBuffer()!;this.buffers.push(buffer);
    gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    for(const [location,size,offset] of [[0,3,0],[1,3,12],[2,4,24]]){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,40,offset);}
    return vao;
  }
  draw(width:number,height:number,_time:number,orbs:RenderOrb[],quality:number){
    const gl=this.gl,dpr=Math.min(devicePixelRatio||1,quality),w=Math.round(width*dpr),h=Math.round(height*dpr);
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    gl.viewport(0,0,w,h);gl.disable(gl.BLEND);gl.bindVertexArray(this.bgVao);gl.useProgram(this.bg);
    gl.uniform2f(this.bgResolution,w,h);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.useProgram(this.particles);
    const u=this.uniforms;gl.uniform2f(u.resolution,width,height);gl.uniform1f(u.dpr,dpr);let total=0;
    for(const o of orbs){
      if(o.radius<1||o.opacity<.005||o.x+o.radius*1.4<0||o.x-o.radius*1.4>width||o.y+o.radius*1.4<0||o.y-o.radius*1.4>height)continue;
      gl.uniform2f(u.center,o.x,o.y);gl.uniform1f(u.radius,o.radius);gl.uniform1f(u.phase,o.phase);gl.uniform1f(u.seed,o.seed);
      gl.uniform1f(u.working,o.working);gl.uniform1f(u.responding,o.responding);gl.uniform1f(u.opacity,o.opacity);
      gl.uniform1f(u.selected,o.selected?1:0);gl.uniform1f(u.provider,o.provider==='codex'?1:0);
      gl.bindVertexArray(this.lineVao);gl.drawArrays(gl.LINES,0,this.lineCount);
      const count=Math.round((o.radius>95?12000:o.radius>65?8500:o.radius>35?5000:2500)*(quality<1? .65:1));
      gl.bindVertexArray(this.pointVao);gl.drawArrays(gl.POINTS,0,count);total+=count;
    }
    return total;
  }
  dispose(){const gl=this.gl;gl.deleteProgram(this.bg);gl.deleteProgram(this.particles);for(const b of this.buffers)gl.deleteBuffer(b);for(const v of [this.bgVao,this.pointVao,this.lineVao])gl.deleteVertexArray(v);}
}
