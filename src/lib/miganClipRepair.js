import { createTemporalRepair } from "./repairTemporal.js";
import { encodeRepairedVideoRanges } from "./media.js";
import { repairMiganFrame } from "./miganRepair.js";

function abortError() {
  const error = new Error("AI repair canceled");
  error.name = "AbortError";
  return error;
}

function waitFor(video, eventName, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, ready);
      video.removeEventListener("error", failed);
      signal?.removeEventListener("abort", canceled);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("Could not read the video")); };
    const canceled = () => { cleanup(); reject(abortError()); };
    video.addEventListener(eventName, ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", canceled, { once: true });
  });
}

async function loadVideo(src, signal) {
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = src; video.load();
  try {
    if (video.readyState < 1) await waitFor(video, "loadedmetadata", signal);
    if (video.readyState < 2) await waitFor(video, "loadeddata", signal);
    if (signal?.aborted) throw abortError();
    return video;
  } catch (error) {
    video.pause(); video.removeAttribute("src"); video.load();
    throw error;
  }
}

async function seek(video, time, signal) {
  if (signal?.aborted) throw abortError();
  const target = Math.max(0, Math.min(Math.max(0, video.duration - 0.001), time));
  if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.0005) return;
  const waiting = waitFor(video, "seeked", signal);
  video.currentTime = target;
  await waiting;
}

const REPAIR_ENCODING_PHASES = {
  remasterPhaseLoadEncoder: "repairPhaseLoadEncoder",
  remasterPhaseEncodeVideo: "repairPhaseEncodeVideo",
  remasterPhaseCreateAsset: "repairPhaseCreateAsset",
};

export function resolveRepairSelection(region, timelineTime) {
  const frames = Array.isArray(region.keyframes) ? region.keyframes : [];
  if (!frames.length) return region.selection;
  if (timelineTime <= frames[0].time) return frames[0].selection;
  if (timelineTime >= frames.at(-1).time) return frames.at(-1).selection;
  const nextIndex = frames.findIndex((frame) => frame.time >= timelineTime);
  const before = frames[nextIndex - 1];
  const after = frames[nextIndex];
  const mix = (timelineTime - before.time) / Math.max(0.001, after.time - before.time);
  return Object.fromEntries(["x", "y", "width", "height"].map((key) => [
    key,
    before.selection[key] + (after.selection[key] - before.selection[key]) * mix,
  ]));
}

