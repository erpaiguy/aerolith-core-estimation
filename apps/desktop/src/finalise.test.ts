import { moneyClose } from "@aerolith/shared";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { ItemResult } from "@aerolith/calc";
import { itemKeyOf } from "./bills";
import {
  applyDraft,
  commercialOf,
  compareSnapshots,
  editDraft,
  freezeRevision,
  parseCommercial,
  submissionChecks,
  submissionPackDocument,
  submissionPackXlsx,
  tenderSummary,
  tradeSplit,
  withCommercial,
} from "./finalise";
import { buildPdf } from "./print/pdf";
import type { LoadedProject, ProjectBill, ProjectResource, TenderQueryItem, WorkingItem } from "./model";
import { mergeReportFormat } from "./reportFormat";

function bill(id: string, code: string, name: string): ProjectBill {
  return { id, number: 1, code, name, issuedRef: "", sourceLockedAt: null };
}

function result(boqCode: string, qty: number, rate: number, cost: number): ItemResult {
  return {
    boqCode,
    quoteQty: qty,
    unitCost: qty ? cost / qty : cost,
    rate,
    costAmount: cost,
    marginAmount: rate * qty - cost,
    amount: rate * qty,
    clientAmount: rate * qty,
    adjustmentAmount: 0,
  };
}

function row(partial: Partial<WorkingItem> & Pick<WorkingItem, "boqCode" | "kind">): WorkingItem {
  return {
    id: partial.id ?? partial.boqCode,
    billId: partial.billId ?? "bill-1",
    boqCode: partial.boqCode,
    clientLinkCode: partial.boqCode,
    slNo: partial.slNo ?? partial.boqCode,
    kind: partial.kind,
    parentCode: partial.parentCode ?? null,
    description: partial.description ?? partial.boqCode,
    boqCategory: null,
    workCategory: null,
    subWorkCategory: null,
    group1: null,
    group2: null,
    group3: null,
    clientQty: partial.clientQty ?? partial.ourQty ?? 1,
    ourQty: partial.ourQty ?? 1,
    unit: partial.unit ?? "m2",
    lines: partial.lines ?? [],
    result: partial.result,
  };
}

function resource(code: string, category: string): ProjectResource {
  return {
    project_code: code,
    global_code: null,
    category,
    type: category,
    sub_type: null,
    description: code,
    unit: null,
    project_wastage_pct: 0,
    project_rate: 0,
    total_qty: 0,
    total_amount: 0,
  };
}

function project(items: WorkingItem[], extra: Partial<LoadedProject> = {}): LoadedProject {
  return {
    name: "Campus",
    locationNote: "Lusail",
    margin: { overheadPct: 0, profitPct: 0, logisticsPct: 0, contingencyPct: 0 },
    marginPresets: [],
    marginRules: [],
    currency: "QAR",
    qtySource: "client_plus_adjustments",
    bills: extra.bills ?? [bill("bill-1", "BOQ1", "Building")],
    items,
    clientNodes: [],
    clientColumns: [],
    workingColumns: [],
    resources: extra.resources ?? [],
    units: [],
    categories: [],
    vendors: [],
    qtoLines: [],
    resourceQuotes: [],
    itemQuotes: extra.itemQuotes ?? [],
    enquiries: [],
    quoteReplies: [],
    quoteFieldDefs: [],
    queryItems: extra.queryItems ?? [],
    queryLists: [],
    sourceLockedAt: null,
    sealedAt: null,
    revision: extra.revision ?? 1,
    commercial: extra.commercial,
  };
}

