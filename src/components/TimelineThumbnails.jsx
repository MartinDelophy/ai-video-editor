import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  getSampledVideoTrackFrames,
  getVideoTrackFrameAtSourceTime,
  getVideoTrackFrameSource,
  PLAYHEAD_FRAME_SYNC_TOLERANCE_SECONDS,
} from "../lib/videoTrackFrames.js";
import { getVisualSourceTime } from "../lib/visualEffects.js";
import { captureVideoTrackFrame } from "../lib/media.js";

const EMPTY_FRAMES = [];

// Only the active visual receives the changing playback time. The other
// filmstrips keep their full frame density without rebuilding their image
// elements for every playback tick, selection, or unrelated audio update.
export const TimelineThumbnails = memo(function TimelineThumbnails({
  segment,
  src,
  type,
  videoFrameCount = 1,
  imageFrameCount = 1,
  imageCellWidth = 84,
  currentTime = null,
  segmentStart = 0,
  previewVideoMediaTime = 0,
  timelineSeekActive = false,
  overlay = false,
  visible = true,
}) {
  const [playheadFrame, setPlayheadFrame] = useState(null);
  const playheadFrameCaptureRef = useRef(0);
  const playheadPresentedFrameRef = useRef(null);
  useEffect(() => {
    if (playheadFrameCaptureRef.current) {
      window.cancelAnimationFrame(playheadFrameCaptureRef.current);
      playheadFrameCaptureRef.current = 0;
    }
    if (timelineSeekActive) return undefined;
    if (!visible || currentTime === null || type !== "video") {
      playheadPresentedFrameRef.current = null;
      setPlayheadFrame(null);
      return undefined;
    }
    const localTime = Math.max(0, Math.min(Number(segment.duration) || 0, currentTime - segmentStart));
    // At the exact origin, retain the prepared opening representative. Some
    // WebM decoders expose a synthetic black canvas before their first PTS.
    if (localTime < 0.2) return undefined;
    const expectedSourceTime = getVisualSourceTime(segment, localTime);
    let attempts = 0;
    const capturePresentedFrame = () => {
      playheadFrameCaptureRef.current = 0;
      const previewVideo = document.querySelector(".preview-video");
      if (!(previewVideo instanceof HTMLVideoElement) || previewVideo.readyState < 2) {
        if (attempts++ < 48) playheadFrameCaptureRef.current = window.requestAnimationFrame(capturePresentedFrame);
        return;
      }
      // currentTime advances as soon as a seek is requested, before the new
      // pixels necessarily reach the compositor. Capture only after the
      // preview's requestVideoFrameCallback-backed media time confirms that
      // the decoder actually presented the frame for this playhead position.
      if (Math.abs(previewVideoMediaTime - expectedSourceTime) > PLAYHEAD_FRAME_SYNC_TOLERANCE_SECONDS) {
        if (attempts++ < 48) playheadFrameCaptureRef.current = window.requestAnimationFrame(capturePresentedFrame);
        return;
      }
      // Zoom, selection and progressive strip commits can revisit the same
      // presented video frame. Reuse that exact PTS capture instead of another
      // synchronous GPU readback and JPEG encode. A new decoded PTS still gets
      // its own capture, including immediately after a completed seek.
      const presented = playheadPresentedFrameRef.current;
      const frame = presented?.video === previewVideo
        && presented.src === previewVideo.currentSrc
        && presented.sourceTime === previewVideoMediaTime
        ? presented.frame
        : captureVideoTrackFrame(previewVideo, { sourceTime: previewVideoMediaTime });
      if (!frame) return;
      playheadPresentedFrameRef.current = { video: previewVideo, src: previewVideo.currentSrc, sourceTime: previewVideoMediaTime, frame };
      setPlayheadFrame((previous) => previous?.frame === frame
        && previous.segmentId === segment.id
        && Math.abs(previous.timelineTime - currentTime) <= PLAYHEAD_FRAME_SYNC_TOLERANCE_SECONDS
        ? previous
        : {
          segmentId: segment.id,
          timelineTime: currentTime,
          sourceTime: previewVideoMediaTime,
          frame,
        });
    };
    playheadFrameCaptureRef.current = window.requestAnimationFrame(capturePresentedFrame);
    return () => {
      if (!playheadFrameCaptureRef.current) return;
      window.cancelAnimationFrame(playheadFrameCaptureRef.current);
      playheadFrameCaptureRef.current = 0;
    };
  }, [currentTime, previewVideoMediaTime, segment, segmentStart, timelineSeekActive, type, visible]);
  const trackFrames = Array.isArray(segment.trackFrames) ? segment.trackFrames : EMPTY_FRAMES;
  const { sourceStart, sourceDuration, duration, playbackRate, trackFrameDuration, speedCurve, thumbnail } = segment;
  const sampledFrames = useMemo(() => visible && type === "video"
    ? trackFrames.length
      ? getSampledVideoTrackFrames(trackFrames, videoFrameCount, {
          sourceStart, sourceDuration, duration, playbackRate, trackFrameDuration, speedCurve,
        })
      : !overlay && thumbnail
        ? Array.from({ length: videoFrameCount }, () => thumbnail)
        : EMPTY_FRAMES
    : EMPTY_FRAMES, [visible, type, trackFrames, videoFrameCount, sourceStart, sourceDuration,
      duration, playbackRate, trackFrameDuration, speedCurve, overlay, thumbnail]);
  // Clip wrappers stay mounted for sizing, selection, snapping and drops.
  // All hooks run even when offscreen or inactive; only artwork is culled.
  if (!visible) return null;
  let visibleFrames = sampledFrames;
  if (type === "video" && currentTime !== null && sampledFrames.length) {
    const localTime = Math.max(0, Math.min(Number(segment.duration) || 0, currentTime - segmentStart));
    const activeFrameIndex = Math.min(
      sampledFrames.length - 1,
      Math.floor(localTime / Math.max(0.001, Number(segment.duration) || 0.001) * sampledFrames.length),
    );
    const expectedSourceTime = getVisualSourceTime(segment, localTime);
    const exactFrame = getVideoTrackFrameAtSourceTime(
      trackFrames,
      expectedSourceTime,
      Number(segment.trackFrameDuration) || Number(segment.sourceDuration) || Number(segment.duration) || 0,
    );
    const liveFrame = playheadFrame?.segmentId === segment.id
      && Math.abs(playheadFrame.timelineTime - currentTime) <= PLAYHEAD_FRAME_SYNC_TOLERANCE_SECONDS
      && Math.abs(playheadFrame.sourceTime - expectedSourceTime) <= PLAYHEAD_FRAME_SYNC_TOLERANCE_SECONDS
      ? playheadFrame.frame
      : null;
    if (liveFrame || exactFrame) {
      visibleFrames = sampledFrames.slice();
      visibleFrames[activeFrameIndex] = liveFrame || exactFrame;
    }
  }
  const isPortraitVideo = type === "video" && (segment.height || 0) > (segment.width || 0);
  return (
    <div
      className={overlay ? "visual-overlay-thumbnails" : `image-thumbnails ${type === "video" ? "is-video" : ""} ${isPortraitVideo ? "is-portrait-video" : ""}`}
      style={overlay ? undefined : {
        "--thumbnail-cell-width": `${imageCellWidth}px`,
        "--video-thumbnail-count": Math.max(1, visibleFrames.length),
      }}
    >
      {type === "video"
        ? visibleFrames.length
          ? visibleFrames.map((frame, index) => (
            <img src={getVideoTrackFrameSource(frame)} alt="" crossOrigin="anonymous" draggable={false} key={index} />
          ))
          : <video src={src} crossOrigin="anonymous" muted playsInline preload="metadata" draggable={false} />
        : Array.from({ length: Math.max(1, imageFrameCount) }, (_, index) => (
          <img src={src} alt="" crossOrigin="anonymous" draggable={false} key={index} />
        ))}
    </div>
  );
});
