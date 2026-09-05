import { describe, expect, it } from "vitest";
import { applyBoqCarry, computeProject, contributesResources, normalizeBoqCarry } from "./index.ts";

const margin = { overheadPct: 0, profitPct: 0, logisticsPct: 0, contingencyPct: 0 };

describe("BOQ carry mode", () => {
  it("normalizes unknown values to normal", () => {
    expect(normalizeBoqCarry(undefined)).toBe("normal");
    expect(normalizeBoqCarry("rateOnly")).toBe("rateOnly");
    expect(contributesResources("rateOnly")).toBe(false);
    expect(contributesResources("amountOnly")).toBe(true);
  });

  it("rate only keeps unit rate and zeros billed money", () => {
    const priced = computeProject({
      margin,
      items: [
        {
          boqCode: "1a",
          clientQty: 10,
          ourQty: 12,
          lines: [{ factors: [1], wastagePct: 0, resourceRate: 5 }],
          carryMode: "rateOnly",
        },
      ],
    });
    const item = priced.items[0]!;
    expect(item.unitCost).toBe(5);
    expect(item.rate).toBe(5);
    expect(item.amount).toBe(0);
    expect(item.costAmount).toBe(0);
    expect(item.clientAmount).toBe(0);
    expect(item.adjustmentAmount).toBe(0);
    expect(priced.grandTotal).toBe(0);
  });

  it("amount only bills the analysis total as a lumpsum and skips tender adjustments", () => {
    const priced = computeProject({
      margin,
      items: [
        {
          boqCode: "1a",
          clientQty: 10,
          ourQty: 12,
          lines: [{ factors: [1], wastagePct: 0, resourceRate: 5 }],
          carryMode: "amountOnly",
        },
      ],
    });
    const item = priced.items[0]!;
    expect(item.rate).toBe(5);
    expect(item.amount).toBe(60);
    expect(item.clientAmount).toBe(60);
    expect(item.adjustmentAmount).toBe(0);
    expect(priced.grandTotal).toBe(60);
  });

  it("applyBoqCarry leaves qty × rate untouched for normal", () => {
    const carried = applyBoqCarry("normal", { costAmount: 10, marginAmount: 2, amount: 12 }, { clientAmount: 8, adjustmentAmount: 4 });
    expect(carried.amount).toBe(12);
    expect(carried.clientAmount).toBe(8);
    expect(carried.adjustmentAmount).toBe(4);
  });
});
