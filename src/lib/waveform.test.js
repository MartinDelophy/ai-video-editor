import { describe, expect, it } from "vitest";

import { getWaveformDisplayPeaks, isWaveformPlaceholder } from "./waveform.js";

describe("timeline waveform display", () => {
  it("preserves decoded peaks", () => {
    const peaks = [0.2, 0.8, 0.4];
    expect(getWaveformDisplayPeaks(peaks)).toBe(peaks);
    expect(isWaveformPlaceholder(peaks)).toBe(false);
  });

  it("provides a stable visible fallback while peaks are unavailable", () => {
    const first = getWaveformDisplayPeaks([]);
    const second = getWaveformDisplayPeaks(null);
    expect(first).toEqual(second);
    expect(first).toHaveLength(48);
    expect(Math.min(...first)).toBeGreaterThan(0);
    expect(isWaveformPlaceholder([])).toBe(true);
  });
});
