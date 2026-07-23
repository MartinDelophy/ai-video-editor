import { UI_MESSAGE_COPY } from "./i18nMessages.js";

const templateCache = new Map();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileTemplates(language) {
  if (templateCache.has(language)) return templateCache.get(language);
  const entries = Object.entries(UI_MESSAGE_COPY[language] ?? UI_MESSAGE_COPY.en ?? {})
    .filter(([source]) => /\{\d+\}/.test(source))
    .map(([source, translated]) => {
      const placeholders = [...source.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1]));
      const pattern = source.split(/\{\d+\}/g).map(escapeRegex).join("(.*?)");
      return { literalLength: source.replace(/\{\d+\}/g, "").length, placeholders, regex: new RegExp(`^${pattern}$`), translated };
    })
    .sort((left, right) => right.literalLength - left.literalLength);
  templateCache.set(language, entries);
  return entries;
}

export function localizeUiMessage(message, language) {
  const text = String(message ?? "");
  const copy = UI_MESSAGE_COPY[language] ?? UI_MESSAGE_COPY.en ?? {};
  if (copy[text]) return copy[text];
  for (const entry of compileTemplates(language)) {
    const match = text.match(entry.regex);
    if (!match) continue;
    let result = entry.translated;
    entry.placeholders.forEach((placeholder, index) => {
      result = result.replaceAll(`{${placeholder}}`, match[index + 1] ?? "");
    });
    return result;
  }
  return text;
}
