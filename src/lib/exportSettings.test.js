import { describe, expect, it } from "vitest";

import { getExportDimensions } from "./exportSettings.js";

describe("export dimensions", () => {
  it("uses the selected resolution as the short edge for landscape video", () => {
    expect(getExportDimensions({ width: 16, height: 9 }, 2160)).toEqual({ width: 3840, height: 2160 });
  });

  it("produces full vertical 4K instead of 1216x2160", () => {
    expect(getExportDimensions({ width: 9, height: 16 }, 2160)).toEqual({ width: 2160, height: 3840 });
  });

  it("keeps square exports square", () => {
    expect(getExportDimensions({ width: 1, height: 1 }, 1080)).toEqual({ width: 1080, height: 1080 });
  });
});
