import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { getWaveformDisplayPeaks, isWaveformPlaceholder } from "../lib/waveform.js";

export function IconButton({ label, children, active = false, disabled = false, onClick }) {
  return (
    <button
      className={`icon-button ${active ? "is-active" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Popover({ children, onClose, className = "" }) {
  const popoverRef = useRef(null);

  useEffect(() => {
    const closeOnOutsidePointer = (event) => {
      if (!popoverRef.current?.contains(event.target)) onClose?.();
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
  }, [onClose]);

  return (
    <div ref={popoverRef} className={`popover ${className}`.trim()} role="dialog">
      <button className="popover-close" type="button" aria-label="关闭" onClick={onClose}>
        <X size={14} />
      </button>
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
