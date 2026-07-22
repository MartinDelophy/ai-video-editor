import { describe, expect, it } from "vitest";

import {
  createTimelineEdgeAutoScroller,
  getTimelineDragTimeDelta,
  getTimelineEdgeAutoScrollStep,
  getTimelineTrimDragClientX,
  getMobileTrimReleaseScrollLeft,
  getTrimScrollSettleStep,
  getTrimTrailingSpacerGeometry,
  getTrimLockedTrackWidth,
} from "./timelineEdgeAutoScroll.js";

describe("mobile timeline edge auto-scroll", () => {
  const rect = { left: 100, right: 500, width: 400 };

  it("scrolls toward the edge with progressive speed", () => {
    expect(getTimelineEdgeAutoScrollStep(100, rect)).toBe(-6);
    expect(getTimelineEdgeAutoScrollStep(500, rect)).toBe(14);
    expect(getTimelineEdgeAutoScrollStep(476, rect)).toBe(3.5);
  });

  it("returns toward the start more gently than it extends forward", () => {
    expect(Math.abs(getTimelineEdgeAutoScrollStep(100, rect))).toBeLessThan(getTimelineEdgeAutoScrollStep(500, rect));
  });

  it("uses one stable scale for pointer and scroll displacement", () => {
    expect(getTimelineDragTimeDelta({ clientX: 300, startX: 300, scrollOffset: 14, contentWidth: 1000, timelineDuration: 20 })).toBeCloseTo(0.28);
  });

  it("grows the track instead of compressing time when trimming extends the project", () => {
    expect(getTrimLockedTrackWidth(20, 50)).toBe(1000);
    expect(getTrimLockedTrackWidth(25, 50)).toBe(1250);
  });

  it("reserves one viewport of invisible trailing scroll space", () => {
    expect(getTrimTrailingSpacerGeometry(1100, 500)).toEqual({ left: 1100, width: 500 });
  });

  it("settles retained scroll space at the same gentle return speed", () => {
    expect(getTrimScrollSettleStep(700, 550)).toBe(694);
    expect(getTrimScrollSettleStep(553, 550)).toBe(550);
  });

  it("keeps desktop and mobile trim handles inside the visible viewport", () => {
    expect(getTimelineTrimDragClientX(520, rect)).toBe(490);
    expect(getTimelineTrimDragClientX(80, rect)).toBe(110);
    expect(getTimelineTrimDragClientX(300, rect)).toBe(300);
  });

  it("prevents the mobile fixed playhead from ending beyond the project", () => {
    expect(getMobileTrimReleaseScrollLeft(900, 700)).toBe(700);
    expect(getMobileTrimReleaseScrollLeft(500, 700)).toBe(500);
  });

  it("does not scroll inside the safe center region", () => {
    expect(getTimelineEdgeAutoScrollStep(300, rect)).toBe(0);
  });

  it("disables width transitions for the full mobile trim gesture", () => {
    const trackClasses = new Set();
    const rulerClasses = new Set();
    const makeClassList = (values) => ({ add: (value) => values.add(value), remove: (value) => values.delete(value) });
    const ruler = { classList: makeClassList(rulerClasses) };
    const track = {
      classList: makeClassList(trackClasses),
      closest: () => ({ querySelector: () => ruler }),
      parentElement: { scrollLeft: 0, getBoundingClientRect: () => rect },
    };
    const scroller = createTimelineEdgeAutoScroller({
      trackElement: track,
      pointerType: "touch",
      win: { matchMedia: () => ({ matches: true }), requestAnimationFrame: () => 1, cancelAnimationFrame() {} },
    });
    expect(trackClasses.has("is-trimming")).toBe(true);
    expect(rulerClasses.has("is-trimming")).toBe(true);
    scroller.stop();
    expect(trackClasses.has("is-trimming")).toBe(false);
    expect(rulerClasses.has("is-trimming")).toBe(false);
  });

  it("never creates or settles a desktop trailing spacer on mobile", () => {
    let appended = 0;
    const scrollElement = {
      clientWidth: 400,
      scrollLeft: 120,
      ownerDocument: { createElement: () => ({}) },
      appendChild: () => { appended += 1; },
    };
    const track = {
      classList: { add() {}, remove() {} },
      closest: () => null,
      parentElement: scrollElement,
    };
    const scroller = createTimelineEdgeAutoScroller({
      trackElement: track,
      pointerType: "touch",
      win: { matchMedia: () => ({ matches: true }), requestAnimationFrame: () => 1, cancelAnimationFrame() {} },
    });
    scroller.stop();
    expect(appended).toBe(0);
    expect(scrollElement.scrollLeft).toBe(120);
  });

  it("clamps only mobile release scrolling to the final track end", () => {
    const createScroller = (isMobile, pointerType) => {
      const scrollElement = {
        clientWidth: 400,
        scrollLeft: 900,
        getBoundingClientRect: () => rect,
      };
      const track = {
        classList: { add() {}, remove() {} },
        closest: () => null,
        getBoundingClientRect: () => ({ width: 700 }),
        parentElement: scrollElement,
      };
      const scroller = createTimelineEdgeAutoScroller({
        trackElement: track,
        pointerType,
        win: { matchMedia: () => ({ matches: isMobile }), requestAnimationFrame: () => 1, cancelAnimationFrame() {} },
      });
      scroller.stop();
      return scrollElement.scrollLeft;
    };

    expect(createScroller(true, "touch")).toBe(700);
    expect(createScroller(false, "mouse")).toBe(900);
  });

  it("enables the same edge-scroll lifecycle for desktop mouse trimming", () => {
    const values = new Set();
    const track = {
      classList: { add: (value) => values.add(value), remove: (value) => values.delete(value) },
      closest: () => null,
      parentElement: { scrollLeft: 0, getBoundingClientRect: () => rect },
    };
    const scroller = createTimelineEdgeAutoScroller({
      trackElement: track,
      pointerType: "mouse",
      win: { matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 1, cancelAnimationFrame() {} },
    });
    expect(values.has("is-trimming")).toBe(true);
    expect(scroller.getDragClientX(520)).toBe(490);
    scroller.stop();
    expect(values.has("is-trimming")).toBe(false);
  });

  it("does not feed content-shrink anchor compensation back into drag time", () => {
    let contentWidth = 1250;
    let frameCallback = null;
    const scrollElement = {
      clientWidth: 500,
      scrollLeft: 700,
      scrollWidth: 1250,
      getBoundingClientRect: () => ({ left: 100, right: 500, width: 400 }),
    };
    const track = {
      classList: { add() {}, remove() {} },
      closest: () => null,
      getBoundingClientRect: () => ({ width: contentWidth }),
      parentElement: scrollElement,
    };
    const scroller = createTimelineEdgeAutoScroller({
      trackElement: track,
      pointerType: "mouse",
      timelineDuration: 25,
      win: {
        matchMedia: () => ({ matches: false }),
        requestAnimationFrame: (callback) => { frameCallback = callback; return 1; },
        cancelAnimationFrame() {},
        dispatchEvent() {},
        CustomEvent: class {},
      },
    });
    scroller.update(300);
    contentWidth = 1100;
    scrollElement.scrollWidth = 1100;
    scrollElement.scrollLeft = 600; // Browser-native clamp before our frame runs.
    frameCallback();
    expect(scrollElement.scrollLeft).toBe(600);
    expect(scroller.getScrollOffset()).toBe(0);
    scroller.stop();
  });
});
