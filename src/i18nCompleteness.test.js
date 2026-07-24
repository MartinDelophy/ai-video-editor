import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_LANGUAGES, UI_COPY, createTranslator } from "./i18n.js";
import { I18N_COMPLETION_COPY } from "./i18nCompletion.js";

function collectRuntimeTranslationKeys(directory, keys = new Set()) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const info = statSync(path);
    if (info.isDirectory() && name !== "vendor") collectRuntimeTranslationKeys(path, keys);
    else if (/\.(?:js|jsx)$/.test(name) && !/\.test\.[^.]+$/.test(name) && name !== "i18nCompletion.js") {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/\bt\(\s*["']([^"']+)["']/g)) keys.add(match[1]);
    }
  }
  return keys;
}

describe("complete editor localization", () => {
  const runtimeKeys = collectRuntimeTranslationKeys(new URL(".", import.meta.url).pathname);
  const editorKeys = new Set([...Object.keys(UI_COPY.en), ...runtimeKeys]);

  it("resolves every static and dynamic editor key in every supported language", () => {
    for (const { id } of APP_LANGUAGES) {
      const t = createTranslator(id);
      for (const key of editorKeys) expect(t(key), `${id}.${key}`).not.toBe(key);
    }
  });

  it("records every remaining English-equivalent fallback as an explicit locale entry", () => {
    const english = createTranslator("en");
    for (const { id } of APP_LANGUAGES.filter(({ id }) => id !== "en")) {
      const t = createTranslator(id);
      for (const key of editorKeys) {
        if (t(key) === english(key)) {
          expect(Object.hasOwn(I18N_COMPLETION_COPY[id] ?? {}, key), `${id}.${key}`).toBe(true);
        }
      }
    }
  });
});
