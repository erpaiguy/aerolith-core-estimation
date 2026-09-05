import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

export type MenuSelectOption<T extends string = string> = {
  value: T;
  label: string;
  group?: string;
  disabled?: boolean;
};

export function MenuSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  style,
}: {
  label: string;
  value: T;
  options: MenuSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>({
    left: 0,
    width: 180,
    maxHeight: 320,
  });
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = Math.max(r.width, 180);
      const gap = 4;
      const vh = window.innerHeight;
      const spaceBelow = vh - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      const maxHeight = Math.min(320, Math.max(96, openUp ? spaceAbove : spaceBelow));
      const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8));
      setPos(
        openUp
          ? { bottom: vh - r.top + gap, left, width, maxHeight }
          : { top: r.bottom + gap, left, width, maxHeight },
      );
    };
    place();
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
    };
    const close = () => setOpen(false);
    window.addEventListener("pointerdown", onDoc, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", onDoc, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <label className={["field", "menu-select", className].filter(Boolean).join(" ")} style={style}>
      {label}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        className="menu-select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="menu-select-value">{selected?.label ?? value}</span>
      </button>
      {open
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              className="menu-select-list"
              role="listbox"
              style={{
                position: "fixed",
                top: pos.top,
                bottom: pos.bottom,
                left: pos.left,
                minWidth: pos.width,
                maxHeight: pos.maxHeight,
              }}
            >
              {options.map((o, i) => {
                const prev = options[i - 1];
                const showGroup = Boolean(o.group && o.group !== prev?.group);
                return (
                  <li key={o.value || `__empty-${i}`}>
                    {showGroup ? (
                      <div className="menu-select-group" role="presentation">
                        {o.group}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      disabled={o.disabled}
                      aria-selected={o.value === value}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                        btnRef.current?.focus();
                      }}
                    >
                      {o.label}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </label>
  );
}
