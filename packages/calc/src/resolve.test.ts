import { describe, expect, it } from "vitest";
import { computeProject, resolveAnalysisUnitCost, resolveBoqUnitCost, wouldCreateCycle } from "../src/index.ts";
import type { ItemInput } from "../src/index.ts";

const zeroMargin = { overheadPct: 0, profitPct: 0, logisticsPct: 0, contingencyPct: 0 };
const stack = {
  overheadPct: 0.1,
  profitPct: 0.3,
  logisticsPct: 0.025,
  contingencyPct: 0.05,
};

function line(rate: number, factor = 1): ItemInput["lines"][number] {
  return { factors: [factor], wastagePct: 0, resourceRate: rate };
}

describe("direct unit cost", () => {
  it("applies the margin stack once to a typed unit cost", () => {
    const priced = computeProject({
      margin: stack,
      items: [
        {
          boqCode: "1a",
          clientQty: 1,
          ourQty: 1,
          lines: [],
          directCost: 100000,
          priceMode: "direct",
        },
      ],
    });
    expect(priced.items[0]?.unitCost).toBe(100000);
    expect(priced.items[0]?.rate).toBe(147500);
  });
});

describe("link vs clone", () => {
  it("live link follows the parent analysis", () => {
    const parent: ItemInput = {
      boqCode: "1a",
      clientQty: 1,
      ourQty: 1,
      lines: [line(10)],
      priceMode: "analysis",
      analysisOrigin: "own",
    };
    const child: ItemInput = {
      boqCode: "1b",
      clientQty: 1,
      ourQty: 1,
      lines: [],
      priceMode: "analysis",
      analysisOrigin: "link",
      linkedBoqCode: "1a",
    };
    expect(resolveAnalysisUnitCost([parent, child], "1b").unitCost).toBe(10);
    const edited = { ...parent, lines: [line(25)] };
    expect(resolveAnalysisUnitCost([edited, child], "1b").unitCost).toBe(25);
  });

  it("clone does not follow the parent after copy", () => {
    const parent: ItemInput = {
      boqCode: "1a",
      clientQty: 1,
      ourQty: 1,
      lines: [line(10)],
      priceMode: "analysis",
      analysisOrigin: "own",
    };
    const child: ItemInput = {
      boqCode: "1b",
      clientQty: 1,
      ourQty: 1,
      lines: [line(10)],
      priceMode: "analysis",
      analysisOrigin: "clone",
    };
    const edited = { ...parent, lines: [line(25)] };
    expect(resolveAnalysisUnitCost([edited, child], "1b").unitCost).toBe(10);
  });
});

describe("includes", () => {
  it("own lines plus two live includes follow the parents", () => {
    const a: ItemInput = {
      boqCode: "1a",
      clientQty: 1,
      ourQty: 1,
      lines: [line(10)],
      priceMode: "analysis",
    };
    const b: ItemInput = {
      boqCode: "1b",
      clientQty: 1,
      ourQty: 1,
      lines: [line(5)],
      priceMode: "analysis",
    };
    const host: ItemInput = {
      boqCode: "1c",
      clientQty: 1,
      ourQty: 1,
      lines: [line(1)],
      priceMode: "analysis",
      analysisOrigin: "own",
      includes: [
        { sourceBoqCode: "1a", relation: "link", factor: 1 },
        { sourceBoqCode: "1b", relation: "link", factor: 2 },
      ],
    };
    expect(resolveAnalysisUnitCost([a, b, host], "1c").unitCost).toBe(1 + 10 + 10);
    const a2 = { ...a, lines: [line(20)] };
    expect(resolveAnalysisUnitCost([a2, b, host], "1c").unitCost).toBe(1 + 20 + 10);
  });

  it("cloned include stays frozen when the parent changes", () => {
    const a: ItemInput = {
      boqCode: "1a",
      clientQty: 1,
      ourQty: 1,
      lines: [line(10)],
      priceMode: "analysis",
    };
    const host: ItemInput = {
      boqCode: "1c",
      clientQty: 1,
      ourQty: 1,
      lines: [line(1)],
      priceMode: "analysis",
      includes: [{ sourceBoqCode: "1a", relation: "clone", factor: 1, snapshotUnitCost: 10 }],
    };
    const a2 = { ...a, lines: [line(99)] };
    expect(resolveAnalysisUnitCost([a2, host], "1c").unitCost).toBe(11);
  });
});

describe("subcontract quote vs backup analysis", () => {
  it("BOQ uses the quote while link/clone reads the backup analysis", () => {
    const quoted: ItemInput = {
      boqCode: "1a",
      clientQty: 2,
      ourQty: 2,
      lines: [line(10)],
      quotedUnitCost: 40,
      priceMode: "analysis",
    };
    const linked: ItemInput = {
      boqCode: "1b",
      clientQty: 1,
      ourQty: 1,
      lines: [],
      priceMode: "analysis",
      analysisOrigin: "link",
      linkedBoqCode: "1a",
    };
    const boq = computeProject({ margin: zeroMargin, items: [quoted, linked] });
    expect(boq.items[0]?.unitCost).toBe(40);
    expect(boq.items[0]?.costAmount).toBe(80);
    expect(resolveBoqUnitCost([quoted, linked], "1a").unitCost).toBe(40);
    expect(resolveAnalysisUnitCost([quoted, linked], "1a").unitCost).toBe(10);
    expect(resolveAnalysisUnitCost([quoted, linked], "1b").unitCost).toBe(10);
  });
});

describe("cycles", () => {
  it("rejects a link that would cycle and resolve returns cyclic", () => {
    const a: ItemInput = {
      boqCode: "1a",
      clientQty: 1,
      ourQty: 1,
      lines: [line(10)],
      priceMode: "analysis",
      analysisOrigin: "link",
      linkedBoqCode: "1b",
    };
    const b: ItemInput = {
      boqCode: "1b",
      clientQty: 1,
      ourQty: 1,
      lines: [line(5)],
      priceMode: "analysis",
      analysisOrigin: "own",
    };
    expect(wouldCreateCycle([a, b], "1b", "1a")).toBe(true);
    expect(wouldCreateCycle([a, b], "1a", "1b")).toBe(false);
    const cycled = { ...b, analysisOrigin: "link" as const, linkedBoqCode: "1a" };
    expect(resolveAnalysisUnitCost([a, cycled], "1a").cyclic).toBe(true);
    expect(resolveAnalysisUnitCost([a, cycled], "1a").unitCost).toBe(0);
  });
});

describe("item keys across bills", () => {
  it("keeps colliding issued codes distinct and follows a cross-bill live link", () => {
    const a: ItemInput = {
      boqCode: "1.1",
      itemKey: "bill-a::1.1",
      clientQty: 1,
      ourQty: 1,
      lines: [line(10)],
      priceMode: "analysis",
      analysisOrigin: "own",
    };
    const b: ItemInput = {
      boqCode: "1.1",
      itemKey: "bill-b::1.1",
      clientQty: 2,
      ourQty: 2,
      lines: [],
      priceMode: "analysis",
      analysisOrigin: "link",
      linkedBoqCode: "bill-a::1.1",
    };
    const priced = computeProject({ margin: zeroMargin, items: [a, b] });
    expect(priced.items[0]?.amount).toBe(10);
    expect(priced.items[1]?.unitCost).toBe(10);
    expect(priced.items[1]?.amount).toBe(20);
    expect(priced.grandTotal).toBe(30);
    const edited = { ...a, lines: [line(25)] };
    expect(resolveAnalysisUnitCost([edited, b], "bill-b::1.1").unitCost).toBe(25);
  });
});
