const CHINESE_SPOKEN_DIGITS = {
  0: "零",
  1: "一",
  2: "二",
  3: "三",
  4: "四",
  5: "五",
  6: "六",
  7: "七",
  8: "八",
  9: "九",
};

const CHINESE_SPOKEN_LETTERS = {
  A: "诶",
  B: "比",
  C: "西",
  D: "迪",
  E: "伊",
  F: "艾弗",
  G: "吉",
  H: "艾尺",
  I: "艾",
  J: "杰",
  K: "开",
  L: "艾勒",
  M: "艾姆",
  N: "恩",
  O: "欧",
  P: "皮",
  Q: "丘",
  R: "阿尔",
  S: "艾斯",
  T: "提",
  U: "优",
  V: "维",
  W: "达不溜",
  X: "艾克斯",
  Y: "歪",
  Z: "泽德",
};

const ASCII_PUNCTUATION_MAP = new Map([
  [",", "，"],
  [".", "。"],
  ["?", "？"],
  ["!", "！"],
  [";", "；"],
  [":", "："],
]);

export class TtsInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "TtsInputError";
  }
}

function countMatches(text, pattern) {
  return text.match(pattern)?.join("").length ?? 0;
}

function normalizeBaseText(text) {
  return text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[“”"']/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function speakShortLatinTokenInChinese(token) {
  return [...token.toUpperCase()]
    .map((char) => CHINESE_SPOKEN_DIGITS[char] ?? CHINESE_SPOKEN_LETTERS[char] ?? "")
    .join("");
}

function prepareChinesePiperText(rawText) {
  const normalized = normalizeBaseText(rawText);
  const latinCount = countMatches(normalized, /[A-Za-z]/g);
  const hanCount = countMatches(normalized, /\p{Script=Han}/gu);

  if (latinCount > Math.max(14, hanCount * 0.8)) {
    throw new TtsInputError("当前中文语音不适合大量英文文案，请切换 English 声音后再生成。");
  }

  let changed = false;
  let text = normalized
    .replace(/[A-Za-z0-9]+/g, (token) => {
      changed = true;
      return token.length <= 8 ? speakShortLatinTokenInChinese(token) : "，";
    })
    .replace(/[()（）\[\]{}【】<>《》]/g, () => {
      changed = true;
      return "，";
    })
    .replace(/[-_/\\|~`^+=*@#$%&]/g, () => {
      changed = true;
      return "，";
    })
    .replace(/[,.?!;:]/g, (mark) => {
      changed = true;
      return ASCII_PUNCTUATION_MAP.get(mark) ?? "，";
    })
    .replace(/\s+/g, "，")
    .replace(/[^\p{Script=Han}零一二三四五六七八九十百千万亿两，。！？；：、\n]/gu, () => {
      changed = true;
      return "";
    })
    .replace(/[，、]{2,}/g, "，")
    .replace(/[。！？；：]{2,}/g, (marks) => marks[0])
    .replace(/^[，。！？；：、]+|[，。！？；：、]+$/g, "")
    .trim();

  if (!text) {
    throw new TtsInputError("当前中文语音没有可朗读的中文内容，请输入中文或切换英文声音。");
  }

  return {
    text,
    warning: changed ? "已自动清理中文语音不支持的符号，避免本地 ONNX 运行失败。" : "",
  };
}

function prepareKokoroText(rawText) {
  const normalized = normalizeBaseText(rawText).replace(/\s+/g, " ");
  const hanCount = countMatches(normalized, /\p{Script=Han}/gu);
  const latinCount = countMatches(normalized, /[A-Za-z]/g);

  if (hanCount > Math.max(4, latinCount * 0.5)) {
    throw new TtsInputError("当前英文语音不适合中文文案，请切换中文声音后再生成。");
  }

  const text = normalized.replace(/[^\p{Script=Latin}0-9\s.,!?;:'"()\-]/gu, "").trim();
  if (!text) {
    throw new TtsInputError("当前英文语音没有可朗读的英文内容，请输入英文或切换中文声音。");
  }

  return {
    text,
    warning: text !== normalized ? "已自动清理英文语音不支持的字符。" : "",
  };
}

export function prepareTextForVoice(rawText, voice) {
  if (voice?.engine === "piper" && voice.language === "中文") {
    return prepareChinesePiperText(rawText);
  }

  if (voice?.engine === "kokoro") {
    return prepareKokoroText(rawText);
  }

  const text = normalizeBaseText(rawText);
  if (!text) {
    throw new TtsInputError("请输入要生成的文案。");
  }
  return { text, warning: "" };
}

export function isPiperSymbolError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /Gather|indices element out of data bounds|OrtRun|emb\/Gather/i.test(message);
}

export function isStorageQuotaError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /QuotaExceededError|storage quota|exceed.*quota/i.test(message);
}

export async function clearPiperCacheIfStorageTight(tts) {
  if (!navigator.storage?.estimate || typeof tts?.flush !== "function") {
    return false;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    const remaining = quota > usage ? quota - usage : 0;
    if (quota > 0 && (usage / quota > 0.9 || remaining < 120 * 1024 * 1024)) {
      await tts.flush();
      return true;
    }
  } catch {
    return false;
  }

  return false;
}
