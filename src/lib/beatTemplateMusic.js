const SAMPLE_RATE = 32_000;
const TAU = 2 * Math.PI;
const CHORDS = [
  { bass: 33, tones: [57, 60, 64, 71] },
  { bass: 29, tones: [57, 60, 64, 69] },
  { bass: 36, tones: [55, 59, 64, 67] },
  { bass: 31, tones: [55, 57, 62, 67] },
];
const pitch = (note) => 440 * 2 ** ((note - 69) / 12);

// Original instrumental. All transients use the composition's clock; the
// score is rendered at the selected tempo so the instruments keep their pitch.
export function renderBeatTemplateMusic({ bpm, duration, start, markers }) {
  const length = Math.ceil(duration * SAMPLE_RATE);
  const channels = [new Float32Array(length), new Float32Array(length)];
  const [left, right] = channels;
  const quarter = 60 / bpm;
  const firstBeat = (markers.find(({ color }) => color === "violet")?.time ?? start) - start;
  let seed = 0x7153a4d2;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x80000000 - 1;
  };
  const mix = (time, seconds, gain, pan, voice) => {
    const offset = Math.max(0, Math.round(time * SAMPLE_RATE));
    const count = Math.min(length - offset, Math.round(seconds * SAMPLE_RATE));
    const l = gain * (1 - pan), r = gain * (1 + pan);
    for (let i = 0; i < count; i++) {
      const sample = voice(i / SAMPLE_RATE);
      left[offset + i] += l * sample;
      right[offset + i] += r * sample;
    }
  };
  const pluck = (time, note, gain, pan, decay = 0.17) => {
    const frequency = pitch(note) * TAU;
    mix(time, decay * 4, gain, pan, (t) => {
      const envelope = Math.min(1, t / 0.003) * Math.exp(-t / decay);
      return envelope * (Math.sin(frequency * t) + 0.24 * Math.sin(frequency * 2.01 * t) * Math.exp(-t * 18));
    });
  };
  const kick = (time, gain) => mix(time, 0.22, gain, 0, (t) => (
    Math.sin(TAU * (49 * t + 1.6 * (1 - Math.exp(-t * 44))))
      * Math.min(1, t / 0.0025) * Math.exp(-t * 20)
  ));
  const percussion = (time, gain, seconds, pan, body = 0) => {
    let previous = 0;
    mix(time, seconds, gain, pan, (t) => {
      const raw = noise();
      const high = (raw - previous) * 0.52;
      previous = raw;
      const tone = body ? Math.sin(TAU * body * t) * 0.4 * Math.exp(-t * 25) : 0;
      return (high + tone) * Math.min(1, t / 0.0015) * Math.exp(-t * 4.8 / seconds);
    });
  };

  pluck(0.04, 76, 0.095, -0.15, quarter * 0.45);
  pluck(firstBeat * 0.55, 71, 0.065, 0.18, quarter * 0.35);
  for (let beat = 0; firstBeat + beat * quarter < duration; beat++) {
    const time = firstBeat + beat * quarter;
    const bar = Math.floor(beat / 4);
    const chord = CHORDS[bar % CHORDS.length];
    const step = beat % 4;
    const dense = bar >= 4 && bar < 8;
    if (step === 0) {
      chord.tones.slice(0, 3).forEach((note, i) => {
        const f = pitch(note) * TAU;
        const hold = 4 * quarter;
        mix(time, hold, 0.047, (i - 1) * 0.3, (t) => {
          const envelope = Math.min(1, t / 0.15, (hold - t) / 0.38);
          return envelope * (Math.sin(f * t) + 0.18 * Math.sin(f * 1.006 * t));
        });
      });
    }
    if (bar < 8) {
      if (step === 0 || step === 2 || dense) kick(time, step === 0 ? 0.46 : 0.28);
      if (step === 1 || step === 3) percussion(time, 0.19, 0.15, 0.06, 171);
      percussion(time + quarter / 2, dense ? 0.10 : 0.075, 0.05, step % 2 ? 0.26 : -0.22);
      pluck(time + quarter * 0.05, chord.bass + (step === 3 ? 12 : 0), 0.15, 0, quarter * 0.38);
    }
    pluck(time + quarter * 0.075, chord.tones[[0, 2, 1, 3][step]] + 12, 0.105, step % 2 ? 0.24 : -0.21);
    if (dense || step === 2) pluck(time + quarter / 2, chord.tones[(step + 2) % 4] + 12, 0.06, 0.26);
  }

  let panel = 0;
  for (const marker of markers) {
    const time = marker.time - start;
    if (marker.color === "violet") {
      panel = 0;
      pluck(time, 76, 0.16, 0, 0.19);
    } else if (marker.color === "cyan") {
      const entry = panel++ % 3;
      percussion(time, 0.22, 0.13, [0.32, -0.32, 0][entry], [255, 204, 320][entry]);
      pluck(time, [79, 76, 84][entry], 0.115, [0.28, -0.28, 0][entry], 0.13);
    } else if (marker.color === "rose") {
      percussion(time, 0.28, 0.29, 0, 233);
      pluck(time, 84, 0.13, 0.13, 0.19);
    } else if (marker.color === "amber") {
      percussion(time, 0.14, 0.12, 0, 146);
    }
  }

  let peak = 0;
  const release = SAMPLE_RATE * Math.min(0.44, quarter * 0.7);
  for (let i = 0; i < length; i++) {
    const fade = Math.min(1, (length - 1 - i) / release);
    left[i] *= fade;
    right[i] *= fade;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const gain = 0.84 / Math.max(0.01, peak);
  for (const channel of channels) {
    for (let i = 0; i < length; i++) channel[i] *= gain;
  }
  return { length, duration, sampleRate: SAMPLE_RATE, numberOfChannels: channels.length, getChannelData: (i) => channels[i] };
}
