import { describe, expect, it } from "vitest";
import { applyThemeStyle, parseThemeStyle, readThemeStyle, THEME_STYLES } from "./theme";

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
