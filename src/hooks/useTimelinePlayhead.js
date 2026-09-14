import { useLayoutEffect, useRef } from "react";

function playbackTime(state, now) {
  const duration = Math.max(0, Number(state.playbackDuration) || 0);
  const startedAt = Number(state.visualPlaybackStartedAtRef?.current);
  const startTime = Number(state.visualPlaybackStartTimeRef?.current);
  const time = state.isPlaying
    ? startedAt > 0 && Number.isFinite(startTime)
      ? startTime + Math.max(0, now - startedAt) / 1000
      : Number(state.currentTimeRef?.current) || state.currentTime
    : state.currentTime;
  return Math.max(0, Math.min(state.isPlaying ? duration : state.timelineDuration, Number(time) || 0));
}

// The playback clock is deliberately independent from React's scheduled
// inspector/timecode updates. On desktop, native transform animations also keep
// the line and ruler triangle moving when a React commit occupies the main
// thread. rAF follows the same clock for mobile scrolling and older browsers.
export function useTimelinePlayhead(state) {
  const playheadRef = useRef(null);
  const rulerPlayheadRef = useRef(null);
  const stateRef = useRef(state);
  const syncRef = useRef(null);
  stateRef.current = state;

  useLayoutEffect(() => {
    const track = state.trackScrollRef.current;
    const ruler = state.rulerCanvasRef.current;
    const scroll = track?.parentElement;
    if (!track || !ruler || !scroll) return undefined;
    const mobile = window.matchMedia?.("(max-width: 760px)");
    let trackWidth = 0;
    let rulerWidth = 0;
    let frameId = 0;
    let animationKey = "";
    let animations = [];
    let lastAriaTime = -1;

    const stopAnimations = () => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
      animationKey = "";
    };
    const position = (now) => {
      const current = stateRef.current;
      const time = playbackTime(current, now);
      const duration = Math.max(0.001, Number(current.timelineDuration) || 0.001);
      const ratio = Math.max(0, Math.min(1, time / duration));
      const line = playheadRef.current;
      const triangle = rulerPlayheadRef.current;
      if (!line || !triangle) return;
      const canAnimate = current.isPlaying && !mobile?.matches
        && current.playbackDuration > time
        && typeof line.animate === "function" && typeof triangle.animate === "function";
      const key = canAnimate
        ? [current.visualPlaybackStartTimeRef?.current, current.visualPlaybackStartedAtRef?.current,
          current.playbackDuration, duration, trackWidth, rulerWidth].join(":")
        : "";

      if (!canAnimate || key !== animationKey) {
        // Install the exact current position before cancelling an older native
        // animation so pause, seeking and zoom never reveal its stale origin.
        line.style.transform = `translate3d(${ratio * trackWidth}px, 0, 0)`;
        triangle.style.transform = `translate3d(${ratio * rulerWidth}px, 0, 0)`;
        stopAnimations();
        if (canAnimate) {
          const remainingMs = (current.playbackDuration - time) * 1000;
          const endRatio = Math.max(0, Math.min(1, current.playbackDuration / duration));
          const startTime = document.timeline?.currentTime;
          animations = [[line, trackWidth], [triangle, rulerWidth]].map(([element, width]) => {
            const animation = element.animate([
              { transform: `translate3d(${ratio * width}px, 0, 0)` },
              { transform: `translate3d(${endRatio * width}px, 0, 0)` },
            ], { duration: remainingMs, easing: "linear", fill: "forwards" });
            if (typeof startTime === "number") animation.startTime = startTime;
            return animation;
          });
          animationKey = key;
        }
      }
      if (current.isPlaying && mobile?.matches) {
        scroll.scrollLeft = ratio * trackWidth;
        // Keep the sticky ruler in the same frame; its normal scroll listener
        // still publishes the lower-frequency viewport/thumbnail state.
        ruler.style.transform = `translateX(${-scroll.scrollLeft}px)`;
      }
      const ariaTime = Math.round(time);
      if (ariaTime !== lastAriaTime) {
        line.setAttribute("aria-valuenow", String(ariaTime));
        lastAriaTime = ariaTime;
      }
    };
    const tick = (now) => {
      frameId = 0;
      position(now);
      if (stateRef.current.isPlaying) frameId = window.requestAnimationFrame(tick);
    };
    const sync = () => {
      position(performance.now());
      if (stateRef.current.isPlaying && !frameId) frameId = window.requestAnimationFrame(tick);
      if (!stateRef.current.isPlaying && frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }
    };
    const measure = () => {
      trackWidth = track.getBoundingClientRect().width;
      rulerWidth = ruler.getBoundingClientRect().width;
      sync();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(track);
    observer?.observe(ruler);
    window.addEventListener("resize", measure);
    mobile?.addEventListener?.("change", measure);
    syncRef.current = sync;
    measure();
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      stopAnimations();
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      mobile?.removeEventListener?.("change", measure);
      if (syncRef.current === sync) syncRef.current = null;
    };
  }, [state.trackScrollRef, state.rulerCanvasRef]);

  useLayoutEffect(() => {
    syncRef.current?.();
  }, [state.currentTime, state.isPlaying, state.playbackDuration, state.timelineDuration]);

  return { playheadRef, rulerPlayheadRef };
}
