import { fetchFirstAvailableModel, mirroredModelFileUrls } from "./modelSources.js";

export const DEFAULT_CAPTION_FONT_ID = "default";
export const CAPTION_FONT_REPOSITORY = "timeline-studio-fonts";
export const CAPTION_FONT_REVISION = import.meta.env?.VITE_CAPTION_FONT_REVISION || "v1.0.0";

const SYSTEM_CAPTION_STACK =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

const font = (id, family, label, options = {}) => ({
  id,
  family,
  label,
  weight: options.weight || 400,
  category: options.category || "display",
  sample: options.sample || "字幕 Caption",
  googleFamily: options.googleFamily === false ? "" : (options.googleFamily || family),
  file: options.file || `${id}/font.ttf`,
  fallback: options.fallback || SYSTEM_CAPTION_STACK,
  license: options.license || "OFL-1.1",
});

export const CAPTION_FONT_CATALOG = [
  {
    id: DEFAULT_CAPTION_FONT_ID,
    family: "",
    label: "Default",
    weight: 700,
    category: "sans",
    sample: "字幕 Caption",
    googleFamily: "",
    file: "",
    fallback: SYSTEM_CAPTION_STACK,
    license: "system",
  },
  font("noto-sans-sc", "Noto Sans SC", "思源黑体", { weight: 700, category: "sans", sample: "清晰字幕" }),
  font("noto-serif-sc", "Noto Serif SC", "思源宋体", { weight: 700, category: "serif", sample: "电影字幕" }),
  font("zcool-kuaile", "ZCOOL KuaiLe", "站酷快乐体", { sample: "快乐字幕" }),
  font("zcool-qingke-huangyou", "ZCOOL QingKe HuangYou", "庆科黄油体", { sample: "复古标题" }),
  font("zcool-xiaowei", "ZCOOL XiaoWei", "站酷小薇体", { category: "serif", sample: "文艺字幕" }),
  font("ma-shan-zheng", "Ma Shan Zheng", "马善政毛笔楷书", { category: "script", sample: "国风字幕" }),
  font("long-cang", "Long Cang", "龙藏体", { category: "script", sample: "挥毫字幕" }),
  font("liu-jian-mao-cao", "Liu Jian Mao Cao", "刘建毛草", { category: "script", sample: "毛笔字幕" }),
  font("zhi-mang-xing", "Zhi Mang Xing", "志莽行书", { category: "script", sample: "行书字幕" }),
  font("noto-sans-tc", "Noto Sans TC", "思源黑体繁体", { weight: 700, category: "sans", sample: "繁體字幕" }),

  font("noto-sans-jp", "Noto Sans JP", "Noto Sans JP", { weight: 700, category: "sans", sample: "日本語字幕" }),
  font("noto-serif-jp", "Noto Serif JP", "Noto Serif JP", { weight: 700, category: "serif", sample: "映画字幕" }),
  font("m-plus-1p", "M PLUS 1p", "M PLUS 1p", { weight: 700, category: "sans", sample: "読みやすい字幕" }),
  font("klee-one", "Klee One", "Klee One", { weight: 600, category: "handwriting", sample: "手書きの字幕" }),
  font("zen-kaku-gothic-new", "Zen Kaku Gothic New", "Zen Kaku Gothic", { weight: 700, category: "sans", sample: "現代的な字幕" }),
  font("zen-maru-gothic", "Zen Maru Gothic", "Zen Maru Gothic", { weight: 700, category: "rounded", sample: "丸い字幕" }),
  font("zen-old-mincho", "Zen Old Mincho", "Zen Old Mincho", { weight: 700, category: "serif", sample: "物語の字幕" }),
  font("shippori-mincho", "Shippori Mincho", "Shippori Mincho", { weight: 700, category: "serif", sample: "上品な字幕" }),
  font("kaisei-decol", "Kaisei Decol", "Kaisei Decol", { weight: 700, category: "display", sample: "装飾字幕" }),
  font("hachi-maru-pop", "Hachi Maru Pop", "Hachi Maru Pop", { category: "handwriting", sample: "楽しい字幕" }),

  font("noto-sans-kr", "Noto Sans KR", "Noto Sans KR", { weight: 700, category: "sans", sample: "한국어 자막" }),
  font("noto-serif-kr", "Noto Serif KR", "Noto Serif KR", { weight: 700, category: "serif", sample: "영화 자막" }),
  font("black-han-sans", "Black Han Sans", "Black Han Sans", { category: "display", sample: "강한 자막" }),
  font("do-hyeon", "Do Hyeon", "Do Hyeon", { category: "display", sample: "또렷한 자막" }),
  font("jua", "Jua", "Jua", { category: "rounded", sample: "즐거운 자막" }),
  font("gamja-flower", "Gamja Flower", "Gamja Flower", { category: "handwriting", sample: "손글씨 자막" }),
  font("gowun-batang", "Gowun Batang", "Gowun Batang", { weight: 700, category: "serif", sample: "감성 자막" }),
  font("gowun-dodum", "Gowun Dodum", "Gowun Dodum", { category: "sans", sample: "편안한 자막" }),
  font("song-myung", "Song Myung", "Song Myung", { category: "serif", sample: "고전 자막" }),
  font("nanum-pen-script", "Nanum Pen Script", "Nanum Pen Script", { category: "handwriting", sample: "펜글씨 자막" }),

  font("inter", "Inter", "Inter", { weight: 700, category: "sans", sample: "Clear captions" }),
  font("montserrat", "Montserrat", "Montserrat", { weight: 700, category: "sans", sample: "Modern captions" }),
  font("poppins", "Poppins", "Poppins", { weight: 700, category: "rounded", sample: "Friendly captions" }),
  font("oswald", "Oswald", "Oswald", { weight: 700, category: "condensed", sample: "Bold captions" }),
  font("barlow-condensed", "Barlow Condensed", "Barlow Condensed", { weight: 700, category: "condensed", sample: "Compact captions" }),
  font("playfair-display", "Playfair Display", "Playfair Display", { weight: 700, category: "serif", sample: "Cinematic captions" }),
  font("bebas-neue", "Bebas Neue", "Bebas Neue", { category: "display", sample: "TITLE CAPTIONS" }),
  font("caveat", "Caveat", "Caveat", { weight: 700, category: "handwriting", sample: "Handwritten captions" }),
  font("lobster", "Lobster", "Lobster", { category: "script", sample: "Stylish captions" }),
  font("libre-baskerville", "Libre Baskerville", "Libre Baskerville", { weight: 700, category: "serif", sample: "Editorial captions" }),

  font("be-vietnam-pro", "Be Vietnam Pro", "Be Vietnam Pro", { weight: 700, category: "sans", sample: "Phụ đề tiếng Việt" }),
  font("noto-sans", "Noto Sans", "Noto Sans", { weight: 700, category: "sans", sample: "Phụ đề rõ ràng" }),
  font("noto-serif", "Noto Serif", "Noto Serif", { weight: 700, category: "serif", sample: "Phụ đề điện ảnh" }),
  font("merriweather", "Merriweather", "Merriweather", { weight: 700, category: "serif", sample: "Phụ đề nổi bật" }),
  font("baloo-2", "Baloo 2", "Baloo 2", { weight: 700, category: "rounded", sample: "Phụ đề vui vẻ" }),
  font("coiny", "Coiny", "Coiny", { category: "display", sample: "Phụ đề cá tính" }),

  font("rubik", "Rubik", "Rubik", { weight: 700, category: "rounded", sample: "Русские субтитры" }),
  font("pt-sans", "PT Sans", "PT Sans", { weight: 700, category: "sans", sample: "Чёткие субтитры" }),
  font("pt-serif", "PT Serif", "PT Serif", { weight: 700, category: "serif", sample: "Киносубтитры" }),
  font("russo-one", "Russo One", "Russo One", { category: "display", sample: "ЯРКИЕ ТИТРЫ" }),
  font("comfortaa", "Comfortaa", "Comfortaa", { weight: 700, category: "rounded", sample: "Мягкие субтитры" }),
  font("cormorant-garamond", "Cormorant Garamond", "Cormorant Garamond", { weight: 700, category: "serif", sample: "Элегантные титры" }),

  font("noto-sans-thai", "Noto Sans Thai", "Noto Sans Thai", { weight: 700, category: "sans", sample: "คำบรรยายภาษาไทย" }),
  font("noto-serif-thai", "Noto Serif Thai", "Noto Serif Thai", { weight: 700, category: "serif", sample: "คำบรรยายภาพยนตร์" }),
  font("ibm-plex-sans-thai", "IBM Plex Sans Thai", "IBM Plex Sans Thai", { weight: 700, category: "sans", sample: "คำบรรยายชัดเจน" }),
  font("ibm-plex-sans-thai-looped", "IBM Plex Sans Thai Looped", "IBM Plex Thai Looped", { weight: 700, category: "sans", sample: "คำบรรยายร่วมสมัย" }),
  font("bai-jamjuree", "Bai Jamjuree", "Bai Jamjuree", { weight: 700, category: "sans", sample: "คำบรรยายทันสมัย" }),
  font("kanit", "Kanit", "Kanit", { weight: 700, category: "display", sample: "คำบรรยายโดดเด่น" }),
  font("prompt", "Prompt", "Prompt", { weight: 700, category: "sans", sample: "คำบรรยายอ่านง่าย" }),
  font("sarabun", "Sarabun", "Sarabun", { weight: 700, category: "sans", sample: "คำบรรยายสบายตา" }),
  font("mitr", "Mitr", "Mitr", { weight: 700, category: "rounded", sample: "คำบรรยายเป็นมิตร" }),
  font("chonburi", "Chonburi", "Chonburi", { category: "display", sample: "คำบรรยายศิลป์" }),
];

