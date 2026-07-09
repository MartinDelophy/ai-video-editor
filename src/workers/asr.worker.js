import { AUTOMATIC_CAPTION_MODEL_ID, AUTOMATIC_CAPTION_MODEL_LABEL } from "../config/models.js";

const ASR_SAMPLE_RATE = 16000;
const LANGUAGE_DETECTION_SECONDS = 20;

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

function postProgress(requestId, progress, phase) {
  self.postMessage({
    type: "progress",
    requestId,
    progress,
    phase,
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

function createModelLoadProgressCallback(requestId) {
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
    postProgress(requestId, nextProgress, `下载或读取 ${AUTOMATIC_CAPTION_MODEL_LABEL} ONNX`);
  };
}

function getPreferredInferenceDevice() {
  return "wasm";
}

async function createTranscriber(requestId, device) {
  const { pipeline } = await import("@huggingface/transformers");
  return pipeline("automatic-speech-recognition", AUTOMATIC_CAPTION_MODEL_ID, {
    dtype: "q8",
    device,
    progress_callback: createModelLoadProgressCallback(requestId),
  });
}

async function getTranscriber(requestId) {
  if (!transcriberState || transcriberState.modelId !== AUTOMATIC_CAPTION_MODEL_ID) {
    transcriberState = {
      modelId: AUTOMATIC_CAPTION_MODEL_ID,
      promise: (async () => {
        const preferredDevice = getPreferredInferenceDevice();
        try {
          postProgress(
            requestId,
            7,
            preferredDevice === "webgpu" ? "在 Worker 中初始化 WebGPU ONNX" : "在 Worker 中初始化 WASM ONNX",
          );
          return await createTranscriber(requestId, preferredDevice);
        } catch (error) {
          if (preferredDevice !== "webgpu") {
            throw error;
          }
          console.warn("Whisper WebGPU initialization failed, falling back to WASM.", error);
          postProgress(requestId, 7, "WebGPU 初始化失败，切换 WASM Worker");
          return createTranscriber(requestId, "wasm");
        }
      })(),
    };
  }

  return transcriberState.promise;
}

async function detectWhisperLanguage(transcriber, audio, preferredLanguage, requestId) {
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
    postProgress(requestId, 70, "识别音频语言");
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

function serializeTimestamp(timestamp) {
  if (!Array.isArray(timestamp)) {
    return null;
  }

  return timestamp.map((value) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  });
}

function serializeOutput(output) {
  return {
    text: String(output?.text ?? ""),
    chunks: Array.isArray(output?.chunks)
      ? output.chunks.map((chunk) => ({
          text: String(chunk?.text ?? ""),
          timestamp: serializeTimestamp(chunk?.timestamp),
        }))
      : [],
  };
}

async function transcribe({ requestId, audioBuffer, preferredLanguage, modelId }) {
  if (modelId && modelId !== AUTOMATIC_CAPTION_MODEL_ID) {
    throw new Error("自动字幕模型版本已更新，请刷新后重新生成。");
  }

  const audio = new Float32Array(audioBuffer);
  if (!audio.length) {
    throw new Error("没有检测到可识别的音频。");
  }

  const transcriber = await getTranscriber(requestId);
  const languageResult = await detectWhisperLanguage(transcriber, audio, preferredLanguage, requestId);
  const languageLabel = WHISPER_LANGUAGE_NAMES[languageResult.language] ?? languageResult.language.toUpperCase();
  postProgress(
    requestId,
    74,
    `${languageResult.detected ? "检测为" : "按"} ${languageLabel} 转写字幕`,
  );

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
  self.postMessage({
    type: "result",
    requestId,
    output: serializeOutput(output),
    language: languageResult.language,
    languageDetected: languageResult.detected,
    modelId: AUTOMATIC_CAPTION_MODEL_ID,
  });
}

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type !== "transcribe") {
    return;
  }

  transcribe(message).catch((error) => {
    self.postMessage({
      type: "error",
      requestId: message.requestId,
      error: error instanceof Error ? error.message : "自动字幕生成失败",
    });
  });
});
