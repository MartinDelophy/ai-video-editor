import { useRef } from "react";

const WIDTH = 180;
const HEIGHT = 126;
const CX = WIDTH / 2;
const CY = 82;
const RADIUS = 78;
const LOW = 12;
const HIGH = 54;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const toRadians = (degrees) => (degrees * Math.PI) / 180;
const point = (side, degrees) => ({
  x: CX + side * RADIUS * Math.cos(toRadians(degrees)),
  y: CY - RADIUS * Math.sin(toRadians(degrees)),
});

function AngleArc({ side, axis, locked, onStart }) {
  const pointer = useRef(null);
  const start = point(side, LOW);
  const end = point(side, HIGH);
  const sweep = side < 0 ? 1 : 0;
  const path = (to) => `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 0 ${sweep} ${to.x} ${to.y}`;
  const offset = clamp(axis.value, -axis.limit, axis.limit);
  const thumb = point(side, LOW + ((offset + axis.limit) / (2 * axis.limit)) * (HIGH - LOW));
  const setFromPointer = (event, anchor = 0) => {
    const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((event.clientX - rect.left) * WIDTH) / rect.width;
    const y = ((event.clientY - rect.top) * HEIGHT) / rect.height;
    const angle = (Math.atan2(CY - y, side * (x - CX)) * 180) / Math.PI;
    const ratio = clamp((angle - anchor - LOW) / (HIGH - LOW), 0, 1);
    return { angle, value: Math.round((ratio * 2 - 1) * axis.limit * 2) / 2 };
  };
  return (
    <g
      className="face-angle-arc"
      role="slider"
      aria-label={axis.label}
      aria-valuemin={Number((axis.tracked - axis.limit).toFixed(1))}
      aria-valuemax={Number((axis.tracked + axis.limit).toFixed(1))}
      aria-valuenow={Number((axis.tracked + offset).toFixed(1))}
      aria-valuetext={`${Number((axis.tracked + offset).toFixed(1))}°`}
      aria-disabled={locked || undefined}
      tabIndex={locked ? -1 : 0}
      onPointerDown={(event) => {
        if (locked || event.button !== 0 || pointer.current) return;
        const position = setFromPointer(event);
        if (!position) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus();
        onStart?.();
        event.currentTarget.setPointerCapture(event.pointerId);
        const onThumb = event.target.closest(".face-angle-thumb");
        const thumbAngle = LOW + ((offset + axis.limit) / (2 * axis.limit)) * (HIGH - LOW);
        pointer.current = {
          id: event.pointerId,
          anchor: onThumb ? position.angle - thumbAngle : 0,
        };
        if (!onThumb) axis.onChange(position.value);
      }}
      onPointerMove={(event) => {
        if (locked || pointer.current?.id !== event.pointerId) return;
        const position = setFromPointer(event, pointer.current.anchor);
        if (position && position.value !== offset) axis.onChange(position.value);
      }}
      onLostPointerCapture={() => {
        pointer.current = null;
      }}
      onKeyDown={(event) => {
        if (locked) return;
        let next;
        switch (event.key) {
          case "ArrowUp":
          case "ArrowRight":
            next = offset + 0.5;
            break;
          case "ArrowDown":
          case "ArrowLeft":
            next = offset - 0.5;
            break;
          case "PageUp":
            next = offset + 5;
            break;
          case "PageDown":
            next = offset - 5;
            break;
          case "Home":
            next = -axis.limit;
            break;
          case "End":
            next = axis.limit;
            break;
          default:
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        onStart?.();
        axis.onChange(clamp(next, -axis.limit, axis.limit));
      }}
    >
      <path className="face-angle-arc-hit" d={path(end)} />
      <path className="face-angle-arc-track" d={path(end)} />
      <circle className="face-angle-thumb face-angle-thumb-hit" cx={thumb.x} cy={thumb.y} r="11" />
      <circle className="face-angle-thumb face-angle-thumb-dot" cx={thumb.x} cy={thumb.y} r="5" />
    </g>
  );
}

export function FaceAlignmentArcs({ yaw, pitch, locked, onStart }) {
  return (
    <div className="face-alignment-diagram">
      <div className="face-alignment-head">
        <img src="/assets/effects/vfx/face-alignment-head.webp" alt="" draggable={false} />
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="face-alignment-arcs">
          <AngleArc side={-1} axis={yaw} locked={locked} onStart={onStart} />
          <AngleArc side={1} axis={pitch} locked={locked} onStart={onStart} />
        </svg>
      </div>
      {[yaw, pitch].map((axis) => (
        <div className="face-angle-readout" key={axis.label}>
          <span>{axis.label}</span>
          <output>{Number((axis.tracked + axis.value).toFixed(1))}°</output>
          {axis.keyframe}
        </div>
      ))}
    </div>
  );
}
