import { describe, expect, it } from "vitest";

import { setCaptionSegmentPlacement } from "./captionEditingActions.js";

describe("caption canvas placement", () => {
  it("moves only the caption selected on the preview canvas", () => {
    const source = [
      { id: "first", text: "First", placement: { x: 30, y: 40 } },
      { id: "second", text: "Second", placement: { x: 60, y: 70 } },
    ];

    const result = setCaptionSegmentPlacement(source, "first", { x: 45, y: 55 });

    expect(result[0].placement).toEqual({ x: 45, y: 55 });
    expect(result[1]).toBe(source[1]);
    expect(source[0].placement).toEqual({ x: 30, y: 40 });
  });

});
