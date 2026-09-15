import { memo } from "react";
import { formatCompactDuration, formatTime } from "../lib/timeline.js";
import { WaveformStrip } from "./ui.jsx";

// Geometry/selection changes rerender the affected clip. Playback ticks keep
// the clip subtree intact; pointer actions always read the latest parent
// handlers so memoization cannot retain an old selection, lock or seek state.
export const TimelineAudioClip = memo(function TimelineAudioClip({
  segment,
  laneIndex,
  timelineDuration,
  selected,
  rangeSelected,
  waveformVisible,
  handlersRef,
}) {
  const left = timelineDuration > 0 ? (segment.start / timelineDuration) * 100 : 0;
  const width = timelineDuration > 0 ? (segment.duration / timelineDuration) * 100 : 0;
  return (
    <div
      className={`audio-clip ${segment.sourceKind === "video-source" ? "is-video-source" : ""} ${selected ? "is-selected" : ""}`}
      data-timeline-segment-track="audio"
      data-timeline-segment-id={segment.id}
      data-range-selected={rangeSelected || undefined}
      style={{ left: `${left}%`, width: `${width}%` }}
      onPointerDown={(event) => handlersRef.current.startAudioSegmentMove(event, segment.id, laneIndex)}
      onContextMenu={(event) => handlersRef.current.showTrackContextMenu(event, "audio", segment.id)}
      onClick={(event) => handlersRef.current.selectAudioClip(event, segment.id)}
    >
      {waveformVisible ? <WaveformStrip peaks={segment.peaks} active /> : null}
      <span className="audio-clip-duration" data-compact-duration={formatCompactDuration(segment.duration)}>{formatTime(segment.duration)}</span>
    </div>
  );
});

export const TimelineCaptionClip = memo(function TimelineCaptionClip({
  segment,
  index,
  laneIndex,
  start,
  duration,
  timelineDuration,
  current,
  selected,
  dragging,
  reorderTarget,
  rangeSelected,
  placeholder,
  handlersRef,
}) {
  const left = start !== undefined && timelineDuration > 0
    ? Math.max(0, Math.min(100, (start / timelineDuration) * 100))
    : 0;
  const width = timelineDuration > 0
    ? Math.max(0.01, Math.min(100, (duration / timelineDuration) * 100))
    : 0;
  return (
    <button
      type="button"
      className={`caption-segment ${current ? "is-current" : ""} ${selected ? "is-selected-segment" : ""} ${segment.hidden ? "is-hidden" : ""} ${dragging ? "is-reorder-dragging" : ""} ${reorderTarget ? "is-reorder-target" : ""}`}
      data-timeline-segment-track="caption"
      data-timeline-segment-index={index}
      data-timeline-segment-id={segment.id}
      data-range-selected={rangeSelected || undefined}
      data-placeholder={placeholder}
      style={{ "--caption-left": `${left}%`, "--caption-width": `${width}%` }}
      onPointerDown={(event) => handlersRef.current.startTimelineClipDrag(event, "caption", segment.id, index)}
      onContextMenu={(event) => handlersRef.current.showTrackContextMenu(event, "caption", segment.id, `caption-${laneIndex}`)}
      onClick={(event) => handlersRef.current.selectCaptionClip(event, segment.id, index, start)}
    >
      <span
        className="caption-resize-handle is-start"
        aria-hidden="true"
        onPointerDown={(event) => handlersRef.current.startCaptionResize(event, segment.id, index, "start")}
      />
      <span className="caption-segment-label">{segment.text}</span>
      <span
        className="caption-resize-handle is-end"
        aria-hidden="true"
        onPointerDown={(event) => handlersRef.current.startCaptionResize(event, segment.id, index, "end")}
      />
    </button>
  );
});
