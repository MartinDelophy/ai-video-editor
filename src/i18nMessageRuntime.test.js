import { describe, expect, it } from "vitest";
import { localizeUiMessage } from "./i18nMessageRuntime.js";

describe("localized legacy UI messages", () => {
  it("translates exact hard-coded notifications", () => {
    const translated = localizeUiMessage("没有可撤销的编辑操作", "ko");
    expect(translated).not.toBe("没有可撤销的编辑操作");
    expect(translated).toMatch(/[가-힣]/);
  });

  it("translates templated notifications and preserves their values", () => {
    expect(localizeUiMessage("画布比例已切换为 9:16", "en")).toBe("Canvas scale switched to 9:16");
    expect(localizeUiMessage("画布比例已切换为 9:16", "vi")).toContain("9:16");
  });

  it("leaves unknown external errors intact", () => {
    expect(localizeUiMessage("HTTP 503", "fr")).toBe("HTTP 503");
  });
});
