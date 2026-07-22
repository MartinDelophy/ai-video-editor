import { flushSync } from "react-dom";

const MOBILE_TIMELINE_QUERY = "(max-width: 760px)";
export const TIMELINE_TRIM_SCALE_START_EVENT = "timeline-trim-scale-start";
export const TIMELINE_TRIM_SCALE_END_EVENT = "timeline-trim-scale-end";

export function getTimelineDragTimeDelta({ clientX, startX, scrollOffset = 0, contentWidth, timelineDuration }) {
  if (![clientX, startX, scrollOffset, contentWidth, timelineDuration].every(Number.isFinite) || contentWidth <= 0) return 0;
  return ((clientX - startX + scrollOffset) / contentWidth) * timelineDuration;
}

export function getTrimLockedTrackWidth(timelineDuration, pixelsPerSecond) {
  const duration = Math.max(0, Number(timelineDuration) || 0);
  const scale = Math.max(0, Number(pixelsPerSecond) || 0);
  return duration * scale;
}

export function getTrimTrailingSpacerGeometry(contentWidth, viewportWidth) {
  return {
    left: Math.max(0, Number(contentWidth) || 0),
    width: Math.max(0, Number(viewportWidth) || 0),
  };
}

export function getTrimScrollSettleStep(scrollLeft, nativeMaximum, maxStep = 6) {
  const current = Math.max(0, Number(scrollLeft) || 0);
  const maximum = Math.max(0, Number(nativeMaximum) || 0);
  const step = Math.max(0, Number(maxStep) || 0);
  return Math.max(maximum, current - step);
}

export function getTimelineEdgeAutoScrollStep(clientX, rect, { threshold = 48, forwardMaxStep = 14, backwardMaxStep = 6 } = {}) {
  if (!rect || !Number.isFinite(clientX) || rect.width <= 0) return 0;
  const getStep = (distanceFromEdge, maxStep) => {
    const strength = Math.min(1, Math.max(0, (threshold - Math.max(0, distanceFromEdge)) / threshold));
    return Math.max(0.35, strength ** 2 * maxStep);
  };
  if (clientX < rect.left + threshold) {
    return -getStep(clientX - rect.left, backwardMaxStep);
  }
  if (clientX > rect.right - threshold) {
    return getStep(rect.right - clientX, forwardMaxStep);
  }
  return 0;
}

