import { memo, useEffect, useMemo, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { getWaveformDisplayPeaks, isWaveformPlaceholder } from "../lib/waveform.js";
import { formatShortcutLabel, releasePointerActivatedFocus } from "../lib/editorShortcuts.js";
import { observeViewportCanvas } from "../lib/viewportCanvas.js";
import { sliceSourceAudioPeaks } from "../lib/sourceAudioSync.js";

export function IconButton({ label, children, active = false, disabled = false, onClick, tooltip = false, shortcut = "", releaseFocusOnPointer = false }) {
  const tooltipLabel = formatShortcutLabel(label, shortcut);
  return (
    <button
      className={`icon-button ${active ? "is-active" : ""}`}
      type="button"
      aria-label={label}
      title={tooltip || shortcut ? undefined : label}
      data-tooltip={tooltip || shortcut ? tooltipLabel : undefined}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (releaseFocusOnPointer) releasePointerActivatedFocus(event);
      }}
    >
      {children}
    </button>
  );
}

export function Popover({ children, onClose, closeLabel = "Close", className = "", anchorRef, showClose = true }) {
  const popoverRef = useRef(null);

  useEffect(() => {
    const closeOnOutsidePointer = (event) => {
      if (!popoverRef.current?.contains(event.target) && !anchorRef?.current?.contains(event.target)) onClose?.();
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [anchorRef, onClose]);

  return (
    <div ref={popoverRef} className={`popover ${className}`.trim()} role="dialog">
      {showClose ? <button className="popover-close" type="button" aria-label={closeLabel} onClick={onClose}>
        <X size={14} />
      </button> : null}
      {children}
    </div>
  );
}

// The playhead updates its parent frequently; immutable peaks and CSS-driven
// zoom sizing let the entire waveform subtree stay unchanged between edits.
export const WaveformStrip = memo(function WaveformStrip({ peaks, active = false, hidden = false, sourceStart, sourceDuration, sourceAudioDuration = 0, timeline = false, volume = 1 }) {
  const visiblePeaks = useMemo(() => Array.isArray(peaks) && sourceAudioDuration > 0
    ? sliceSourceAudioPeaks(peaks, { sourceStart, sourceDuration }, sourceAudioDuration)
    : peaks, [peaks, sourceStart, sourceDuration, sourceAudioDuration]);
  const safePeaks = useMemo(() => {
    const values = getWaveformDisplayPeaks(visiblePeaks);
    if (timeline || values.length <= 118) return values;
    return Array.from({ length: 118 }, (_, i) => {
      let peak = 0;
      for (let j = Math.floor(i * values.length / 118); j < Math.ceil((i + 1) * values.length / 118); j++) peak = Math.max(peak, values[j] || 0);
      return peak;
    });
  }, [visiblePeaks, timeline]);
  const placeholder = isWaveformPlaceholder(visiblePeaks);
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!timeline || !canvas) return undefined;
    return observeViewportCanvas(canvas, ({ context: ctx, width, height, offset, fullWidth }) => {
      if (placeholder) return;
      const gain = hidden ? 0 : Math.max(0, Math.min(4, volume));
      const count = Math.min(2048, Math.max(1, Math.floor(width / 3)));
      const ceiling = height * 0.76;
      const amplitudes = Array.from({ length: count }, (_, i) => {
        const from = (offset + i / count * width) / fullWidth * safePeaks.length;
        const to = (offset + (i + 1) / count * width) / fullWidth * safePeaks.length;
        let peak = 0;
        if (to - from < 1) {
          const index = Math.floor(from);
          const a = safePeaks[Math.min(index, safePeaks.length - 1)] || 0;
          const b = safePeaks[Math.min(index + 1, safePeaks.length - 1)] || 0;
          peak = a + (b - a) * (from - index);
        } else {
          for (let j = Math.floor(from); j < Math.ceil(to); j++) peak = Math.max(peak, safePeaks[j] || 0);
        }
        return peak * gain;
      });
      const color = getComputedStyle(canvas).getPropertyValue("--waveform-color").trim() || "#20d2bf";
      const step = width / count;
      const barWidth = Math.max(1, step - 1);
      amplitudes.forEach((value, i) => {
        const barHeight = Math.min(1, value) * ceiling;
        if (barHeight <= 0) return;
        const x = i * step;
        const y = height - barHeight;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, Math.min(barWidth / 2, barHeight / 2));
        ctx.clip();
        ctx.fillStyle = color;
        ctx.fillRect(x, y, barWidth, barHeight);
        if (value > 1) {
          ctx.fillStyle = "#ff6355";
          ctx.fillRect(x, y, barWidth, Math.min(barHeight, Math.max(7, barHeight * 0.28)));
        }
        ctx.restore();
      });
    });
  }, [timeline, safePeaks, placeholder, volume, hidden]);
  return (
    <div
      className={`waveform-strip ${timeline ? "is-timeline-waveform" : ""} ${active ? "is-active" : ""} ${hidden ? "is-muted" : ""} ${placeholder ? "is-placeholder" : ""}`}
      aria-hidden="true"
    >
      {timeline ? <canvas ref={canvasRef} /> : safePeaks.map((peak, index) => (
        <span key={`${index}-${peak}`} style={{ "--bar": peak }} />
      ))}
    </div>
  );
});
