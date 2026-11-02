import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenterHorizontal, AlignLeft, AlignRight, AlignTop, AlignBottom,
  ArrowsIn, ArrowsOut, Crosshair, Flag, ArrowLineLeft, ArrowLineRight,
  MapPin, LinkSimple,
} from "@phosphor-icons/react";
import { getSplitScreenCells, alignedOverlayStart } from "../lib/previewAlignment.js";

const ACTION_ICONS = { center: AlignCenterHorizontal, left: AlignLeft, right: AlignRight, top: AlignTop, bottom: AlignBottom,
  fit: ArrowsIn, fill: ArrowsOut, mark: Flag, start: ArrowLineLeft, end: ArrowLineRight, playhead: MapPin, reference: LinkSimple };

function LayoutGlyph({ count, layout }) {
  return <svg viewBox="0 0 48 30" aria-hidden="true">{getSplitScreenCells(count, layout).map((cell, index) => <rect key={index}
    x={2 + cell.x * 44} y={2 + cell.y * 26} width={cell.width * 44 - 2} height={cell.height * 26 - 2} rx="1.5" />)}</svg>;
}

export function PreviewContextMenu({ menu, locked, mainRange, reference, overlayCount = 0, splitLocked, onAction, onClose, t }) {
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
  const item = (action, label, disabled = locked) => {
    const Icon = ACTION_ICONS[action] || Crosshair;
    return <button key={action} type="button" role="menuitem" disabled={disabled} aria-label={t(label)}
      onClick={() => { onAction({ ...menu, action }); onClose(); }}>
      <Icon size={19} aria-hidden="true" /><span>{t(label)}</span></button>;
  };
  return createPortal(<div ref={ref} className="timeline-context-menu preview-context-menu" role="menu" aria-label={t("previewMenuTitle")}
    style={position} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}>
    <div className="preview-menu-heading">{t("previewMenuSpatial")}</div>
    <div className="preview-alignment-grid">{["center", "left", "right", "top", "bottom", "fit", "fill"].map(action => item(action, `previewAlign_${action}`))}</div>
    <>
      <div className="preview-menu-heading">{t("previewSplitTitle").replace("{count}", overlayCount)}</div>
      <div className="preview-split-grid">{["columns", "rows", ...(overlayCount > 2 ? ["grid"] : [])].map(layout =>
        <button key={layout} type="button" role="menuitem" disabled={splitLocked || overlayCount < 2} onClick={() => { onAction({ ...menu, action: `split-${layout}` }); onClose(); }}>
          <LayoutGlyph count={Math.max(2, overlayCount)} layout={layout} /><span>{t(`previewSplit_${layout}`)}</span>
        </button>)}</div>
      <p className="preview-menu-hint">{t(overlayCount < 2 ? "previewSplitNeedsMore" : "previewSplitHint")}</p>
    </>
    {menu.segment.type === "video" ? <>
      <div className="preview-menu-heading">{t("previewMenuTemporal")}</div>
      <div className="preview-time-actions">
      {item("mark", "previewMarkFrame", false)}
      {menu.track === "overlay" ? <>
        {["start", "end", "playhead"].map(action => item(action, `previewTime_${action}`,
          locked || alignedOverlayStart(action, menu.segment, mainRange, menu.time, reference) == null))}
        {item("reference", "previewTime_reference", locked || !reference
          || reference.id === menu.segment.id || alignedOverlayStart("reference", menu.segment, mainRange, menu.time, reference) == null)}
      </> : null}
      </div>
      <p className="preview-menu-hint">{reference ? `${t("previewReference")}: ${reference.name || ""}` : t("previewReferenceHint")}</p>
    </> : null}
  </div>, document.body);
}
