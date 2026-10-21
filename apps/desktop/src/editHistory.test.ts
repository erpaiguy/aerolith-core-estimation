import { describe, expect, it } from "vitest";
import { createHistory, pushHistory, redoHistory, undoHistory } from "./editHistory";

describe("edit history", () => {
  it("restores the project from before an edit and can redo it", () => {
    let history = createHistory<{ n: number }>();
    history = pushHistory(history, { n: 1 }, 1_000, 500);
    const undone = undoHistory(history, { n: 2 });
    expect(undone?.value).toEqual({ n: 1 });
    const redone = undone ? redoHistory(undone.history, undone.value) : null;
    expect(redone?.value).toEqual({ n: 2 });
  });

  it("keeps one snapshot for a burst of edits", () => {
    let history = createHistory<{ n: number }>();
    history = pushHistory(history, { n: 1 }, 1_000, 500);
    history = pushHistory(history, { n: 2 }, 1_200, 500);
    expect(history.past).toEqual([{ n: 1 }]);
    const undone = undoHistory(history, { n: 3 });
    expect(undone?.value).toEqual({ n: 1 });
  });

  it("drops redo once a new edit is made", () => {
    let history = createHistory<{ n: number }>();
    history = pushHistory(history, { n: 1 }, 1_000, 500);
    const undone = undoHistory(history, { n: 2 });
    expect(undone).not.toBeNull();
    const next = pushHistory(undone!.history, undone!.value, 5_000, 500);
    expect(next.future).toEqual([]);
    expect(undoHistory(next, { n: 9 })?.value).toEqual({ n: 1 });
  });
});
