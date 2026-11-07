import { createFaceAttachmentFrameReader } from "./faceAttachmentFrames.js";
import { createFaceAttachmentFlow } from "./faceAttachmentFlow.js";
import { getVisualSourceTime } from "./visualEffects.js";
import { getVisualSegmentTimeline } from "./timeline.js";
import { seekVideoFrame, getVisualDimensions } from "./media.js";
import { faceSourceKey, resolveFaceAttachmentPose } from "./faceAttachments.js";
export { FACE_EFFECT_IDS, isFaceEffect } from "./faceEffectKinds.js";
const ANALYSIS_VERSION = 9;
export function faceAnalysisKey(clip, segments) {
  const ranges = getVisualSegmentTimeline(segments);
  return JSON.stringify([
    ANALYSIS_VERSION,
    clip.start,
    clip.duration,
    segments.map((segment, i) => [faceSourceKey(segment), ranges[i]?.start, segment.duration]),
  ]);
}
const abort = () => new DOMException("Aborted", "AbortError");
let worker,
  sequence = 0;
const requests = new Map();
function runtime() {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/face-attachments.worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    const request = requests.get(data.id);
    if (!request) return;
    requests.delete(data.id);
    request.cleanup();
    if (data.error)
      request.reject(new Error("FACE_ATTACHMENT_ANALYSIS_FAILED", { cause: data.error }));
    else request.resolve(data.faces);
  };
  worker.onerror = (event) => {
    console.error("Face attachment worker failed", event.message);
    for (const request of requests.values()) {
      request.cleanup();
      request.reject(new Error("FACE_ATTACHMENT_ANALYSIS_FAILED"));
    }
    requests.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}
