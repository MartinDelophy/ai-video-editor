import { describe, expect, it } from "vitest";

import { encodeLibavAudioFramesAsWav } from "./libavAudio.js";

describe("libav audio WAV encoding", () => {
  it("interleaves planar float samples into PCM16 WAV", () => {
    const result = encodeLibavAudioFramesAsWav([
      {
        channels: 2,
        sample_rate: 48000,
        nb_samples: 2,
        format: 8,
        data: [new Float32Array([-1, 0.5]), new Float32Array([1, -0.5])],
      },
    ]);
    const view = new DataView(result.buffer);
    expect(String.fromCharCode(...new Uint8Array(result.buffer, 0, 4))).toBe("RIFF");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect([...Array(4)].map((_, index) => view.getInt16(44 + index * 2, true))).toEqual([
      -32768, 32767, 16383, -16384,
    ]);
  });

  it("converts packed signed 16-bit samples without changing channel order", () => {
    const result = encodeLibavAudioFramesAsWav([
      {
        channels: 2,
        sample_rate: 44100,
        nb_samples: 1,
        format: 1,
        data: new Int16Array([8192, -8192]),
      },
    ]);
    const view = new DataView(result.buffer);
    expect(view.getInt16(44, true)).toBe(8191);
    expect(view.getInt16(46, true)).toBe(-8192);
    expect(result.duration).toBeCloseTo(1 / 44100);
  });
});
