import { createVisualSegment, getVisualSegmentsTotal } from '../lib/timeline.js';
import { normalizeTimelineMarkers } from '../lib/timelineMarkers.js';
import { boardError, validateReady } from './storyboard.js';

export function storyboardMarkerPrefix(connection, release) {
  return `sanity-${connection.projectId}-${connection.dataset}-${release._id}-`;
}
export function planStoryboardImport({ connection, release, assignments, assets, visuals, markers, locked }) {
  if (locked) throw boardError('lockedError');
  const content = validateReady(release);
  const prefix = storyboardMarkerPrefix(connection, release);
  if (markers.some((marker) => marker.id.startsWith(prefix))) throw boardError('duplicateError');
  const start = getVisualSegmentsTotal(visuals);
  const duration = content.shots.reduce((sum, shot) => sum + shot.duration, 0);
  if (start + duration > 1800) throw boardError('durationError');
  let cursor = start;
  const segments = [];
  const nextMarkers = [];
  for (const shot of content.shots) {
    const mapping = assignments[shot._key];
    const asset = assets.find((item) => item.id === mapping?.assetId);
    const sourceStart = Number(mapping?.sourceStart ?? 0);
    if (!asset || !['image', 'video'].includes(asset.type) || !asset.src || asset.preparing || !Number.isFinite(sourceStart) || sourceStart < 0 ||
      (asset.type === 'video' && (!(asset.duration > 0) || sourceStart + shot.duration > asset.duration + .001))) throw boardError('assetError');
    const segment = createVisualSegment(shot.duration, { ...asset, sourceStart: asset.type === 'video' ? sourceStart : 0, playbackRate: 1 });
    segments.push(segment);
    nextMarkers.push({ id: `${prefix}${shot._key}`, type: 'range', time: cursor, endTime: cursor + shot.duration,
      title: shot.title, notes: [shot.visualBrief, shot.narration, `${connection.projectId}/${connection.dataset}/${release._id}`].filter(Boolean).join('\n\n'), color: 'violet' });
    cursor += shot.duration;
  }
  return { start, duration, segments, markers: normalizeTimelineMarkers([...markers, ...nextMarkers]) };
}
