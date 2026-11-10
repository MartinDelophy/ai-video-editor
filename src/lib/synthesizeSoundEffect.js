const TAU = 2 * Math.PI;
export const SOUND_EFFECT_SAMPLE_RATE = 48000;

export const SOUND_EFFECTS = [
  { id: "soft-sweep", duration: 0.62 },
  { id: "rising-whoosh", duration: 0.90 },
  { id: "bass-hit", duration: 0.48 },
  { id: "punch-hit", duration: 0.27 },
  { id: "film-shutter", duration: 0.22 },
  { id: "digital-shutter", duration: 0.15 },
  { id: "soft-tap", duration: 0.12 },
  { id: "confirm-chime", duration: 0.38 },
];

const pulse = (time, decay) => time < 0 ? 0 : Math.min(1, time * 700) * Math.exp(-time * decay);
const tone = (hz, time) => Math.sin(TAU * hz * time);

export function synthesizeSoundEffect(index) {
  const { duration } = SOUND_EFFECTS[index];
  const rate = SOUND_EFFECT_SAMPLE_RATE;
  const samples = new Float32Array(Math.round(duration * rate));
  let seed = 189221 + index;
  let low = 0;
  let band = 0;
  let phase = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const time = i / rate;
    const progress = time / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0x80000000 - 1;
    low += (noise - low) * 0.085;
    let value;
    switch (index) {
      case 0:
      case 1: {
        const rising = index === 1;
        const envelope = rising ? progress ** 2.3 * (1 - progress) ** 0.46 : Math.sin(Math.PI * progress) ** 1.55;
        band += (noise - band) * (rising ? 0.018 + progress ** 2 * 0.36 : 0.09 + Math.sin(Math.PI * progress) * 0.18);
        phase += TAU * (rising ? 90 + 540 * progress ** 2 : 210 - 105 * progress) / rate;
        value = envelope * (1.8 * (band - low * 0.60) + Math.sin(phase) * 0.085);
        break;
      }
      case 2:
      case 3: {
        const bass = index === 2;
        phase += TAU * (bass ? 48 + 92 * Math.exp(-time * 32) : 106 + 180 * Math.exp(-time * 72)) / rate;
        const body = Math.sin(phase) * pulse(time, bass ? 11 : 25);
        const strike = (noise - low * 0.66) * pulse(time, bass ? 80 : 66);
        value = (bass ? 0.80 : 0.58) * body + (bass ? 0.25 : 0.48) * strike;
        break;
      }
      case 4:
      case 5: {
        const film = index === 4;
        const release = time - (film ? 0.067 : 0.028);
        const mechanism = (noise - low * 0.68) * (pulse(time, 92) + (film ? 0.76 : 0.48) * pulse(release, 112));
        value = 0.72 * mechanism + (film ? tone(410, time) * pulse(time, 58) * 0.33 : tone(1540, release) * pulse(release, 78) * 0.27);
        break;
      }
      case 6:
        value = (tone(540, time) + 0.35 * tone(1008, time) + low * 0.48) * pulse(time, 68);
        break;
      default: {
        const second = time - 0.057;
        value = (tone(659.25, time) + 0.13 * tone(1318.5, time)) * pulse(time, 24)
          + (tone(987.77, second) + 0.10 * tone(1975.54, second)) * pulse(second, 19) * 0.78;
      }
    }
    samples[i] = value * Math.min(1, (duration - time) / 0.018);
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const gain = (index === 2 ? 0.86 : 0.72) / peak;
  return samples.map((sample) => sample * gain);
}
