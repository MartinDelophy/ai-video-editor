// File-track recognition is a separate capability from microphone dictation.
// Chrome desktop added start(audioTrack) in 135; never fall back to start().
export function supportsFileSpeech(scope = globalThis) {
  const ua = scope.navigator?.userAgent || "";
  const version = /(?:Chrome|Chromium)\/(\d+)/.exec(ua);
  return Boolean(scope.isSecureContext && version && Number(version[1]) >= 135 && !/Android|Mobile|iPhone|iPad/.test(ua)
    && typeof (scope.SpeechRecognition || scope.webkitSpeechRecognition) === "function"
    && typeof (scope.AudioContext || scope.webkitAudioContext)?.prototype?.createMediaStreamDestination === "function");
}
const fail = code => Object.assign(new Error(code), { code });
const check = signal => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };

// Bound subtitle ranges with measured silence, never recognition-event timestamps.
export function speechRanges(buffer) {
  const step = Math.max(1, Math.round(buffer.sampleRate * 0.02));
  const energy = [];
  for (let start = 0; start < buffer.length; start += step) {
    let sum = 0, count = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const samples = buffer.getChannelData(c);
      for (let i = start; i < Math.min(buffer.length, start + step); i++) { sum += samples[i] ** 2; count++; }
    }
    energy.push(Math.sqrt(sum / Math.max(1, count)));
  }
  const peak = energy.reduce((maximum, value) => Math.max(maximum, value), 0);
  const threshold = Math.max(0.002, peak * 0.04);
  const runs = []; let first = null, last = 0;
  for (let i = 0; i < energy.length; i++) {
    if (energy[i] >= threshold) { if (first === null) first = i; last = i; }
    if (first !== null && (i - last >= 25 || i === energy.length - 1)) {
      runs.push([Math.max(0, first * 0.02 - 0.12), Math.min(buffer.duration, (last + 1) * 0.02 + 0.15)]); first = null;
    }
  }
  return runs.flatMap(([start, end]) => {
    const ranges = []; while (end - start > 10) {
      // Select a low-energy boundary around 7–10 seconds. Timing remains approximate.
      let cut = start + 8, minimum = Infinity;
      for (let i = Math.floor((start + 7) / 0.02); i < Math.min(energy.length, Math.floor((start + 10) / 0.02)); i++) {
        if (energy[i] < minimum) { minimum = energy[i]; cut = i * 0.02; }
      }
      ranges.push({ start, end: cut }); start = cut;
    }
    ranges.push({ start, end }); return ranges;
  });
}

function recognizeRange(context, buffer, range, language, signal) {
  return new Promise((resolve, reject) => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition(); const destination = context.createMediaStreamDestination();
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination);
    let timer, ended = false, played = false; let results = [];
    const finish = error => {
      if (ended) return; ended = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
      recognition.onend = recognition.onerror = recognition.onresult = recognition.onstart = null;
      source.onended = null;
      try { recognition.abort(); } catch { /* already ended */ }
      try { source.stop(); } catch { /* not started */ }
      source.disconnect(); destination.stream.getTracks().forEach(track => track.stop());
      const text = results.filter(result => result.final).map(result => result.text).join(" ").trim();
      error ? reject(error) : text ? resolve(text) : reject(fail("empty"));
    };
    const abort = () => finish(new DOMException("Cancelled", "AbortError"));
    recognition.lang = language; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = event => { results = Array.from(event.results, result => ({ final: result.isFinal, text: result[0]?.transcript || "" })); };
    recognition.onerror = event => finish(fail(event.error));
    recognition.onend = () => finish(played ? null : fail("interrupted"));
    recognition.onstart = () => source.start(context.currentTime + 0.3, range.start, range.end - range.start);
    source.onended = () => { played = true; clearTimeout(timer); timer = setTimeout(() => { try { recognition.stop(); } catch { finish(fail("interrupted")); } timer = setTimeout(() => finish(fail("timeout")), 5000); }, 2000); };
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => finish(fail("timeout")), (range.end - range.start + 20) * 1000);
    try { check(signal); recognition.start(destination.stream.getAudioTracks()[0]); } catch (error) { finish(error); }
  });
}

export async function transcribeBrowserFile(blob, { language = "zh-CN", offset = 0, signal, onProgress, context, sourceStart = 0, sourceDuration } = {}) {
  if (!supportsFileSpeech()) throw fail("unsupported");
  const ctx = context || new (window.AudioContext || window.webkitAudioContext)();
  try {
    check(signal); await ctx.resume();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer()); check(signal);
    const start = Math.max(0, Math.min(decoded.duration, sourceStart));
    const duration = Math.min(decoded.duration - start, sourceDuration ?? decoded.duration);
    if (!(duration > 0)) throw fail("empty");
    const first = Math.floor(start * decoded.sampleRate);
    const length = Math.min(decoded.length - first, Math.round(duration * decoded.sampleRate));
    const buffer = start === 0 && length === decoded.length ? decoded : ctx.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
    if (buffer !== decoded) for (let channel = 0; channel < decoded.numberOfChannels; channel++) buffer.copyToChannel(decoded.getChannelData(channel).subarray(first, first + length), channel);
    if (buffer.duration > 1800) throw fail("too-long");
    const ranges = speechRanges(buffer); if (!ranges.length) throw fail("empty");
    const segments = [];
    for (let i = 0; i < ranges.length; i++) {
      check(signal); onProgress?.(i / ranges.length);
      try {
        const text = await recognizeRange(ctx, buffer, ranges[i], language, signal);
        segments.push({ id: `browser-caption-${crypto.randomUUID()}`, start: offset + ranges[i].start, end: offset + ranges[i].end, text, hidden: false });
      } catch (error) {
        // Music, silence and non-speech may occupy a detected energy range.
        // Skip only empty recognition; network, permission and cancellation still fail atomically.
        if (!["empty", "no-speech"].includes(error.code)) throw error;
      }
      onProgress?.((i + 1) / ranges.length);
    }
    if (!segments.length) throw fail("empty");
    return segments;
  } finally { await ctx.close().catch(() => {}); }
}