const BY_ID = new Map(CAPTION_FONT_CATALOG.map((item) => [item.id, item]));

const LATIN_FONT_IDS = [
  "inter", "montserrat", "poppins", "oswald", "barlow-condensed",
  "playfair-display", "bebas-neue", "caveat", "lobster", "libre-baskerville",
];

const FONT_IDS_BY_LANGUAGE = {
  zh: [
    "noto-sans-sc", "noto-serif-sc", "zcool-kuaile", "zcool-qingke-huangyou",
    "zcool-xiaowei", "ma-shan-zheng", "long-cang", "liu-jian-mao-cao",
    "zhi-mang-xing", "noto-sans-tc",
  ],
  ja: [
    "noto-sans-jp", "noto-serif-jp", "m-plus-1p", "klee-one",
    "zen-kaku-gothic-new", "zen-maru-gothic", "zen-old-mincho",
    "shippori-mincho", "kaisei-decol", "hachi-maru-pop",
  ],
  ko: [
    "noto-sans-kr", "noto-serif-kr", "black-han-sans", "do-hyeon", "jua",
    "gamja-flower", "gowun-batang", "gowun-dodum", "song-myung", "nanum-pen-script",
  ],
  en: LATIN_FONT_IDS,
  es: LATIN_FONT_IDS,
  fr: LATIN_FONT_IDS,
  de: LATIN_FONT_IDS,
  pt: LATIN_FONT_IDS,
  vi: [
    "be-vietnam-pro", "noto-sans", "noto-serif", "inter", "montserrat",
    "poppins", "merriweather", "barlow-condensed", "baloo-2", "coiny",
  ],
  ru: [
    "montserrat", "rubik", "pt-sans", "pt-serif", "oswald",
    "russo-one", "comfortaa", "lobster", "caveat", "cormorant-garamond",
  ],
  th: [
    "noto-sans-thai", "noto-serif-thai", "ibm-plex-sans-thai",
    "ibm-plex-sans-thai-looped", "bai-jamjuree", "kanit",
    "prompt", "sarabun", "mitr", "chonburi",
  ],
};

