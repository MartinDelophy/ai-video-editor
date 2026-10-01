// Decode in bounded chunks without retaining the full video's PCM. Split clips
// share the same promise, and only one background decoder runs at a time.
const cache = new WeakMap();
let queue = Promise.resolve();

export function getVideoAudioWaveform(blob) {
  if (!(blob instanceof Blob)) return Promise.resolve(null);
  if (cache.has(blob)) return cache.get(blob);
  const result = queue.then(async () => {
    const { Input, BlobSource, ALL_FORMATS, AudioBufferSink } = await import("mediabunny");
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !await track.canDecode()) return null;
      const duration = await input.computeDuration();
      if (!(duration > 0)) return null;
      const peaks = new Float32Array(Math.min(8192, Math.max(256, Math.ceil(duration * 24))));
      const sink = new AudioBufferSink(track);
      for await (const { buffer, timestamp } of sink.buffers()) {
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
          const samples = buffer.getChannelData(channel);
          for (let i = 0; i < samples.length; i += 4) {
            const index = Math.floor((timestamp + i / buffer.sampleRate) / duration * peaks.length);
            if (index >= 0 && index < peaks.length) peaks[index] = Math.max(peaks[index], Math.abs(samples[i]));
          }
        }
      }
      return { peaks, duration };
    } finally { input.dispose(); }
  }).catch(() => null);
  cache.set(blob, result);
  queue = result.then(() => {});
  return result;
}
