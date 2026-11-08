import {
  ALL_FORMATS, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input,
  Mp4OutputFormat, Output, WebMOutputFormat, canEncodeVideo,
} from "mediabunny";
import { createCardFaceProjector } from "../lib/cardFaceProjection.js";

const size = 768;

async function openSource({ blob, type }, times, cleanup, stage = false) {
  if (type === "image") {
    const bitmap = await createImageBitmap(blob);
    cleanup.push(() => bitmap.close());
    return () => bitmap;
  }

  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  cleanup.push(() => input.dispose());
  const track = await input.getPrimaryVideoTrack();
  if (!track || !await track.canDecode()) throw new Error("Could not decode card face video.");
  const [start, end] = await Promise.all([track.getFirstTimestamp(), track.computeDuration()]);
  const first = Math.max(0, start);
  const last = Math.max(first, end - 0.000001);
  const sink = new CanvasSink(track, {
    width: stage ? size : 360,
    height: stage ? size : 400,
    fit: "cover",
    poolSize: 2,
  });
  const frames = sink.canvasesAtTimestamps(times.map((time) => Math.min(first + time + 0.000002, last)));
  let previous;
  return async () => {
    const { value } = await frames.next();
    previous = value?.canvas ?? previous;
    if (!previous) throw new Error("Missing card face video frame.");
    return previous;
  };
}

self.addEventListener("message", async ({ data: { stage, media, faces, fps, frameCount } }) => {
  const cleanup = [];
  let output;
  try {
    const times = Array.from({ length: frameCount }, (_, i) => i / fps);
    const bitrate = 2_400_000;
    const options = { width: size, height: size, bitrate, latencyMode: "realtime" };
    let codec;
    for (const candidate of ["avc", "vp9", "vp8"]) {
      if (await canEncodeVideo(candidate, options)) {
        codec = candidate;
        break;
      }
    }
    if (!codec) throw new Error("No card intro video encoder.");
    const readers = await Promise.allSettled([
      openSource({ blob: stage, type: "video" }, times, cleanup, true),
      ...media.map((item) => openSource(item, times, cleanup)),
    ]);
    const failed = readers.find((reader) => reader.status === "rejected");
    if (failed) throw failed.reason;
    const readFrames = readers.map((reader) => reader.value);

    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d", { alpha: false });
    const projectFaces = createCardFaceProjector();
    const target = new BufferTarget();
    const format = codec === "avc" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat();
    output = new Output({ format, target });
    const video = new CanvasSource(canvas, { codec, bitrate, keyFrameInterval: 0.5, latencyMode: "realtime" });
    output.addVideoTrack(video, { frameRate: fps });
    await output.start();
    for (let i = 0; i < times.length; i += 1) {
      const [background, ...images] = await Promise.all(readFrames.map((read) => read()));
      context.drawImage(background, 0, 0);
      context.drawImage(projectFaces(times[i], faces.map((index) => images[index])), 0, 0);
      await video.add(times[i], 1 / fps);
      if (i % 6 === 0) self.postMessage({ progress: Math.round(99 * (i + 1) / times.length) });
    }
    video.close();
    await output.finalize();
    self.postMessage({ blob: new Blob([target.buffer], { type: codec === "avc" ? "video/mp4" : "video/webm" }) });
  } catch (error) {
    await output?.cancel().catch(() => {});
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    cleanup.forEach((close) => close());
  }
});
