import { describe, expect, it } from "vitest";

import { timeStretchChannelData } from "./pitchPreservingTimeStretch.js";

function makeSine(frequency, duration, sampleRate = 48_000) {
  return Float32Array.from({ length: Math.round(duration * sampleRate) }, (_, index) =>
    Math.sin(2 * Math.PI * frequency * index / sampleRate));
}

function estimateFrequency(samples, sampleRate = 48_000) {
  const start = Math.floor(samples.length * 0.2);
  const end = Math.floor(samples.length * 0.8);
  let crossings = 0;
  for (let index = start + 1; index < end; index += 1) {
    if (samples[index - 1] <= 0 && samples[index] > 0) crossings += 1;
  }
  return crossings / ((end - start) / sampleRate);
}

describe("pitch-preserving time stretch", () => {
  it.each([0.5, 2])("changes duration at %sx while retaining a 440 Hz tone", (rate) => {
    const source = makeSine(440, 2);
    const stretched = timeStretchChannelData(source, rate);

    expect(stretched.length).toBeCloseTo(source.length / rate, 0);
    expect(estimateFrequency(stretched)).toBeGreaterThan(420);
    expect(estimateFrequency(stretched)).toBeLessThan(460);
  });
});
