import { memo, useRef, useState } from "react";
import { Diamond } from "@phosphor-icons/react";
import { formatTime } from "../lib/timeline.js";
import { clampVisualKeyframeTime, normalizeVisualKeyframes } from "../lib/visualEffects.js";

export const VisualClipKeyframes = memo(function VisualClipKeyframes({ keyframes, duration, label, id, track, start, locked, actions }) {
  const drag = useRef(null);
  const [draft, setDraft] = useState(null);
  if (!keyframes?.length || !(duration > 0)) return null;
  const frames = normalizeVisualKeyframes(keyframes);
  const commit = (index, time) => {
    const frame = frames[index];
    const next = clampVisualKeyframeTime(frames, index, time, duration);
    actions.current.select(track, id);
    if (next !== frame.time) actions.current.move(track, id, frame.time, next);
  };
  return (
    <div className="visual-clip-keyframe-markers" role="group" aria-label={label}>
      {frames.map(({ time }, index) => {
        if (time > duration + 1e-6) return null;
        const shownTime = draft?.index === index ? draft.time : time;
        const name = `${label} · ${formatTime(shownTime)}`;
        return (
          <button key={index} type="button" className="visual-clip-keyframe" disabled={locked}
            data-keyframe-index={index} aria-label={name} title={name} style={{ "--clip-keyframe-position": `${shownTime / duration * 100}%` }}
            onPointerDown={(event) => {
              if (event.button !== 0 || !event.isPrimary || locked) return;
              event.preventDefault();
              event.stopPropagation();
              const button = event.currentTarget;
              const rail = button.parentElement;
              // The hit areas can overlap at low zoom. Use the nearest
              // displayed diamond so a neighboring button can't steal it.
              let nearest = button;
              let distance = Infinity;
              for (const candidate of rail.children) {
                const rect = candidate.getBoundingClientRect();
                const offset = Math.abs(event.clientX - rect.left - rect.width / 2);
                if (offset < distance) { distance = offset; nearest = candidate; }
              }
              const index = Number(nearest.dataset.keyframeIndex);
              drag.current = { x: event.clientX, pointerId: event.pointerId, width: rail.getBoundingClientRect().width, index, moved: false };
              nearest.focus({ preventScroll: true });
              button.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const active = drag.current;
              if (active?.pointerId !== event.pointerId) return;
              const delta = event.clientX - active.x;
              if (!active.moved && Math.abs(delta) < 3) return;
              active.moved = true;
              const next = frames[active.index].time + delta / Math.max(1, active.width) * duration;
              setDraft({ index: active.index, time: clampVisualKeyframeTime(frames, active.index, next, duration) });
            }}
            onPointerUp={(event) => {
              const active = drag.current;
              if (active?.pointerId !== event.pointerId) return;
              event.stopPropagation();
              drag.current = null;
              setDraft(null);
              const frameTime = frames[active.index].time;
              if (active.moved) commit(active.index, frameTime + (event.clientX - active.x) / Math.max(1, active.width) * duration);
              else { actions.current.select(track, id); actions.current.seek(start + frameTime); }
            }}
            onLostPointerCapture={() => { drag.current = null; setDraft(null); }}
            onClick={(event) => {
              event.stopPropagation();
              if (event.detail === 0) { actions.current.select(track, id); actions.current.seek(start + time); }
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const step = event.shiftKey ? 0.1 : 0.01;
              commit(index, time + step * (event.key === "ArrowLeft" ? -1 : 1));
            }}>
            <Diamond size={11} weight="fill" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
});
