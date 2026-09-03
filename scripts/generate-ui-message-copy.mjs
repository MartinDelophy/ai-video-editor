import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const traverse = traverseModule.default;
const LANGUAGES = { zh: "zh-CN", en: "en", ja: "ja", ko: "ko", es: "es", fr: "fr", de: "de", pt: "pt", th: "th", vi: "vi", ru: "ru", it: "it", id: "id" };
const requestedLanguages = new Set(process.argv.slice(2));
const messages = new Set();
const USER_MESSAGE_CALL = /^(?:notify|commit|clear|replace|setStatus|setStatusText|reject|onProgress|confirm|alert|Error)/;

function callName(node) {
  const callee = node.callee;
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "MemberExpression") return callee.property?.name ?? callee.property?.value ?? "";
  return "";
}

function belongsToUserMessage(path) {
  return Boolean(path.findParent((parent) => (parent.isCallExpression() || parent.isNewExpression()) && USER_MESSAGE_CALL.test(callName(parent.node))));
}

async function collectMessages(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const info = await stat(path);
    if (info.isDirectory()) await collectMessages(path);
    else if (/\.(?:js|jsx)$/.test(name) && !/\.test\.[^.]+$/.test(name) && !/i18n|ttsText|asr\.js|workers/.test(path)) {
      const source = await readFile(path, "utf8");
      const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
      traverse(ast, {
        StringLiteral(path) {
          if (/[\u3400-\u9fff]/u.test(path.node.value) && belongsToUserMessage(path)) messages.add(path.node.value.replace(/\s+/g, " ").trim());
        },
        TemplateLiteral(path) {
          const value = path.node.quasis.map((part, index) => `${part.value.cooked}${index < path.node.expressions.length ? `{${index}}` : ""}`).join("").replace(/\s+/g, " ").trim();
          if (/[\u3400-\u9fff]/u.test(value) && belongsToUserMessage(path)) messages.add(value);
        },
      });
    }
  }
}

function chunksFor(entries, maximumLength = 900) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const entry of entries) {
    const line = `@@${entry.index}@@ ${entry.source}`;
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

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function translateChunk(chunk, target, attempt = 0) {
  const url = new URL("https://clients5.google.com/translate_a/t");
  url.searchParams.set("client", "dict-chrome-ex");
  url.searchParams.set("sl", "zh-CN");
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
  for (const match of translated.matchAll(/@@(\d+)@@\s*([\s\S]*?)(?=\s*@@\d+@@|$)/g)) values.set(Number(match[1]), match[2].trim());
  for (const entry of chunk) if (!values.has(entry.index)) throw new Error(`Missing translated message ${entry.index} for ${target}`);
  return values;
}

async function translateText(source, target, attempt = 0) {
  const url = new URL("https://clients5.google.com/translate_a/t");
  url.searchParams.set("client", "dict-chrome-ex");
  url.searchParams.set("sl", "zh-CN");
  url.searchParams.set("tl", target);
  url.searchParams.set("q", source);
  const response = await fetch(url, { headers: { "User-Agent": "Timeline-Studio-i18n/1.0" } });
  if (response.status === 429 && attempt < 6) {
    await wait(Math.min(30000, 1500 * (2 ** attempt)));
    return translateText(source, target, attempt + 1);
  }
  if (!response.ok) throw new Error(`Translation failed: ${response.status}`);
  const payload = await response.json();
  return payload.join("").trim();
}

await collectMessages(new URL("../src", import.meta.url).pathname);
const entries = [...messages].sort().map((source, index) => ({ index, source }));
const output = {};
const { UI_MESSAGE_COPY: existingCopy } = await import("../src/i18nMessages.js");

for (const [language, target] of Object.entries(LANGUAGES)) {
  output[language] = { ...(existingCopy[language] ?? {}) };
  if (requestedLanguages.size && !requestedLanguages.has(language)) continue;
  const missingEntries = entries.filter(({ source }) => !output[language][source]);
  if (language === "zh") {
    for (const entry of missingEntries) output[language][entry.source] = entry.source;
  } else {
    for (const chunk of chunksFor(missingEntries)) {
      const translated = await translateChunk(chunk, target);
      for (const entry of chunk) output[language][entry.source] = translated.get(entry.index);
      await wait(350);
    }
    const templates = missingEntries.filter(({ source }) => /\{\d+\}/.test(source));
    for (let index = 0; index < templates.length; index += 6) {
      const batch = templates.slice(index, index + 6);
      const translated = await Promise.all(batch.map(({ source }) => translateText(source, target)));
      batch.forEach((entry, itemIndex) => { output[language][entry.source] = translated[itemIndex]; });
    }
  }
  process.stdout.write(`${language}: ${entries.length} messages\n`);
}

const source = `// Generated by scripts/generate-ui-message-copy.mjs.\nexport const UI_MESSAGE_COPY = ${JSON.stringify(output, null, 2)};\n`;
await writeFile(new URL("../src/i18nMessages.js", import.meta.url), source);
