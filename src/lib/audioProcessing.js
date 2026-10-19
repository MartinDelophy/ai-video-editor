import { normalizeAudioProcessing } from "./audioProcessingDsp.js";
export function audioProcessingIdentity(segment) {
  return JSON.stringify([
    segment.id,
    segment.sourceStart,
    segment.sourceDuration,
    segment.duration,
    segment.playbackRate,
    segment.speedCurve,
    segment.reversed,
  ]);
}
export async function processAudioClip(
  segment,
  settings,
  { language, signal, onProgress = () => {} } = {},
) {
  const blob =
    segment.processingOriginalBlob instanceof Blob ? segment.processingOriginalBlob : segment.blob;
  if (!(blob instanceof Blob)) throw Error("AUDIO_MISSING");
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  const context = new Audio({ sampleRate: 48000 });
  let worker;
  try {
    signal?.throwIfAborted();
    onProgress({ phase: "decode", progress: 0 });
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    signal?.throwIfAborted();
    const start = Math.max(
        0,
        (segment.processingOriginalBlob instanceof Blob
          ? Number(segment.processingOriginal?.sourceStart) || 0
          : 0) + (Number(segment.sourceStart) || 0),
      ),
      duration = Math.min(
        audio.duration - start,
        Number(segment.sourceDuration) || segment.duration * (segment.playbackRate || 1),
      );
    if (!(duration > 0) || duration > 1800 || audio.numberOfChannels > 2)
      throw Error("AUDIO_RANGE");
    const first = Math.round(start * 48000),
      length = Math.max(1, Math.round(duration * 48000));
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
      audio.getChannelData(i).slice(first, first + length),
    );
    await context.close();
    worker = new Worker(new URL("../workers/audioProcessing.worker.js", import.meta.url), {
      type: "module",
    });
    const result = await new Promise((resolve, reject) => {
      const abort = () => {
        worker.terminate();
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      worker.onerror = () => {
        signal?.removeEventListener("abort", abort);
        reject(Error("AUDIO_PROCESSING_FAILED"));
      };
      worker.onmessage = ({ data }) => {
        if (data.phase) return onProgress(data);
        signal?.removeEventListener("abort", abort);
        data.type === "done" ? resolve(data) : reject(Error("AUDIO_PROCESSING_FAILED"));
      };
      if (signal?.aborted) return abort();
      worker.postMessage(
        { channels, settings: normalizeAudioProcessing(settings), language },
        channels.map((ch) => ch.buffer),
      );
    });
    signal?.throwIfAborted();
    const count = result.channels.length,
      frames = result.channels[0].length,
      bytes = new ArrayBuffer(44 + frames * count * 2),
      view = new DataView(bytes);
    const ascii = (offset, text) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };
    ascii(0, "RIFF");
    view.setUint32(4, bytes.byteLength - 8, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, count, true);
    view.setUint32(24, 48000, true);
    view.setUint32(28, 48000 * count * 2, true);
    view.setUint16(32, count * 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, frames * count * 2, true);
    const peaks = new Array(118).fill(0);
    for (let i = 0; i < frames; i++) {
      for (const channel of result.channels)
        peaks[Math.min(117, Math.floor((i / frames) * 118))] = Math.max(
          peaks[Math.min(117, Math.floor((i / frames) * 118))],
          Math.abs(channel[i]),
        );
      for (let ch = 0; ch < count; ch++) {
        const sample = Math.max(-1, Math.min(1, result.channels[ch][i]));
        view.setInt16(
          44 + (i * count + ch) * 2,
          sample < 0 ? sample * 32768 : sample * 32767,
          true,
        );
      }
      if (i % 48000 === 0) {
        signal?.throwIfAborted();
        onProgress({ phase: "encode", progress: i / frames });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    return {
      blob: new Blob([bytes], { type: "audio/wav" }),
      sourceDuration: frames / 48000,
      peak: result.peak,
      peaks,
      originalSourceStart: start,
      settings: normalizeAudioProcessing(settings),
    };
  } finally {
    worker?.terminate();
    if (context.state !== "closed") await context.close().catch(() => {});
  }
}

// Shared commits for the detailed processor and one-action speech enhancement.
export function audioProcessingResultPatch(segment, result, url) {
  return { blob:result.blob, url, sourceStart:0, sourceDuration:result.sourceDuration,
    peaks:result.peaks, audioProcessing:result.settings,
    processingOriginalBlob:segment.processingOriginalBlob instanceof Blob ? segment.processingOriginalBlob : segment.blob,
    processingOriginalPeaks:segment.processingOriginalPeaks || segment.peaks,
    processingOriginal:{sourceStart:result.originalSourceStart,sourceDuration:result.sourceDuration},
    processingRevision:crypto.randomUUID(),originalBlob:null,originalPeaks:null,reversed:false };
}
export function audioProcessingRestorePatch(segment, url) {
  return {blob:segment.processingOriginalBlob,url,
    sourceStart:(segment.processingOriginal?.sourceStart || 0)+(segment.sourceStart || 0),
    processingOriginalBlob:null,processingOriginal:null,audioProcessing:null,
    processingRevision:crypto.randomUUID(),peaks:segment.processingOriginalPeaks || [],processingOriginalPeaks:null};
}
export function speechEnhancementSettings(strength='natural') {
  const presets={gentle:[.4,-1,1,1,1.6,2],natural:[.65,-2,2,1.5,2.5,4],strong:[.85,-3,3,2,3,5]};
  const key=Object.hasOwn(presets,strength)?strength:'natural';
  const [amount,low,mid,high,ratio,gain]=presets[key];
  return normalizeAudioProcessing({speechEnhancement:key,engine:'deepfilter',strength:amount,
    eq:{enabled:true,low,mid,high},compressor:{enabled:true,threshold:-24,ratio,attack:10,release:150},
    loudness:{enabled:true,gain},limiter:{enabled:true,ceiling:-1}});
}
