import { describe, expect, it } from "vitest";
import { isNumericDraft, parseSignedNumber } from "@aerolith/shared";

describe("quantity entry", () => {
  it("keeps minus and decimal drafts while typing", () => {
    expect(isNumericDraft("")).toBe(true);
    expect(isNumericDraft("-")).toBe(true);
    expect(isNumericDraft("-.")).toBe(true);
    expect(isNumericDraft("0.")).toBe(true);
    expect(isNumericDraft(".25")).toBe(true);
    expect(isNumericDraft("-12.5")).toBe(true);
    expect(isNumericDraft("12.5")).toBe(true);
    expect(isNumericDraft("1,234.5")).toBe(true);
    expect(isNumericDraft("12e3")).toBe(false);
    expect(isNumericDraft("1.2.3")).toBe(false);
  });

  it("parses negative and decimal quantities", () => {
    expect(parseSignedNumber("-")).toBeNull();
    expect(parseSignedNumber("")).toBeNull();
    expect(parseSignedNumber("-12.5")).toBe(-12.5);
    expect(parseSignedNumber(".5")).toBe(0.5);
    expect(parseSignedNumber("-0.25")).toBe(-0.25);
    expect(parseSignedNumber("1,250.75")).toBe(1250.75);
    expect(parseSignedNumber("0")).toBe(0);
  });
});