async function inferRegion(source, signal, region, stats) {
  if (signal.aborted) throw abort();
  const size = getVisualDimensions(source);
  const crop = region || { x: 0, y: 0, width: size.width, height: size.height };
  const scale = Math.min(1, 640 / Math.max(crop.width, crop.height));
  const image = await createImageBitmap(
    source,
    Math.round(crop.x),
    Math.round(crop.y),
    Math.max(1, Math.round(crop.width)),
    Math.max(1, Math.round(crop.height)),
    {
      resizeWidth: Math.max(1, Math.round(crop.width * scale)),
      resizeHeight: Math.max(1, Math.round(crop.height * scale)),
    },
  );
  if (stats) stats.modelPasses++;
  if (signal.aborted) {
    image.close();
    throw abort();
  }
  const faces = await new Promise((resolve, reject) => {
    const id = ++sequence;
    const cancel = () => {
      requests.delete(id);
      cleanup();
      reject(abort());
    };
    const timer = setTimeout(() => {
      requests.delete(id);
      cleanup();
      reject(new Error("FACE_ATTACHMENT_ANALYSIS_FAILED"));
    }, 90000);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    };
    requests.set(id, { resolve, reject, cleanup });
    signal.addEventListener("abort", cancel, { once: true });
    runtime().postMessage({ id, image }, [image]);
  });
  const point = (p) => ({
    x: (crop.x + p.x * crop.width) / size.width,
    z: ((p.z || 0) * crop.width) / size.width,
    y: (crop.y + p.y * crop.height) / size.height,
  });
  return faces.map((face) => ({
    ...face,
    five: face.five.map(point),
    support: face.support?.map(point),
    forehead: face.forehead ? point(face.forehead) : undefined,
  }));
}
async function detect(source, signal, previous = null, stats = null) {
  const size = getVisualDimensions(source);
  const probe = document.createElement("canvas");
  probe.width = 32;
  probe.height = 32;
  const context = probe.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, 32, 32);
  const rgba = context.getImageData(0, 0, 32, 32).data;
  let sum = 0,
    squared = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const value = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 765;
    sum += value;
    squared += value * value;
  }
  if (squared / 1024 - (sum / 1024) ** 2 < 0.00008) return [];
  if (previous) {
    const [left, right] = previous.five;
    const distance = Math.hypot((right.x - left.x) * size.width, (right.y - left.y) * size.height);
    const side = Math.min(Math.min(size.width, size.height), Math.max(64, distance * 4.6));
    const cx = ((left.x + right.x) * size.width) / 2,
      cy = ((left.y + right.y) * size.height) / 2 + distance * 0.4;
    const region = {
      x: Math.max(0, Math.min(size.width - side, cx - side / 2)),
      y: Math.max(0, Math.min(size.height - side, cy - side * 0.48)),
      width: side,
      height: side,
    };
    const locked = await inferRegion(source, signal, region, stats);
    if (locked.length) return locked;
  }
  const full = await inferRegion(source, signal, null, stats);
  if (full.length) return full;
  // Short-range face detection can miss a clearly visible but small face in
  // a wide shot. Search overlapping windows, then map every landmark back to
  // the original source coordinates before accepting it or starting flow.
  const regions = [
    { x: size.width * 0.2, y: 0, width: size.width * 0.6, height: size.height * 0.75 },
  ];
  for (const y of [0, size.height * 0.33])
    for (const x of [0, size.width * 0.33])
      regions.push({ x, y, width: size.width * 0.67, height: size.height * 0.67 });
  for (const region of regions) {
    const faces = await inferRegion(source, signal, region, stats);
    if (faces.length) return faces;
  }
  return [];
}
function pickFace(faces, previous, width, height) {
  const valid = faces.filter((face) => resolveFaceAttachmentPose(face, width, height));
  const center = (face) => ({
    x: (face.five[0].x + face.five[1].x) / 2,
    y: (face.five[0].y + face.five[1].y) / 2,
  });
  const span = (face) =>
    Math.hypot(face.five[0].x - face.five[1].x, face.five[0].y - face.five[1].y);
  if (!previous) return valid.sort((a, b) => span(b) - span(a))[0] || null;
  const origin = center(previous);
  return (
    valid
      .map((face) => ({
        face,
        d: Math.hypot(center(face).x - origin.x, center(face).y - origin.y),
        ratio: span(face) / span(previous),
      }))
      .filter((item) => item.d < 0.18 && item.ratio > 0.55 && item.ratio < 1.8)
      .sort((a, b) => a.d - b.d)[0]?.face || null
  );
}
function loadFaceMedia(segment, signal) {
  return new Promise((resolve, reject) => {
    const video = segment.type === "video";
    const media = video ? document.createElement("video") : new Image();
    const event = video ? "loadeddata" : "load";
    const cleanup = () => {
      clearTimeout(timer);
      media.removeEventListener(event, ready);
      media.removeEventListener("error", error);
      signal.removeEventListener("abort", cancel);
    };
    const dispose = () => {
      if (video) {
        media.pause();
        media.removeAttribute("src");
        media.load();
      } else media.src = "";
    };
    const ready = () => {
      cleanup();
      resolve(media);
    };
    const error = () => {
      cleanup();
      dispose();
      reject(new Error("FACE_ATTACHMENT_MEDIA_UNAVAILABLE"));
    };
    const cancel = () => {
      cleanup();
      dispose();
      reject(abort());
    };
    const timer = setTimeout(error, 30000);
    if (signal.aborted) {
      cancel();
      return;
    }
    media.crossOrigin = "anonymous";
    if (video) {
      media.muted = true;
      media.playsInline = true;
      media.preload = "auto";
    }
    media.addEventListener(event, ready, { once: true });
    media.addEventListener("error", error, { once: true });
    signal.addEventListener("abort", cancel, { once: true });
    media.src = segment.src;
  });
}

