export const DEFAULT_TRACK_VISIBILITY = Object.freeze({
  effects: true,
  image: true,
  overlay: true,
  caption: true,
  sticker: true,
  source: true,
  audio: true,
  music: true,
});

export const DEFAULT_TRACK_LOCKS = Object.freeze({
  effects: false,
  image: false,
  overlay: false,
  caption: false,
  sticker: false,
  source: false,
  audio: false,
  music: false,
});

function isTrackState(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeTrackVisibility(value) {
  return { ...DEFAULT_TRACK_VISIBILITY, ...(isTrackState(value) ? value : {}) };
}

export function normalizeTrackLocks(value) {
  return { ...DEFAULT_TRACK_LOCKS, ...(isTrackState(value) ? value : {}) };
}
