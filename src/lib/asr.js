import { AUTOMATIC_CAPTION_MODEL_ID, AUTOMATIC_CAPTION_MODEL_LABEL } from "../config/models.js";
import { makeId } from "./timeline.js";

const ASR_SAMPLE_RATE = 16000;
const MIN_CAPTION_DURATION = 0.45;
const FALLBACK_CAPTION_SECONDS = 3.2;
const LANGUAGE_DETECTION_SECONDS = 20;
const CHINESE_VISIBLE_CHAR_THRESHOLD = 8;
const ENERGY_FRAME_SECONDS = 0.05;
const ENERGY_MERGE_GAP_SECONDS = 0.35;
const ENERGY_MIN_INTERVAL_SECONDS = 0.1;
const ENERGY_SEQUENCE_MIN_INTERVAL_SECONDS = 0.48;
const ENERGY_SEQUENCE_REALIGN_LEAD_SECONDS = 1;
const ENERGY_SEQUENCE_FIRST_START_SECONDS = 0.75;
const ENERGY_SKIPPED_INTERVAL_RATIO = 0.95;
const ENERGY_BOUNDARY_PADDING_SECONDS = 0.12;
const ENERGY_MAX_EXTENSION_SECONDS = 0.45;
const CHINESE_CAPTION_CHARS_PER_SECOND = 5;
const MAX_SEQUENCE_CAPTION_SECONDS = 4.5;
const CJK_PATTERN = /[\u3400-\u9fff]/;

const CHINESE_ASR_CONTEXT_REPLACEMENTS = [
  [/侯[父付负](?=主[母姆幕]|夫人|公子|小姐|世子|嫡|庶|门|中|里|内|上下)/g, "侯府"],
  [/候府(?=主[母姆幕]|夫人|公子|小姐|世子|嫡|庶|门|中|里|内|上下)/g, "侯府"],
  [/(侯府)主[姆幕](?=$|[，。！？!?、\s])/g, "$1主母"],
];

const UI_LANGUAGE_TO_WHISPER_LANGUAGE = {
  zh: "zh",
  en: "en",
  ja: "ja",
  ko: "ko",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "pt",
  th: "th",
  vi: "vi",
};

const WHISPER_LANGUAGE_NAMES = {
  zh: "中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  th: "ไทย",
  vi: "Tiếng Việt",
};

let transcriberState = null;
let asrWorker = null;
let shouldSkipAsrWorker = false;
const workerRequests = new Map();

function getAudioContext(sampleRate = ASR_SAMPLE_RATE) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("当前浏览器不支持 AudioContext，无法识别音频。");
  }

  return new AudioContextClass({ sampleRate });
}

function downmixToMono(decoded) {
  if (decoded.numberOfChannels <= 1) {
    return new Float32Array(decoded.getChannelData(0));
  }

  const left = decoded.getChannelData(0);
  const right = decoded.getChannelData(1);
  const mono = new Float32Array(decoded.length);
  const scale = Math.SQRT2 / 2;
  for (let index = 0; index < decoded.length; index += 1) {
    mono[index] = (left[index] + right[index]) * scale;
  }
  return mono;
}

async function decodeAudioForAsr(blob) {
  const audioContext = getAudioContext();
  try {
    const buffer = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(buffer.slice(0));
    return {
      audio: downmixToMono(decoded),
      duration: decoded.duration,
    };
  } finally {
    await audioContext.close().catch(() => {});
  }
}

function normalizeTimestampValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeTimestamp(timestamp, fallbackStart, fallbackEnd, timelineOffset = 0) {
  if (!Array.isArray(timestamp)) {
    return [fallbackStart + timelineOffset, fallbackEnd + timelineOffset];
  }

  const [rawStart, rawEnd] = timestamp;
  const timestampStart = normalizeTimestampValue(rawStart);
  const timestampEnd = normalizeTimestampValue(rawEnd);
  const start = (timestampStart ?? fallbackStart) + timelineOffset;
  const end = (timestampEnd ?? fallbackEnd) + timelineOffset;
  return [Math.max(0, start), Math.max(start + MIN_CAPTION_DURATION, end)];
}

