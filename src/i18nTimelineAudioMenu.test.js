import { describe, expect, it } from "vitest";
import { APP_LANGUAGES, createTranslator } from "./i18n.js";

describe("timeline audio context-menu translations", () => {
  it("provides localized mute and separate-audio labels for every interface language", () => {
    APP_LANGUAGES.forEach(({ id }) => {
      const t = createTranslator(id);
      expect(t("muteClip")).not.toBe("muteClip");
      expect(t("unmuteClip")).not.toBe("unmuteClip");
      expect(t("separateSourceAudio")).not.toBe("separateSourceAudio");
    });
  });

  it("uses English labels in the English context menu", () => {
    const t = createTranslator("en");
    expect(t("muteClip")).toBe("Mute");
    expect(t("unmuteClip")).toBe("Unmute");
    expect(t("separateSourceAudio")).toBe("Separate audio");
  });
});
