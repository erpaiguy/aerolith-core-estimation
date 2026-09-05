import { describe, expect, it } from "vitest";
import {
  currencyMarker,
  formatDim,
  formatMoneyPlain,
  formatNos,
  mergeDisplayFormat,
  roundUpTo,
} from "@aerolith/shared";

describe("display rounding and currency markers", () => {
  it("rounds Nos up away from zero to two places", () => {
    expect(roundUpTo(1.221, 2)).toBe(1.23);
    expect(roundUpTo(-1.221, 2)).toBe(-1.23);
    expect(roundUpTo(1.22, 2)).toBe(1.22);
    expect(roundUpTo(1.2200000000001, 2)).toBe(1.22);
    expect(formatNos(1.221, 2)).toBe("1.23");
    expect(formatNos(-0.001, 2)).toBe("-0.01");
  });

  it("rounds dimensions up at the fifth decimal", () => {
    expect(roundUpTo(1.234561, 5)).toBe(1.23457);
    expect(formatDim(1.234561, 5)).toBe("1.23457");
    expect(formatDim(-2.5, 5)).toBe("-2.50000");
  });

  it("prints money without a currency code and markers for headers", () => {
    expect(formatMoneyPlain(1475.5, 2)).toBe("1,475.50");
    expect(currencyMarker("QAR")).toBe("QAR");
    expect(currencyMarker("USD")).toBe("$");
    expect(currencyMarker("EUR")).toBe("€");
  });

  it("merges nos and dimension decimal settings", () => {
    const next = mergeDisplayFormat({ nosDecimals: 2, dimDecimals: 5, currency: "usd" });
    expect(next.currency).toBe("USD");
    expect(next.nosDecimals).toBe(2);
    expect(next.dimDecimals).toBe(5);
  });
});