function normalizeAsrWhitespace(text, language) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (language !== "zh") {
    return normalized;
  }

  return normalized.replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, "$1$2");
}

function normalizeChineseAsrText(text) {
  if (!CJK_PATTERN.test(text)) {
    return text;
  }

  return CHINESE_ASR_CONTEXT_REPLACEMENTS.reduce(
    (currentText, [pattern, replacement]) => currentText.replace(pattern, replacement),
    text,
  );
}

function normalizeAsrText(text, language) {
  const normalized = normalizeAsrWhitespace(text, language);
  return language === "zh" ? normalizeChineseAsrText(normalized) : normalized;
}

function outputToCaptionSegments(output, duration, timelineOffset = 0, language = "zh") {
  const chunks = Array.isArray(output?.chunks) ? output.chunks : [];
  let previousEnd = timelineOffset;
  const segments = chunks
    .map((chunk, index) => {
      const rawText = normalizeAsrWhitespace(chunk.text, language);
      const text = normalizeAsrText(rawText, language);
      if (!text) {
        return null;
      }

      const fallbackStart = Math.max(
        0,
        Math.min(duration, index === 0 ? 0 : previousEnd - timelineOffset),
      );
      const fallbackEnd = Math.min(duration, fallbackStart + FALLBACK_CAPTION_SECONDS);
      const [start, end] = normalizeTimestamp(
        chunk.timestamp,
        fallbackStart,
        fallbackEnd,
        timelineOffset,
      );
      const clampedStart = Math.min(
        duration + timelineOffset,
        Math.max(timelineOffset, start < previousEnd - 0.05 ? previousEnd : start),
      );
      const clampedEnd = Math.min(
        duration + timelineOffset,
        Math.max(clampedStart + MIN_CAPTION_DURATION, end),
      );
      previousEnd = clampedEnd;

      return {
        id: makeId("caption"),
        text,
        rawText: rawText !== text ? rawText : undefined,
        start: clampedStart,
        end: clampedEnd,
        hidden: false,
        source: "asr",
      };
    })
    .filter(Boolean)
    .filter((segment) => segment.end > segment.start)
    .sort((a, b) => a.start - b.start);

  if (segments.length) {
    return segments;
  }

  const rawText = normalizeAsrWhitespace(output?.text, language);
  const text = normalizeAsrText(rawText, language);
  return text
    ? [
        {
          id: makeId("caption"),
          text,
          rawText: rawText !== text ? rawText : undefined,
          start: timelineOffset,
          end: timelineOffset + Math.max(MIN_CAPTION_DURATION, duration || FALLBACK_CAPTION_SECONDS),
          hidden: false,
          source: "asr",
        },
      ]
    : [];
}

function getQuantile(sortedValues, quantile) {
  if (!sortedValues.length) {
    return 0;
  }

  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * quantile)));
  return sortedValues[index];
}

function getAudioEnergyFrames(audio) {
  const frameLength = Math.max(1, Math.round(ASR_SAMPLE_RATE * ENERGY_FRAME_SECONDS));
  const frames = [];
  for (let index = 0; index < audio.length; index += frameLength) {
    let sum = 0;
    const end = Math.min(audio.length, index + frameLength);
    for (let sampleIndex = index; sampleIndex < end; sampleIndex += 1) {
      sum += audio[sampleIndex] * audio[sampleIndex];
    }

    frames.push({
      start: index / ASR_SAMPLE_RATE,
      end: end / ASR_SAMPLE_RATE,
      rms: Math.sqrt(sum / Math.max(1, end - index)),
    });
  }
  return frames;
}