export function getCaptionFont(fontId = DEFAULT_CAPTION_FONT_ID) {
  return BY_ID.get(fontId) || BY_ID.get(DEFAULT_CAPTION_FONT_ID);
}

export function getCaptionFontsForLanguage(language = "en") {
  const ids = FONT_IDS_BY_LANGUAGE[language] || LATIN_FONT_IDS;
  return [getCaptionFont(DEFAULT_CAPTION_FONT_ID), ...ids.map(getCaptionFont).filter(Boolean)];
}

export function resolveCaptionFontFamily(fontId) {
  const selected = getCaptionFont(fontId);
  return selected.id === DEFAULT_CAPTION_FONT_ID
    ? selected.fallback
    : `"${selected.family}", ${selected.fallback}`;
}

export function resolveCaptionFontWeight(fontId) {
  return getCaptionFont(fontId).weight || 700;
}

export function resolveCaptionStyleForSegment(captionStyle = {}, segment = null) {
  const overrides = segment?.styleOverrides ?? {};
  const legacyFontId = segment?.fontId && segment.fontId !== DEFAULT_CAPTION_FONT_ID
    ? segment.fontId
    : null;
  return {
    ...captionStyle,
    ...overrides,
    fontId: overrides.fontId || legacyFontId || captionStyle?.fontId || DEFAULT_CAPTION_FONT_ID,
  };
}

