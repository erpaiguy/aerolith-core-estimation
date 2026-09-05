import { describe, expect, it } from "vitest";
import {
  formatLicenseTerm,
  generateLicenseKey,
  licenseExpiresAt,
  normalizeLicenseKey,
  parseLicenseTerm,
} from "./licenseTerm";

describe("license terms", () => {
  it("adds calendar days, months, and years", () => {
    const from = new Date(2026, 0, 15, 12, 0, 0);
    const days = licenseExpiresAt(from, { amount: 14, unit: "day" });
    const months = licenseExpiresAt(from, { amount: 1, unit: "month" });
    const years = licenseExpiresAt(from, { amount: 1, unit: "year" });
    expect(days.getDate()).toBe(29);
    expect(months.getMonth()).toBe(1);
    expect(years.getFullYear()).toBe(2027);
  });

  it("accepts custom length and formats it", () => {
    expect(parseLicenseTerm("45", "day")).toEqual({ amount: 45, unit: "day" });
    expect(parseLicenseTerm("0", "day")).toBeNull();
    expect(formatLicenseTerm({ amount: 1, unit: "year" })).toBe("1 year");
    expect(formatLicenseTerm({ amount: 21, unit: "day" })).toBe("21 days");
  });

  it("trims a custom key and can generate one", () => {
    expect(normalizeLicenseKey("  AL-MAHA 2026  ")).toBe("AL-MAHA2026");
    expect(generateLicenseKey().startsWith("AERO-")).toBe(true);
  });
});
