export const healthyPortraitFrame = Float32Array.from(
  { length: 768 },
  (_, index) => 0.18 + ((index * 37) % 101) / 160,
);

export const flatCorruptFrame = new Float32Array(768).fill(0.5);

export const nonFiniteCorruptFrame = (() => {
  const frame = new Float32Array(768).fill(0.4);
  frame[256] = Number.NaN;
  return frame;
})();

export const extremeCorruptFrame = (() => {
  const frame = Float32Array.from(healthyPortraitFrame);
  frame[256] = 32;
  return frame;
})();
