import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { BrandLockup, useSurfaceTone } from "./Brand";
import { applyTheme, readTheme, type ThemeName } from "../theme";

export type BarMenuItem = {
  label: string;
  onSelect: () => void;
  separatorBefore?: boolean;
  disabled?: boolean;
};

export function AppBar({
  projectName,
  revision,
  user,
  menu,
  actions,
  showIdle = false,
}: {
  projectName?: string | null;
  revision?: string | null;
  user?: string | null;
  menu?: { label: string; items: BarMenuItem[] } | null;
  actions?: ReactNode;
  showIdle?: boolean;
}) {
  const tone = useSurfaceTone();
  return (
    <header className="appbar">
      <BrandLockup size="sm" tone={tone} />
      {menu ? <BarMenu label={menu.label} items={menu.items} /> : null}
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

export function BarMenu({ label, items }: { label: string; items: BarMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 220;
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
    window.addEventListener("pointerdown", onDoc, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("pointerdown", onDoc, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="bar-menu">
      <button
        ref={btnRef}
        type="button"
        className="bar-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
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
                  <button type="button" role="menuitem" disabled={item.disabled} onClick={() => run(item.onSelect)}>
                    {item.label}
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
