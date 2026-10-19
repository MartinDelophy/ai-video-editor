import { getVisualSpeedCurveTimelineProgress } from './visualSpeedCurve.js';

export const DUCKING_PRESETS = { gentle: { db: -6, release: .45 }, natural: { db: -12, release: .65 }, strong: { db: -18, release: .9 } };
export const normalizeAutoDuck = value => ({ enabled: value?.enabled === true, strength: Object.hasOwn(DUCKING_PRESETS, value?.strength) ? value.strength : 'natural' });
const entries = new Map(), listeners = new Set();
const idle = Object.freeze({ status: 'idle', progress: 0 });
export const subscribeDucking = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const getDuckingStatus = id => entries.get(id) || idle;
export function publishDucking(id, entry) { entries.set(id, entry); listeners.forEach(listener => listener()); }
export function clearDucking() { entries.clear(); listeners.forEach(listener => listener()); }
export function speechIntervals(probabilities, clip) {
  const duration = clip.sourceDuration || clip.duration * (clip.playbackRate || 1);
  const map = time => (clip.start || 0) + (clip.speedCurve?.enabled
    ? getVisualSpeedCurveTimelineProgress(clip.speedCurve, time / duration) * clip.duration
    : time / (clip.playbackRate || 1));
  const result = []; let start = null, last = 0;
  for (let i = 0; i <= probabilities.length; i++) {
    const speech = i < probabilities.length && probabilities[i] >= .5;
    if (speech) { start ??= i * .032; last = Math.min(duration, (i + 1) * .032); }
    if (start !== null && (!speech && i * .032 - last >= .18 || i === probabilities.length)) {
      if (last - start >= .096) result.push([map(start), map(last)]);
      start = null;
    }
  }
  return result;
}
export function buildDuckingEnvelope(intervals, clip) {
  const { strength } = normalizeAutoDuck(clip.autoDuck), preset = DUCKING_PRESETS[strength];
  const floor = 10 ** (preset.db / 20), begin = clip.start || 0, end = begin + clip.duration;
  const spans = [];
  for (const [a,b] of intervals.filter(([a,b])=>b>begin-preset.release && a<end+.08).sort((x,y)=>x[0]-y[0])) {
    const previous=spans[spans.length-1];
    if(previous && a-.08<=previous[1]+preset.release) previous[1]=Math.max(previous[1],b);
    else spans.push([a,b]);
  }
  const at = time => Math.min(1, ...spans.map(([a,b]) => time < a - .08 || time > b + preset.release ? 1 : time < a ? 1 + (floor - 1) * (time - a + .08) / .08 : time <= b ? floor : floor + (1 - floor) * (time - b) / preset.release));
  const knots = new Set([begin,end]);
  for (const [a,b] of spans) for (const time of [a - .08,a,b,b + preset.release]) if(time > begin && time < end) knots.add(time);
  return [...knots].sort((a,b)=>a-b).map(time => [time,at(time)]);
}
export function gainAtEnvelope(points, time) {
  if (!points?.length) return 1;
  let lo=0,hi=points.length-1;
  if(time<=points[lo][0])return points[lo][1];
  if(time>=points[hi][0])return points[hi][1];
  while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid][0]<=time)lo=mid;else hi=mid;}
  const [a,x]=points[lo], [b,y]=points[hi];return x+(y-x)*(time-a)/(b-a);
}
export function getDuckingEnvelope(segment, { strict = false } = {}) {
  if (!normalizeAutoDuck(segment?.autoDuck).enabled) return null;
  const entry = entries.get(segment.id);
  if (entry?.status === 'ready') return entry.points;
  if(strict) throw Object.assign(new Error('Audio ducking analysis is not ready'),{code:entry?.status==='error'?'DUCKING_FAILED':'DUCKING_NOT_READY'});
  return null;
}
export const getAutoDuckGain = (segment,time) => gainAtEnvelope(getDuckingEnvelope(segment),time);

export function scheduleDuckingGain(gain, points, timelineStart, outputStart, duration) {
  gain.setValueAtTime(gainAtEnvelope(points,timelineStart),outputStart);
  for(const [time,value] of points || []) if(time>timelineStart && time<timelineStart+duration) gain.linearRampToValueAtTime(value,outputStart+time-timelineStart);
  gain.linearRampToValueAtTime(gainAtEnvelope(points,timelineStart+duration),outputStart+duration);
}
