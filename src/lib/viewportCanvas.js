// Keep long timeline surfaces inside the browser's canvas dimension limits.
// Only the visible source interval is painted; scrolling never stretches it.
export function observeViewportCanvas(canvas, paint) {
  const host = canvas.parentElement;
  const viewport = host.closest('.tracks') || host.closest('.track-scroll');
  let frame = 0;
  const draw = () => {
    frame = 0;
    const rect = host.getBoundingClientRect();
    const bounds = viewport?.getBoundingClientRect();
    const left = Math.max(rect.left, bounds?.left ?? 0, 0);
    const right = Math.min(rect.right, bounds?.right ?? window.innerWidth, window.innerWidth);
    const offset = Math.max(0, left - rect.left);
    const width = Math.max(0, Math.ceil(right - left));
    const height = Math.max(1, host.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1, 8192 / Math.max(1, width));
    canvas.style.position = 'absolute';
    canvas.style.left = `${offset}px`;
    canvas.style.width = `${width}px`;
    canvas.width = Math.max(1, Math.ceil(width * dpr));
    canvas.height = Math.ceil(height * dpr);
    const context = canvas.getContext('2d');
    if (!context || !width) return;
    context.scale(dpr, dpr);
    paint({ context, width, height, offset, fullWidth: Math.max(1, rect.width) });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
  const observer = new ResizeObserver(schedule);
  observer.observe(host);
  if (viewport) observer.observe(viewport);
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  draw();
  return () => {
    observer.disconnect();
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    cancelAnimationFrame(frame);
  };
}
