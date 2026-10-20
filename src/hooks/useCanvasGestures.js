import { useEffect, useRef } from "react";

// Trackpad pinch arrives as Ctrl+wheel in Chromium and GestureEvent in WebKit.
// A non-passive listener on the canvas owns these events before the browser
// can zoom the document or chain a horizontal pan into history navigation.
export function useCanvasGestures(elementRef, options) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let gestureScale = null;
    const control = (event) =>
      event.target instanceof Element &&
      event.target.closest(current.current.controls || "textarea, input, select");
    const anchor = (event) => {
      const rect = element.getBoundingClientRect();
      return {
        x: Number.isFinite(event.clientX) ? event.clientX - rect.left : rect.width / 2,
        y: Number.isFinite(event.clientY) ? event.clientY - rect.top : rect.height / 2,
      };
    };
    const consume = (event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };
    const wheel = (event) => {
      const pinch = event.ctrlKey || event.metaKey;
      // Native scrolling inside controls remains available. Pinch must never
      // escape into browser zoom, even over a control or while storage loads.
      if (control(event)) {
        if (pinch) consume(event);
        else event.stopPropagation();
        return;
      }
      consume(event);
      if (!current.current.enabled || gestureScale !== null) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      if (pinch) {
        current.current.onZoom(
          Math.exp(-Math.max(-240, Math.min(240, event.deltaY * unit)) * 0.002),
          anchor(event),
        );
      } else current.current.onPan(event.deltaX * unit, event.deltaY * unit);
    };
    const gestureStart = (event) => {
      consume(event);
      gestureScale = control(event) ? 0 : 1;
    };
    const gestureChange = (event) => {
      consume(event);
      if (
        !gestureScale ||
        !current.current.enabled ||
        !Number.isFinite(event.scale) ||
        event.scale <= 0
      )
        return;
      current.current.onZoom(event.scale / gestureScale, anchor(event));
      gestureScale = event.scale;
    };
    const gestureEnd = (event) => {
      consume(event);
      gestureScale = null;
    };
    const resetGesture = () => {
      gestureScale = null;
    };
    window.addEventListener("blur", resetGesture);
    const listeners = {
      wheel,
      gesturestart: gestureStart,
      gesturechange: gestureChange,
      gestureend: gestureEnd,
    };
    for (const [type, listener] of Object.entries(listeners))
      element.addEventListener(type, listener, { passive: false, capture: true });
    return () => {
      window.removeEventListener("blur", resetGesture);
      for (const [type, listener] of Object.entries(listeners))
        element.removeEventListener(type, listener, true);
    };
  }, [elementRef]);
}
