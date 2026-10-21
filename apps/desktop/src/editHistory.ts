/** Undo stack for one open project. Snapshots are cloned so later edits cannot rewrite them. */

export type EditHistory<T> = {
  past: T[];
  future: T[];
  coalesceUntil: number;
};

const CAP = 50;

export function createHistory<T>(): EditHistory<T> {
  return { past: [], future: [], coalesceUntil: 0 };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Record `current` as the state before an edit. Edits inside the coalesce window share one snapshot. */
export function pushHistory<T>(history: EditHistory<T>, current: T, now = Date.now(), coalesceMs = 500): EditHistory<T> {
  if (now < history.coalesceUntil && history.past.length > 0) {
    return { past: history.past, future: [], coalesceUntil: now + coalesceMs };
  }
  const past = [...history.past, clone(current)];
  if (past.length > CAP) past.shift();
  return { past, future: [], coalesceUntil: now + coalesceMs };
}

export function undoHistory<T>(
  history: EditHistory<T>,
  current: T,
): { history: EditHistory<T>; value: T } | null {
  if (history.past.length === 0) return null;
  const value = history.past[history.past.length - 1];
  const future = [clone(current), ...history.future];
  if (future.length > CAP) future.pop();
  return {
    history: { past: history.past.slice(0, -1), future, coalesceUntil: 0 },
    value: clone(value),
  };
}

export function redoHistory<T>(
  history: EditHistory<T>,
  current: T,
): { history: EditHistory<T>; value: T } | null {
  if (history.future.length === 0) return null;
  const value = history.future[0];
  const past = [...history.past, clone(current)];
  if (past.length > CAP) past.shift();
  return {
    history: { past, future: history.future.slice(1), coalesceUntil: 0 },
    value: clone(value),
  };
}
