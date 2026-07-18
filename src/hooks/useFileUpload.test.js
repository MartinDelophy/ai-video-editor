import { describe, expect, it } from "vitest";

import { shouldAutoAddImportedVisual } from "./useFileUpload.js";

describe("visual import placement", () => {
  it("auto-adds the first project visual only", () => {
    const assets = [{ type: "audio" }, { type: "image" }, { type: "video" }];
    expect(shouldAutoAddImportedVisual(assets, [])).toBe(true);
    expect(shouldAutoAddImportedVisual(assets, [{ id: "existing" }])).toBe(false);
  });

  it("does not auto-add audio-only imports", () => {
    expect(shouldAutoAddImportedVisual([{ type: "audio" }], [])).toBe(false);
  });
});