describe("tender summary", () => {
  it("totals each BOQ and section and splits cost by trade", () => {
    const job = project(
      [
        row({ boqCode: "1", kind: "section", description: "Structure", ourQty: 0 }),
        row({
          boqCode: "1.1",
          kind: "item",
          parentCode: "1",
          ourQty: 2,
          unit: "m2",
          lines: [
            { factors: [1], wastagePct: 0, resourceRate: 10, projectResourceCode: "LAB" },
            { factors: [1], wastagePct: 0, resourceRate: 30, projectResourceCode: "MAT" },
          ],
          result: result("1.1", 2, 50, 80),
        }),
        row({
          boqCode: "2",
          kind: "item",
          billId: "bill-2",
          ourQty: 1,
          lines: [{ factors: [1], wastagePct: 0, resourceRate: 15, projectResourceCode: "PLT" }],
          result: result("2", 1, 20, 15),
        }),
      ],
      {
        bills: [bill("bill-1", "BOQ1", "Building"), bill("bill-2", "BOQ2", "External")],
        resources: [resource("LAB", "Labour"), resource("MAT", "Material"), resource("PLT", "Plant")],
      },
    );
    const quoted = row({
      boqCode: "9",
      kind: "item",
      description: "Package",
      ourQty: 1,
      result: result("9", 1, 100, 80),
    });
    const withQuote = project([quoted], {
      itemQuotes: [{ id: "q", boqCode: "9", vendorName: "Sub", rate: 80, selected: true }],
    });
    expect(tradeSplit(withQuote, quoted).subcontract).toBe(80);

    const rows = tenderSummary(job);
    const building = rows.find((row) => row.id === "bill-1");
    const structure = rows.find((row) => row.label.startsWith("1 "));
    const external = rows.find((row) => row.id === "bill-2");
    const tender = rows.find((row) => row.level === "tender");
    expect(building).toMatchObject({ cost: 80, sell: 100, labour: 20, material: 60, offer: 100 });
    expect(structure).toMatchObject({ cost: 80, sell: 100, depth: 1 });
    expect(external).toMatchObject({ cost: 15, plant: 15, sell: 20 });
    expect(tender).toMatchObject({ cost: 95, sell: 120, labour: 20, material: 60, plant: 15 });
  });
});

describe("final adjustments", () => {
  it("previews a discount without changing the applied offer, then applies it", () => {
    const base = project([
      row({ boqCode: "1", kind: "section", description: "A", ourQty: 0 }),
      row({ boqCode: "1.1", kind: "item", parentCode: "1", ourQty: 1, result: result("1.1", 1, 100, 60) }),
      row({ boqCode: "2", kind: "section", description: "B", ourQty: 0 }),
      row({ boqCode: "2.1", kind: "item", parentCode: "2", ourQty: 1, result: result("2.1", 1, 100, 70) }),
    ]);
    const sectionId = itemKeyOf(base.items[0]!);
    const drafted = editDraft(base, [
      { id: "oh", kind: "overhead", level: "tender", targetId: "", pct: 0.1 },
      { id: "sec", kind: "profit", level: "section", targetId: sectionId, pct: 0.05 },
    ]);
    const preview = tenderSummary(drafted);
    const tender = preview.find((row) => row.level === "tender");
    expect(tender).toMatchObject({ sell: 200, offer: 200 });
    expect(moneyClose(tender?.preview ?? 0, 225)).toBe(true);
    expect(moneyClose(preview.find((row) => row.label.startsWith("1 "))?.preview ?? 0, 115)).toBe(true);
    expect(moneyClose(preview.find((row) => row.label.startsWith("2 "))?.preview ?? 0, 110)).toBe(true);
    const applied = applyDraft(drafted);
    expect(commercialOf(applied).draft).toBeNull();
    expect(moneyClose(tenderSummary(applied).find((row) => row.level === "tender")?.offer ?? 0, 225)).toBe(true);

    const discounted = editDraft(applied, [
      ...commercialOf(applied).adjustments,
      { id: "disc", kind: "discount", level: "tender", targetId: "", pct: 0.1 },
    ]);
    const after = tenderSummary(discounted).find((row) => row.level === "tender");
    expect(moneyClose(after?.offer ?? 0, 225)).toBe(true);
    expect(moneyClose(after?.preview ?? 0, 205)).toBe(true);
  });
});

describe("revisions", () => {
  it("freezes inside the file and compares quantity, rate, and amount", () => {
    const first = project([
      row({ boqCode: "1.1", kind: "item", description: "Slab", ourQty: 10, result: result("1.1", 10, 5, 40) }),
    ]);
    const frozen = freezeRevision(first, "Issued", "2026-10-16T00:00:00.000Z");
    expect(frozen.revision).toBe(2);
    expect(commercialOf(frozen).revisions.map((rev) => rev.number)).toEqual([1]);
    expect(commercialOf(frozen).revisions[0]?.sell).toBe(50);
    const changed = {
      ...frozen,
      items: frozen.items.map((item) =>
        item.kind === "item" ? { ...item, ourQty: 12, result: result(item.boqCode, 12, 6, 48) } : item,
      ),
    };
    const again = freezeRevision(changed, "Revised qty");
    expect(again.revision).toBe(3);
    const [r1, r2] = commercialOf(again).revisions;
    const diffs = compareSnapshots(r1!.lines, r2!.lines);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ status: "changed", qtyA: 10, qtyB: 12, rateA: 5, rateB: 6, amountA: 50, amountB: 72 });
    const added = compareSnapshots(r1!.lines, [
      ...r2!.lines,
      { ...r2!.lines[0]!, key: "bill-1::9", description: "New", slNo: "9", qty: 1, rate: 2, amount: 2 },
    ]);
    expect(added.some((row) => row.status === "added" && row.description === "New")).toBe(true);
  });
});

