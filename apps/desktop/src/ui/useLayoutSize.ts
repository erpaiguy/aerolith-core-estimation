import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(JSON.parse(raw));
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, value: number) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Shared grid and pane defaults so every window starts the same until the user resizes it. */
export const GRID = {
  rowHeight: 28,
  colMin: 48,
  rail: 220,
  railMin: 160,
  railMax: 380,
  companion: 380,
  companionMin: 280,
  companionMax: 640,
};

export const LAYOUT_RESET_EVENT = "bidcraft-layout-reset";

export function layoutKeyMatches(storageKey: string, ids: string[]) {
  return ids.some(
    (id) =>
      storageKey === id ||
      storageKey === `aerolith-split:${id}` ||
      storageKey === `${id}-cols` ||
      storageKey === `${id}-row`,
  );
}

/** Drop saved pane, column, and row sizes for one window and tell open grids to restore defaults. */
export function resetStoredLayout(ids: string[]) {
  if (!ids.length) return;
  for (const id of ids) {
    try {
      localStorage.removeItem(`aerolith-split:${id}`);
      localStorage.removeItem(`${id}-cols`);
      localStorage.removeItem(`${id}-row`);
    } catch {
      /* ignore quota / private mode */
    }
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LAYOUT_RESET_EVENT, { detail: { ids } }));
}

/** Capture the pointer so pane/column resize cannot leave dangling move listeners. */
export function attachPointerDrag(el: HTMLElement, pointerId: number, onMove: (e: PointerEvent) => void) {
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    try {
      if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
    } catch {
      /* already released */
    }
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", finish);
    el.removeEventListener("pointercancel", finish);
    el.removeEventListener("lostpointercapture", finish);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    window.removeEventListener("blur", finish);
    document.body.classList.remove("is-resizing");
  };
  document.body.classList.add("is-resizing");
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);
  el.addEventListener("lostpointercapture", finish);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
  window.addEventListener("blur", finish);
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* window listeners remain as fallback */
  }
}

export function usePersistedNumber(key: string, fallback: number, min: number, max: number) {
  const [value, setValue] = useState(() => clamp(readNumber(key, fallback), min, max));

  useEffect(() => {
    writeNumber(key, value);
  }, [key, value]);

  useEffect(() => {
    function onReset(ev: Event) {
      const ids = (ev as CustomEvent<{ ids?: string[] }>).detail?.ids;
      if (!ids?.length || !layoutKeyMatches(key, ids)) return;
      setValue(clamp(fallback, min, max));
    }
    window.addEventListener(LAYOUT_RESET_EVENT, onReset);
    return () => window.removeEventListener(LAYOUT_RESET_EVENT, onReset);
  }, [key, fallback, min, max]);

  const set = useCallback(
    (n: number | ((prev: number) => number)) => {
      setValue((prev) => clamp(typeof n === "function" ? n(prev) : n, min, max));
    },
    [min, max],
  );

  const reset = useCallback(() => set(fallback), [fallback, set]);

  const beginDrag = useCallback(
    (axis: "x" | "y", sign: 1 | -1) => (ev: ReactPointerEvent<HTMLElement>) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const origin = axis === "x" ? ev.clientX : ev.clientY;
      const start = value;
      attachPointerDrag(ev.currentTarget, ev.pointerId, (e) => {
        const pos = axis === "x" ? e.clientX : e.clientY;
        set(start + sign * (pos - origin));
      });
    },
    [set, value],
  );

  return { value, set, reset, beginDrag };
}