function googleFontsStylesheetUrl(selected) {
  const family = selected.googleFamily.trim().replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${selected.weight}&display=swap`;
}

const loadPromises = new Map();
const loadedFontFaces = new Map();
const FONT_CACHE_NAME = "timeline-studio-caption-fonts-v1";

async function loadMirroredFont(selected) {
  if (!CAPTION_FONT_REVISION || !globalThis.FontFace) return false;
  const canonicalUrl = `https://timeline-studio.local/caption-fonts/${CAPTION_FONT_REVISION}/${selected.file}`;
  let response = null;
  if (globalThis.caches) {
    const cache = await caches.open(FONT_CACHE_NAME);
    response = await cache.match(canonicalUrl);
  }
  if (!response) {
    const urls = mirroredModelFileUrls({
      repository: CAPTION_FONT_REPOSITORY,
      revision: CAPTION_FONT_REVISION,
      path: `fonts/${selected.file}`,
    });
    const remote = await fetchFirstAvailableModel(urls);
    response = remote.response;
    if (globalThis.caches) {
      const cache = await caches.open(FONT_CACHE_NAME);
      await cache.put(canonicalUrl, response.clone());
    }
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const face = new FontFace(selected.family, `url("${objectUrl}")`, {
    style: "normal",
    weight: String(selected.weight),
    display: "swap",
  });
  await face.load();
  document.fonts.add(face);
  loadedFontFaces.set(selected.id, { face, objectUrl });
  return true;
}

function loadGoogleFontStylesheet(selected) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`link[data-caption-font="${selected.id}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const link = existing || document.createElement("link");
    link.rel = "stylesheet";
    link.href = googleFontsStylesheetUrl(selected);
    link.dataset.captionFont = selected.id;
    link.addEventListener("load", () => {
      link.dataset.loaded = "true";
      resolve();
    }, { once: true });
    link.addEventListener("error", () => reject(new Error(`CAPTION_FONT_DOWNLOAD_FAILED:${selected.id}`)), { once: true });
    if (!existing) document.head.append(link);
  });
}

export async function ensureCaptionFontLoaded(fontId, text = "") {
  const selected = getCaptionFont(fontId);
  if (selected.id === DEFAULT_CAPTION_FONT_ID || typeof document === "undefined") return selected;
  const mirroredFace = loadedFontFaces.get(selected.id)?.face;
  const stylesheet = document.querySelector(`link[data-caption-font="${selected.id}"][data-loaded="true"]`);
  if (
    (mirroredFace?.status === "loaded" || stylesheet)
    && document.fonts?.check(`${selected.weight} 32px "${selected.family}"`, text || selected.sample)
  ) {
    return selected;
  }

  if (!loadPromises.has(selected.id)) {
    loadPromises.set(selected.id, (async () => {
      let mirrored = false;
      try {
        mirrored = await loadMirroredFont(selected);
      } catch {
        // Fall back to the public Google Fonts stylesheet below.
      }
      if (!mirrored) {
        if (!selected.googleFamily) throw new Error(`CAPTION_FONT_DOWNLOAD_FAILED:${selected.id}`);
        await loadGoogleFontStylesheet(selected);
      }
      await document.fonts.load(
        `${selected.weight} 32px "${selected.family}"`,
        text || selected.sample,
      );
      return selected;
    })().catch((error) => {
      loadPromises.delete(selected.id);
      throw error;
    }));
  }
  await loadPromises.get(selected.id);
  if (text) {
    await document.fonts.load(`${selected.weight} 32px "${selected.family}"`, text);
  }
  return selected;
}
