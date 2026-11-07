import {
  ensureFaceAttachmentAssets,
  faceAttachmentAssetRevision,
} from "../lib/faceAttachmentAssets.js";
import { useEffect, useRef } from "react";
import { drawPreviewFrame } from "../lib/media.js";
import { isCompositionEffect } from "../lib/beatEffects.js";
import { activeEffectClips } from "../lib/timelineEffects.js";
import { getVisualPlaybackRateAtTime, getVisualSourceTime } from "../lib/visualEffects.js";

const COMPOSITION_PREVIEW_MAX_EDGE = 960;

// Use the same primary-picture compositor and post-process as offline export.
// The underlying video remains mounted for audio, seeking and frame observers.
export function TimelineEffectPreview({
  clips,
  markers,
  overlays,
  time,
  localTime,
  isPlaying,
  videoRef,
  imageRef,
  type,
  effects,
  fitMode,
  filter,
  vision,
  depthRef,
  shellRef,
  transition,
}) {
  const ref = useRef(null),
    latest = useRef(null);
  latest.current = { clips, markers, overlays, time, localTime, isPlaying, effects, fitMode, filter, vision, transition };
  useEffect(() => {
    const canvas = ref.current,
      shell = shellRef.current;
    if (!canvas || !shell) return;
    let frame,
      lastDraw = null, lastPaint = -Infinity;
    void ensureFaceAttachmentAssets(latest.current.clips)
      .then(() => {
        lastDraw = null;
      })
      .catch(() => {});
    const draw = (now) => {
      const d = latest.current;
      const source = type === "video" ? videoRef.current : imageRef.current;
      let visualTime = d.localTime;
      if (d.isPlaying && type === "video" && source && d.effects) {
        const sourceTime = getVisualSourceTime(d.effects, visualTime);
        const rate = getVisualPlaybackRateAtTime(d.effects, visualTime);
        const delta = (source.currentTime - sourceTime) / rate;
        // React updates the timeline UI less often than video presents frames.
        // Use the native clock between updates, without jumping across cuts.
        if (Math.abs(delta) < 0.14) {
          visualTime = Math.max(0, Math.min(d.effects.duration, visualTime + delta));
        }
      }
      const timelineTime = d.time + visualTime - d.localTime;
      const active = activeEffectClips(d.clips, timelineTime);
      if (
        active.length > 0 &&
        source &&
        (source.videoWidth || source.naturalWidth) &&
        !source.seeking &&
        !source.__timelineFramePending
      ) {
        // The shell includes editor padding and letterboxed workspace. Rasterize
        // the actual composition frame, which is also the export aspect ratio.
        const composite = active.some(isCompositionEffect);
        const expensive = composite || active.some((clip) => clip.effect === "ink-print");
        const previous = lastDraw?.data;
        const sameScene = previous?.effects?.id === d.effects?.id
          && previous?.overlays.length === d.overlays.length
          && d.overlays.every((overlay, index) => overlay.id === previous.overlays[index].id);
        if (expensive && d.isPlaying && sameScene && now - lastPaint < 31) {
          frame = requestAnimationFrame(draw);
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const pixelRatio = window.devicePixelRatio || 1;
        const density = expensive
          ? Math.min(pixelRatio, COMPOSITION_PREVIEW_MAX_EDGE / Math.max(1, rect.width, rect.height))
          : pixelRatio;
        const width = Math.max(2, Math.round(rect.width * density));
        const height = Math.max(2, Math.round(rect.height * density));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const overlayLayers = composite ? [...shell.querySelectorAll("[data-composition-overlay]")] : [];
        const overlaySources = overlayLayers.map((layer) => layer.querySelector(":scope > video, :scope > img:not(.visual-overlay-subject-cutout), :scope > .visual-overlay-subject-cutout"));
        // An incoming panel can still be decoding on a slower device. Keep
        // the complete canvas pipeline active and paint the other panels.
        const overlayFrames = overlaySources.map((item) => item && (
          !item.seeking && (item.naturalWidth || item.readyState >= 2) ? item.currentTime ?? item.naturalWidth : null
        ));
        const compositeReady = composite && overlayLayers.length === d.overlays.length && overlaySources.every(Boolean);
        if (
          lastDraw?.data === d &&
          lastDraw.assetRevision === faceAttachmentAssetRevision() &&
          lastDraw.source === source &&
          lastDraw.mediaTime === source.currentTime &&
          lastDraw.width === width &&
          lastDraw.height === height &&
          lastDraw.compositeReady === compositeReady &&
          overlayFrames.every((value, index) => value === lastDraw.overlayFrames[index] && overlaySources[index] === lastDraw.overlaySources[index])
        ) {
          frame = requestAnimationFrame(draw);
          return;
        }
        lastPaint = now;
        lastDraw = {
          assetRevision: faceAttachmentAssetRevision(),
          data: d,
          source,
          mediaTime: source.currentTime,
          width,
          height,
          compositeReady, overlayFrames, overlaySources,
        };
        const next = shell.querySelector(
          ".preview-transition-layer video, .preview-transition-layer img",
        );
        const depth = depthRef.current;
        const useDepth =
          depth &&
          depth.width > 0 &&
          (d.effects?.cinematicDepth?.enabled || d.effects?.photoParallax?.enabled);
        drawPreviewFrame(canvas.getContext("2d"), useDepth ? depth : source, canvas, {
          captionsEnabled: false,
          fitMode: useDepth ? "contain" : d.fitMode,
          filter: useDepth ? "none" : d.filter,
          visualEffects: useDepth
            ? { ...d.effects, cinematicDepth: null, photoParallax: null }
            : d.effects,
          visualTime,
          vision: d.vision,
          transitionId: d.transition?.id,
          transitionProgress: d.transition?.progress,
          transitionNext:
            next && (next.videoWidth || next.naturalWidth)
              ? { visual: next, visualEffects: d.transition?.next }
              : null,
          effectClips: compositeReady ? d.clips : d.clips.filter((clip) => !isCompositionEffect(clip)),
          timelineMarkers: d.markers,
          visualOverlays: compositeReady ? overlayLayers.map((layer) => {
            const overlay = d.overlays.find((item) => String(item.id) === layer.dataset.compositionOverlay);
            return { ...overlay, start: (overlay.start || 0) - (d.time - d.localTime) };
          }) : [],
          visualOverlaySources: compositeReady ? overlaySources.map((item, index) => overlayFrames[index] !== null ? item : null) : [],
          timelineTime,
        });
        canvas.style.visibility = "visible";
        shell.classList.add("has-timeline-effects");
        shell.classList.toggle("has-composition-effects", compositeReady);
      } else if (!active.length) {
        canvas.style.visibility = "hidden";
        shell.classList.remove("has-timeline-effects", "has-composition-effects");
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      shell.classList.remove("has-timeline-effects", "has-composition-effects");
    };
  }, [videoRef, imageRef, shellRef, depthRef, type]);
  return (
    <canvas
      ref={ref}
      className="timeline-effects-preview"
      style={{ visibility: "hidden" }}
      aria-hidden="true"
    />
  );
}
