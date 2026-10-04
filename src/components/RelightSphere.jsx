import { useEffect, useRef } from "react";
import { getRelightPosition } from "../lib/videoRelighting.js";

const vertex = `attribute vec2 position; varying vec2 uv; void main(){uv=position;gl_Position=vec4(position,0.,1.);}`;
const fragment = `precision highp float; varying vec2 uv; uniform vec3 light, tint; uniform float aspect;
float sphereHit(vec3 ro,vec3 rd,vec3 center,float radius){vec3 oc=ro-center;float b=dot(oc,rd);float h=b*b-dot(oc,oc)+radius*radius;if(h<0.)return -1.;float t=-b-sqrt(h);return t>0.?t:-1.;}
float gridLine(float value,float width){return 1.-smoothstep(width,width*1.8,abs(fract(value+.5)-.5));}
void main(){
 vec3 eye=vec3(0.,.7,4.8);
 vec3 forward=normalize(vec3(0.,0.,0.)-eye);
 vec3 right=normalize(cross(forward,vec3(0.,1.,0.)));
 vec3 up=cross(right,forward);
 vec3 ray=normalize(forward*3.05+right*uv.x*aspect+up*uv.y);
 vec3 color=vec3(.065,.088,.105);
 // Both grids are actual perspective planes in the widget's 3D space.
 float floorT=(-.85-eye.y)/ray.y;
 float wallT=(-2.8-eye.z)/ray.z;
 if(wallT>0.){
  vec3 p=eye+ray*wallT;
  float grid=max(gridLine(p.x*1.8,.009),gridLine(p.y*1.8,.009));
  color+=vec3(.055,.075,.09)*grid;
 }
 if(floorT>0.&&floorT<wallT){
  vec3 p=eye+ray*floorT;
  float fade=exp(-max(0.,length(p.xz)-1.)*.1);
  float grid=max(gridLine(p.x*2.,.012),gridLine(p.z*2.,.012));
  color=vec3(.072,.099,.12)+grid*vec3(.06,.08,.095)*fade;
  float contact=exp(-dot(p.xz,p.xz)*3.);
  color*=1.-contact*.48;
 }
 float hit=sphereHit(eye,ray,vec3(0.),.75);
 if(hit>0.){
  vec3 surface=eye+ray*hit;
  vec3 normal=normalize(surface);
  vec3 direction=normalize(light-surface);
  float diffuse=max(0.,dot(normal,direction));
  float fill=max(0.,dot(normal,normalize(vec3(-.5,1.,1.))));
  float spec=pow(max(0.,dot(normal,normalize(direction-ray))),42.);
  // A neutral studio fill keeps the sphere readable while the user's light
  // changes its direction, color and falloff in real time.
  float attenuation=min(1.4,4./max(1.,dot(light-surface,light-surface)));
  float rim=pow(1.-max(0.,dot(normal,-ray)),4.)*smoothstep(0.,.65,-direction.z);
  color=vec3(.21,.225,.24)+vec3(.24)*fill+vec3(.3)*diffuse*tint*attenuation+spec*.035+rim*tint*.35*attenuation;
 }
 // Reference-style construction guides: intersect the actual orbital planes.
 float frontT=-eye.z/ray.z;
 vec3 front=eye+ray*frontT;
 float ring=abs(length(front.xy)-1.03);
 float dash=step(.38,fract(atan(front.y,front.x)*14.));
 float guides=(1.-smoothstep(.006,.014,ring))*dash;
 float axisDash=step(.4,fract(front.y*11.));
 guides=max(guides,(1.-smoothstep(.004,.009,abs(front.x)))*axisDash*step(abs(front.y),1.65));
 guides=max(guides,(1.-smoothstep(.004,.009,abs(front.y)))*step(.4,fract(front.x*11.))*step(abs(front.x),1.45));
 float equatorT=-eye.y/ray.y;
 if(equatorT>0.){vec3 p=eye+ray*equatorT;float ring=abs(length(p.xz)-1.03);guides=max(guides,(1.-smoothstep(.006,.014,ring))*step(.4,fract(atan(p.z,p.x)*15.)));}
 vec2 orbitScreen=vec2(uv.x*aspect,uv.y);
 float orbit=abs(length(vec2(orbitScreen.x/.77,(orbitScreen.y-.015)/.038))-1.);
 guides=max(guides,(1.-smoothstep(.035,.075,orbit))*step(.4,fract(atan((orbitScreen.y-.015)/.038,orbitScreen.x/.77)*15.)));
 float floorRing=0.;
 if(floorT>0.){vec3 p=eye+ray*floorT;floorRing=(1.-smoothstep(.006,.013,abs(length(p.xz)-1.03)))*.5;}
 color=mix(color,vec3(.57,.64,.69),clamp(guides*.62+floorRing,0.,.75));
 // Project the 3D lamp and its dashed direction line using the same camera.
 vec3 lamp=normalize(light)*1.18;
 vec3 view=lamp-eye;
 vec2 projected=vec2(dot(view,right)/aspect,dot(view,up))*3.05/dot(view,forward);
 float d=length(vec2((uv.x-projected.x)*aspect,uv.y-projected.y));
 color+=tint*.12*exp(-d*24.);
 if(d<.027&&lamp.z>=0.)color=tint;
 if(lamp.z<0.&&d>.021&&d<.028)color=mix(color,tint,.75);
 if(d>.04&&d<.047)color=tint;
 vec2 screen=vec2(uv.x*aspect,uv.y);
 vec2 endpoint=vec2(projected.x*aspect,projected.y);
 float along=clamp(dot(screen,endpoint)/max(.001,dot(endpoint,endpoint)),0.,1.);
 float lineDistance=length(screen-endpoint*along);
 if(along>.04&&along<.92&&lineDistance<.0025&&fract(along*18.)>.4)color=mix(color,tint,.5);
 float center=length(screen);
 if(center<.012)color=vec3(.66,.72,.77);
 gl_FragColor=vec4(color,1.);
}`;
export function RelightSphere({ light, label, hint, disabled, onChange }) {
  const ref = useRef(null);
  const renderer = useRef(null);
  useEffect(() => {
    const canvas=ref.current;
    const gl=canvas.getContext("webgl",{alpha:false,antialias:true});
    if(!gl) return;
    const compile=(type,code)=>{const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);return shader;};
    const program=gl.createProgram(); const shaders=[compile(gl.VERTEX_SHADER,vertex),compile(gl.FRAGMENT_SHADER,fragment)];
    shaders.forEach((shader)=>gl.attachShader(program,shader));gl.linkProgram(program);gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,"position");gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    renderer.current={gl,program};
    return()=>{renderer.current=null;gl.deleteBuffer(buffer);shaders.forEach((shader)=>gl.deleteShader(shader));gl.deleteProgram(program);};
  },[]);
  useEffect(()=>{
    const current=renderer.current; if(!current)return;
    const {gl,program}=current; const canvas=ref.current;
    gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);
    gl.uniform3f(gl.getUniformLocation(program,"light"),...getRelightPosition(light));
    gl.uniform3f(gl.getUniformLocation(program,"tint"),...[1,3,5].map((index)=>parseInt(light.color.slice(index,index+2),16)/255));
    gl.uniform1f(gl.getUniformLocation(program,"aspect"),canvas.width/canvas.height);gl.drawArrays(gl.TRIANGLES,0,6);
  },[light]);
  const move=(event)=>{
    if(disabled)return;
    const rect=event.currentTarget.getBoundingClientRect();
    onChange({x:Math.max(-1,Math.min(1,(event.clientX-rect.left)/rect.width*2-1)),y:Math.max(-1,Math.min(1,(event.clientY-rect.top)/rect.height*2-1))});
  };
  return <canvas ref={ref} width={1280} height={768} className="relight-position" role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label={`${label} · ${hint}`} aria-valuemin={-180} aria-valuemax={180} aria-valuenow={Math.round(light.x*180)} aria-valuetext={`${Math.round(light.x*180)}°, ${Math.round(-light.y*90)}°`} onPointerDown={(event)=>{if(!disabled){event.currentTarget.setPointerCapture(event.pointerId);move(event);}}} onPointerMove={(event)=>{if(event.currentTarget.hasPointerCapture(event.pointerId))move(event);}} onKeyDown={(event)=>{const deltas={ArrowLeft:[-.025,0],ArrowRight:[.025,0],ArrowUp:[0,-.025],ArrowDown:[0,.025]};const delta=deltas[event.key];if(delta&&!disabled){event.preventDefault();onChange({x:Math.max(-1,Math.min(1,light.x+delta[0])),y:Math.max(-1,Math.min(1,light.y+delta[1]))});}}} />;
}
