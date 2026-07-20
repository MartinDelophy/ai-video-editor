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
