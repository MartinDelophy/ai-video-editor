import { describe, expect, it } from "vitest";
import { APP_LANGUAGES, createTranslator } from "./i18n.js";

describe("mobile drawer translations", () => {
  it("provides every drawer header label in every supported language", () => {
    APP_LANGUAGES.forEach(({ id }) => {
      const t = createTranslator(id);
      expect(t("mobilePanelView")).not.toBe("mobilePanelView");
      expect(t("mobileDrawerTools")).not.toBe("mobileDrawerTools");
      expect(t("properties")).not.toBe("properties");
      expect(t("mobileAddMedia")).not.toBe("mobileAddMedia");
      expect(t("mobileAddMedia")).not.toBe("mobileAddMedia");
      expect(t("mobileAddToMainTrack")).not.toBe("mobileAddToMainTrack");
      expect(t("mobileAddToVoice")).not.toBe("mobileAddToVoice");
      expect(t("mobileAddToMusic")).not.toBe("mobileAddToMusic");
      expect(t("mobileClipEdit")).not.toBe("mobileClipEdit");
      expect(t("mobileClipAudio")).not.toBe("mobileClipAudio");
      expect(t("mobileClipCaptions")).not.toBe("mobileClipCaptions");
      expect(t("mobileClipSeparate")).not.toBe("mobileClipSeparate");
      expect(t("mobileClipSplit")).not.toBe("mobileClipSplit");
      expect(t("mobileClipCopy")).not.toBe("mobileClipCopy");
      expect(t("mobileClipDelete")).not.toBe("mobileClipDelete");
      expect(t("addSticker")).not.toBe("addSticker");
      expect(t("mobileStickerActions")).not.toBe("mobileStickerActions");
      expect(t("mobileStickerCancel")).not.toBe("mobileStickerCancel");
    });
  });

  it("uses English labels in the English interface", () => {
    const t = createTranslator("en");
    expect(t("mobilePanelView")).toBe("Drawer view");
    expect(t("mobileDrawerTools")).toBe("Tools");
    expect(t("properties")).toBe("Properties");
    expect(t("mobileAddMedia")).toBe("Add media");
    expect(t("mobileAddMedia")).toBe("Add media");
    expect(t("mobileAddToMainTrack")).toBe("Add to main track");
  });
});
