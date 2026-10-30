import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { alignedOverlayStart } from "../lib/previewAlignment.js";

export function PreviewContextMenu({ menu, locked, mainRange, reference, onAction, onClose, t }) {
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
  useLayoutEffect(() => {
    const rect = ref.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)) });
    ref.current.querySelector('button:not(:disabled)')?.focus();
  }, [menu]);
  useEffect(() => {
    const outside = event => { if (!ref.current?.contains(event.target)) onClose(); };
    const dismiss = () => onClose();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [onClose]);
  const item = (action, label, disabled = locked) => <button key={action} type="button" role="menuitem" disabled={disabled}
    onClick={() => { onAction({ ...menu, action }); onClose(); }}>{t(label)}</button>;
  return createPortal(<div ref={ref} className="timeline-context-menu preview-context-menu" role="menu" aria-label={t("previewMenuTitle")}
    style={position} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}>
    <div className="preview-menu-heading">{t("previewMenuSpatial")}</div>
    {["center", "left", "right", "top", "bottom", "fit", "fill"].map(action => item(action, `previewAlign_${action}`))}
    {menu.segment.type === "video" ? <>
      <div className="preview-menu-heading">{t("previewMenuTemporal")}</div>
      {item("mark", "previewMarkFrame", false)}
      {menu.track === "overlay" ? <>
        {["start", "end", "playhead"].map(action => item(action, `previewTime_${action}`,
          locked || alignedOverlayStart(action, menu.segment, mainRange, menu.time, reference) == null))}
        {item("reference", "previewTime_reference", locked || !reference
          || reference.id === menu.segment.id || alignedOverlayStart("reference", menu.segment, mainRange, menu.time, reference) == null)}
      </> : null}
      <p className="preview-menu-hint">{reference ? `${t("previewReference")}: ${reference.name || ""}` : t("previewReferenceHint")}</p>
    </> : null}
  </div>, document.body);
}
