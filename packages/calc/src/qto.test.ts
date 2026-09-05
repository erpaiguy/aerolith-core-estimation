import { describe, expect, it } from "vitest";
import { qtoQty, postedQtyByItem } from "./qto.ts";

describe("qtoQty", () => {
  it("qty uses L only", () => {
    expect(qtoQty("qty", { l: -12.5 })).toBe(-12.5);
  });

  it("product ignores blanks", () => {
    expect(qtoQty("product", { nos1: 2, nos2: 3, l: 4 })).toBe(24);
  });

  it("area / volume / perimeter × H", () => {
    expect(qtoQty("area", { nos1: 2, l: 3, b: 4 })).toBe(24);
    expect(qtoQty("volume", { nos1: 1, nos2: 1, l: 2, b: 3, h: 4 })).toBe(24);
    expect(qtoQty("perimeter_x_h", { l: 10, b: 4, h: 3 })).toBe(84);
  });
});

describe("postedQtyByItem", () => {
  it("sums lines onto one working item", () => {
    const sums = postedQtyByItem([
      { workingBoqCode: "3a", formulaKey: "qty", dims: { l: 10 } },
      { workingBoqCode: "3a", formulaKey: "qty", dims: { l: 2.5 } },
      { workingBoqCode: "3b", formulaKey: "qty", dims: { l: 1 } },
    ]);
    expect(sums.get("3a")).toBe(12.5);
    expect(sums.get("3b")).toBe(1);
  });

  it("keeps negative deduction lines in the posted total", () => {
    const sums = postedQtyByItem([
      { workingBoqCode: "3a", formulaKey: "qty", dims: { l: 10 } },
      { workingBoqCode: "3a", formulaKey: "qty", dims: { l: -2.5 } },
    ]);
    expect(sums.get("3a")).toBe(7.5);
  });
});
