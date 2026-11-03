import { CaretDown, Check, Eye, X } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { Popover } from "./ui.jsx";

const compactMenuSnapshot = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches;
const subscribeCompactMenu = (listener) => {
  const query = window.matchMedia("(max-width: 1279px)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

function DesktopMenu({ id, label, open, onOpen, onClose, items, t }) {
  const compact = useSyncExternalStore(subscribeCompactMenu, compactMenuSnapshot, () => false);
  const menuItems = useRef(null);
  const anchor = useRef(null);
  const trigger = useRef(null);
  const keyboardOpen = useRef(false);
  useLayoutEffect(() => {
    if (!open || !keyboardOpen.current) return;
    menuItems.current?.querySelector('[role^="menuitem"]:not(:disabled)')?.focus();
    keyboardOpen.current = false;
  }, [open]);
  const close = (restore = false) => {
    onClose();
    if (restore) trigger.current?.focus();
  };
  return (
    <div className={`menu-anchor desktop-editor-menu ${id === "view" ? "is-compact-view" : ""}`} ref={anchor}>
      <button
        ref={trigger}
        type="button"
        className="project-file-button"
        role="menuitem"
        data-editor-menu-trigger
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `desktop-menu-${id}` : undefined}
        onClick={() => { keyboardOpen.current = false; if (open) close(); else onOpen(id); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (open) menuItems.current?.querySelector('[role^="menuitem"]:not(:disabled)')?.focus();
            else { keyboardOpen.current = true; onOpen(id); }
          }
        }}
      >
        {id === "view" ? <Eye className="compact-view-icon" size={17} aria-hidden="true" /> : null}
        <span className="desktop-menu-trigger-label">{label}</span>
        <CaretDown size={12} weight="bold" aria-hidden="true" />
      </button>
      {open ? (
        <Popover
          anchorRef={anchor}
          showClose={false}
          closeLabel={t("close")}
          portal={compact}
          className={`desktop-editor-popover ${compact ? "is-compact-menu" : ""}`}
          onClose={() => close()}
        >
          <div className="compact-menu-heading"><strong>{label}</strong><button type="button" aria-label={t("close")} onClick={() => close(true)}><X size={17} /></button></div>
          <div
            ref={menuItems}
            id={`desktop-menu-${id}`}
            role="menu"
            aria-label={label}
            className="desktop-menu-items"
            onKeyDown={(event) => {
              const buttons = [
                ...event.currentTarget.querySelectorAll('[role^="menuitem"]:not(:disabled)'),
              ];
              const index = buttons.indexOf(document.activeElement);
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                        buttons.length;
                buttons[next]?.focus();
              } else if (event.key === "Escape") {
                event.preventDefault();
                close(true);
              } else if (event.key === "Tab") close();
            }}
          >
            {items.map((item, index) => {
              if (item === null) return <div className="desktop-menu-separator" role="separator" key={`separator-${index}`} />;
              const Icon = item.icon;
              if (item.kind === "heading") return <div key={item.key} className="desktop-menu-heading">{t(item.key)}</div>;
              if (item.kind === "note") return <p key={item.key} className="desktop-menu-note">{t(item.key)}</p>;
              if (item.kind === "status") return <div key={item.key} role="status" className="desktop-menu-status">
                {Icon ? <Icon size={14} className={item.spinning ? "is-spinning" : ""} aria-hidden="true" /> : null}
                <span>{item.text}{item.detail ? <small>{item.detail}</small> : null}</span>
              </div>;
              const content = <>
                <span className="desktop-menu-icon" aria-hidden="true">{Icon ? <Icon size={17} /> : null}</span>
                <span className="desktop-menu-label">{t(item.key)}</span>
                {typeof item.checked === "boolean" ? item.checked ? <Check className="desktop-menu-check" size={15} aria-hidden="true" /> : <span className="desktop-menu-check" /> : null}
                {item.shortcut ? <kbd aria-hidden="true">{item.shortcut}</kbd> : null}
              </>;
              return item.href ? <a key={item.key} role="menuitem" href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} onClick={() => close()}>{content}</a> : <button
                key={item.key} role={typeof item.checked === "boolean" ? "menuitemradio" : "menuitem"}
                aria-checked={typeof item.checked === "boolean" ? item.checked : undefined}
                aria-label={t(item.key)} type="button" disabled={item.disabled}
                onClick={() => { close(); item.run?.(); }}
              >{content}</button>;
            })}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}

export function DesktopMenus({ menus, activeMenu, onOpen, onClose, t }) {
  return menus.map((menu) => (
    <DesktopMenu
      key={menu.id}
      {...menu}
      open={activeMenu === menu.id}
      onOpen={onOpen}
      onClose={onClose}
      t={t}
    />
  ));
}
