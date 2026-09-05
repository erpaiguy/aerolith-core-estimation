import { describe, expect, it } from "vitest";
import { computeProject } from "./project.ts";
import { buildProjectGraph } from "./graph.ts";

describe("scale", () => {
  it("prices 100k items without dropping totals", () => {
    const n = 100_000;
    const items = Array.from({ length: n }, (_, i) => ({
      boqCode: `i${i}`,
      clientQty: 1,
      ourQty: 1,
      lines: [
        {
          factors: [1, null, 1, null, null, null],
          wastagePct: 0,
          resourceRate: 10,
        },
      ],
    }));
    const started = performance.now();
    const result = computeProject({
      margin: { overheadPct: 0.1, profitPct: 0.3, logisticsPct: 0.025, contingencyPct: 0.05 },
      items,
    });
    const elapsed = performance.now() - started;
    expect(result.items.length).toBe(n);
    expect(result.grandTotal).toBeCloseTo(n * 10 * 1.475, 0);
    expect(elapsed).toBeLessThan(8000);
  });

  it("a resource-style origin dirties only the analysis chain", () => {
    const n = 5000;
    const codes = Array.from({ length: n }, (_, i) => `i${i}`);
    const graph = buildProjectGraph(codes, codes.map(() => 1));
    const dirty = graph.dirtyFrom("line:i0:0");
    expect(dirty.has("analysis:i0")).toBe(true);
    expect(dirty.has("item:i0")).toBe(true);
    expect(dirty.has("totals")).toBe(true);
    expect(dirty.has("item:i1")).toBe(false);
    expect(dirty.size).toBeLessThan(10);
  });
});