function getActiveAudioIntervals(audio) {
  const frames = getAudioEnergyFrames(audio);
  if (!frames.length) {
    return [];
  }

  const rmsValues = frames.map((frame) => frame.rms).sort((a, b) => a - b);
  const median = getQuantile(rmsValues, 0.5);
  const upperMid = getQuantile(rmsValues, 0.75);
  const loud = getQuantile(rmsValues, 0.9);
  const threshold = Math.max(0.008, median * 1.8, upperMid * 1.12, loud * 0.45);
  const rawIntervals = [];
  let currentStart = null;
  let currentEnd = null;

  frames.forEach((frame) => {
    if (frame.rms >= threshold) {
      currentStart ??= frame.start;
      currentEnd = frame.end;
      return;
    }

    if (currentStart !== null && currentEnd - currentStart >= ENERGY_MIN_INTERVAL_SECONDS) {
      rawIntervals.push({ start: currentStart, end: currentEnd });
    }
    currentStart = null;
    currentEnd = null;
  });

  if (currentStart !== null && currentEnd - currentStart >= ENERGY_MIN_INTERVAL_SECONDS) {
    rawIntervals.push({ start: currentStart, end: currentEnd });
  }

  return rawIntervals.reduce((merged, interval) => {
    const previous = merged.at(-1);
    if (previous && interval.start - previous.end <= ENERGY_MERGE_GAP_SECONDS) {
      previous.end = Math.max(previous.end, interval.end);
      return merged;
    }

    merged.push({ ...interval });
    return merged;
  }, []);
}

function scoreActiveInterval(interval, segmentStart, segmentEnd) {
  const duration = interval.end - interval.start;
  const endDistance = Math.abs(interval.end - segmentEnd);
  const centerDistance = Math.abs((interval.start + interval.end - segmentStart - segmentEnd) / 2);
  return duration * 1.8 - endDistance * 0.35 - centerDistance * 0.05;
}

function findBestActiveInterval(intervals, searchStart, searchEnd, segmentStart, segmentEnd) {
  return intervals
    .map((interval) => ({
      start: Math.max(searchStart, interval.start),
      end: Math.min(searchEnd, interval.end),
    }))
    .filter((interval) => interval.end - interval.start >= ENERGY_MIN_INTERVAL_SECONDS)
    .sort(
      (left, right) =>
        scoreActiveInterval(right, segmentStart, segmentEnd) -
        scoreActiveInterval(left, segmentStart, segmentEnd),
    )[0] ?? null;
}

function getIntervalDuration(interval) {
  return Math.max(0, interval.end - interval.start);
}

function getRealignedEnergySequence(intervals, segments, timelineOffset = 0) {
  if (segments.length < 2 || intervals.length <= segments.length) {
    return null;
  }

  const firstSegmentStart = Math.max(0, segments[0].start - timelineOffset);
  if (firstSegmentStart > ENERGY_SEQUENCE_FIRST_START_SECONDS) {
    return null;
  }

  const meaningfulIntervals = intervals.filter(
    (interval) => getIntervalDuration(interval) >= ENERGY_SEQUENCE_MIN_INTERVAL_SECONDS,
  );
  if (meaningfulIntervals.length <= segments.length) {
    return null;
  }

  const candidateIntervals = meaningfulIntervals.slice(-segments.length);
  const skippedIntervals = meaningfulIntervals.slice(0, -segments.length);
  const firstCandidateDuration = getIntervalDuration(candidateIntervals[0]);
  const skippedMaxDuration = skippedIntervals.reduce(
    (maxDuration, interval) => Math.max(maxDuration, getIntervalDuration(interval)),
    0,
  );
  const hasClearLeadIn = candidateIntervals[0].start - firstSegmentStart >= ENERGY_SEQUENCE_REALIGN_LEAD_SECONDS;
  const skippedLooksLikeNoise = skippedMaxDuration <= firstCandidateDuration * ENERGY_SKIPPED_INTERVAL_RATIO;

  return hasClearLeadIn && skippedLooksLikeNoise ? candidateIntervals : null;
}

