import { describe, expect, it } from "vitest";

import { translateRemasterPhase } from "./remasterProgress.js";

describe("translateRemasterPhase", () => {
  const t = (key) => ({
    remasterProcessing: "Enhancing",
    remasterPhaseEnhancingFrame: "Enhancing frame {current} / {total}",
  })[key] || key;

  it("translates phase keys and replaces variables", () => {
    expect(translateRemasterPhase({
      phaseKey: "remasterPhaseEnhancingFrame",
      phaseParams: { current: 9, total: 301 },
    }, t)).toBe("Enhancing frame 9 / 301");
  });

  it("keeps legacy phase strings and supplies a translated fallback", () => {
    expect(translateRemasterPhase({ phase: "Legacy phase" }, t)).toBe("Legacy phase");
    expect(translateRemasterPhase({}, t)).toBe("Enhancing");
  });
});
