import { transcribeSourcePcm } from "./asr.js";
import { analyzeVideoPauses } from "./sileroVad.js";
import { findSpeechRanges } from "./silenceRemoval.js";
import { SILERO_SPEECH_SEGMENTATION } from "../config/sileroVad.js";

export async function openAnalysisSource(src, signal) {
  const { Input, UrlSource, ALL_FORMATS } = await import("mediabunny");
  signal?.throwIfAborted();
  const input = new Input({ source: new UrlSource(src, { maxCacheSize: 16 * 1024 * 1024, parallelism: 2,
    requestInit: { cache: "no-store", credentials: "omit", signal } }), formats: ALL_FORMATS });
  const abort = () => input.dispose();
  signal?.addEventListener("abort", abort, { once: true });
  return { input, close() { signal?.removeEventListener("abort", abort); input.dispose(); } };
}

async function decodeWindow(track, start, end, signal) {
  const { AudioBufferSink } = await import("mediabunny");
  const sink = new AudioBufferSink(track), length = end - start;
  const first = Math.max(0, await track.getFirstTimestamp()), last = await track.computeDuration();
  const from = Math.max(start, first), to = Math.min(end, last);
  if (!Number.isFinite(first) || !Number.isFinite(last)) throw new Error("无法读取音轨时间范围。");
  let buffer, covered = from;
  const consume = item => {
    if (!item) return;
    const audio = item.buffer, left = Math.max(from, item.timestamp), right = Math.min(to, item.timestamp + audio.duration);
    if (right <= left) return;
    if (left > covered + 0.1) throw new Error("源音频解码存在未覆盖区间。");
    covered = Math.max(covered, right);
    buffer ??= new AudioBuffer({ numberOfChannels: 1, length: Math.ceil(length * audio.sampleRate), sampleRate: audio.sampleRate });
    if (buffer.sampleRate !== audio.sampleRate) throw new Error("音轨采样率在处理区间内发生变化。");
    const sourceOffset = Math.max(0, Math.round((left - item.timestamp) * audio.sampleRate));
    const targetOffset = Math.max(0, Math.round((left - start) * audio.sampleRate));
    const frames = Math.min(Math.round((right - left) * audio.sampleRate), audio.length - sourceOffset, buffer.length - targetOffset);
    const target = buffer.getChannelData(0);
    for (let frame = 0; frame < frames; frame++) {
      let sum = 0;
      for (let channel = 0; channel < audio.numberOfChannels; channel++) sum += audio.getChannelData(channel)[sourceOffset + frame];
      target[targetOffset + frame] = sum / audio.numberOfChannels;
    }
  };
  if (to > from) {
    consume(await sink.getBuffer(from));
    for await (const item of sink.buffers(from, to)) { signal.throwIfAborted(); consume(item); }
    if (!buffer || covered < to - 0.1) throw new Error("源音频解码未完成。");
  }
  signal.throwIfAborted();
  const frameCount = Math.max(1, Math.round(length * 16000));
  if (!buffer) return new Float32Array(frameCount);
  const context = new OfflineAudioContext(1, frameCount, 16000), source = context.createBufferSource();
  source.buffer = buffer; source.connect(context.destination); source.start();
  const rendered = await context.startRendering();
  signal.throwIfAborted();
  return rendered.getChannelData(0).slice();
}