function getEstimatedCaptionSpeechSeconds(text) {
  const compactText = String(text ?? "").replace(/\s/g, "");
  const cjkCount = compactText.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  if (cjkCount) {
    return Math.max(
      MIN_CAPTION_DURATION,
      Math.min(MAX_SEQUENCE_CAPTION_SECONDS, cjkCount / CHINESE_CAPTION_CHARS_PER_SECOND + 0.6),
    );
  }

  const wordCount = compactText ? Math.max(1, compactText.split(/\s+/).length) : 1;
  return Math.max(MIN_CAPTION_DURATION, Math.min(MAX_SEQUENCE_CAPTION_SECONDS, wordCount / 2.8 + 0.8));
}

function refineCaptionSegmentsWithAudioEnergy(segments, audio, duration, timelineOffset = 0) {
  if (!segments.length || !audio.length || duration <= 0) {
    return segments;
  }

  const intervals = getActiveAudioIntervals(audio);
  if (!intervals.length) {
    return segments;
  }

  let previousEnd = timelineOffset;
  const realignedSequence = getRealignedEnergySequence(intervals, segments, timelineOffset);
  return segments.map((segment, index) => {
    const localStart = Math.max(0, segment.start - timelineOffset);
    const localEnd = Math.max(localStart + MIN_CAPTION_DURATION, segment.end - timelineOffset);
    const hasNextSegment = Number.isFinite(segments[index + 1]?.start);
    const nextLocalStart = hasNextSegment
      ? Math.max(0, segments[index + 1].start - timelineOffset)
      : duration;
    const searchStart = Math.max(0, localStart - 0.35);
    const searchEnd = Math.min(
      duration,
      hasNextSegment ? nextLocalStart - 0.05 : duration,
      localEnd + ENERGY_MAX_EXTENSION_SECONDS,
    );
    const sequenceInterval = realignedSequence?.[index] ?? null;
    const activeInterval =
      sequenceInterval ??
      findBestActiveInterval(
        intervals,
        searchStart,
        searchEnd,
        localStart,
        localEnd,
      );

    if (!activeInterval) {
      previousEnd = segment.end;
      return segment;
    }

    const sequenceEndBound =
      sequenceInterval && localEnd >= activeInterval.start
        ? timelineOffset + localEnd + ENERGY_MAX_EXTENSION_SECONDS
        : timelineOffset + duration;
    const nextSequenceStart = realignedSequence?.[index + 1]?.start;
    const refinedStart = Math.max(
      timelineOffset,
      previousEnd + 0.01,
      timelineOffset + activeInterval.start - ENERGY_BOUNDARY_PADDING_SECONDS,
    );
    const sequenceDurationBound = sequenceInterval
      ? refinedStart + getEstimatedCaptionSpeechSeconds(segment.text)
      : timelineOffset + duration;
    const refinedEnd = Math.min(
      timelineOffset + duration,
      sequenceInterval
        ? timelineOffset + (Number.isFinite(nextSequenceStart) ? nextSequenceStart - 0.05 : duration)
        : timelineOffset + localEnd + ENERGY_MAX_EXTENSION_SECONDS,
      sequenceEndBound,
      sequenceDurationBound,
      sequenceInterval ? timelineOffset + duration : timelineOffset + nextLocalStart - 0.05,
      Math.max(refinedStart + MIN_CAPTION_DURATION, timelineOffset + activeInterval.end + 0.16),
    );

    if (refinedEnd - refinedStart < MIN_CAPTION_DURATION) {
      previousEnd = segment.end;
      return segment;
    }

    previousEnd = refinedEnd;
    return {
      ...segment,
      start: refinedStart,
      end: refinedEnd,
      rawStart: segment.rawStart ?? segment.start,
      rawEnd: segment.rawEnd ?? segment.end,
      timingSource: "asr-energy",
    };
  });
}

