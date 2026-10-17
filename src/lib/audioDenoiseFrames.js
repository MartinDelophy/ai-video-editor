// All engines receive normalized PCM; RNNoise's C ABI uses 16-bit PCM units.
// Flush the lookahead and remove its measured delay without changing length.
export async function denoisePcmChannel(
  pcm,
  engine,
  { rnnoise = false, delay = 0, strength = 1, onProgress = () => {} } = {},
) {
  const length = pcm.length,
    frameSize = 480;
  for (
    let offset = 0;
    offset < Math.ceil((length + delay) / frameSize) * frameSize;
    offset += frameSize
  ) {
    const frame = new Float32Array(frameSize);
    frame.set(pcm.subarray(offset, Math.min(length, offset + frameSize)));
    let out;
    if (rnnoise) {
      for (let i = 0; i < frameSize; i++) frame[i] *= 32768;
      engine.processFrame(frame);
      for (let i = 0; i < frameSize; i++) frame[i] /= 32768;
      out = frame;
    } else out = engine.process(frame);
    if (!(out instanceof Float32Array) || out.length !== frameSize) throw Error("INVALID_OUTPUT");
    for (let i = 0; i < frameSize; i++) {
      const target = offset + i - delay;
      if (target < 0 || target >= length) continue;
      const wet = out[i];
      if (!Number.isFinite(wet)) throw Error("INVALID_OUTPUT");
      pcm[target] = pcm[target] * (1 - strength) + wet * strength;
    }
    if (offset % 24000 === 0) {
      onProgress(Math.min(1, offset / Math.max(1, length)));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  onProgress(1);
  return pcm;
}
