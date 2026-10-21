import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./WorkflowContextMenu.css";

export function WorkflowContextMenu({ x, y, label, items, onClose, outsideIgnore = "" }) {
  const menu = useRef(null);
  useLayoutEffect(() => {
    const node = menu.current, previous = document.activeElement;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    node.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    const outside = event => { if (!node.contains(event.target) && !(outsideIgnore && event.target.closest?.(outsideIgnore))) onClose(); };
    const dismiss = () => onClose();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
      if (previous?.isConnected && node.contains(document.activeElement)) previous.focus?.({ preventScroll: true });
    };
  }, [x, y, onClose, outsideIgnore]);
  return createPortal(<div ref={menu} role="menu" aria-label={label} className="workflow-context-menu" style={{ left: x, top: y }} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); onClose(); return; }
    const options = [...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const index = options.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      options[event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
    }
  }}>{items.map(({ label: text, icon: Icon, action, disabled, danger }, index) => <button type="button" role="menuitem" key={index} disabled={disabled} className={danger ? "is-danger" : ""} onClick={() => { onClose(); action(); }}><Icon size={17}/><span>{text}</span></button>)}</div>, document.body);
}
