import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Output,
  UrlSource,
  WebMOutputFormat,
  AudioBufferSource,
} from "mediabunny";
import { getVisualSourceTime } from "./visualEffects.js";
import { prepareEmbeddedVideoAudio } from "./embeddedVideoAudioExport.js";
import { mixOfflineAudio } from "./audioExport.js";

const checkAbort = (signal) => {
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
};
export const DEFAULT_LINE_ART = Object.freeze({ detail: 55, thickness: 1, inverted: false });

// One renderer for preview and baked assets. Blur suppresses texture noise before
// Sobel extraction; all distances are measured on the same 1080px reference grid.
export function createLineArtRenderer(canvas, width, height) {
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    preserveDrawingBuffer: true,
    antialias: false,
  });
  if (!gl) throw new Error("Line art WebGL unavailable");
  const resources = { textures: [], shaders: [], programs: [], framebuffers: [] };
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    resources.shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error("Line art shader failed");
    return shader;
  };
  const vertex = compile(
    gl.VERTEX_SHADER,
    `#version 300 es
    in vec2 position; out vec2 uv;
    void main(){uv=position*.5+.5;gl_Position=vec4(position,0,1);}`,
  );
  const fragment = `#version 300 es
    precision highp float; uniform sampler2D source; uniform vec2 pixel;
    uniform float detail; uniform float thickness; uniform bool inverted;
    in vec2 uv; out vec4 color;
    float gray(vec2 p){return dot(texture(source,p).rgb,vec3(.2126,.7152,.0722));}
  `;
  const makeProgram = (code) => {
    const program = gl.createProgram();
    resources.programs.push(program);
    gl.attachShader(program, vertex);
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment + code));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Line art shader failed");
    return program;
  };
  let buffer;
  try {
    const blur = makeProgram(`void main(){vec2 d=pixel;float g=gray(uv)*4.;
      g+=2.*(gray(uv+vec2(d.x,0))+gray(uv-vec2(d.x,0))+gray(uv+vec2(0,d.y))+gray(uv-vec2(0,d.y)));
      g+=gray(uv+d)+gray(uv-d)+gray(uv+vec2(d.x,-d.y))+gray(uv+vec2(-d.x,d.y));color=vec4(vec3(g/16.),1);}`);
    const edges = makeProgram(`void main(){vec2 d=pixel*thickness;
      float a=gray(uv+vec2(-d.x,-d.y)),b=gray(uv+vec2(0,-d.y)),c=gray(uv+vec2(d.x,-d.y));
      float e=gray(uv+vec2(-d.x,0)),f=gray(uv+vec2(d.x,0));
      float g=gray(uv+vec2(-d.x,d.y)),h=gray(uv+vec2(0,d.y)),i=gray(uv+d);
      float gradient=length(vec2(c+2.*f+i-a-2.*e-g,g+2.*h+i-a-2.*b-c));
      float threshold=mix(.42,.035,detail/100.);
      float ink=smoothstep(threshold*.5,threshold,gradient);
      float value=inverted?ink:1.-ink;color=vec4(vec3(value),1);}`);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const texture = () => {
      const tex = gl.createTexture();
      resources.textures.push(tex);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    const source = texture(),
      blurred = texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const framebuffer = gl.createFramebuffer();
    resources.framebuffers.push(framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blurred, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error("Line art framebuffer failed");
    const draw = (program, tex, target, options) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, width, height);
      gl.useProgram(program);
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(program, "source"), 0);
      gl.uniform2f(gl.getUniformLocation(program, "pixel"), 1 / width, 1 / height);
      gl.uniform1f(gl.getUniformLocation(program, "detail"), options.detail);
      gl.uniform1f(
        gl.getUniformLocation(program, "thickness"),
        (options.thickness * Math.max(width, height)) / 1080,
      );
      gl.uniform1i(gl.getUniformLocation(program, "inverted"), options.inverted ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    return {
      draw(media, options = DEFAULT_LINE_ART) {
        if (gl.isContextLost()) throw new Error("Line art WebGL unavailable");
        gl.bindTexture(gl.TEXTURE_2D, source);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media);
        draw(blur, source, framebuffer, options);
        draw(edges, blurred, null, options);
      },
      dispose() {
        resources.textures.forEach((t) => gl.deleteTexture(t));
        resources.framebuffers.forEach((f) => gl.deleteFramebuffer(f));
        resources.programs.forEach((p) => gl.deleteProgram(p));
        resources.shaders.forEach((s) => gl.deleteShader(s));
        gl.deleteBuffer(buffer);
      },
    };
  } catch (error) {
    resources.textures.forEach((t) => gl.deleteTexture(t));
    resources.framebuffers.forEach((f) => gl.deleteFramebuffer(f));
    resources.programs.forEach((p) => gl.deleteProgram(p));
    resources.shaders.forEach((s) => gl.deleteShader(s));
    if (buffer) gl.deleteBuffer(buffer);
    throw error;
  }
}

