import { describe, expect, it } from "vitest";
import { APP_LANGUAGES, createTranslator } from "./i18n.js";

describe("visual animation translations", () => {
  it("provides native animation copy for every supported UI language", () => {
    for (const language of APP_LANGUAGES) {
      const t = createTranslator(language.id);
      expect(t("visualTabAnimation")).not.toBe("visualTabAnimation");
      expect(t("visualAnimationHoverHint")).not.toBe("visualAnimationHoverHint");
      expect(t("visualAnimationDuration")).not.toBe("visualAnimationDuration");
      expect(t("stickerProperties")).not.toBe("stickerProperties");
      expect(t("stickerOpacity")).not.toBe("stickerOpacity");
      expect(t("deleteSticker")).not.toBe("deleteSticker");
    }
  });
});
