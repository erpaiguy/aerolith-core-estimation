import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { mergeReportFormat } from "../reportFormat";
import { buildPdf } from "./pdf";
import type { PrintDocument } from "./types";

function sample(orientation: "portrait" | "landscape", paper: "a4" | "a3" | "letter"): PrintDocument {
  return {
    filename: "Sample.pdf",
    documentTitle: "Submission BOQ",
    projectName: "Interior refurbishment",
    paper,
    orientation,
    format: mergeReportFormat({ paper, orientation, showLogo: false, companyName: "Northwind" }),
    revision: "r1",
    sections: [
      {
        title: "Bill",
        columns: [
          { label: "Description", width: 60 },
          { label: "Rate (in QAR)", width: 20, align: "right" },
          { label: "Amount (in QAR)", width: 20, align: "right" },
        ],
        rows: [
          { cells: ["Joinery package", "1,250.00", "147,500.00"] },
          { kind: "total", cells: ["Grand total", "", "100,826,297.13"] },
        ],
      },
    ],
  };
}

describe("buildPdf", () => {
  it("writes a portrait A4 PDF whose page box matches the packet paper", async () => {
    const bytes = await buildPdf(sample("portrait", "a4"));
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPage(0);
    const { width, height } = page.getSize();
    expect(bytes.slice(0, 5)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(pdf.getTitle()).toContain("Submission BOQ");
  });

  it("swaps the page box for landscape A3", async () => {
    const pdf = await PDFDocument.load(await buildPdf(sample("landscape", "a3")));
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(1191);
    expect(Math.round(height)).toBe(842);
  });
});
