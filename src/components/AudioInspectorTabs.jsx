import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

function revealSelected(node) {
  const active = node?.querySelector('[aria-selected="true"]');
  if (!active) return;
  const left = active.offsetLeft - node.offsetLeft;
  if (left < node.scrollLeft) node.scrollLeft = left;
  else if (left + active.offsetWidth > node.scrollLeft + node.clientWidth - 36)
    node.scrollLeft = left + active.offsetWidth - node.clientWidth + 36;
}

// Shares Media's glass rail, selected pane and overflow arrows.
export function AudioInspectorTabs({
  items,
  value,
  onChange,
  label,
  previous,
  next,
  className = "",
}) {
  const viewport = useRef(null);
  const contentKey = items.map((item) => item.label).join("|");
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const node = viewport.current;
    const update = () =>
      setEdges({
        left: node.scrollLeft > 2,
        right: node.scrollLeft < node.scrollWidth - node.clientWidth - 2,
      });
    revealSelected(node);
    update();
    const observer = new ResizeObserver(() => {
      revealSelected(node);
      update();
    });
    observer.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", update);
    };
  }, [items.length, contentKey]);
  useEffect(() => {
    revealSelected(viewport.current);
  }, [value]);
  const scroll = (direction) =>
    viewport.current.scrollBy({
      left: direction * viewport.current.clientWidth * 0.7,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  return (
    <div
      className={`library-type-tabs-shell audio-inspector-tabs ${edges.left ? "has-left-shadow" : ""} ${edges.right ? "has-right-shadow" : ""} ${className}`}
    >
      <div
        ref={viewport}
        className="library-type-tabs"
        role="tablist"
        aria-label={label}
        onKeyDown={(event) => {
          const index = items.findIndex((item) => item.id === value);
          const target =
            event.key === "ArrowRight"
              ? (index + 1) % items.length
              : event.key === "ArrowLeft"
                ? (index + items.length - 1) % items.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : -1;
          if (target < 0) return;
          event.preventDefault();
          onChange(items[target].id);
          viewport.current.querySelectorAll('[role="tab"]')[target].focus();
        }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            tabIndex={item.id === value ? 0 : -1}
            aria-selected={item.id === value}
            className={item.id === value ? "is-active" : ""}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {edges.right ? (
        <button
          type="button"
          className="library-type-arrow is-right"
          aria-label={next}
          onClick={() => scroll(1)}
        >
          <CaretRight size={16} weight="bold" />
        </button>
      ) : edges.left ? (
        <button
          type="button"
          className="library-type-arrow is-left"
          aria-label={previous}
          onClick={() => scroll(-1)}
        >
          <CaretLeft size={16} weight="bold" />
        </button>
      ) : null}
    </div>
  );
}
