import { createVectorColorSlots, createVectorSvgDataUrl, VECTOR_VIEWBOX_SIZE } from "./vectorAssets.js";
import { createChromeBuiltInSession } from "./chromeBuiltInAi.js";

const BLOCKED_ELEMENTS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "canvas",
  "image",
  "use",
]);

const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
  "filter",
  "fegaussianblur",
  "feoffset",
  "femerge",
  "femergenode",
  "fecolormatrix",
]);

const SAFE_URL_REFERENCE = /^url\(\s*#[-_a-z0-9:.]+\s*\)$/i;
const XML_PARSER_ERROR = "parsererror";

function getLanguageModelApi(scope = globalThis) {
  if (scope?.LanguageModel?.availability && scope.LanguageModel?.create) {
    return {
      kind: "current",
      availability: () => scope.LanguageModel.availability(),
      create: (options) => scope.LanguageModel.create(options),
    };
  }
  const legacy = scope?.ai?.languageModel;
  if (legacy?.capabilities && legacy?.create) {
    return {
      kind: "legacy",
      availability: async () => {
        const capabilities = await legacy.capabilities();
        const status = capabilities?.available;
        if (status === "readily" || status === "available") return "available";
        if (status === "after-download" || status === "downloadable") return "downloadable";
        return "unavailable";
      },
      create: (options) => legacy.create(options),
    };
  }
  return null;
}

function getTranslatorApi(scope = globalThis) {
  if (scope?.Translator?.availability && scope.Translator?.create) return scope.Translator;
  return null;
}

function getLanguageDetectorApi(scope = globalThis) {
  if (scope?.LanguageDetector?.availability && scope.LanguageDetector?.create) return scope.LanguageDetector;
  return null;
}

export async function detectGeminiNanoVectorSupport(scope = globalThis, sourceLanguage = "en") {
  const api = getLanguageModelApi(scope);
  if (!api) return { supported: false, availability: "unavailable", apiKind: "" };
  try {
    const availability = await api.availability();
    const detectorApi = getLanguageDetectorApi(scope);
    const detectorAvailability = detectorApi ? await detectorApi.availability() : "unavailable";
    const translatorApi = getTranslatorApi(scope);
    const translationAvailability = translatorApi
      ? await translatorApi.availability({ sourceLanguage: sourceLanguage === "en" ? "es" : sourceLanguage, targetLanguage: "en" })
      : "unavailable";
    return {
      supported: availability !== "unavailable" && detectorAvailability !== "unavailable" && translationAvailability !== "unavailable",
      availability,
      detectorAvailability,
      translationAvailability,
      apiKind: api.kind,
    };
  } catch (error) {
    return {
      supported: false,
      availability: "unavailable",
      apiKind: api.kind,
      error: error?.message || String(error),
    };
  }
}

export async function detectVectorRequestLanguage({
  request,
  fallbackLanguage = "en",
  signal,
  onDownloadProgress,
  scope = globalThis,
}) {
  const api = getLanguageDetectorApi(scope);
  if (!api) throw new Error("LANGUAGE_DETECTOR_UNAVAILABLE");
  const availability = await api.availability();
  if (availability === "unavailable") throw new Error("LANGUAGE_DETECTOR_UNAVAILABLE");
  const detector = await createChromeBuiltInSession({
    create: (options) => api.create(options),
    signal,
    onDownloadProgress,
  });
  try {
    const results = await detector.detect(String(request || "").trim(), { signal });
    const detected = String(results?.[0]?.detectedLanguage || "").trim().toLowerCase();
    const confidence = Number(results?.[0]?.confidence) || 0;
    const language = confidence >= 0.45 ? detected : fallbackLanguage;
    return String(language || "en").split("-")[0];
  } finally {
    detector.destroy?.();
  }
}

export async function translateVectorRequestToEnglish({
  request,
  sourceLanguage,
  signal,
  onDownloadProgress,
  scope = globalThis,
}) {
  const value = String(request || "").trim();
  if (!value) return "";
  if (!sourceLanguage) throw new Error("SOURCE_LANGUAGE_REQUIRED");
  if (sourceLanguage === "en") return value;
  const api = getTranslatorApi(scope);
  if (!api) throw new Error("TRANSLATOR_UNAVAILABLE");
  const availability = await api.availability({ sourceLanguage, targetLanguage: "en" });
  if (availability === "unavailable") throw new Error("TRANSLATION_PAIR_UNAVAILABLE");
  const translator = await createChromeBuiltInSession({
    create: (options) => api.create(options),
    options: { sourceLanguage, targetLanguage: "en" },
    signal,
    onDownloadProgress,
  });
  try {
    const translated = String(await translator.translate(value, { signal })).trim();
    if (!translated) throw new Error("TRANSLATION_EMPTY");
    return translated;
  } finally {
    translator.destroy?.();
  }
}

function unwrapCodeFence(value = "") {
  return String(value)
    .replace(/^\s*```(?:xml|svg)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export function extractVectorXml(value = "") {
  const text = unwrapCodeFence(value);
  const svgStart = text.search(/<svg\b/i);
  if (svgStart < 0) throw new Error("SVG_ROOT_MISSING");
  const svgContent = text.slice(svgStart);
  const svgEndMatch = svgContent.match(/<\/svg\s*>/i);
  if (!svgEndMatch || svgEndMatch.index == null) throw new Error("SVG_ROOT_UNCLOSED");
  const svgEnd = svgEndMatch.index + svgEndMatch[0].length;

  return svgContent.slice(0, svgEnd).trim();
}

function parseViewBox(svg) {
  const values = String(svg.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value)) || values[2] <= 0 || values[3] <= 0) {
    return [0, 0, VECTOR_VIEWBOX_SIZE, VECTOR_VIEWBOX_SIZE];
  }
  return values;
}

function sanitizeAttribute(element, attribute) {
  const name = attribute.name.toLowerCase();
  const value = attribute.value.trim();
  if (
    name.startsWith("on")
    || name === "href"
    || name === "xlink:href"
    || name === "src"
    || name === "srcset"
  ) {
    element.removeAttribute(attribute.name);
    return;
  }
  if (name === "style") {
    if (/url\s*\(|expression\s*\(|@import|javascript:/i.test(value)) element.removeAttribute(attribute.name);
    return;
  }
  if ((name === "fill" || name === "stroke" || name === "filter" || name === "clip-path" || name === "mask") && /url\s*\(/i.test(value) && !SAFE_URL_REFERENCE.test(value)) {
    element.removeAttribute(attribute.name);
  }
}

function sanitizeTree(root) {
  for (const element of [...root.querySelectorAll("*")]) {
    const tag = element.localName?.toLowerCase();
    if (BLOCKED_ELEMENTS.has(tag) || !ALLOWED_ELEMENTS.has(tag)) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) sanitizeAttribute(element, attribute);
  }
}

export function sanitizeGeneratedVectorXml(vectorXml, environment = globalThis) {
  const Parser = environment.DOMParser;
  const Serializer = environment.XMLSerializer;
  if (!Parser || !Serializer) throw new Error("SVG_PARSER_UNAVAILABLE");
  if (/<!doctype|<!entity/i.test(vectorXml)) throw new Error("SVG_XML_DECLARATION_BLOCKED");
  const document = new Parser().parseFromString(vectorXml, "image/svg+xml");
  if (document.querySelector(XML_PARSER_ERROR)) throw new Error("SVG_XML_INVALID");
  const svg = document.documentElement;
  if (svg?.localName?.toLowerCase() !== "svg") throw new Error("SVG_ROOT_MISSING");
  sanitizeTree(svg);
  const [x, y, width, height] = parseViewBox(svg);
  const scale = Math.min(VECTOR_VIEWBOX_SIZE / width, VECTOR_VIEWBOX_SIZE / height);
  const translateX = (VECTOR_VIEWBOX_SIZE - width * scale) / 2 - x * scale;
  const translateY = (VECTOR_VIEWBOX_SIZE - height * scale) / 2 - y * scale;
  const body = [...svg.childNodes]
    .map((node) => new Serializer().serializeToString(node))
    .join("")
    .trim();
  if (!body || !svg.querySelector("path,rect,circle,ellipse,line,polyline,polygon,text")) {
    throw new Error("SVG_CONTENT_EMPTY");
  }
  return `<g transform="translate(${translateX.toFixed(4)} ${translateY.toFixed(4)}) scale(${scale.toFixed(6)})">${body}</g>`;
}

export function buildVectorDesignPrompt(userRequest) {
  return `You are an expert SVG designer. Create one polished, editable vector graphic for a video editor.

USER REQUEST:
${String(userRequest || "").trim()}

Return one complete SVG document only, starting with <svg and ending with </svg>:
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200">...</svg>

Rules:
- Transparent background. Do not add a full-canvas background rectangle.
- Use only SVG paths, groups, rects, circles, ellipses, lines, polylines, polygons, text, gradients, masks, clip paths, and simple filters.
- Wrap each visually meaningful editable part in its own <g> when practical. Give the group a short semantic id and a child <title> in English, such as "trend line", "data bars", or "background shape". Do not use fixed part names.
- No scripts, event handlers, foreignObject, external images, external URLs, CSS imports, animation, or embedded HTML.
- Keep important artwork inside the viewBox with comfortable margins.
- Prefer clean geometry and no more than 80 visible shapes.
- Output no Markdown and no explanation.`;
}

export async function generateVectorWithGeminiNano({
  request,
  sourceLanguage = "en",
  signal,
  onDownloadProgress,
  onLanguageDetectionDownloadProgress,
  onTranslationDownloadProgress,
  onPhaseChange,
  scope = globalThis,
}) {
  const api = getLanguageModelApi(scope);
  if (!api) throw new Error("LANGUAGE_MODEL_UNAVAILABLE");
  onPhaseChange?.("detectingLanguage");
  const detectedLanguage = await detectVectorRequestLanguage({
    request,
    fallbackLanguage: sourceLanguage,
    signal,
    scope,
    onDownloadProgress: onLanguageDetectionDownloadProgress,
  });
  onPhaseChange?.("translating");
  const englishRequest = await translateVectorRequestToEnglish({
    request,
    sourceLanguage: detectedLanguage,
    signal,
    scope,
    onDownloadProgress: onTranslationDownloadProgress,
  });
  onPhaseChange?.("model");
  const session = await createChromeBuiltInSession({
    create: (options) => api.create(options),
    signal,
    onDownloadProgress,
  });
  try {
    onPhaseChange?.("generating");
    const raw = await session.prompt(buildVectorDesignPrompt(englishRequest), { signal });
    console.info("[AI Vector][Gemini Nano] Generation context", {
      request: String(request || "").trim(),
      detectedLanguage,
      englishRequest,
    });
    console.log(`[AI Vector][Gemini Nano] Raw response:\n${String(raw)}`);
    onPhaseChange?.("validating");
    let vectorXml;
    let vectorBody;
    try {
      vectorXml = extractVectorXml(raw);
      vectorBody = sanitizeGeneratedVectorXml(vectorXml, scope);
    } catch (error) {
      console.error("[AI Vector][Gemini Nano] SVG validation failed", {
        error: error?.message || String(error),
        rawResponse: String(raw),
      });
      throw error;
    }
    const id = `ai-vector-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const name = (englishRequest.slice(0, 42) || "AI vector").trim();
    const src = createVectorSvgDataUrl(vectorBody);
    return {
      id,
      type: "image",
      kind: "vector",
      name,
      meta: "Gemini Nano · SVG",
      src,
      thumbnail: src,
      vectorBody,
      vectorColorSlots: createVectorColorSlots(vectorBody),
      vectorBackground: "transparent",
      width: VECTOR_VIEWBOX_SIZE,
      height: VECTOR_VIEWBOX_SIZE,
      provider: "Gemini Nano",
      prompt: String(request).trim(),
      englishPrompt: englishRequest,
      createdAt: new Date().toISOString(),
    };
  } finally {
    session.destroy?.();
  }
}
