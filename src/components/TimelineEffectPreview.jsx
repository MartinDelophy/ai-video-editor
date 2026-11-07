import {
  ensureFaceAttachmentAssets,
  faceAttachmentAssetRevision,
} from "../lib/faceAttachmentAssets.js";
import { useEffect, useRef } from "react";
import { drawPreviewFrame } from "../lib/media.js";
import { activeEffectClips } from "../lib/timelineEffects.js";

// Use the same primary-picture compositor and post-process as offline export.
// The underlying video remains mounted for audio, seeking and frame observers.
export function TimelineEffectPreview({
  clips,
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
  latest.current = { clips, time, localTime, effects, fitMode, filter, vision, transition };
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
      const active = activeEffectClips(d.clips, d.time).length > 0;
      if (
        active &&
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
        if (
          lastDraw?.data === d &&
          lastDraw.assetRevision === faceAttachmentAssetRevision() &&
          lastDraw.source === source &&
          lastDraw.mediaTime === source.currentTime &&
          lastDraw.width === width &&
          lastDraw.height === height
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
          effectClips: d.clips,
          timelineTime: d.time,
        });
        canvas.style.visibility = "visible";
        shell.classList.add("has-timeline-effects");
      } else if (!active) {
        canvas.style.visibility = "hidden";
        shell.classList.remove("has-timeline-effects");
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      shell.classList.remove("has-timeline-effects");
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
