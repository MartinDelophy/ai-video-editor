const EDGE_GAP = 12;
const SETTLE_MS = 450;

/** Only shrink an overflowing window; keep a user's smaller size and position. */
export function fitAnnaWindowSize(rect, viewport, minimum) {
  if (![rect.x, rect.y, rect.width, rect.height, viewport.x ?? 0, viewport.y ?? 0,
    viewport.width, viewport.height].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return null;
  const right = (viewport.x || 0) + viewport.width - EDGE_GAP;
  const bottom = (viewport.y || 0) + viewport.height - EDGE_GAP;
  const w = Math.min(Math.round(rect.width), Math.max(minimum.w, Math.floor(right - rect.x)));
  const h = Math.min(Math.round(rect.height), Math.max(minimum.h, Math.floor(bottom - rect.y)));
  return w < Math.round(rect.width) || h < Math.round(rect.height) ? { w, h } : null;
}

/** Anna currently restores window geometry without clamping it to the host
 * viewport. Read only our own window bounds; all writes use the official SDK.
 * This cannot reposition a window that is already entirely offscreen.
 */
export function observeAnnaWindowLayout(runtime) {
  let host;
  let container;
  try {
    const frame = window.frameElement;
    host = frame?.ownerDocument.defaultView;
    container = frame?.closest(".anna-app-window");
    if (!host || !container || container.dataset.wid !== runtime.windowUuid) return () => {};
  } catch { return () => {}; } // A future cross-origin container must opt in via a host API.

  const minimum = {
    w: Math.max(360, Number(runtime.viewMeta?.min_size?.w) || 360),
    h: Math.max(480, Number(runtime.viewMeta?.min_size?.h) || 480),
  };
  let timer;
  let stopped = false;
  let pending = false;
  let attempted = "";
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(fit, SETTLE_MS);
  };
  const fit = async () => {
    if (stopped || pending || !container.isConnected) return;
    const rect = container.getBoundingClientRect();
    const visual = host.visualViewport;
    const viewport = {
      x: visual?.offsetLeft || 0, y: visual?.offsetTop || 0,
      width: visual?.width || host.innerWidth, height: visual?.height || host.innerHeight,
    };
    const size = fitAnnaWindowSize(rect, viewport, minimum);
    if (!size) { attempted = ""; return; }
    const key = JSON.stringify([rect.x, rect.y, rect.width, rect.height, viewport]);
    if (key === attempted) return;
    attempted = key;
    pending = true;
    try { await runtime.window.resize(size, { timeoutMs: 5000 }); }
    catch { /* Keep editing available; retry only when the bounds change. */ }
    finally { pending = false; schedule(); }
  };
  const observer = new MutationObserver(schedule);
  observer.observe(container, { attributes: true, attributeFilter: ["style", "class"] });
  host.addEventListener("resize", schedule);
  host.visualViewport?.addEventListener("resize", schedule);
  host.visualViewport?.addEventListener("scroll", schedule);
  schedule(); // Let Anna's opening/restore animation finish before measuring.
  return () => {
    stopped = true;
    clearTimeout(timer);
    observer.disconnect();
    host.removeEventListener("resize", schedule);
    host.visualViewport?.removeEventListener("resize", schedule);
    host.visualViewport?.removeEventListener("scroll", schedule);
  };
}
