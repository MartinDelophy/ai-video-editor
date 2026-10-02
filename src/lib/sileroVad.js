// Decode only bounded source windows. Neither the complete movie nor its full
// decoded audio is copied into memory; the inference worker owns recurrent state.
export async function analyzeVideoPauses(clip, { language, signal, onProgress }) {
  const worker = new Worker(new URL("../workers/sileroVad.worker.js", import.meta.url), { type: "module" });
  let serial = 0;
  let input;
  const pending = new Map();
  const abortError = () => new DOMException("Aborted", "AbortError");
  const stop = () => {
    worker.terminate();
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(abortError()); }
    pending.clear(); input?.dispose();
  };
  signal.addEventListener("abort", stop, { once: true });
  worker.onmessage = ({ data }) => {
    const task = pending.get(data.id);
    if (!task) return;
    if (data.type === "phase") return task.progress?.(0, data.phase);
    if (data.type === "progress") return task.progress?.(data.progress, "pauseAnalyzing");
    pending.delete(data.id); clearTimeout(task.timer);
    if (data.type === "error") task.reject(Object.assign(new Error(data.code), { code: data.code }));
    else task.resolve(data);
  };
  worker.onerror = () => {
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(Object.assign(new Error(), { code: "pauseModelFailed" })); }
    pending.clear();
  };
  const call = (data, progress, transfer = []) => new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id); reject(Object.assign(new Error(), { code: "pauseModelFailed" }));
    }, 180000);
    pending.set(id, { resolve, reject, progress, timer });
    worker.postMessage({ ...data, id }, transfer);
  });
  try {
    signal.throwIfAborted();
    onProgress(0, "pauseDownloading");
    await call({ type: "init", language }, (_value, phase) => onProgress(0, phase));
    const { Input, BlobSource, UrlSource, ALL_FORMATS, AudioBufferSink } = await import("mediabunny");
    input = new Input({ source: clip.blob instanceof Blob ? new BlobSource(clip.blob) : new UrlSource(clip.src), formats: ALL_FORMATS });
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw Object.assign(new Error(), { code: "pauseNoAudio" });
    if (!(await track.canDecode())) throw Object.assign(new Error(), { code: "pauseDecodeFailed" });
    // A valid movie can start before its audio or continue after its last
    // packet. Those source-time regions are silence, not decoder failures.
    // Use packet timestamps rather than the container's video duration.
    const [firstAudioTimestamp, audioEnd] = await Promise.all([track.getFirstTimestamp(), track.computeDuration()]);
    if (!Number.isFinite(firstAudioTimestamp) || !Number.isFinite(audioEnd) || audioEnd < firstAudioTimestamp) {
      throw Object.assign(new Error(), { code: "pauseDecodeFailed" });
    }
    const audioStart = Math.max(0, firstAudioTimestamp);
    const sink = new AudioBufferSink(track);
    const start = Number(clip.sourceStart) || 0;
    const duration = Number(clip.duration) * (Number(clip.playbackRate) || 1);
    const chunks = [];
    const chunkSeconds = 16.384; // 512 complete VAD frames: no padding between windows.
    for (let offset = 0; offset < duration - 0.000001; offset += chunkSeconds) {
      signal.throwIfAborted();
      const length = Math.min(chunkSeconds, duration - offset);
      const from = start + offset;
      const to = from + length;
      onProgress(offset / duration, "pauseDecoding");
      let buffer;
      let coverage = 0;
      const decodeFrom = Math.max(from, audioStart);
      const decodeTo = Math.min(to, audioEnd);
      const expectedCoverage = Math.max(0, decodeTo - decodeFrom);
      let coveredUntil = decodeFrom;
      const consume = (item) => {
        if (!item) return;
        const audio = item.buffer;
        if (!buffer) buffer = new AudioBuffer({ numberOfChannels: 1, length: Math.ceil(length * audio.sampleRate), sampleRate: audio.sampleRate });
        const left = Math.max(decodeFrom, item.timestamp);
        const right = Math.min(decodeTo, item.timestamp + audio.duration);
        if (right <= left) return;
        // getBuffer() and buffers() may return the same packet. Count each
        // decoded interval once so duplicates cannot hide a missing region.
        coverage += Math.max(0, right - Math.max(left, coveredUntil));
        coveredUntil = Math.max(coveredUntil, right);
        const sourceOffset = Math.max(0, Math.round((left - item.timestamp) * audio.sampleRate));
        const targetOffset = Math.max(0, Math.round((left - from) * audio.sampleRate));
        const frames = Math.min(Math.round((right - left) * audio.sampleRate), audio.length - sourceOffset, buffer.length - targetOffset);
        const out = buffer.getChannelData(0);
        // Assign, not accumulate: the initial getBuffer may also be yielded by buffers().
        for (let i = 0; i < frames; i++) {
          let sum = 0;
          for (let channel = 0; channel < audio.numberOfChannels; channel++) sum += audio.getChannelData(channel)[sourceOffset + i];
          out[targetOffset + i] = sum / audio.numberOfChannels;
        }
      };
      if (expectedCoverage > 0) {
        consume(await sink.getBuffer(decodeFrom));
        for await (const item of sink.buffers(decodeFrom, decodeTo)) { signal.throwIfAborted(); consume(item); }
        if (!buffer || coverage < expectedCoverage - 0.1) throw Object.assign(new Error(), { code: "pauseDecodeFailed" });
      }
      // Keep the complete video-window clock, including legitimate silence at
      // either end. Never compress the audio-only portion before detection.
      let pcm = new Float32Array(Math.round(length * 16000));
      if (buffer) {
        const offline = new OfflineAudioContext(1, pcm.length, 16000);
        const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination); source.start();
        const resampled = await offline.startRendering();
        pcm = resampled.getChannelData(0).slice();
      }
      signal.throwIfAborted();
      const result = await call({ type: "infer", pcm }, (value) => onProgress((offset + length * value) / duration, "pauseAnalyzing"), [pcm.buffer]);
      chunks.push(result.probabilities);
    }
    const probabilities = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) { probabilities.set(chunk, offset); offset += chunk.length; }
    return probabilities;
  } finally {
    signal.removeEventListener("abort", stop);
    for (const task of pending.values()) clearTimeout(task.timer);
    stop();
  }
}
