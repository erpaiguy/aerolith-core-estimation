import { Children, type KeyboardEvent, type ReactNode } from "react";
import { usePersistedNumber } from "./useLayoutSize";

export function Split({
  id,
  axis = "x",
  defaultSize,
  min = 140,
  max = 720,
  primary = "start",
  className = "",
  children,
}: {
  id: string;
  axis?: "x" | "y";
  defaultSize: number;
  min?: number;
  max?: number;
  primary?: "start" | "end";
  className?: string;
  children: ReactNode;
}) {
  const { value, set, reset, beginDrag } = usePersistedNumber(`aerolith-split:${id}`, defaultSize, min, max);
  const panes = Children.toArray(children).slice(0, 2);
  const sign: 1 | -1 = primary === "end" ? -1 : 1;
  const template =
    axis === "x"
      ? primary === "start"
        ? `${value}px 7px minmax(0, 1fr)`
        : `minmax(0, 1fr) 7px ${value}px`
      : primary === "start"
        ? `${value}px 7px minmax(0, 1fr)`
        : `minmax(0, 1fr) 7px ${value}px`;
  const style =
    axis === "x" ? { gridTemplateColumns: template } : { gridTemplateRows: template };

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 24 : 8;
    if (axis === "x" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      set(value + dir * sign * step);
    }
    if (axis === "y" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      set(value + dir * sign * step);
    }
    if (e.key === "Home") {
      e.preventDefault();
      set(min);
    }
    if (e.key === "End") {
      e.preventDefault();
      set(max);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      reset();
    }
  }

  return (
    <div className={`split split-${axis} ${className}`.trim()} style={style}>
      <div className="split-pane">{panes[0]}</div>
      <div
        className="split-gutter"
        role="separator"
        aria-orientation={axis === "x" ? "vertical" : "horizontal"}
        aria-label="Resize panes"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={beginDrag(axis, sign)}
        onDoubleClick={reset}
        onKeyDown={onKey}
      />
      <div className="split-pane">{panes[1]}</div>
    </div>
  );
}
