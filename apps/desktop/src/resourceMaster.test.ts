import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { emptyProject } from "./loadReference";
import { copyGlobalMaster, projectWithMaster } from "./projectResourceMaster";
import {
  convertMasterRates,
  importResourceRows,
  mergeResourceSeed,
  parseResourceWorkbook,
  pushRateToMaster,
  RESOURCE_SEED_VERSION,
  resourceMasterToXlsx,
  searchResourceMaster,
  type ResourceMasterRow,
} from "./resourceMaster";

function workbookWithRateHeader(rateHeader: string): Uint8Array {
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Code</t></is></c><c r="B1" t="inlineStr"><is><t>Name</t></is></c><c r="C1" t="inlineStr"><is><t>Category</t></is></c><c r="D1" t="inlineStr"><is><t>Sub-category</t></is></c><c r="E1" t="inlineStr"><is><t>Unit</t></is></c><c r="F1" t="inlineStr"><is><t>${rateHeader}</t></is></c><c r="G1" t="inlineStr"><is><t>Notes</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>MAT-9</t></is></c><c r="B2" t="inlineStr"><is><t>Sheet</t></is></c><c r="C2" t="inlineStr"><is><t>Material</t></is></c><c r="D2" t="inlineStr"><is><t>Plywood</t></is></c><c r="E2" t="inlineStr"><is><t>Nr</t></is></c><c r="F2"><v>12.5</v></c><c r="G2" t="inlineStr"><is><t></t></is></c></row>
</sheetData></worksheet>`;
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resources" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

const seedBytes = new Uint8Array(
  readFileSync(new URL("./resources/BidCraft-Default-Resources-QAR.xlsx", import.meta.url)),
);

function row(partial: Partial<ResourceMasterRow> & Pick<ResourceMasterRow, "code">): ResourceMasterRow {
  return {
    name: partial.name ?? partial.code,
    category: partial.category ?? "Material",
    subCategory: partial.subCategory ?? "Cement",
    unit: partial.unit ?? "Bag",
    rate: partial.rate ?? 100,
    notes: partial.notes ?? "",
    userEdited: partial.userEdited ?? false,
    code: partial.code,
  };
}

describe("bundled resource master", () => {
  const seed = parseResourceWorkbook(seedBytes);

  it("reads the 357-row QAR workbook, including joinery material sub-categories", () => {
    expect(seed).toHaveLength(357);
    expect(seed[0]).toMatchObject({ code: "MAT-001", rate: 195.65, subCategory: "Acrylics" });
    expect(seed[0]?.notes).toContain("1 QAR = 23 INR");
    const subs = new Set(seed.filter((item) => item.category === "Material").map((item) => item.subCategory));
    for (const name of ["Cabinet Hardware", "Door Hardware", "Door Core", "Plywood", "Veneer", "Solid Wood", "Laminate"]) {
      expect(subs.has(name)).toBe(true);
    }
    expect(seed.every((item) => item.userEdited === false)).toBe(true);
    expect(RESOURCE_SEED_VERSION).toBe(2);
  });

  it("accepts Rate, Rate (QAR), and Rate (INR) column headings", () => {
    for (const heading of ["Rate", "Rate (QAR)", "Rate (INR)"]) {
      const parsed = parseResourceWorkbook(workbookWithRateHeader(heading));
      expect(parsed[0]).toMatchObject({ code: "MAT-9", rate: 12.5, subCategory: "Plywood" });
    }
  });

  it("round-trips through Excel without dropping codes or rates", () => {
    const again = parseResourceWorkbook(resourceMasterToXlsx(seed.slice(0, 12)));
    expect(again.map((item) => [item.code, item.rate, item.subCategory])).toEqual(
      seed.slice(0, 12).map((item) => [item.code, item.rate, item.subCategory]),
    );
  });
});

describe("resource master edits", () => {
  const seed = [row({ code: "MAT-001", rate: 420, name: "Cement" }), row({ code: "LAB-001", rate: 800, category: "Labour" })];

  it("seeds on first run and refreshes only untouched rows on a version upgrade", () => {
    const first = mergeResourceSeed(undefined, seed, undefined, 1);
    expect(first.rows.map((item) => item.rate)).toEqual([420, 800]);
    const edited = first.rows.map((item) => (item.code === "MAT-001" ? { ...item, rate: 500, userEdited: true } : item));
    const upgraded = mergeResourceSeed(edited, [row({ code: "MAT-001", rate: 450, name: "Cement new" }), row({ code: "LAB-001", rate: 900 }), row({ code: "NEW-1", rate: 10 })], 1, 2);
    expect(upgraded.rows.find((item) => item.code === "MAT-001")).toMatchObject({ rate: 500, userEdited: true });
    expect(upgraded.rows.find((item) => item.code === "LAB-001")?.rate).toBe(900);
    expect(upgraded.rows.find((item) => item.code === "NEW-1")?.rate).toBe(10);
    const same = mergeResourceSeed(upgraded.rows, seed, 2, 2);
    expect(same.rows).toEqual(upgraded.rows);
  });

  it("keeps user-added codes and marks an Excel import as edited", () => {
    const custom = [...seed, row({ code: "LOCAL-1", rate: 5, userEdited: true })];
    const imported = importResourceRows(custom, [row({ code: "MAT-001", rate: 111, name: "Imported cement" })]);
    expect(imported.find((item) => item.code === "MAT-001")).toMatchObject({ rate: 111, name: "Imported cement", userEdited: true });
    expect(imported.find((item) => item.code === "LOCAL-1")?.rate).toBe(5);
  });

  it("converts master rates by a factor and does not touch them when the factor is 1", () => {
    const converted = convertMasterRates(seed, 0.012);
    expect(converted[0]?.rate).toBeCloseTo(5.04, 2);
    expect(converted.every((item) => item.userEdited)).toBe(true);
    expect(convertMasterRates(seed, 1).map((item) => item.userEdited)).toEqual([false, false]);
  });

  it("searches name, code, and sub-category", () => {
    const rows = [row({ code: "MAT-001", name: "Teak plywood", subCategory: "Plywood" }), row({ code: "LAB-9", name: "Mason" })];
    expect(searchResourceMaster(rows, "ply").map((item) => item.code)).toEqual(["MAT-001"]);
    expect(searchResourceMaster(rows, "lab-9")).toHaveLength(1);
  });

  it("copies the global master into a project and pushes one rate back", () => {
    const global = seed.map((item) => ({ ...item }));
    const project = copyGlobalMaster(emptyProject("Job", "QAR"), global);
    expect(project.resourceMaster?.map((item) => item.code)).toEqual(["MAT-001", "LAB-001"]);
    expect(project.resources.find((item) => item.project_code === "MAT-001")?.project_rate).toBe(420);
    const edited = projectWithMaster(project, (project.resourceMaster ?? []).map((item) => (item.code === "MAT-001" ? { ...item, rate: 510, userEdited: true } : item)));
    expect(edited.resources.find((item) => item.project_code === "MAT-001")?.project_rate).toBe(510);
    expect(global[0]?.rate).toBe(420);
    const pushed = pushRateToMaster(global, edited.resourceMaster!.find((item) => item.code === "MAT-001")!);
    expect(pushed.find((item) => item.code === "MAT-001")).toMatchObject({ rate: 510, userEdited: true });
    expect(global[0]?.rate).toBe(420);
  });
});
