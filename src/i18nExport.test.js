import { describe, expect, it } from "vitest";
import { APP_LANGUAGES, createTranslator } from "./i18n.js";

describe("export rendering translations", () => {
  it("provides localized offline-render phases for every supported interface language", () => {
    const keys = [
      "exportPreparing", "exportRecordingStream", "exportEmbeddedAudio", "exportOfflinePreparing",
      "exportOfflineRendering", "exportVerifyFile", "exportPrepareVisuals", "exportPrepareTracks",
      "exportMixAudio", "exportStartRecording", "exportRecording", "exportPackageFile",
      "exportCompatibility", "exportSaveFile", "exportComplete", "exportFailed",
    ];
    APP_LANGUAGES.forEach(({ id }) => {
      const t = createTranslator(id);
      keys.forEach((key) => expect(t(key)).not.toBe(key));
      expect(t("exportOfflineRendering")).toContain("{current}");
      expect(t("exportOfflineRendering")).toContain("{total}");
      expect(t("exportComplete")).not.toBe("exportComplete");
      expect(t("exportFailed")).not.toBe("exportFailed");
    });
  });
});
