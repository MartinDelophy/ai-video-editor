import { getVisualSegmentTimeline, materializeCaptionTimings } from "./timeline.js";

const addRange = (points, track, id, start, duration) => {
  const safeStart = Math.max(0, Number(start) || 0);
  const safeDuration = Math.max(0, Number(duration) || 0);
  if (!(safeDuration > 0)) return;
  points.push(
    { time: safeStart, track, id, edge: "start" },
    { time: safeStart + safeDuration, track, id, edge: "end" },
  );
};

export function collectTimelineSnapPoints(d, exclude = {}) {
  const timelineDuration = Math.max(0, Number(d.timelineDuration) || 0);
  const currentTime = Math.max(0, Math.min(timelineDuration, Number(d.currentTime) || 0));
  const points = [
    { time: 0, track: "timeline", id: "start", edge: "start" },
  ];
  if (timelineDuration > 0) points.push({ time: timelineDuration, track: "timeline", id: "end", edge: "end" });
  if (currentTime > 0 && currentTime < timelineDuration) {
    points.push({ time: currentTime, track: "playhead", id: "playhead", edge: "playhead" });
  }
  getVisualSegmentTimeline(d.visualSegments ?? []).forEach((range, index) => {
    const segment = d.visualSegments[index];
    addRange(points, "image", segment?.id, range.start, range.end - range.start);
  });
  materializeCaptionTimings(d.captionSegments ?? [], d.captionTargetDuration ?? d.timelineDuration ?? 0)
    .forEach((segment) => addRange(points, "caption", segment.id, segment.start, segment.end - segment.start));
  (d.stickerSegments ?? []).forEach((segment) => addRange(points, "sticker", segment.id, segment.start, segment.duration));
  (d.audioSegments ?? []).forEach((segment) => addRange(points, "audio", segment.id, segment.start, segment.duration));
  if (d.sourceAudioDuration > 0) addRange(points, "source", "source", d.sourceAudioStart, d.sourceAudioDuration);
  if (d.musicDuration > 0) addRange(points, "music", "music", d.musicStart, d.musicDuration);
  return points.filter((point) => point.track !== exclude.track || point.id !== exclude.id);
}

export function findClosestTimelineSnap(value, points, thresholdSeconds) {
  let closest = null;
  points.forEach((point) => {
    const distance = Math.abs(point.time - value);
    if (distance <= thresholdSeconds && (!closest || distance < closest.distance)) closest = { ...point, distance };
  });
  return closest;
}

export function snapTimelineRange(start, duration, points, thresholdSeconds) {
  const startSnap = findClosestTimelineSnap(start, points, thresholdSeconds);
  const endSnap = findClosestTimelineSnap(start + duration, points, thresholdSeconds);
  const snap = !startSnap ? endSnap : !endSnap ? startSnap : startSnap.distance <= endSnap.distance ? startSnap : endSnap;
  if (!snap) return { start, guide: null };
  const snappedStart = snap === endSnap ? snap.time - duration : snap.time;
  return { start: snappedStart, guide: { time: snap.time, label: `${snap.time.toFixed(2)}s` } };
}
