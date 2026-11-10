export const AUDIO_FADE_FIELDS = ["fadeIn", "fadeOut"];

export function getAudioFadeControl(segment, field) {
  const duration = Math.max(0, Number(segment.duration) || 0);
  const value = Math.min(duration, Math.max(0, Number(segment[field]) || 0));
  const digits = duration < 0.1 ? 3 : 2;
  const step = 10 ** -digits;
  const normalMax = Math.floor(Math.min(3, duration / 2) / step + 1e-8) * step;
  // Older projects and agent edits can already contain longer fades.
  return { value, max: Math.max(value, normalMax), step, digits };
}

export function formatAudioFadeDuration(value, digits, language) {
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: "second",
    unitDisplay: "narrow",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
