import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default;

const RAW_KEY_ENGLISH = {
  apply: "Apply",
  cancel: "Cancel",
  canvasRatio: "Canvas ratio",
  clipDuration: "Clip duration",
  clipStart: "Clip start",
  complete: "Complete",
  layer: "Layer",
  lock: "Lock",
  reset: "Reset",
  visualBasic: "Basic",
};

const TARGET_CODES = { zh: "zh-CN", en: "en", ja: "ja", ko: "ko", es: "es", fr: "fr", de: "de", pt: "pt", th: "th", vi: "vi", ru: "ru", it: "it", id: "id" };
const requestedLanguages = new Set(process.argv.slice(2));
const keys = new Set();
const fallbackEnglish = new Map();

globalThis.__GENERATING_I18N__ = true;
const { APP_LANGUAGES, UI_COPY, createTranslator } = await import("../src/i18n.js");
const { I18N_COMPLETION_COPY: existingCompletion } = await import("../src/i18nCompletion.js");
for (const key of Object.keys(UI_COPY.en)) keys.add(key);

async function collectKeys(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const info = await stat(path);
    if (info.isDirectory()) await collectKeys(path);
    else if (/\.(?:js|jsx)$/.test(name) && !/\.test\.[^.]+$/.test(name) && name !== "i18nCompletion.js") {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(/\bt\(\s*["']([^"']+)["'](?:\s*,\s*["']([^"']*)["'])?/g)) {
        keys.add(match[1]);
        if (match[2]) fallbackEnglish.set(match[1], match[2]);
      }
    }
  }
}

async function collectDeclaredCopyKeys(path) {
  const source = await readFile(path, "utf8");
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  traverse(ast, {
    VariableDeclarator(path) {
      if (path.node.id?.type !== "Identifier" || !/_COPY$/.test(path.node.id.name) || path.node.init?.type !== "ObjectExpression") return;
      const englishProperty = path.node.init.properties.find((property) => property.type === "ObjectProperty" && (property.key.name === "en" || property.key.value === "en"));
      if (englishProperty?.value?.type !== "ObjectExpression") return;
      for (const property of englishProperty.value.properties) {
        if (property.type !== "ObjectProperty") continue;
        const key = property.key.name ?? property.key.value;
        if (typeof key !== "string") continue;
        keys.add(key);
        if (property.value.type === "StringLiteral") fallbackEnglish.set(key, property.value.value);
      }
    },
  });
}

function chunksFor(entries, maximumLength = 3500) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const entry of entries) {
    const line = `@@${entry.index}@@ ${entry.text.replace(/\s+/g, " ").trim()}`;
    if (current.length && length + line.length + 1 > maximumLength) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push({ ...entry, line });
    length += line.length + 1;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function restorePlaceholders(source, translated) {
  const placeholders = [...source.matchAll(/\{[^}]+\}/g)].map((match) => match[0]);
  let index = 0;
  return translated.replace(/\{[^}]+\}/g, () => placeholders[index++] ?? "");
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function translateChunk(chunk, target, attempt = 0) {
  const url = new URL("https://clients5.google.com/translate_a/t");
  url.searchParams.set("client", "dict-chrome-ex");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", target);
  url.searchParams.set("q", chunk.map(({ line }) => line).join("\n"));
  const response = await fetch(url, { headers: { "User-Agent": "Timeline-Studio-i18n/1.0" } });
  if (response.status === 429 && attempt < 6) {
    await wait(Math.min(30000, 1500 * (2 ** attempt)));
    return translateChunk(chunk, target, attempt + 1);
  }
  if (!response.ok) throw new Error(`Translation failed: ${response.status}`);
  const payload = await response.json();
  const translated = payload.join("");
  const values = new Map();
  for (const match of translated.matchAll(/@@(\d+)@@\s*([\s\S]*?)(?=\s*@@\d+@@|$)/g)) {
    values.set(Number(match[1]), match[2].trim());
  }
  for (const entry of chunk) {
    if (!values.has(entry.index)) throw new Error(`Missing translated entry K${entry.index} for ${target}`);
  }
  return values;
}

await collectKeys(new URL("../src", import.meta.url).pathname);
await collectDeclaredCopyKeys(new URL("../src/i18n.js", import.meta.url).pathname);
const sortedKeys = [...keys].sort();
const english = createTranslator("en");
const output = {};

for (const { id } of APP_LANGUAGES) {
  if (requestedLanguages.size && !requestedLanguages.has(id)) {
    output[id] = { ...(existingCompletion[id] ?? {}) };
    continue;
  }
  const current = createTranslator(id);
  const entries = sortedKeys.flatMap((key, index) => {
    const needsCompletion = !existingCompletion[id]?.[key] && (current(key) === key || (id !== "en" && current(key) === english(key)));
    if (!needsCompletion) return [];
    const englishText = english(key) === key ? fallbackEnglish.get(key) ?? RAW_KEY_ENGLISH[key] : english(key);
    if (!englishText) throw new Error(`No English source text for ${key}`);
    return needsCompletion ? [{ key, index, text: englishText }] : [];
  });
  output[id] = { ...(existingCompletion[id] ?? {}) };
  if (id === "en") {
    for (const entry of entries) output[id][entry.key] = entry.text;
    continue;
  }
  for (const chunk of chunksFor(entries)) {
    const translated = await translateChunk(chunk, TARGET_CODES[id]);
    for (const entry of chunk) output[id][entry.key] = restorePlaceholders(entry.text, translated.get(entry.index));
    await wait(350);
  }
  process.stdout.write(`${id}: ${entries.length} completed\n`);
}

for (const { id } of APP_LANGUAGES) {
  if (id === "en" || (requestedLanguages.size && !requestedLanguages.has(id))) continue;
  const english = createTranslator("en");
  for (const [key, value] of Object.entries(output[id] ?? {})) {
    const source = english(key);
    if (source !== key) output[id][key] = restorePlaceholders(source, value);
  }
}

const source = `// Generated by scripts/generate-i18n-completion.mjs.\n// Regenerate after adding user-visible t(\"…\") keys.\nexport const I18N_COMPLETION_COPY = ${JSON.stringify(output, null, 2)};\n`;
await writeFile(new URL("../src/i18nCompletion.js", import.meta.url), source);