function normalizeTokenId(value) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function getGeneratedTokenIds(output) {
  const tensorLike = output?.sequences ?? output;
  const rawTokens =
    tensorLike?.[0] && typeof tensorLike[0].tolist === "function"
      ? tensorLike[0].tolist()
      : typeof tensorLike?.tolist === "function"
        ? tensorLike.tolist()
        : tensorLike;
  const firstSequence = Array.isArray(rawTokens?.[0]) ? rawTokens[0] : rawTokens;
  return Array.isArray(firstSequence)
    ? firstSequence.map(normalizeTokenId).filter((token) => token !== null)
    : [];
}

function getWhisperLanguageIdMap(transcriber) {
  const langToId = transcriber?.model?.generation_config?.lang_to_id;
  if (!langToId) {
    return new Map();
  }

  return new Map(
    Object.entries(langToId)
      .map(([token, id]) => {
        const language = normalizeWhisperLanguageToken(token);
        return [normalizeTokenId(id), language];
      })
      .filter(([id, language]) => id !== null && language),
  );
}

function normalizeWhisperLanguageToken(token) {
  const normalized = String(token ?? "").match(/^<\|?([a-z_]+)\|?>$/i)?.[1];
  return normalized || String(token ?? "").replace(/[<|>]/g, "");
}

function getPreferredWhisperLanguage(preferredLanguage) {
  return UI_LANGUAGE_TO_WHISPER_LANGUAGE[preferredLanguage] ?? "zh";
}

function getLanguageDetectionSample(audio) {
  const sampleLength = Math.min(audio.length, ASR_SAMPLE_RATE * LANGUAGE_DETECTION_SECONDS);
  return audio.subarray(0, sampleLength);
}

function isMultilingualWhisper(transcriber) {
  return Boolean(transcriber?.model?.generation_config?.is_multilingual);
}

function createModelLoadProgressCallback(onProgress) {
  const progressByFile = new Map();
  let reportedProgress = 8;

  return (event) => {
    const rawProgress = Number(event?.progress);
    if (!Number.isFinite(rawProgress)) {
      return;
    }

    const fileKey = event.file ?? event.name ?? event.url ?? "__model__";
    progressByFile.set(fileKey, Math.max(0, Math.min(100, rawProgress)));
    const totalProgress = Array.from(progressByFile.values()).reduce((sum, value) => sum + value, 0);
    const averageProgress = totalProgress / progressByFile.size;
    const nextProgress = Math.min(70, Math.max(8, Math.round(8 + averageProgress * 0.62)));
    if (nextProgress <= reportedProgress) {
      return;
    }

    reportedProgress = nextProgress;
    onProgress?.({
      progress: nextProgress,
      phase: `下载或读取 ${AUTOMATIC_CAPTION_MODEL_LABEL} ONNX`,
    });
  };
}

async function detectWhisperLanguage(transcriber, audio, preferredLanguage, onProgress) {
  const generationConfig = transcriber?.model?.generation_config;
  const fallbackLanguage = getPreferredWhisperLanguage(preferredLanguage);
  if (!isMultilingualWhisper(transcriber)) {
    return { language: "en", detected: false };
  }

  const languageIdMap = getWhisperLanguageIdMap(transcriber);
  if (!languageIdMap.size) {
    return { language: fallbackLanguage, detected: false };
  }

  const decoderStartTokenId = normalizeTokenId(generationConfig.decoder_start_token_id);
  if (decoderStartTokenId === null) {
    return { language: fallbackLanguage, detected: false };
  }

  try {
    onProgress?.({ progress: 70, phase: "识别音频语言" });
    const sample = getLanguageDetectionSample(audio);
    const features = await transcriber.processor(sample);
    const output = await transcriber.model.generate({
      inputs: features.input_features,
      decoder_input_ids: [decoderStartTokenId],
      max_new_tokens: 1,
      return_timestamps: false,
    });
    const tokenIds = getGeneratedTokenIds(output);
    const languageTokenId = tokenIds.find((token) => token !== decoderStartTokenId && languageIdMap.has(token));
    const language = languageTokenId === undefined ? null : languageIdMap.get(languageTokenId);

    return {
      language: language || fallbackLanguage,
      detected: Boolean(language),
    };
  } catch (error) {
    console.warn("Whisper language detection failed, falling back to preferred language.", error);
    return { language: fallbackLanguage, detected: false };
  }
}

