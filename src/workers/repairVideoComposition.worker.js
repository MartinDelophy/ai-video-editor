import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";

// Decode, patch, and encode in a worker, without full-frame PNG readbacks.
// Every frame uses the same RGB path so patch boundaries cannot change color.
self.onmessage = async ({ data }) => {
  let input;
  let conversion;
  let bitmap;
  let finished = false;
  try {
    if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") throw new Error("WebCodecs unavailable");
    registerAacEncoder();
    const { frames, sourceBlob, sourceStart, sourceDuration } = data;
    input = new Input({ source: new BlobSource(sourceBlob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("Source video track unavailable");
    const stats = await track.computePacketStats(120);
    const width = await track.getDisplayWidth();
    const height = await track.getDisplayHeight();
    const bitrate = Math.max(2_000_000, Math.min(40_000_000,
      Math.round(width * height * (stats.averagePacketRate || 30) * 0.22)));
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
    const patches = new Map(frames.map((frame) => [Math.round(frame.time * 1e6), frame.blob]));
    let bitmapIndex = -1;
    conversion = await Conversion.init({
      input, output, tracks: "primary", showWarnings: false,
      trim: { start: sourceStart, end: sourceStart + sourceDuration },
      video: {
        codec: "avc", bitrate, hardwareAcceleration: "prefer-hardware",
        allowRotationMetadata: false,
        // Conversion presents source samples with timestamps relative to trim.start.
        // Keep native timestamps and frame rate, including variable-rate sources.
        process: async (sample) => {
          const index = Math.round(sample.timestamp * 1e6);
          const patch = patches.get(index);
          sample.draw(context, 0, 0, width, height);
          if (!patch) return canvas;
          if (bitmapIndex !== index) {
            bitmap?.close();
            bitmap = await createImageBitmap(patch);
            bitmapIndex = index;
          }
          context.drawImage(bitmap, 0, 0, width, height);
          return canvas;
        },
      },
      // AAC can be remuxed when possible; Conversion handles trimming or other
      // source codecs by transcoding instead. Never silently discard source audio.
      audio: { codec: "aac" },
    });
    if (!conversion.isValid || conversion.discardedTracks.length) throw new Error("Native composition cannot preserve the source tracks");
    conversion.onProgress = (progress) => self.postMessage({ type: "progress", progress: Math.min(98, 92 + progress * 6) });
    await conversion.execute();
    if (!target.buffer) throw new Error("Native composition returned no video");
    finished = true;
    self.postMessage({ type: "done", blob: new Blob([target.buffer], { type: "video/mp4" }) });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  } finally {
    if (!finished) await conversion?.cancel().catch(() => {});
    bitmap?.close();
    input?.dispose();
  }
};