export function createTimelineEdgeAutoScroller({ trackElement, pointerType, timelineDuration = 0, onScrollFrame, win = globalThis.window } = {}) {
  const scrollElement = trackElement?.parentElement;
  const isMobile = Boolean(win?.matchMedia?.(MOBILE_TIMELINE_QUERY).matches);
  const enabled = Boolean(scrollElement) && (
    (pointerType === "touch" && isMobile)
    || (["mouse", "pen"].includes(pointerType) && !isMobile)
  );
  const usesDesktopTrailingSpacer = enabled && !isMobile;
  const rulerElement = enabled ? trackElement.closest?.(".timeline-board")?.querySelector?.(".timeline-ruler-canvas") : null;
  if (enabled) {
    trackElement.classList?.add("is-trimming");
    rulerElement?.classList?.add("is-trimming");
    const contentWidth = trackElement.getBoundingClientRect?.().width || trackElement.clientWidth || 0;
    const viewportWidth = scrollElement.clientWidth || contentWidth;
    if (contentWidth > 0 && timelineDuration > 0 && win?.dispatchEvent && win?.CustomEvent) {
      flushSync(() => win.dispatchEvent(new win.CustomEvent(TIMELINE_TRIM_SCALE_START_EVENT, {
        detail: {
          pixelsPerSecond: contentWidth / timelineDuration,
          visibleDuration: (viewportWidth * timelineDuration) / contentWidth,
        },
      })));
    }
  }
  let previousContentWidth = trackElement?.getBoundingClientRect?.().width || trackElement?.clientWidth || 0;
  let logicalScrollOffset = 0;
  let latestClientX = 0;
  let frameId = 0;
  let spacerElement = null;

  const updateTrailingSpacer = (contentWidth = previousContentWidth) => {
    if (!enabled || !spacerElement) return;
    const geometry = getTrimTrailingSpacerGeometry(contentWidth, scrollElement.clientWidth);
    spacerElement.style.left = `${geometry.left}px`;
    spacerElement.style.width = `${geometry.width}px`;
  };

  if (usesDesktopTrailingSpacer && scrollElement?.ownerDocument?.createElement) {
    const previousSpacer = scrollElement.querySelector?.("[data-timeline-trim-scroll-spacer]");
    previousSpacer?.__timelineTrimCleanup?.();
    previousSpacer?.remove?.();
    spacerElement = scrollElement.ownerDocument.createElement("div");
    spacerElement.setAttribute("data-timeline-trim-scroll-spacer", "");
    Object.assign(spacerElement.style, {
      position: "absolute",
      top: "0",
      height: "1px",
      pointerEvents: "none",
      visibility: "hidden",
    });
    updateTrailingSpacer();
    scrollElement.appendChild(spacerElement);
  }

  const syncContentWidth = () => {
    if (!enabled) return;
    const nextContentWidth = trackElement?.getBoundingClientRect?.().width || trackElement?.clientWidth || previousContentWidth;
    updateTrailingSpacer(nextContentWidth);
    previousContentWidth = nextContentWidth;
  };

  const tick = () => {
    frameId = 0;
    if (!enabled) return;
    syncContentWidth();
    const rect = scrollElement.getBoundingClientRect();
    const step = getTimelineEdgeAutoScrollStep(latestClientX, rect);
    if (!step) return;
    const before = scrollElement.scrollLeft;
    const requestedScrollDelta = step < 0 ? Math.max(-before, step) : step;
    if (requestedScrollDelta) {
      flushSync(() => onScrollFrame?.(latestClientX, logicalScrollOffset + requestedScrollDelta));
      syncContentWidth();
      const maximumAfterUpdate = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
      const beforeEdgeScroll = scrollElement.scrollLeft;
      scrollElement.scrollLeft = Math.max(0, Math.min(maximumAfterUpdate, beforeEdgeScroll + requestedScrollDelta));
      logicalScrollOffset += scrollElement.scrollLeft - beforeEdgeScroll;
    }
    const after = scrollElement.scrollLeft;
    const maximum = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
    if (!frameId && ((step < 0 && after > 0) || (step > 0 && after < maximum))) frameId = win.requestAnimationFrame(tick);
  };

  return {
    update(clientX) {
      latestClientX = clientX;
      if (enabled && !frameId) frameId = win.requestAnimationFrame(tick);
    },
    getScrollOffset() {
      return enabled ? logicalScrollOffset : 0;
    },
    stop() {
      if (frameId) win.cancelAnimationFrame(frameId);
      frameId = 0;
      if (enabled && win?.dispatchEvent && win?.CustomEvent) {
        flushSync(() => win.dispatchEvent(new win.CustomEvent(TIMELINE_TRIM_SCALE_END_EVENT)));
      }
      trackElement?.classList?.remove("is-trimming");
      rulerElement?.classList?.remove("is-trimming");
      syncContentWidth();
      if (spacerElement) {
        let settleFrameId = 0;
        const removeSpacer = () => {
          if (settleFrameId) win.cancelAnimationFrame(settleFrameId);
          settleFrameId = 0;
          spacerElement?.remove?.();
          spacerElement = null;
        };
        const settleSpacer = () => {
          settleFrameId = 0;
          const nativeMaximum = Math.max(0, previousContentWidth - scrollElement.clientWidth);
          if (scrollElement.scrollLeft <= nativeMaximum + 0.5) {
            removeSpacer();
            return;
          }
          scrollElement.scrollLeft = getTrimScrollSettleStep(scrollElement.scrollLeft, nativeMaximum);
          settleFrameId = win.requestAnimationFrame(settleSpacer);
        };
        spacerElement.__timelineTrimCleanup = removeSpacer;
        settleSpacer();
      }
    },
  };
}
