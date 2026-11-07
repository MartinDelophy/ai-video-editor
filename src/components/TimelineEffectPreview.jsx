import {
  ensureFaceAttachmentAssets,
  faceAttachmentAssetRevision,
} from "../lib/faceAttachmentAssets.js";
import { useEffect, useRef } from "react";
import { drawPreviewFrame } from "../lib/media.js";
import { isCompositionEffect } from "../lib/beatEffects.js";
import { activeEffectClips } from "../lib/timelineEffects.js";

// Use the same primary-picture compositor and post-process as offline export.
// The underlying video remains mounted for audio, seeking and frame observers.
export function TimelineEffectPreview({
  clips,
  markers,
  overlays,
  time,
  localTime,
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
  latest.current = { clips, markers, overlays, time, localTime, effects, fitMode, filter, vision, transition };
  useEffect(() => {
    const canvas = ref.current,
      shell = shellRef.current;
    if (!canvas || !shell) return;
    let frame,
      lastDraw = null;
    void ensureFaceAttachmentAssets(latest.current.clips)
      .then(() => {
        lastDraw = null;
      })
      .catch(() => {});
    const draw = () => {
      const d = latest.current;
      const source = type === "video" ? videoRef.current : imageRef.current;
      const active = activeEffectClips(d.clips, d.time);
      if (
        active.length > 0 &&
        source &&
        (source.videoWidth || source.naturalWidth) &&
        !source.seeking &&
        !source.__timelineFramePending
      ) {
        // The shell includes editor padding and letterboxed workspace. Rasterize
        // the actual composition frame, which is also the export aspect ratio.
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(2, Math.round(rect.width * (window.devicePixelRatio || 1)));
        const height = Math.max(2, Math.round(rect.height * (window.devicePixelRatio || 1)));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const composite = active.some(isCompositionEffect);
        const overlayLayers = composite ? [...shell.querySelectorAll("[data-composition-overlay]")] : [];
        const overlaySources = overlayLayers.map((layer) => layer.querySelector(":scope > video, :scope > img:not(.visual-overlay-subject-cutout), :scope > .visual-overlay-subject-cutout"));
        const overlayFrames = overlaySources.map((item) => item && (item.seeking ? "seeking" : item.currentTime ?? item.naturalWidth));
        const compositeReady = composite && overlayLayers.length === d.overlays.length &&
          overlaySources.every((item) => item && !item.seeking && (item.naturalWidth || item.readyState >= 2));
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
          visualTime: d.localTime,
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
          visualOverlaySources: compositeReady ? overlaySources : [],
          timelineTime: d.time,
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
