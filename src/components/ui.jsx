import { X } from "@phosphor-icons/react";

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

export function Popover({ children, onClose }) {
  return (
    <div className="popover" role="dialog">
      <button className="popover-close" type="button" aria-label="关闭" onClick={onClose}>
        <X size={14} />
      </button>
      {children}
    </div>
  );
}

export function WaveformStrip({ peaks, active = false, hidden = false }) {
  return (
    <div
      className={`waveform-strip ${active ? "is-active" : ""} ${hidden ? "is-muted" : ""}`}
      aria-hidden="true"
    >
      {peaks.map((peak, index) => (
        <span key={`${index}-${peak}`} style={{ "--bar": peak }} />
      ))}
    </div>
  );
}
