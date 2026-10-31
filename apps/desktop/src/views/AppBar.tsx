import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { BrandLockup, useSurfaceTone } from "./Brand";
import { applyTheme, readTheme, type ThemeName } from "../theme";

export type BarMenuItem = {
  label: string;
  onSelect: () => void;
  hint?: string;
  separatorBefore?: boolean;
  disabled?: boolean;
  active?: boolean;
};

export type BarMenu = {
  label: string;
  items: BarMenuItem[];
  active?: boolean;
};

export function AppBar({
  projectName,
  revision,
  user,
  menu,
  menus,
  guide,
  actions,
  showIdle = false,
}: {
  projectName?: string | null;
  revision?: string | null;
  user?: string | null;
  menu?: BarMenu | null;
  menus?: BarMenu[] | null;
  guide?: string | null;
  actions?: ReactNode;
  showIdle?: boolean;
}) {
  const tone = useSurfaceTone();
  const barMenus = menus ?? (menu ? [menu] : []);
  return (
    <header className="appbar">
      <div className="appbar-main">
        <BrandLockup size="sm" tone={tone} />
        {projectName ? (
          <div className="appbar-project">
            <strong title={projectName}>{projectName}</strong>
            {revision ? <span>{revision}</span> : null}
          </div>
        ) : showIdle ? (
          <p className="appbar-idle">No tender open</p>
        ) : null}
        <div className="appbar-sp" />
        {actions}
        {user ? <span className="appbar-user">{user}</span> : null}
      </div>
      {barMenus.length ? (
        <nav className="appbar-menus" aria-label="Menus">
          {barMenus.map((entry) => (
            <BarMenu key={entry.label} label={entry.label} items={entry.items} active={entry.active} />
          ))}
        </nav>
      ) : null}
      {guide ? (
        <p className="appbar-guide" id="workspace-guide">
          {guide}
        </p>
      ) : null}
    </header>
  );
}

export function ThemeButton({ theme, onTheme }: { theme: ThemeName; onTheme: (theme: ThemeName) => void }) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => onTheme(dark ? "light" : "dark")}
    >
      {dark ? <SunIcon size={16} aria-hidden /> : <MoonIcon size={16} aria-hidden />}
      <span>{dark ? "Light" : "Dark"}</span>
    </button>
  );
}

export function useThemeControl(theme?: ThemeName, onTheme?: (theme: ThemeName) => void) {
  const [local, setLocal] = useState<ThemeName>(readTheme);
  const current = theme ?? local;
  function choose(next: ThemeName) {
    if (onTheme) onTheme(next);
    else {
      setLocal(next);
      applyTheme(next);
    }
  }
  return { theme: current, choose };
}

export function BarMenu({ label, items, active = false }: { label: string; items: BarMenuItem[]; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 320;
      const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
      setPos({ top: rect.bottom + 4, left });
    };
    place();
    const entries = () =>
      Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    const focusAt = (index: number) => {
      const list = entries();
      if (!list.length) return;
      list[(index + list.length) % list.length]?.focus();
    };
    const focusTimer = window.setTimeout(() => focusAt(0), 0);
    const onDoc = (event: PointerEvent) => {
      const target = event.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      const list = entries();
      const current = list.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusAt(current < 0 ? 0 : current + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusAt(current < 0 ? list.length - 1 : current - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusAt(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusAt(list.length - 1);
      }
    };
    const close = () => setOpen(false);
    const onOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== label) setOpen(false);
    };
    window.addEventListener("pointerdown", onDoc, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    window.addEventListener("bidcraft-menu-open", onOther);
    window.dispatchEvent(new CustomEvent("bidcraft-menu-open", { detail: label }));
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("pointerdown", onDoc, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("bidcraft-menu-open", onOther);
    };
  }, [open, label]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="bar-menu">
      <button
        ref={btnRef}
        type="button"
        className={active ? "bar-menu-btn is-current" : "bar-menu-btn"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open
        ? createPortal(
            <div ref={menuRef} className="file-menu" role="menu" aria-label={label} style={{ top: pos.top, left: pos.left }}>
              {items.map((item) => (
                <Fragment key={item.label}>
                  {item.separatorBefore ? <div className="file-menu-sep" role="separator" /> : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    aria-current={item.active ? "true" : undefined}
                    onClick={() => run(item.onSelect)}
                  >
                    <span>{item.label}</span>
                    {item.hint ? <small>{item.hint}</small> : null}
                  </button>
                </Fragment>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
