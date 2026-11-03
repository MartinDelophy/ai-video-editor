import { CaretDown } from "@phosphor-icons/react";
import { useLayoutEffect, useRef } from "react";
import { Popover } from "./ui.jsx";

function DesktopMenu({ id, label, open, onOpen, onClose, items, t }) {
  const anchor = useRef(null);
  const trigger = useRef(null);
  const keyboardOpen = useRef(false);
  useLayoutEffect(() => {
    if (!open || !keyboardOpen.current) return;
    anchor.current?.querySelector('[role="menu"] [role="menuitem"]:not(:disabled)')?.focus();
    keyboardOpen.current = false;
  }, [open]);
  const close = (restore = false) => {
    onClose();
    if (restore) trigger.current?.focus();
  };
  return (
    <div className="menu-anchor desktop-editor-menu" ref={anchor}>
      <button
        ref={trigger}
        type="button"
        className="project-file-button"
        role="menuitem"
        data-editor-menu-trigger
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `desktop-menu-${id}` : undefined}
        onClick={() => { keyboardOpen.current = false; if (open) close(); else onOpen(id); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (open) anchor.current?.querySelector('[role="menu"] [role="menuitem"]:not(:disabled)')?.focus();
            else { keyboardOpen.current = true; onOpen(id); }
          }
        }}
      >
        <span>{label}</span>
        <CaretDown size={12} weight="bold" aria-hidden="true" />
      </button>
      {open ? (
        <Popover
          anchorRef={anchor}
          showClose={false}
          closeLabel={t("close")}
          className="desktop-editor-popover"
          onClose={() => close()}
        >
          <div
            id={`desktop-menu-${id}`}
            role="menu"
            aria-label={label}
            className="desktop-menu-items"
            onKeyDown={(event) => {
              const buttons = [
                ...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)'),
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
            {items.map((item, index) =>
              item === null ? (
                <div
                  className="desktop-menu-separator"
                  role="separator"
                  key={`separator-${index}`}
                />
              ) : item.href ? (
                <a
                  key={item.key}
                  role="menuitem"
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                  onClick={() => close()}
                >
                  {t(item.key)}
                </a>
              ) : (
                <button
                  key={item.key}
                  role="menuitem"
                  type="button"
                  aria-label={t(item.key)}
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.run?.();
                  }}
                >
                  <span>{t(item.key)}</span>
                  {item.shortcut ? <kbd aria-hidden="true">{item.shortcut}</kbd> : null}
                </button>
              ),
            )}
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
