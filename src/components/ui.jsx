import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { getWaveformDisplayPeaks, isWaveformPlaceholder } from "../lib/waveform.js";
import { formatShortcutLabel, releasePointerActivatedFocus } from "../lib/editorShortcuts.js";

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

export function WaveformStrip({ peaks, active = false, hidden = false }) {
  const safePeaks = getWaveformDisplayPeaks(peaks);
  const placeholder = isWaveformPlaceholder(peaks);
  return (
    <div
      className={`waveform-strip ${active ? "is-active" : ""} ${hidden ? "is-muted" : ""} ${placeholder ? "is-placeholder" : ""}`}
      aria-hidden="true"
    >
      {safePeaks.map((peak, index) => (
        <span key={`${index}-${peak}`} style={{ "--bar": peak }} />
      ))}
    </div>
  );
}