async function analyzeFaceRange(
  clip,
  segments,
  { signal, onProgress = () => {}, onPreview = () => {}, priorityTime = clip.start },
) {
  const ranges = getVisualSegmentTimeline(segments),
    end = clip.start + clip.duration;
  const relevant = segments
    .map((segment, index) => ({ segment, range: ranges[index] }))
    .filter(({ range }) => range.end > clip.start && range.start < end);
  const tracks = [];
  let done = 0;
  const stats = { detections: 0, modelPasses: 0, flowFrames: 0, sceneCuts: 0 };
  const startedAt = performance.now();
  let previewPublished = false;
  let nextPreview = startedAt + 180;
  const key = faceAnalysisKey(clip, segments);
  const total = relevant.reduce(
    (sum, { segment, range }) =>
      sum +
      (segment.type === "video"
        ? Math.ceil((Math.min(end, range.end) - Math.max(clip.start, range.start)) * 24) + 1
        : 1),
    0,
  );
  for (const { segment, range } of relevant) {
    if (signal.aborted) throw abort();
    const media = await loadFaceMedia(segment, signal);
    const dimensions = getVisualDimensions(media),
      frames = [];
    let previous = null;
    const flow =
      segment.type === "video"
        ? createFaceAttachmentFlow(dimensions.width, dimensions.height)
        : null;
    let reader;
    let flowReady = false,
      lastDetection = -Infinity;
    const makeTrack = (samples) => ({
      segmentId: segment.id,
      sourceKey: faceSourceKey(segment),
      still: segment.type !== "video",
      ...dimensions,
      frames: samples,
    });
    const publish = (currentTracks) => {
      const partial = [...currentTracks, ...tracks];
      onPreview({
        version: ANALYSIS_VERSION,
        complete: false,
        key,
        stats: { ...stats },
        found: partial.some((track) => track.frames.some((frame) => frame.face)),
        tracks: partial,
      });
    };
    try {
      const start = Math.max(clip.start, range.start),
        stop = Math.min(end, range.end);
      let priority = null;
      if (flow && !previewPublished && priorityTime >= start && priorityTime < stop) {
        const sourceTime = getVisualSourceTime(segment, Math.max(0, priorityTime - range.start));
        await seekVideoFrame(media, Math.min(sourceTime, Math.max(0, media.duration - 0.001)));
        const face = pickFace(
          await detect(media, signal, null, stats),
          null,
          dimensions.width,
          dimensions.height,
        );
        stats.detections++;
        stats.firstFrameMs = performance.now() - startedAt;
        previewPublished = true;
        priority = { sourceTime, face };
        publish([makeTrack([priority])]);
      }
      const count = segment.type === "video" ? Math.ceil((stop - start) * 24) : 0;
      const times = Array.from({ length: count + 1 }, (_, i) =>
        count ? Math.min(stop - 0.0001, start + ((stop - start) * i) / count) : start,
      );
      const sourceTimes = times.map((time) =>
        getVisualSourceTime(segment, Math.max(0, time - range.start)),
      );
      if (flow)
        reader = await createFaceAttachmentFrameReader(segment, sourceTimes, dimensions, signal);
      for (let i = 0; i <= count; i++) {
        if (signal.aborted) throw abort();
        const time = times[i],
          sourceTime = sourceTimes[i];
        const decoded = await reader?.next();
        if (segment.type === "video" && !decoded)
          await seekVideoFrame(media, Math.min(sourceTime, Math.max(0, media.duration - 0.001)));
        const source = decoded || media;
        const cut = flow?.capture(source);
        if (cut) {
          previous = null;
          flowReady = false;
          stats.sceneCuts++;
        }
        let face = null;
        const scheduledAnchor = i === 0 || cut || time - lastDetection >= 2.5;
        if (flowReady && !scheduledAnchor) {
          const tracked = await flow.step(signal);
          if (tracked && resolveFaceAttachmentPose(tracked, dimensions.width, dimensions.height)) {
            face = tracked;
            stats.flowFrames++;
          } else flowReady = false;
        }
        if (scheduledAnchor || (!face && time - lastDetection >= 0.35)) {
          if (priority && Math.abs(priority.sourceTime - sourceTime) < 0.001) {
            face = priority.face;
            priority = null;
          } else {
            face = pickFace(
              await detect(source, signal, previous, stats),
              previous,
              dimensions.width,
              dimensions.height,
            );
            stats.detections++;
          }
          lastDetection = time;
          if (face && flow) {
            await flow.anchor(face, signal);
            flowReady = true;
          } else flowReady = false;
        }
        if (face) previous = face;
        else if (lastDetection === time) previous = null;
        frames.push({
          sourceTime,
          face: face
            ? {
                score: face.score,
                five: face.five,
                forehead: face.forehead,
                poseReference: face.poseReference,
              }
            : null,
        });
        onProgress(Math.min(99, Math.round((++done / Math.max(1, total)) * 100)));
        if (performance.now() >= nextPreview && i < count) {
          nextPreview = performance.now() + 240;
          const early = priority && priority.sourceTime > sourceTime ? [makeTrack([priority])] : [];
          publish([...early, makeTrack([...frames])]);
        }
      }
    } finally {
      flow?.dispose();
      await reader?.dispose();
      if (segment.type === "video") {
        media.pause();
        media.removeAttribute("src");
        media.load();
      }
    }
    tracks.push(makeTrack(frames.sort((a, b) => a.sourceTime - b.sourceTime)));
  }
  return {
    version: ANALYSIS_VERSION,
    complete: true,
    stats: { ...stats, totalMs: performance.now() - startedAt },
    key,
    tracks,
    found: tracks.some((track) => track.frames.some((frame) => frame.face)),
  };
}

