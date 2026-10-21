import { useEffect, useRef } from "react";

const IDLE_MS = 180;

/** Own a complete trackpad gesture, painting at most once per animation frame. */
export function bindCanvasGestures(element, getOptions) {
  let owner = null, nativeControl = null, gestureScale = null;
  let desired = null, frame = 0, idle = 0, gestureWatchdog = 0;
  const control = event => event.target instanceof Element
    ? event.target.closest(getOptions().controls || "textarea,input,select") : null;
  const anchor = event => {
    const rect = element.getBoundingClientRect();
    return { x: Number.isFinite(event.clientX) ? event.clientX - rect.left : rect.width / 2,
      y: Number.isFinite(event.clientY) ? event.clientY - rect.top : rect.height / 2 };
  };
  const consume = event => { if (event.cancelable) event.preventDefault(); event.stopPropagation(); };
  const paint = () => {
    frame = 0;
    if (desired && getOptions().enabled) getOptions().onView(desired);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  const settle = () => {
    clearTimeout(idle); clearTimeout(gestureWatchdog);
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    if (desired && getOptions().enabled) {
      getOptions().onView(desired);
      getOptions().onCommit(desired);
    }
    desired = null; owner = null; nativeControl = null; gestureScale = null;
  };
  const arm = () => { clearTimeout(idle); idle = setTimeout(settle, IDLE_MS); };
  const view = () => desired ||= { ...getOptions().getView() };
  const zoom = (factor, point) => {
    const previous = view(), options = getOptions();
    const scale = Math.max(options.minScale || .2, Math.min(options.maxScale || 2, previous.scale * factor));
    const ratio = scale / previous.scale;
    desired = { scale, x: point.x - (point.x - previous.x) * ratio,
      y: point.y - (point.y - previous.y) * ratio };
    schedule();
  };
  const wheel = event => {
    const pinch = event.ctrlKey || event.metaKey;
    if (!getOptions().enabled) { consume(event); return; }
    if (gestureScale !== null) { consume(event); return; }
    // Resolve ownership once. Moving a textarea below the pointer must not
    // interrupt a pan which began on canvas (and vice versa).
    if (!owner || pinch) {
      nativeControl = pinch ? null : control(event);
      owner = nativeControl ? "native" : "canvas";
    }
    arm();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
    if (owner === "native") {
      if (nativeControl.contains(event.target)) event.stopPropagation();
      else {
        consume(event);
        nativeControl.scrollLeft += event.deltaX * unit;
        nativeControl.scrollTop += event.deltaY * unit;
      }
      return;
    }
    consume(event);
    if (pinch) zoom(Math.exp(-Math.max(-240, Math.min(240, event.deltaY * unit)) * .002), anchor(event));
    else {
      const previous = view();
      const shift = event.shiftKey && !event.deltaX;
      desired = { ...previous, x: previous.x - (shift ? event.deltaY : event.deltaX) * unit,
        y: previous.y - (shift ? 0 : event.deltaY) * unit };
      schedule();
    }
  };
  const watchGesture = () => {
    clearTimeout(gestureWatchdog);
    // Some WebKit hosts omit gestureend; never leave Chromium wheel blocked.
    gestureWatchdog = setTimeout(settle, 300);
  };
  const gestureStart = event => {
    consume(event); settle();
    if (!getOptions().enabled) return;
    owner = "canvas"; gestureScale = 1; watchGesture();
  };
  const gestureChange = event => {
    consume(event);
    if (!getOptions().enabled || !gestureScale || !Number.isFinite(event.scale) || event.scale <= 0) return;
    zoom(event.scale / gestureScale, anchor(event));
    gestureScale = event.scale; watchGesture();
  };
  const gestureEnd = event => { consume(event); settle(); };
  const listeners = { wheel, gesturestart: gestureStart, gesturechange: gestureChange, gestureend: gestureEnd };
  for (const [type, listener] of Object.entries(listeners))
    element.addEventListener(type, listener, { passive: false, capture: true });
  window.addEventListener("blur", settle);
  window.addEventListener("pointerdown", settle, true);
  window.addEventListener("keydown", settle, true);
  return () => {
    clearTimeout(idle); clearTimeout(gestureWatchdog);
    if (frame) cancelAnimationFrame(frame);
    for (const [type, listener] of Object.entries(listeners)) element.removeEventListener(type, listener, true);
    window.removeEventListener("blur", settle);
    window.removeEventListener("pointerdown", settle, true);
    window.removeEventListener("keydown", settle, true);
  };
}

export function useCanvasGestures(elementRef, options) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    const element = elementRef.current;
    if (element) return bindCanvasGestures(element, () => current.current);
  }, [elementRef, options.enabled]);
}