export async function openLineArtSource(segment, signal, maxEdge = 1080) {
  checkAbort(signal);
  const size = (w, h) => {
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    return {
      width: Math.max(2, Math.round((w * scale) / 2) * 2),
      height: Math.max(2, Math.round((h * scale) / 2) * 2),
    };
  };
  if (segment.type === "image") {
    const blob =
      segment.blob instanceof Blob
        ? segment.blob
        : await (await fetch(segment.src, { signal })).blob();
    const bitmap = await createImageBitmap(blob);
    if (signal?.aborted) {
      bitmap.close();
      checkAbort(signal);
    }
    const dimensions = size(bitmap.width, bitmap.height);
    // ImageBitmap ignores UNPACK_FLIP_Y_WEBGL. Normalize it to a canvas so
    // still-image and video uploads follow the same upright texture path.
    const raster = document.createElement("canvas");
    raster.width = dimensions.width;
    raster.height = dimensions.height;
    try {
      raster.getContext("2d").drawImage(bitmap, 0, 0, raster.width, raster.height);
    } finally {
      bitmap.close();
    }
    return {
      ...dimensions,
      at: async () => {
        checkAbort(signal);
        return raster;
      },
      dispose: () => {
        raster.width = 0;
        raster.height = 0;
      },
    };
  }
  const input = new Input({
    source:
      segment.blob instanceof Blob ? new BlobSource(segment.blob) : new UrlSource(segment.src),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    checkAbort(signal);
    if (!track || !(await track.canDecode())) throw new Error("Line art decode unavailable");
    const dimensions = size(await track.getDisplayWidth(), await track.getDisplayHeight());
    const duration = await track.computeDuration();
    const sink = new CanvasSink(track, { ...dimensions, fit: "fill", poolSize: 2 });
    return {
      ...dimensions,
      async at(localTime) {
        checkAbort(signal);
        const time = Math.min(
          Math.max(0, duration - 1e-6),
          getVisualSourceTime(segment, localTime),
        );
        const frame = await sink.getCanvas(time);
        checkAbort(signal);
        if (!frame) throw new Error("Line art decode unavailable");
        return frame.canvas;
      },
      async *frames(localTimes) {
        const times = localTimes.map((time) =>
          Math.min(Math.max(0, duration - 1e-6), getVisualSourceTime(segment, time)),
        );
        const iterator = sink.canvasesAtTimestamps(times)[Symbol.asyncIterator]();
        try {
          for (let index = 0; index < times.length; index++) {
            checkAbort(signal);
            const next = await iterator.next();
            checkAbort(signal);
            if (!next.value) throw new Error("Line art decode unavailable");
            yield next.value.canvas;
          }
        } finally {
          await iterator.return?.();
        }
      },
      dispose: () => input.dispose(),
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}

export async function renderLineArtAsset({ segment, options, signal, onProgress }) {
  const source = await openLineArtSource(segment, signal);
  const canvas = document.createElement("canvas");
  let renderer, output;
  const abort = () => {
    source.dispose();
    void output?.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    renderer = createLineArtRenderer(canvas, source.width, source.height);
    if (segment.type === "image") {
      renderer.draw(await source.at(0), options);
      checkAbort(signal);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      checkAbort(signal);
      if (!blob) throw new Error("Line art encoding failed");
      return { blob, type: "image", width: source.width, height: source.height };
    }
    const duration = Math.max(0.05, Number(segment.duration) || 3),
      fps = 24,
      count = Math.ceil(duration * fps);
    const target = new BufferTarget();
    output = new Output({ format: new WebMOutputFormat(), target });
    const video = new CanvasSource(canvas, {
      codec: "vp9",
      bitrate: 4_000_000,
      keyFrameInterval: 2,
    });
    output.addVideoTrack(video, { frameRate: fps });
    onProgress?.(0);
    const embedded = await prepareEmbeddedVideoAudio(
      [
        {
          ...segment,
          sourceAudioDisabled: false,
          volume: 1,
          spatialEffect: "original",
          spatialAmount: 1,
        },
      ],
      undefined,
      signal,
    );
    const audio = embedded.blob
      ? await mixOfflineAudio({
          duration,
          sourceAudioBlob: embedded.blob,
          sourceAudioSegments: embedded.segments,
          signal,
        })
      : null;
    checkAbort(signal);
    let audioSource;
    if (audio) {
      audioSource = new AudioBufferSource({ codec: "opus", bitrate: 192_000 });
      output.addAudioTrack(audioSource);
    }
    await output.start();
    if (audioSource) await audioSource.add(audio);
    let index = 0;
    for await (const frame of source.frames(Array.from({ length: count }, (_, i) => i / fps))) {
      checkAbort(signal);
      renderer.draw(frame, options);
      await video.add(index / fps, Math.min(1 / fps, duration - index / fps));
      onProgress?.(Math.round((++index / count) * 99));
    }
    checkAbort(signal);
    await output.finalize();
    checkAbort(signal);
    return {
      blob: new Blob([target.buffer], { type: "video/webm" }),
      type: "video",
      width: source.width,
      height: source.height,
      duration,
      fps,
      hasAudio: Boolean(audio),
    };
  } catch (error) {
    await output?.cancel().catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    renderer?.dispose();
    source.dispose();
  }
}