export async function analyzeSourceSpeech(src, step, { signal, onProgress, checkpoint, localModelRoot }) {
  const segmentation = step.basis.settings.speechSegmentation;
  if (!segmentation || Object.entries(SILERO_SPEECH_SEGMENTATION).some(([key, value]) => segmentation[key] !== value)) {
    throw new Error("语音分段依据已更新，请保留旧结果并重新发起分析。");
  }
  const source = await openAnalysisSource(src, signal);
  const outputs = step.checkpoints.map(item => item.output);
  const { sourceStartSeconds: start, sourceEndSeconds: end } = step.basis.range;
  try {
    const track = await source.input.getPrimaryAudioTrack();
    if (!track) throw Object.assign(new Error("此素材没有音轨。"), { code: "NO_AUDIO_TRACK" });
    if (!(await track.canDecode())) throw Object.assign(new Error("当前浏览器无法解码此音轨。"), { code: "AUDIO_DECODE_UNAVAILABLE" });
    const duration = await source.input.computeDuration();
    if (end > duration + 0.001) throw new Error("分析区间超出源素材时长。");
    // Bounded decoded PCM, with context overlap. Word midpoints have one owning window.
    for (let from = step.checkpoints.at(-1)?.range.sourceEndSeconds ?? start; from < end;) {
      signal.throwIfAborted();
      const to = Math.min(end, from + 60), decodeFrom = Math.max(start, from - 5), decodeTo = Math.min(end, to + 5);
      onProgress?.({ phase: `解码源区间 ${from.toFixed(1)}–${to.toFixed(1)} 秒` });
      const pcm = await decodeWindow(track, decodeFrom, decodeTo, signal);
      const probabilities = await analyzeVideoPauses({ src, sourceStart: decodeFrom, duration: decodeTo - decodeFrom, playbackRate: 1 }, {
        signal, language: step.basis.settings.language,
        localModelUrl: "/local-components/silero/haixin/timeline-studio-voice-models/model.onnx",
        onProgress: progress => onProgress?.({ phase: "检测源语音区间", progress: progress * 100 }),
      });
      const speech = findSpeechRanges(probabilities, decodeTo - decodeFrom);
      const intervals = [];
      for (const range of speech) {
        const left = Math.max(0, range.start - segmentation.paddingSeconds);
        const right = Math.min(decodeTo - decodeFrom, range.end + segmentation.paddingSeconds);
        const previous = intervals.at(-1);
        if (previous && left <= previous.end) previous.end = Math.max(previous.end, right);
        else intervals.push({ start: left, end: right });
      }
      const words = [], languages = new Set();
      for (const interval of intervals) {
        signal.throwIfAborted();
        const offset = Math.floor(interval.start * 16000);
        const audio = pcm.slice(offset, Math.min(pcm.length, Math.ceil(interval.end * 16000)));
        const result = await transcribeSourcePcm(audio, { signal, onProgress, preferredLanguage: step.basis.settings.language, localModelRoot });
        if (result.language) languages.add(result.language);
        const sourceOffset = decodeFrom + offset / 16000;
        for (const chunk of result.output?.chunks ?? []) {
        const [left, right] = chunk.timestamp ?? [];
        // Preserve model point alignments; the stored raw-word contract permits equal endpoints.
        if (!Number.isFinite(left) || !Number.isFinite(right) || left < 0 || right < left) {
          throw new Error("语音结果缺少有效词级源时间，未保存为完整分析。", {
            cause: { timestamp: chunk.timestamp, text: chunk.text, decodedSeconds: audio.length / 16000, sourceOffset, language: result.language },
          });
        }
        const midpoint = sourceOffset + (left + right) / 2;
        if (midpoint < from || midpoint >= to) continue;
        const previousWord = words.at(-1);
        if (previousWord && sourceOffset + left < previousWord.sourceStartSeconds) {
          throw new Error("语音结果的词级源时间倒退，未保存为完整分析。", {
            cause: { timestamp: chunk.timestamp, text: chunk.text, previousWord },
          });
        }
        // Transformers serializes word timestamps rounded to two decimal places.
        const decodedSeconds = audio.length / 16000;
        if (right > Number(decodedSeconds.toFixed(2))) {
          throw new Error("语音结果的词时间超出源音频范围，未保存为完整分析。", {
            cause: { timestamp: chunk.timestamp, text: chunk.text, decodedSeconds: audio.length / 16000 },
          });
        }
        words.push({ text: chunk.text, sourceStartSeconds: Math.max(from, sourceOffset + left), sourceEndSeconds: Math.min(to, sourceOffset + Math.min(right, decodedSeconds)) });
        }
      }
      const range = { sourceStartSeconds: from, sourceEndSeconds: to };
      const output = { text: words.map(word => word.text).join(""), words, language: [...languages].join(","), samples: [], scenes: [],
        coverage: [range], complete: true, missingCapabilities: [] };
      await checkpoint(range, output); outputs.push(output); from = to;
    }
    return { text: outputs.map(output => output.text).join(""), words: outputs.flatMap(output => output.words),
      language: [...new Set(outputs.flatMap(output => output.language.split(",")).filter(Boolean))].join(","), samples: [], scenes: [],
      coverage: outputs.flatMap(output => output.coverage), complete: true, missingCapabilities: [] };
  } finally { source.close(); }
}
