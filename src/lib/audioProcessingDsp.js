const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
export function normalizeAudioProcessing(value = {}) {
  value = value || {};
  return {
    ...( ["gentle","natural","strong"].includes(value.speechEnhancement) ? {speechEnhancement:value.speechEnhancement} : {} ),
    engine: ["rnnoise", "deepfilter"].includes(value.engine) ? value.engine : "off",
    strength: value.strength == null ? 0.75 : clamp(value.strength, 0, 1),
    eq: {
      enabled: value.eq?.enabled === true,
      low: clamp(value.eq?.low, -12, 12),
      mid: clamp(value.eq?.mid, -12, 12),
      high: clamp(value.eq?.high, -12, 12),
    },
    compressor: {
      enabled: value.compressor?.enabled === true,
      threshold:
        value.compressor?.threshold == null ? -24 : clamp(value.compressor.threshold, -60, 0),
      ratio: value.compressor?.ratio == null ? 3 : clamp(value.compressor.ratio, 1, 12),
      attack: value.compressor?.attack == null ? 10 : clamp(value.compressor.attack, 1, 100),
      release: value.compressor?.release == null ? 150 : clamp(value.compressor.release, 20, 1000),
    },
    loudness: {
      enabled: value.loudness?.enabled === true,
      gain: clamp(value.loudness?.gain, -18, 18),
    },
    limiter: {
      enabled: value.limiter?.enabled === true,
      ceiling: value.limiter?.ceiling == null ? -1 : clamp(value.limiter.ceiling, -12, 0),
    },
  };
}
function coefficients(kind, frequency, db, sampleRate) {
  const a = 10 ** (db / 40),
    w = (2 * Math.PI * frequency) / sampleRate,
    c = Math.cos(w),
    s = Math.sin(w),
    alpha = s / Math.SQRT2,
    beta = 2 * Math.sqrt(a) * alpha;
  let b0, b1, b2, a0, a1, a2;
  if (kind === "low") {
    b0 = a * (a + 1 - (a - 1) * c + beta);
    b1 = 2 * a * (a - 1 - (a + 1) * c);
    b2 = a * (a + 1 - (a - 1) * c - beta);
    a0 = a + 1 + (a - 1) * c + beta;
    a1 = -2 * (a - 1 + (a + 1) * c);
    a2 = a + 1 + (a - 1) * c - beta;
  } else if (kind === "high") {
    b0 = a * (a + 1 + (a - 1) * c + beta);
    b1 = -2 * a * (a - 1 + (a + 1) * c);
    b2 = a * (a + 1 + (a - 1) * c - beta);
    a0 = a + 1 - (a - 1) * c + beta;
    a1 = 2 * (a - 1 - (a + 1) * c);
    a2 = a + 1 - (a - 1) * c - beta;
  } else {
    b0 = 1 + alpha * a;
    b1 = -2 * c;
    b2 = 1 - alpha * a;
    a0 = 1 + alpha / a;
    a1 = -2 * c;
    a2 = 1 - alpha / a;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
// The inspector plots the exact same biquads used by the PCM processor.
export function audioEqResponse(eq, frequency, sampleRate = 48000) {
  let magnitude = 1;
  for (const [kind, hz, gain] of [
    ["low", 120, eq.low],
    ["mid", 2500, eq.mid],
    ["high", 8000, eq.high],
  ]) {
    const [b0, b1, b2, a1, a2] = coefficients(kind, hz, gain, sampleRate);
    const w = (2 * Math.PI * frequency) / sampleRate;
    const real = b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w),
      imaginary = -b1 * Math.sin(w) - b2 * Math.sin(2 * w);
    const denominatorReal = 1 + a1 * Math.cos(w) + a2 * Math.cos(2 * w),
      denominatorImaginary = -a1 * Math.sin(w) - a2 * Math.sin(2 * w);
    magnitude *= Math.sqrt(
      (real * real + imaginary * imaginary) /
        (denominatorReal * denominatorReal + denominatorImaginary * denominatorImaginary),
    );
  }
  return 20 * Math.log10(Math.max(1e-9, magnitude));
}
const checkpoint = () => new Promise((resolve) => setTimeout(resolve, 0));

// One PCM pipeline produces the committed file used by both preview and export.
// The offline limiter reads ahead without delaying the resulting waveform.
export async function processAudioDsp(channels, options, sampleRate = 48000, progress = () => {}) {
  const p = normalizeAudioProcessing(options),
    length = channels[0]?.length || 0;
  const filters = p.eq.enabled
    ? [
        ["low", 120, p.eq.low],
        ["mid", 2500, p.eq.mid],
        ["high", 8000, p.eq.high],
      ]
        .filter(([, , db]) => db)
        .map(([kind, hz, db]) => coefficients(kind, hz, db, sampleRate))
    : [];
  const states = channels.map(() => filters.map(() => [0, 0]));
  const attack = Math.exp(-1 / ((p.compressor.attack / 1000) * sampleRate)),
    release = Math.exp(-1 / ((p.compressor.release / 1000) * sampleRate));
  const makeup = p.loudness.enabled ? 10 ** (p.loudness.gain / 20) : 1;
  let envelope = 0;
  for (let i = 0; i < length; i++) {
    let peak = 0;
    for (let ch = 0; ch < channels.length; ch++) {
      let x = channels[ch][i];
      for (let f = 0; f < filters.length; f++) {
        const [b0, b1, b2, a1, a2] = filters[f],
          state = states[ch][f];
        const y = b0 * x + state[0];
        state[0] = b1 * x - a1 * y + state[1];
        state[1] = b2 * x - a2 * y;
        x = y;
      }
      channels[ch][i] = x;
      peak = Math.max(peak, Math.abs(x));
    }
    const smooth = peak > envelope ? attack : release;
    envelope = smooth * envelope + (1 - smooth) * peak;
    const db = 20 * Math.log10(Math.max(1e-9, envelope));
    const reduction = p.compressor.enabled
      ? Math.max(0, db - p.compressor.threshold) * (1 - 1 / p.compressor.ratio)
      : 0;
    const gain = makeup * 10 ** (-reduction / 20);
    for (const ch of channels) ch[i] *= gain;
    if (i % 48000 === 0) {
      progress((i / Math.max(1, length)) * 0.75);
      await checkpoint();
    }
  }
  if (p.limiter.enabled) {
    const ceiling = 10 ** (p.limiter.ceiling / 20),
      lookahead = Math.ceil(sampleRate * 0.005),
      size = lookahead + 2;
    const indices = new Int32Array(size),
      values = new Float32Array(size);
    let head = 0,
      tail = 0,
      gain = 1;
    const add = (index) => {
      let peak = 0;
      for (const ch of channels) peak = Math.max(peak, Math.abs(ch[index]));
      while (tail !== head && values[(tail - 1 + size) % size] <= peak)
        tail = (tail - 1 + size) % size;
      indices[tail] = index;
      values[tail] = peak;
      tail = (tail + 1) % size;
    };
    for (let j = 0; j < Math.min(length, lookahead + 1); j++) add(j);
    const recovery = Math.exp(-1 / (0.08 * sampleRate));
    for (let i = 0; i < length; i++) {
      while (head !== tail && indices[head] < i) head = (head + 1) % size;
      const target = Math.min(1, ceiling / Math.max(ceiling, values[head]));
      gain = target < gain ? target : recovery * gain + (1 - recovery) * target;
      for (const ch of channels) ch[i] = Math.max(-ceiling, Math.min(ceiling, ch[i] * gain));
      if (i + lookahead + 1 < length) add(i + lookahead + 1);
      if (i % 48000 === 0) {
        progress(0.75 + (i / Math.max(1, length)) * 0.25);
        await checkpoint();
      }
    }
  }
  progress(1);
  return channels;
}
