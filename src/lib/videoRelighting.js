import { useSyncExternalStore } from "react";

export const DEFAULT_RELIGHT = Object.freeze({ x: -35/180, y: -25/90, strength: 0.65, range: 0.7, softness: 0.5, distance: 2, color: "#ffe5bf" });
export function normalizeRelight(input) {
  const value = input && typeof input === "object" ? input : {};
  const clamp = (key, min, max) => Number.isFinite(Number(value[key])) ? Math.max(min, Math.min(max, Number(value[key]))) : DEFAULT_RELIGHT[key];
  return { x: clamp("x", -1, 1), y: clamp("y", -1, 1), strength: clamp("strength", 0, 1), range: clamp("range", 0.1, 1), softness: clamp("softness", 0, 1), distance: clamp("distance", 1, 4), color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : DEFAULT_RELIGHT.color };
}
export function getRelightPosition(light) {
  const azimuth = light.x * Math.PI;
  const elevation = -light.y * Math.PI / 2;
  return [Math.sin(azimuth)*Math.cos(elevation)*light.distance, Math.sin(elevation)*light.distance, Math.cos(azimuth)*Math.cos(elevation)*light.distance];
}
// A transient preview-only store: compare never enters history or saved files.
let compareId = null;
const listeners = new Set();
export function setRelightCompare(id) { compareId = id; listeners.forEach((listener) => listener()); }
export function useRelightCompare(id) {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => id != null && compareId === id, () => false);
}
const renderers = new WeakMap();
const vertex = `attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment = `precision highp float;
varying vec2 uv;
uniform sampler2D sourceImage, depthImage, nextDepthImage;
uniform vec2 texel;
uniform vec3 lightPosition;
uniform float depthMix, strength, radius, softness;
uniform vec3 lightColor;
float depth(vec2 p){return mix(texture2D(depthImage,p).r,texture2D(nextDepthImage,p).r,depthMix);}
void main(){
 vec4 original=texture2D(sourceImage,uv);
 float z=depth(uv);
 vec2 stepSize=texel*(2.+softness*5.);
 float dx=(depth(uv+vec2(stepSize.x,0.))-depth(uv-vec2(stepSize.x,0.)))/(2.*stepSize.x);
 float dy=(depth(uv+vec2(0.,stepSize.y))-depth(uv-vec2(0.,stepSize.y)))/(2.*stepSize.y);
 vec3 normal=normalize(vec3(-dx*.12,-dy*.12,1.));
 vec3 surface=vec3((uv-.5)*2.,z*.5);
 vec3 toLight=lightPosition-surface;
 vec3 lightDirection=normalize(toLight);
 float diffuse=max(0.,dot(normal,lightDirection));
 // A single-view depth surface has no back-facing geometry. Estimate the
 // visible foreground silhouette for rear light instead of lighting the
 // whole front with an absolute Lambert term.
 float low=min(min(depth(uv+vec2(stepSize.x,0.)),depth(uv-vec2(stepSize.x,0.))),min(depth(uv+vec2(0.,stepSize.y)),depth(uv-vec2(0.,stepSize.y))));
 float silhouette=smoothstep(.008,.075,z-low);
 float grazing=pow(1.-normal.z,2.);
 float rear=smoothstep(0.,.65,-lightDirection.z);
 float directionWeight=mix(.35,1.,smoothstep(-.2,.7,dot(normal.xy,lightDirection.xy)));
 float rim=rear*max(silhouette,grazing*.45)*directionWeight;
 float envelope=exp(-dot(surface.xy-lightPosition.xy*.25,surface.xy-lightPosition.xy*.25)/(radius*radius*4.));
 envelope *= min(1.5,4./max(1.,dot(toLight,toLight)));
 float illumination=mix(diffuse,pow(diffuse,.5),softness)*envelope;
 // Add a restrained fill in linear light; retain existing source shading.
 vec3 linear=pow(max(original.rgb,vec3(0.)),vec3(2.2));
 linear += linear*lightColor*illumination*strength*.9;
 linear += (linear*.65+vec3(.08))*lightColor*rim*envelope*strength;
 vec3 result=pow(clamp(linear,0.,1.),vec3(1./2.2));
 gl_FragColor=vec4(result,original.a);
}`;
function createRenderer() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error("Relighting requires WebGL");
  const compile = (type, code) => { const shader = gl.createShader(type); gl.shaderSource(shader, code); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)); return shader; };
  const program = gl.createProgram();
  const shaders = [compile(gl.VERTEX_SHADER, vertex), compile(gl.FRAGMENT_SHADER, fragment)];
  shaders.forEach((shader) => gl.attachShader(program, shader)); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  shaders.forEach((shader) => gl.deleteShader(shader));
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const names = ["sourceImage","depthImage","nextDepthImage","texel","lightPosition","depthMix","strength","radius","softness","lightColor"];
  const uniforms = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program,name)]));
  const textures = [0,1,2].map(() => { const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); return texture; });
  return { canvas, gl, uniforms, textures };
}
export function renderRelighting(target, source, depth, nextDepth, mix, settings) {
  let renderer = renderers.get(target);
  if (!renderer) { renderer = createRenderer(); renderers.set(target, renderer); }
  const { canvas, gl, uniforms: u, textures } = renderer;
  if (gl.isContextLost()) throw new Error("Relighting graphics context lost");
  if (canvas.width !== source.width || canvas.height !== source.height) { canvas.width = source.width; canvas.height = source.height; }
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  [source,depth,nextDepth || depth].forEach((image,index) => { gl.activeTexture(gl.TEXTURE0+index); gl.bindTexture(gl.TEXTURE_2D,textures[index]); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image); });
  gl.uniform1i(u.sourceImage,0); gl.uniform1i(u.depthImage,1); gl.uniform1i(u.nextDepthImage,2);
  gl.uniform2f(u.texel,1/512,(canvas.width/canvas.height)/512);
  gl.uniform3f(u.lightPosition,...getRelightPosition(settings));
  gl.uniform1f(u.depthMix,mix || 0); gl.uniform1f(u.strength,settings.strength); gl.uniform1f(u.radius,settings.range); gl.uniform1f(u.softness,settings.softness);
  gl.uniform3f(u.lightColor,...[1,3,5].map((index) => parseInt(settings.color.slice(index,index+2),16)/255));
  gl.drawArrays(gl.TRIANGLES,0,6);
  return canvas;
}
