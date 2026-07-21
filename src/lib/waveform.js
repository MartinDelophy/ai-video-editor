const FALLBACK_WAVEFORM_PEAKS = Array.from({ length: 48 }, (_, index) => {
  const envelope = 0.45 + 0.35 * Math.sin((index / 47) * Math.PI);
  const texture = 0.35 + 0.65 * Math.abs(Math.sin(index * 1.73 + 0.4));
  return Math.max(0.12, Math.min(0.88, envelope * texture));
});

export function getWaveformDisplayPeaks(peaks) {
  if (Array.isArray(peaks) && peaks.length) return peaks;
  return FALLBACK_WAVEFORM_PEAKS;
}

export function isWaveformPlaceholder(peaks) {
  return !Array.isArray(peaks) || peaks.length === 0;
}
