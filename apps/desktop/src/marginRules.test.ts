import { describe, expect, it } from "vitest";
import { itemKeyOf } from "./bills";
import { emptyProject } from "./loadReference";
import { applyMarginAssignment, effectiveMargin } from "./marginRules";
import { withResults } from "./projectCompute";

describe("scoped margins", () => {
  it("job stack still prices every item when there are no assignments", () => {
    const base = withResults({
      ...emptyProject("Margins"),
      margin: { overheadPct: 0.1, profitPct: 0.3, logisticsPct: 0, contingencyPct: 0 },
      items: emptyProject("Margins").items.map((i) =>
        i.kind === "item" ? { ...i, directCost: 100, ourQty: 1, clientQty: 1, priceMode: "direct" as const } : i,
      ),
    });
    const item = base.items.find((i) => i.kind === "item")!;
    expect(item.result?.unitCost).toBe(100);
    expect(item.result?.rate).toBe(140);
  });

  it("a unique factor on one item overlays only that factor", () => {
    const seed = emptyProject("Margins");
    const item = seed.items.find((i) => i.kind === "item")!;
    const priced = withResults({
      ...seed,
      margin: { overheadPct: 0.1, profitPct: 0.3, logisticsPct: 0, contingencyPct: 0 },
      items: seed.items.map((i) =>
        i.kind === "item" ? { ...i, directCost: 100, ourQty: 1, clientQty: 1, priceMode: "direct" as const } : i,
      ),
    });
    const next = withResults(
      applyMarginAssignment(priced, {
        name: "Low profit",
        factors: ["profitPct"],
        stack: { ...priced.margin, profitPct: 0.1 },
        presetId: null,
        targetKind: "item",
        targetIds: [itemKeyOf(item)],
      }),
    );
    const got = next.items.find((i) => i.kind === "item")!;
    expect(effectiveMargin(next, got)).toEqual({
      overheadPct: 0.1,
      profitPct: 0.1,
      logisticsPct: 0,
      contingencyPct: 0,
    });
    expect(got.result?.rate).toBe(120);
  });

  it("a section group overrides the job stack for children only", () => {
    const seed = emptyProject("Margins");
    const section = seed.items.find((i) => i.kind === "section")!;
    const extra = {
      ...seed.items.find((i) => i.kind === "item")!,
      id: "it-loose",
      boqCode: "2a",
      parentCode: null,
      description: "Loose item",
      directCost: 100,
      ourQty: 1,
      clientQty: 1,
      priceMode: "direct" as const,
    };
    const priced = withResults({
      ...seed,
      margin: { overheadPct: 0.1, profitPct: 0.3, logisticsPct: 0, contingencyPct: 0 },
      items: [
        ...seed.items.map((i) =>
          i.kind === "item" ? { ...i, directCost: 100, ourQty: 1, clientQty: 1, priceMode: "direct" as const } : i,
        ),
        extra,
      ],
    });
    const next = withResults(
      applyMarginAssignment(priced, {
        name: "Section cut",
        factors: ["overheadPct", "profitPct", "logisticsPct", "contingencyPct"],
        stack: { overheadPct: 0.05, profitPct: 0.1, logisticsPct: 0, contingencyPct: 0 },
        presetId: null,
        targetKind: "section",
        targetIds: [itemKeyOf(section)],
      }),
    );
    const child = next.items.find((i) => i.kind === "item" && i.parentCode === section.boqCode)!;
    const loose = next.items.find((i) => i.boqCode === "2a")!;
    expect(child.result?.rate).toBe(115);
    expect(loose.result?.rate).toBe(140);
  });
});
