import { describe, expect, it } from "vitest";

import { snapCaptionPlacement } from "./captionEditingActions.js";

describe("caption canvas snapping", () => {
  it("snaps captions to the horizontal center and bottom safe position", () => {
    expect(snapCaptionPlacement(49.2, 77.4, 1, 1)).toEqual({
      x: 50, y: 78, guideX: 50, guideY: 78,
    });
  });

  it("keeps freely placed captions outside the snap threshold", () => {
    expect(snapCaptionPlacement(42, 63, 1, 1)).toEqual({
      x: 42, y: 63, guideX: null, guideY: null,
    });
  });
});
