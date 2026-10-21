import { useEffect, useId, useRef, useState } from "react";
import "./InspectorScrollArea.css";

/** Persistent, draggable scroll affordance, including browsers with overlay scrollbars. */
export function InspectorScrollArea({ children, className = "", label }) {
  const id = useId();
  const viewport = useRef(null), content = useRef(null), drag = useRef(null);
  const [metrics, setMetrics] = useState({ size: 1, position: 0, max: 0, value: 0 });
  useEffect(() => {
    const node = viewport.current;
    const measure = () => {
      const max = Math.max(0, node.scrollHeight - node.clientHeight);
      setMetrics({ size: Math.min(1, node.clientHeight / Math.max(1, node.scrollHeight)), position: max ? node.scrollTop / max : 0, max, value: node.scrollTop });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node); observer.observe(content.current);
    node.addEventListener("scroll", measure, { passive: true }); measure();
    return () => { observer.disconnect(); node.removeEventListener("scroll", measure); };
  }, []);
  const size = Math.max(.09, metrics.size);
  const move = event => {
    const node = viewport.current, rect = event.currentTarget.getBoundingClientRect();
    const offset = drag.current?.offset ?? size * rect.height / 2;
    node.scrollTop = Math.max(0, Math.min(1, (event.clientY - rect.top - offset) / Math.max(1, rect.height * (1 - size)))) * metrics.max;
  };
  return <div className={`inspector-scroll-area ${className}`}>
    <div id={id} ref={viewport} className="inspector-scroll-viewport"><div ref={content}>{children}</div></div>
    {metrics.max > 1 ? <div className="inspector-scroll-rail" role="scrollbar" aria-label={label} aria-controls={id} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.round(metrics.max)} aria-valuenow={Math.round(metrics.value)} tabIndex={0}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const thumbTop = rect.top + metrics.position * (1 - size) * rect.height;
        drag.current = { offset: event.target === event.currentTarget ? size * rect.height / 2 : event.clientY - thumbTop };
        event.currentTarget.setPointerCapture(event.pointerId); move(event);
      }}
      onPointerMove={event => { if (drag.current) move(event); }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        const node = viewport.current;
        const steps = { ArrowDown: 40, ArrowUp: -40, PageDown: node.clientHeight * .85, PageUp: -node.clientHeight * .85, Home: -metrics.max, End: metrics.max };
        if (Object.hasOwn(steps, event.key)) { event.preventDefault(); event.stopPropagation(); node.scrollTop += steps[event.key]; }
      }}><div className="inspector-scroll-thumb" style={{ height: `${size * 100}%`, top: `${metrics.position * (1 - size) * 100}%` }} /></div> : null}
  </div>;
}