describe("pre-submission check", () => {
  it("flags zero rates, outlier rates, open queries, and missing qualifications", () => {
    const items = [10, 10, 10, 80].map((rate, index) =>
      row({
        boqCode: `1.${index + 1}`,
        kind: "item",
        unit: "m2",
        ourQty: 1,
        result: result(`1.${index + 1}`, 1, rate, rate),
      }),
    );
    items.push(row({ boqCode: "1.5", kind: "item", description: "Blank", ourQty: 1, result: result("1.5", 1, 0, 0) }));
    const query: TenderQueryItem = {
      id: "q1",
      number: "Q1",
      documentRef: "",
      subject: "DALI",
      question: "Which floors?",
      createdAt: "2026-10-01T00:00:00.000Z",
      carriedFromId: null,
      closedAt: null,
      replies: [],
      attachments: [],
    };
    const job = project(items, { queryItems: [query] });
    const issues = submissionChecks(job);
    expect(issues.some((issue) => issue.kind === "unpriced" && issue.itemKey?.endsWith("1.5"))).toBe(true);
    expect(issues.some((issue) => issue.kind === "outlier" && issue.detail.includes("8.0"))).toBe(true);
    expect(issues.some((issue) => issue.kind === "query" && issue.activity === "queries")).toBe(true);
    expect(issues.some((issue) => issue.kind === "qualification" && issue.pane === "pack")).toBe(true);
    const cleared = withCommercial(job, { clauses: [{ id: "c", kind: "qualification", text: "Prices exclude VAT." }] });
    expect(submissionChecks({ ...cleared, queryItems: [{ ...query, closedAt: "2026-10-02T00:00:00.000Z" }] }).some((issue) => issue.kind === "qualification" || issue.kind === "query")).toBe(false);
  });
});

describe("submission pack", () => {
  it("builds a PDF and an Excel workbook from the same offer", async () => {
    const job = withCommercial(
      project([
        row({ boqCode: "1.1", kind: "item", description: "Slab", ourQty: 2, result: result("1.1", 2, 10, 12) }),
      ]),
      {
        coverLetter: "Our offer is attached.",
        clauses: [
          { id: "q", kind: "qualification", text: "Prices exclude VAT." },
          { id: "e", kind: "exclusion", text: "Night working." },
        ],
        adjustments: [{ id: "oh", kind: "overhead", level: "tender", targetId: "", pct: 0.1 }],
      },
    );
    const doc = submissionPackDocument(job, mergeReportFormat({ showLogo: false, companyName: "Northwind" }));
    expect(doc.sections.map((section) => section.title)).toEqual([
      "Cover letter",
      "Tender summary",
      "Cost split",
      "BOQ1 Building",
      "Qualifications",
      "Exclusions",
    ]);
    expect(doc.sections[0]?.rows[0]?.cells[0]).toBe("Our offer is attached.");
    expect(doc.sections[3]?.rows.some((row) => row.cells.includes("22.00") || row.cells.join(" ").includes("22"))).toBe(true);
    const bytes = await buildPdf(doc);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);

    const book = strFromU8(unzipSync(submissionPackXlsx(job))["xl/workbook.xml"]!);
    expect(book).toContain('name="Cover"');
    expect(book).toContain('name="Summary"');
    expect(book).toContain("Qualifications");
    expect(book).toContain("Exclusions");
  });

  it("drops unknown commercial rows when an older file is opened", () => {
    const parsed = parseCommercial({
      adjustments: [{ id: "ok", kind: "discount", level: "bill", targetId: "bill-1", pct: 0.05 }, { kind: "rebate", level: "job" }],
      clauses: [{ id: "c", kind: "qualification", text: "VAT" }, { kind: "note" }],
      revisions: [{ number: 2, lines: [{ key: "bill-1::1", qty: 1, rate: 2, amount: 2 }] }],
      coverLetter: "Hello",
    });
    expect(parsed.adjustments).toHaveLength(1);
    expect(parsed.clauses).toHaveLength(1);
    expect(parsed.revisions[0]?.number).toBe(2);
    expect(parsed.coverLetter).toBe("Hello");
  });
});
