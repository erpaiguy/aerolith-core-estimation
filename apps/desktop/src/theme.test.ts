import { describe, expect, it } from "vitest";
import { applyLayout, applyThemeStyle, LAYOUTS, parseLayout, parseThemeStyle, readLayout, readThemeStyle, THEME_STYLES } from "./theme";

describe("theme style", () => {
  it("defaults to clean minimal", () => {
    expect(parseThemeStyle(null)).toBe("minimal");
    expect(parseThemeStyle(undefined)).toBe("minimal");
    expect(parseThemeStyle("")).toBe("minimal");
    expect(parseThemeStyle("navy")).toBe("minimal");
    expect(readThemeStyle()).toBe("minimal");
  });

  it("accepts the five bundled styles", () => {
    expect(THEME_STYLES.map((style) => style.label)).toEqual([
      "Clean minimal",
      "Dense spreadsheet",
      "Dark-first modern",
      "Soft cards",
      "Classic enterprise",
    ]);
    for (const style of THEME_STYLES) {
      expect(parseThemeStyle(style.id)).toBe(style.id);
      expect(applyThemeStyle(style.id)).toBe(style.id);
    }
  });
});

describe("layout", () => {
  it("defaults to the 1.4.0 standard arrangement", () => {
    expect(parseLayout(null)).toBe("standard");
    expect(parseLayout("excel")).toBe("standard");
    expect(readLayout()).toBe("standard");
    expect(LAYOUTS.map((item) => item.label)).toEqual([
      "1.4.0 standard",
      "Tender folio",
      "Split desk",
      "Section board",
    ]);
    for (const item of LAYOUTS) {
      expect(parseLayout(item.id)).toBe(item.id);
      expect(applyLayout(item.id)).toBe(item.id);
    }
  });
});