// The timeline span is independent of the wear parameters. Reuse completed
// samples only while the visual sequence and its source-time mapping match.
function reusableCoverage(clip, key) {
  const previous = clip.faceAnalysis;
  if (!previous?.complete || previous.version !== ANALYSIS_VERSION) return null;
  try {
    const [, start, duration, sources] = JSON.parse(previous.key);
    const coverage = previous.coverage || { start, end: start + duration };
    if (
      JSON.stringify(sources) !== JSON.stringify(JSON.parse(key)[3]) ||
      !Number.isFinite(coverage.start) ||
      !Number.isFinite(coverage.end) ||
      coverage.start >= clip.start + clip.duration ||
      coverage.end <= clip.start
    )
      return null;
    return coverage;
  } catch {
    return null;
  }
}
function mergeCompletedTracks(tracks) {
  const merged = new Map();
  for (const track of tracks) {
    const id = JSON.stringify([track.segmentId, track.sourceKey]);
    const previous = merged.get(id);
    if (!previous || track.still) merged.set(id, track);
    else {
      const frames = new Map(previous.frames.map((frame) => [frame.sourceTime, frame]));
      for (const frame of track.frames) frames.set(frame.sourceTime, frame);
      merged.set(id, {
        ...track,
        frames: [...frames.values()].sort((a, b) => a.sourceTime - b.sourceTime),
      });
    }
  }
  return [...merged.values()];
}

function hasFaceInSpan(tracks, segments, start, end) {
  const ranges = getVisualSegmentTimeline(segments);
  return segments.some((segment, index) => {
    const range = ranges[index];
    const first = Math.max(start, range.start);
    const last = Math.min(end, range.end);
    if (last <= first) return false;
    const sourceKey = faceSourceKey(segment);
    const from = getVisualSourceTime(segment, first - range.start);
    const to = getVisualSourceTime(segment, last - range.start);
    return tracks.some(
      (track) =>
        track.segmentId === segment.id &&
        track.sourceKey === sourceKey &&
        track.frames.some(
          (frame) =>
            frame.face && (track.still || (frame.sourceTime >= from && frame.sourceTime < to)),
        ),
    );
  });
}