async function getTranscriber(onProgress) {
  if (!transcriberState || transcriberState.modelId !== AUTOMATIC_CAPTION_MODEL_ID) {
    const modelId = AUTOMATIC_CAPTION_MODEL_ID;
    transcriberState = {
      modelId,
      promise: (async () => {
        const { pipeline } = await import("@huggingface/transformers");
        const reportModelLoadProgress = createModelLoadProgressCallback(onProgress);
        return pipeline("automatic-speech-recognition", modelId, {
          dtype: "q8",
          device: "wasm",
          progress_callback: reportModelLoadProgress,
        });
      })(),
    };
  }

  return transcriberState.promise;
}

function rejectWorkerRequests(error) {
  workerRequests.forEach((request) => {
    request.reject(error);
  });
  workerRequests.clear();
}

function getAsrWorker() {
  if (typeof Worker === "undefined") {
    return null;
  }

  if (asrWorker) {
    return asrWorker;
  }

  asrWorker = new Worker(new URL("../workers/asr.worker.js", import.meta.url), {
    type: "module",
  });

  asrWorker.addEventListener("message", (event) => {
    const message = event.data;
    const request = workerRequests.get(message?.requestId);
    if (!request) {
      return;
    }

    if (message.type === "progress") {
      request.onProgress?.({
        progress: message.progress,
        phase: message.phase,
      });
      return;
    }

    workerRequests.delete(message.requestId);
    if (message.type === "result") {
      request.resolve({
        output: message.output,
        language: message.language,
        languageDetected: Boolean(message.languageDetected),
        modelId: message.modelId,
      });
      return;
    }

    if (message.type === "error") {
      request.reject(new Error(message.error || "自动字幕生成失败"));
    }
  });

  asrWorker.addEventListener("error", (event) => {
    const error = new Error(event.message || "自动字幕 Worker 运行失败");
    asrWorker?.terminate();
    asrWorker = null;
    rejectWorkerRequests(error);
  });

  return asrWorker;
}

function transcribeAudioInWorker(audio, { onProgress, preferredLanguage }) {
  if (shouldSkipAsrWorker) {
    return Promise.reject(new Error("本轮已停用自动字幕 Worker。"));
  }

  const worker = getAsrWorker();
  if (!worker) {
    return Promise.reject(new Error("当前浏览器不支持 Worker 自动字幕。"));
  }

  const requestId = makeId("asr");
  const transferableAudio = audio.slice();
  return new Promise((resolve, reject) => {
    workerRequests.set(requestId, {
      resolve,
      reject,
      onProgress,
    });

    worker.postMessage(
      {
        type: "transcribe",
        requestId,
        modelId: AUTOMATIC_CAPTION_MODEL_ID,
        audioBuffer: transferableAudio.buffer,
        preferredLanguage,
      },
      [transferableAudio.buffer],
    );
  });
}

async function transcribeAudioOnMainThread(audio, { onProgress, preferredLanguage }) {
  const transcriber = await getTranscriber(onProgress);
  const languageResult = await detectWhisperLanguage(transcriber, audio, preferredLanguage, onProgress);
  const languageLabel = WHISPER_LANGUAGE_NAMES[languageResult.language] ?? languageResult.language.toUpperCase();
  onProgress?.({
    progress: 74,
    phase: `${languageResult.detected ? "检测为" : "按"} ${languageLabel} 转写字幕`,
  });
  const transcriptionOptions = {
    chunk_length_s: 30,
    max_new_tokens: 224,
    no_repeat_ngram_size: 3,
    repetition_penalty: 1.15,
    stride_length_s: 5,
    return_timestamps: true,
  };
  if (isMultilingualWhisper(transcriber)) {
    transcriptionOptions.language = languageResult.language;
    transcriptionOptions.task = "transcribe";
  }
  const output = await transcriber(audio, transcriptionOptions);

  return {
    output,
    language: languageResult.language,
    languageDetected: languageResult.detected,
    modelId: AUTOMATIC_CAPTION_MODEL_ID,
    source: "main",
  };
}

