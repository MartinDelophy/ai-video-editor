import { describe, expect, it } from "vitest";
import { APP_LANGUAGES, createTranslator } from "./i18n.js";

describe("SRT import translations", () => {
  it("localizes every user-visible import state in every supported language", () => {
    const keys = ["importSrt", "srtConflictTitle", "srtConflictDescription", "replaceSrt", "appendSrt", "srtImportComplete", "srtImportFailed", "srtFileTooLarge", "srtNoValidCaptions"];
    for (const language of APP_LANGUAGES) {
      const t = createTranslator(language.id);
      for (const key of keys) expect(t(key), `${language.id}:${key}`).not.toBe(key);
    }
    expect(createTranslator("ru")("importSrt")).toBe("Импорт SRT");
  });
});