async function performFaceAnalysis(clip, segments, options) {
  const key = faceAnalysisKey(clip, segments);
  const start = clip.start,
    end = start + clip.duration;
  const covered = reusableCoverage(clip, key);
  const tracks = covered ? [...clip.faceAnalysis.tracks] : [];
  const gaps = covered
    ? [
        [start, Math.min(end, covered.start)],
        [Math.max(start, covered.end), end],
      ].filter(([a, b]) => b > a)
    : [[start, end]];
  const priorityIndex = gaps.findIndex(
    ([a, b]) => options.priorityTime >= a && options.priorityTime < b,
  );
  if (priorityIndex > 0) gaps.unshift(...gaps.splice(priorityIndex, 1));
  const stats = { detections: 0, modelPasses: 0, flowFrames: 0, sceneCuts: 0 };
  const started = performance.now();
  for (const [index, [a, b]] of gaps.entries()) {
    const alreadyFound = hasFaceInSpan(tracks, segments, start, end);
    const result = await analyzeFaceRange({ ...clip, start: a, duration: b - a }, segments, {
      ...options,
      priorityTime:
        options.priorityTime >= a && options.priorityTime < b ? options.priorityTime : a,
      onPreview: (partial) =>
        options.onPreview({
          ...partial,
          key,
          tracks: [...partial.tracks, ...tracks],
          found: partial.found || alreadyFound,
        }),
      onProgress: (progress) =>
        options.onProgress(
          Math.min(99, Math.round(((index + progress / 100) / gaps.length) * 100)),
        ),
    });
    tracks.push(...result.tracks);
    for (const name of ["detections", "modelPasses", "flowFrames", "sceneCuts"])
      stats[name] += result.stats[name];
    stats.firstFrameMs ??= result.stats.firstFrameMs;
  }
  const merged = mergeCompletedTracks(tracks);
  return {
    version: ANALYSIS_VERSION,
    complete: true,
    key,
    coverage: {
      start: Math.min(start, covered?.start ?? start),
      end: Math.max(end, covered?.end ?? end),
    },
    stats: { ...stats, totalMs: performance.now() - started },
    tracks: merged,
    found: hasFaceInSpan(merged, segments, start, end),
  };
}

const completedAnalysis = new Map(),
  sharedAnalysis = new Map();
export function analyzeFaceAttachment(
  clip,
  segments,
  { signal, onProgress = () => {}, onPreview = () => {}, priorityTime = clip.start },
) {
  const key = faceAnalysisKey(clip, segments);
  if (signal.aborted) return Promise.reject(abort());
  if (completedAnalysis.has(key)) {
    onProgress(100);
    return Promise.resolve(completedAnalysis.get(key));
  }
  let job = sharedAnalysis.get(key);
  if (!job) {
    const controller = new AbortController();
    job = { controller, listeners: new Map() };
    sharedAnalysis.set(key, job);
    job.promise = performFaceAnalysis(clip, segments, {
      signal: controller.signal,
      priorityTime,
      onPreview: (preview) => {
        for (const listener of job.listeners.values()) listener.preview(preview);
      },
      onProgress: (progress) => {
        for (const listener of job.listeners.values()) listener.progress(progress);
      },
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          completedAnalysis.set(key, result);
          if (completedAnalysis.size > 24)
            completedAnalysis.delete(completedAnalysis.keys().next().value);
        }
        return result;
      })
      .finally(() => {
        if (sharedAnalysis.get(key) === job) sharedAnalysis.delete(key);
      });
  }
  return new Promise((resolve, reject) => {
    const token = Symbol();
    const cleanup = () => {
      job.listeners.delete(token);
      signal.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      cleanup();
      reject(abort());
      if (!job.listeners.size) {
        job.controller.abort();
        if (sharedAnalysis.get(key) === job) sharedAnalysis.delete(key);
      }
    };
    job.listeners.set(token, { progress: onProgress, preview: onPreview });
    signal.addEventListener("abort", cancel, { once: true });
    job.promise.then(
      (result) => {
        if (!signal.aborted) {
          cleanup();
          resolve(result);
        }
      },
      (error) => {
        if (!signal.aborted) {
          cleanup();
          reject(error);
        }
      },
    );
  });
}

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    worker?.terminate();
    worker = null;
    for (const request of requests.values()) {
      request.cleanup();
      request.reject(abort());
    }
    requests.clear();
  });

export function invalidateFaceAttachmentAnalysis(clip, segments) {
  completedAnalysis.delete(faceAnalysisKey(clip, segments));
}
