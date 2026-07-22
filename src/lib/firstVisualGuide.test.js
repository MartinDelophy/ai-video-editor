import { describe, expect, it } from "vitest";

import { canShowFirstVisualGuide } from "./firstVisualGuide.js";

describe("first visual guide eligibility", () => {
  it("keeps the guide available for a new desktop session", () => {
    expect(canShowFirstVisualGuide()).toBe(true);
  });

  it("never opens the guide on mobile", () => {
    expect(canShowFirstVisualGuide({ isMobile: true })).toBe(false);
  });

  it("continues to respect desktop completion and session suppression", () => {
    expect(canShowFirstVisualGuide({ hasSeen: true })).toBe(false);
    expect(canShowFirstVisualGuide({ shownThisSession: true })).toBe(false);
  });
});