export async function repairMiganClip({
  segment,
  referenceSegment = segment,
  selection,
  regions = null,
  videoElement = null,
  frameRate = 25,
  rangeIn = 0,
  rangeOut = null,
  signal,
  onProgress,
  onFrame,
}) {
  if (segment?.type !== "video" || !segment.src) throw new Error("Select a video clip first");
  const expectedSrc = new URL(segment.src, window.location.href).href;
  const reusable = videoElement?.readyState >= 2
    && videoElement.videoWidth > 0
    && (videoElement.currentSrc === expectedSrc || videoElement.src === expectedSrc);
  const video = reusable ? videoElement : await loadVideo(segment.src, signal);
  const restoreTime = reusable ? video.currentTime : 0;
  const sourceStart = Math.max(0, Number(segment.sourceStart) || 0);
  const sourceDuration = Math.max(0.001, Math.min(
    (Number(video.duration) || 0) - sourceStart,
    Number(segment.sourceDuration) || Number(segment.duration) || Number(video.duration) || 0.001,
  ));
  const playbackRate = Math.max(0.25, Number(segment.playbackRate) || 1);
  const safeRate = Math.max(1, Math.min(30, Math.round(frameRate || 25)));
  const totalFrames = Math.max(1, Math.ceil(sourceDuration * safeRate));
  const applyStart = Math.max(0, Number(rangeIn) || 0) * playbackRate;
  const applyEnd = Math.min(sourceDuration, Number.isFinite(rangeOut) ? rangeOut * playbackRate : sourceDuration);
  const repairRegions = Array.isArray(regions) && regions.length
    ? regions
    : [{ start: applyStart / playbackRate, end: applyEnd / playbackRate, selection }];

  // Work only on the union of selected source-time intervals. Keep the normal
  // source video for every other frame; do not seek or serialize untouched frames.
  const frameIndices = [];
  for (let index = 0; index < totalFrames; index += 1) {
    const time = index / safeRate / playbackRate;
    if (repairRegions.some((region) => time >= region.start && time < region.end)) frameIndices.push(index);
  }
  if (!frameIndices.length) {
    if (!reusable) { video.removeAttribute("src"); video.load(); }
    throw new Error("No video frames inside the selected repair ranges");
  }
  let backend = "";
  let temporalFrames = 0;
  const repairedFrames = [];
  let referenceVideo;
  let temporal;
  try {
    // Keep reference decoding separate from both preview playback and the
    // current pass, which may itself be repairing a previous generated result.
    try {
      referenceVideo = await loadVideo(referenceSegment.src, signal);
      const referenceStart = Math.max(0, Number(referenceSegment.sourceStart) || 0);
      temporal = createTemporalRepair({ video: referenceVideo, seek, regions: repairRegions,
        resolveSelection: resolveRepairSelection, sourceStart: referenceStart,
        sourceDuration: Math.min(sourceDuration, referenceVideo.duration - referenceStart), playbackRate, signal });
    } catch (error) {
      if (signal?.aborted || error.name === "AbortError") throw error;
      console.info("Temporal source unavailable; retaining model repair.", error);
    }
    let sourceBlob = segment.blob;
    if (!(sourceBlob instanceof Blob)) {
      const response = await fetch(segment.src, { signal });
      if (!response.ok) throw new Error("Could not read the source video");
      sourceBlob = await response.blob();
    }
    for (const [completed, index] of frameIndices.entries()) {
      if (signal?.aborted) throw abortError();
      const localSourceTime = index / safeRate;
      await seek(video, sourceStart + localSourceTime, signal);
      const timelineTime = localSourceTime / playbackRate;
      const activeRegions = repairRegions.filter((region) => timelineTime >= region.start && timelineTime < region.end);
      let bitmap = await createImageBitmap(video);
      let result;
      let temporalPixels = 0;
      const repairedRects = [];
      try {
        for (const [regionIndex, region] of activeRegions.entries()) {
          const selection = resolveRepairSelection(region, timelineTime);
          const temporalGuide = await temporal?.guide(selection, localSourceTime);
          result = await repairMiganFrame({
            bitmap, temporalGuide,
            selection,
            signal,
            onProgress: (message) => {
              backend = message.backend || backend;
              onProgress?.({
                progress: Math.min(90, 2 + completed / frameIndices.length * 88),
                phaseKey: message.stage === "download" ? "repairPhaseDownload" : message.stage === "compile" ? "repairPhaseCompile" : "repairPhaseFrame",
                frameIndex: completed, totalFrames: frameIndices.length, backend,
              });
            },
          });
          temporalPixels += result.temporalPixels || 0;
          repairedRects.push(result.rect);
          backend = result.backend || backend;
          bitmap.close?.();
          bitmap = null;
          if (regionIndex < activeRegions.length - 1) bitmap = await createImageBitmap(result.blob);
        }
      } finally {
        bitmap?.close?.();
      }
      if (signal?.aborted) throw abortError();
      if (temporalPixels > 0) temporalFrames++;
      // Encode an alpha patch, never a full sampled screenshot. Native source
      // frames retain their own presentation time and pixels outside the masks.
      const patchCanvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
      const patchContext = patchCanvas.getContext("2d");
      const repairedBitmap = await createImageBitmap(result.blob);
      try {
        patchContext.beginPath();
        for (const rect of repairedRects) patchContext.rect(rect.x, rect.y, rect.width, rect.height);
        patchContext.clip();
        patchContext.drawImage(repairedBitmap, 0, 0);
      } finally { repairedBitmap.close(); }
      repairedFrames.push({ blob: await patchCanvas.convertToBlob({ type: "image/png" }), index });
      await onFrame?.({ blob: result.blob, index: completed, totalFrames: frameIndices.length, time: timelineTime, repaired: true });
      onProgress?.({
        progress: Math.min(90, 2 + (completed + 1) / frameIndices.length * 88),
        phaseKey: "repairPhaseFrame", frameIndex: completed + 1,
        totalFrames: frameIndices.length, backend,
      });
    }
    const blob = await encodeRepairedVideoRanges({
      frames: repairedFrames, frameRate: safeRate, sourceBlob,
      sourceStart, sourceDuration, signal,
      onProgress: (progress) => onProgress?.({
        ...progress,
        phaseKey: progress.phaseKey === "remasterPhaseEncodeVideo"
          ? "repairPhaseComposeVideo"
          : REPAIR_ENCODING_PHASES[progress.phaseKey] || progress.phaseKey,
      }),
    });
    return { blob, width: video.videoWidth, height: video.videoHeight, sourceDuration, frameRate: safeRate, totalFrames, backend, temporalFrames };
  } finally {
    temporal?.dispose();
    if (referenceVideo) { referenceVideo.pause(); referenceVideo.removeAttribute("src"); referenceVideo.load(); }
    video.pause();
    if (reusable) video.currentTime = Math.min(restoreTime, Math.max(0, video.duration - 0.001));
    else { video.removeAttribute("src"); video.load(); }
  }
}