function getTranscriptText(output) {
  const chunkText = Array.isArray(output?.chunks)
    ? output.chunks.map((chunk) => chunk?.text ?? "").join("")
    : "";
  return String(chunkText || output?.text || "").replace(/\s+/g, "");
}

function countPattern(text, pattern) {
  return text.match(pattern)?.length ?? 0;
}

function isSuspiciousChineseTranscript(output) {
  const text = getTranscriptText(output);
  const visibleCount = countPattern(text, /[^\s]/g);
  if (visibleCount < CHINESE_VISIBLE_CHAR_THRESHOLD) {
    return false;
  }

  const cjkCount = countPattern(text, /[\u3400-\u9fff]/g);
  const latinCount = countPattern(text, /[A-Za-zÀ-ÖØ-öø-ÿ]/g);
  const latinRatio = latinCount / visibleCount;
  const cjkRatio = cjkCount / visibleCount;
  const hasLongLatinRun = /[A-Za-zÀ-ÖØ-öø-ÿ]{12,}/.test(text);

  return cjkCount === 0 || (latinRatio > 0.45 && cjkRatio < 0.2) || hasLongLatinRun;
}

function isSuspiciousTranscript(output, language, preferredLanguage) {
  const expectedLanguage = language || getPreferredWhisperLanguage(preferredLanguage);
  return expectedLanguage === "zh" && isSuspiciousChineseTranscript(output);
}

function resetAsrWorker() {
  asrWorker?.terminate();
  asrWorker = null;
  workerRequests.clear();
}

export async function transcribeAudioToCaptionSegments(
  blob,
  { onProgress, preferredLanguage = "zh", timelineOffset = 0 } = {},
) {
  onProgress?.({ progress: 5, phase: "解码原声音频" });
  const { audio, duration } = await decodeAudioForAsr(blob);
  if (!audio.length || !duration) {
    throw new Error("没有检测到可识别的音频。");
  }

  let result;
  try {
    result = await transcribeAudioInWorker(audio, { onProgress, preferredLanguage });
    result.source = "worker";
  } catch (error) {
    console.warn("ASR worker failed, falling back to main thread.", error);
    onProgress?.({ progress: 8, phase: "Worker 不可用，切换主线程自动字幕" });
    result = await transcribeAudioOnMainThread(audio, { onProgress, preferredLanguage });
  }

  if (result.source === "worker" && isSuspiciousTranscript(result.output, result.language, preferredLanguage)) {
    console.warn("ASR worker returned a suspicious transcript, retrying on the WASM main thread.", result.output);
    shouldSkipAsrWorker = true;
    resetAsrWorker();
    onProgress?.({ progress: 78, phase: "Worker 结果异常，切换稳定 WASM 重新识别" });
    result = await transcribeAudioOnMainThread(audio, { onProgress, preferredLanguage });
  }

  if (isSuspiciousTranscript(result.output, result.language, preferredLanguage)) {
    throw new Error("自动字幕结果像是识别错语言了，请刷新后重新生成一次。");
  }

  const rawSegments = outputToCaptionSegments(
    result.output,
    duration,
    Math.max(0, timelineOffset || 0),
    result.language,
  );
  const segments = refineCaptionSegmentsWithAudioEnergy(
    rawSegments,
    audio,
    duration,
    Math.max(0, timelineOffset || 0),
  );
  if (!segments.length) {
    throw new Error("没有识别到可用字幕。");
  }

  onProgress?.({ progress: 96, phase: "写入字幕轨道" });
  return {
    segments,
    text: segments.map((segment) => segment.text).join("\n"),
    duration,
    language: result.language,
    languageDetected: result.languageDetected,
  };
}
