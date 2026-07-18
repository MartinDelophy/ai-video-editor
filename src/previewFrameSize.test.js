import { describe, expect, it } from "vitest";
import { isValidPreviewShellMeasurement } from "./hooks/usePreviewFrameSize.js";

describe("large-canvas preview sizing", () => {
  it("documents that disconnected portal shells are not valid resize measurements", () => {
    expect(isValidPreviewShellMeasurement({ isConnected: true, clientWidth: 640, clientHeight: 360 })).toBe(true);
    expect(isValidPreviewShellMeasurement({ isConnected: false, clientWidth: 1, clientHeight: 1 })).toBe(false);
    expect(isValidPreviewShellMeasurement({ isConnected: true, clientWidth: 1, clientHeight: 1 })).toBe(false);
  });
});
