import { AudioBufferSource, BufferTarget, CanvasSource, Output, WebMOutputFormat } from "mediabunny";
import { drawCinematicDepthFrame, loadPreviewDepthFrame, resolveDepthAnalysisAtTime } from "./depthOfField.js";
import { prepareEmbeddedVideoAudio } from "./embeddedVideoAudioExport.js";
import { mixOfflineAudio } from "./audioExport.js";
import { createRifeDepthInterpolator } from "./rifeDepthInterpolation.js";
import { getVisualSourceTime } from "./visualEffects.js";

// Bake the depth surface and source-time-matched sound into an independent asset.
export async function renderDepthMapAsset({ segment, analysis, effect, signal, onProgress, sampleStream, interpolationProvider = "webgpu" }) {
  const check = () => { if (signal?.aborted) throw new DOMException("Canceled", "AbortError"); };
  check();
  const canvas = document.createElement("canvas");
  const size = analysis.sourceSize;
  const scale = Math.min(1, 1080 / Math.max(size.width, size.height));
  canvas.width = Math.max(2, Math.round(size.width * scale / 2) * 2);
  canvas.height = Math.max(2, Math.round(size.height * scale / 2) * 2);
  const context = canvas.getContext("2d", { alpha: false });
  const duration = Math.max(0.05, Number(segment.duration) || 3);
  const fps = 24;
  const count = Math.ceil(duration * fps);
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const video = new CanvasSource(canvas, { codec: "vp9", bitrate: 4_000_000, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });
  let audioSource = null;
  let audioBuffer = null;
  if (segment.type === "video") {
    const source = segment;
    const embedded = await prepareEmbeddedVideoAudio([{ ...source, sourceAudioDisabled: false,
      volume: 1, spatialEffect: "original", spatialAmount: 1 }], undefined, signal);
    const audio = embedded.blob ? await mixOfflineAudio({ duration, sourceAudioBlob: embedded.blob,
      sourceAudioSegments: embedded.segments, signal }) : null;
    check();
    if (audio) {
      audioSource = new AudioBufferSource({ codec: "opus", bitrate: 192_000 });
      output.addAudioTrack(audioSource);
    }
    audioBuffer = audio;
  }
  let interpolator = null;
  const useRife = segment.type === "video" && ["fast", "balanced"].includes(effect.quality || "balanced") && (sampleStream || analysis.samples?.length > 1);
  const abort = () => { void output.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (useRife) {
      onProgress?.(0, "depthMapInterpolating");
      interpolator = await createRifeDepthInterpolator(signal, { executionProvider: interpolationProvider });
      check();
    }
    await output.start();
    if (audioSource) await audioSource.add(audioBuffer);
    for (let index = 0; index < count; index += 1) {
      check();
      const time = index / fps;
      const sourceTime = segment.type === "video" ? getVisualSourceTime(segment, time) : 0;
      const sample = sampleStream ? await sampleStream.atTime(sourceTime) : resolveDepthAnalysisAtTime(analysis, sourceTime);
      const frame = await loadPreviewDepthFrame(sample);
      check();
      const depthVisual = interpolator ? await interpolator.interpolate(frame) : frame.depthVisual;
      check();
      drawCinematicDepthFrame(context, depthVisual, canvas, {
        ...frame, depthVisual, ...(interpolator ? { nextDepthVisual: null, depthMix: 0 } : {}), effect: { ...effect, enabled: true, output: "depth-map" }, fitMode: "contain",
      });
      await video.add(time, Math.min(1 / fps, duration - time));
      if (index % 5 === 0) onProgress?.(Math.round((index + 1) / count * 100), useRife ? "depthMapInterpolating" : "depthMapEncoding");
    }
    check();
    await output.finalize();
    check();
    return { blob: new Blob([target.buffer], { type: "video/webm" }), width: canvas.width, height: canvas.height, duration, fps, hasAudio: Boolean(audioSource) };
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    interpolator?.dispose();
    signal?.removeEventListener("abort", abort);
  }
}
