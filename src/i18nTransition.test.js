import { describe, expect, it } from "vitest";

import { APP_LANGUAGES, createTranslator, translateOptionName } from "./i18n.js";

describe("transition editor translations", () => {
  it("provides editor labels and localized transition names for every UI language", () => {
    APP_LANGUAGES.forEach(({ id }) => {
      const t = createTranslator(id);
      expect(t("transitionSettings")).not.toBe("transitionSettings");
      expect(t("close")).not.toBe("close");
      expect(t("duration")).not.toBe("duration");
      expect(t("secondsShort")).not.toBe("secondsShort");
      if (id !== "zh") expect(translateOptionName(id, "淡入淡出")).not.toBe("淡入淡出");
    });
  });
});
