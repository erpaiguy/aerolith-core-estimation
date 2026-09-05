import { useCallback, useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { attachPointerDrag, clamp, usePersistedNumber } from "./useLayoutSize";

export function useColWidths(key: string, defaults: Record<string, number> = {}, min = 48) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ...defaults };
      const parsed = JSON.parse(raw) as Record<string, number>;
      return { ...defaults, ...parsed };
    } catch {
      return { ...defaults };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(widths));
    } catch {
      /* ignore quota */
    }
  }, [key, widths]);

  const startResize = useCallback(
    (id: string, ev: ReactPointerEvent<HTMLElement>) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const startX = ev.clientX;
      const th = ev.currentTarget.closest("th");
      const measured = th ? Math.round(th.getBoundingClientRect().width) : min;
      const startW = widths[id] ?? defaults[id] ?? measured;
      attachPointerDrag(ev.currentTarget, ev.pointerId, (e) => {
        setWidths((prev) => ({ ...prev, [id]: Math.max(min, Math.round(startW + (e.clientX - startX))) }));
      });
    },
    [defaults, min, widths],
  );

  return { widths, startResize };
}

export function useTableLayout(key: string, defaults: Record<string, number> = {}, colMin = 48, rowDefault = 28) {
  const cols = useColWidths(`${key}-cols`, defaults, colMin);
  const row = usePersistedNumber(`${key}-row`, rowDefault, 20, 160);
  const startRowResize = row.beginDrag("y", 1);
  const tableStyle = { ["--row-min"]: `${row.value}px` } as CSSProperties;
  return {
    widths: cols.widths,
    startResize: cols.startResize,
    rowMin: row.value,
    startRowResize,
    resetRow: row.reset,
    tableStyle,
    setRowMin: (n: number) => row.set(clamp(n, 20, 160)),
  };
}
