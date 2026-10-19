export const ALL_CAPTION_VISUALS = 'caption-all-visuals';
export function buildCaptionTargets(timelineMedia, assets) {
  const clips = timelineMedia.filter(item => ['video', 'audio'].includes(item.type) && item.blob instanceof Blob)
    .map(item => ({ ...item, id: `caption-target-${item.id}`, clipId: item.id,
      name: `${item.name || ''} (${item.timelineStart.toFixed(2)}–${(item.timelineStart + item.duration).toFixed(2)}s)` }));
  return { clips, media: [...clips, ...assets.filter(item => ['video', 'audio'].includes(item.type) && !item.preparing && item.blob instanceof Blob)] };
}
export function captionTargetUnchanged(previous, current) {
  return Boolean(current && previous.blob === current.blob && previous.sourceStart === current.sourceStart && previous.sourceDuration === current.sourceDuration && previous.duration === current.duration && previous.timelineStart === current.timelineStart && previous.playbackRate === current.playbackRate && previous.reversed === current.reversed && previous.reverse === current.reverse && JSON.stringify(previous.speedCurve) === JSON.stringify(current.speedCurve));
}
