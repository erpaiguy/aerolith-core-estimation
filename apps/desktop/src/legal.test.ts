import { describe, expect, it } from "vitest";
import { LEGAL_DOCS, legalDocument } from "./legal";

describe("legal documents", () => {
  it("publishes privacy, terms of service, terms and conditions, and the license", () => {
    expect(LEGAL_DOCS.map((doc) => doc.title)).toEqual([
      "Privacy policy",
      "Terms of service",
      "Terms and conditions",
      "License terms",
    ]);
    for (const doc of LEGAL_DOCS) {
      expect(doc.effective).toBe("16 October 2026");
      expect(doc.sections.length).toBeGreaterThan(0);
      expect(doc.sections.every((section) => section.paragraphs.every((p) => p.trim().length > 0))).toBe(true);
    }
  });

  it("describes local tender files and does not embed a secret", () => {
    const privacy = legalDocument("privacy")
      .sections.flatMap((section) => [section.heading, ...section.paragraphs])
      .join(" ");
    expect(privacy).toMatch(/\.aero/);
    expect(privacy).toMatch(/this computer/i);
    expect(privacy).toMatch(/Documents\/Aerolith/);
    expect(privacy.toLowerCase()).not.toContain("service_role");
    expect(privacy).not.toMatch(/eyJ/);
    expect(legalDocument("license").sections.some((section) => section.heading === "Grant")).toBe(true);
  });
});
