import { describe, expect, it } from "vitest";
import { APP_LANGUAGES, createTranslator } from "./i18n.js";

const keys = [
  "fileMenu", "projectMenuHeading", "newProject", "newProjectHint",
  "importProject", "importProjectHint", "exportProject", "exportProjectHint",
  "exportVideo", "exportSettings", "exportCaptions", "enableAudioTrack",
  "enableSourceTrack", "enableMusicTrack", "checkModelCache", "language",
];

describe("project chrome translations", () => {
  it("provides every project and export setting label in every supported language", () => {
    for (const { id } of APP_LANGUAGES) {
      const t = createTranslator(id);
      for (const key of keys) expect(t(key), `${id}.${key}`).not.toBe(key);
    }
  });

  it("does not fall back to English for localized interfaces", () => {
    const english = createTranslator("en");
    for (const { id } of APP_LANGUAGES.filter(({ id }) => !["en"].includes(id))) {
      const t = createTranslator(id);
      for (const key of keys) expect(t(key), `${id}.${key}`).not.toBe(english(key));
    }
  });
});
