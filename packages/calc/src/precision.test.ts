import { describe, expect, it, afterEach } from "vitest";
import { configureDisplayFormat, formatDim, formatMoney, formatQty, resetDisplayFormat, roundAmount, roundDimValue, roundQty, roundRate } from "../../shared/src/decimal.ts";
import { composeResourceLine } from "./analysis.ts";
import { computeProject } from "./project.ts";
import { qtoQty } from "./qto.ts";
import { priceLine } from "./working.ts";

afterEach(() => {
  resetDisplayFormat();
});

describe("decimal precision", () => {
  it("rounds dimensions, quantity, rate, and amount independently", () => {
    configureDisplayFormat({ dimDecimals: 1, qtyDecimals: 3, rateDecimals: 2, amountDecimals: 0 });
    expect(roundDimValue(1.21)).toBe(1.3);
    expect(formatDim(1.21)).toBe("1.3");
    expect(roundQty(1.23456)).toBe(1.235);
    expect(formatQty(1.23456)).toBe("1.235");
    expect(roundRate(10.456)).toBe(10.46);
    expect(roundAmount(10.6)).toBe(11);
    // Rate analysis keeps Excel full precision. Display and export round the same figures.
    const line = composeResourceLine({ factors: [1.23456], wastagePct: 0, resourceRate: 10.456 }, 2);
    expect(line.qty).toBeCloseTo(1.23456, 8);
    expect(roundQty(line.qty)).toBe(1.235);
    expect(roundAmount(roundQty(line.qty) * roundRate(line.amount / line.qty))).toBe(13);
    const priced = priceLine(10.456, 1.23456, { overheadPct: 0, profitPct: 0, logisticsPct: 0, contingencyPct: 0 });
    expect(priced.rate).toBeCloseTo(10.456, 8);
    expect(roundRate(priced.rate)).toBe(10.46);
    expect(roundAmount(roundRate(priced.rate) * roundQty(priced.amount / priced.rate))).toBe(13);
  });

  it("rounds displayed totals without moving the full-precision project sum", () => {
    configureDisplayFormat({ qtyDecimals: 2, rateDecimals: 2, amountDecimals: 2, dimDecimals: 2 });
    const result = computeProject({
      margin: { overheadPct: 0, profitPct: 0, logisticsPct: 0, contingencyPct: 0 },
      items: [
        { boqCode: "a", clientQty: 1, ourQty: 1, lines: [], directCost: 10.004, priceMode: "direct" },
        { boqCode: "b", clientQty: 2, ourQty: 2, lines: [], directCost: 3.335, priceMode: "direct" },
      ],
    });
    expect(result.items[0]?.amount).toBeCloseTo(10.004, 8);
    expect(result.items[1]?.amount).toBeCloseTo(6.67, 8);
    expect(result.grandTotal).toBeCloseTo(16.674, 8);
    expect(roundAmount(result.items[0]?.amount ?? 0)).toBe(10);
    expect(roundAmount(result.items[1]?.amount ?? 0)).toBe(6.67);
    expect(roundAmount(result.grandTotal)).toBe(16.67);
  });

  it("rounds take-off dimensions up and the posted quantity to the quantity setting", () => {
    configureDisplayFormat({ dimDecimals: 2, qtyDecimals: 2 });
    expect(qtoQty("area", { nos1: 1, nos2: 1, l: 1.221, b: 2 })).toBe(2.46);
    expect(qtoQty("qty", { l: 1.234 })).toBe(1.23);
  });

  it("groups Indian rupees in en-IN and keeps other currencies in en-US", () => {
    expect(formatMoney(100826297.13, "INR", 2)).toBe("₹10,08,26,297.13");
    expect(formatMoney(220000, "QAR", 2)).toBe("QAR 220,000.00");
    expect(formatMoney(1475.5, "USD", 2)).toBe("$1,475.50");
  });
});
