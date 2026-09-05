import { moneyClose } from "@aerolith/shared";
import { describe, expect, it } from "vitest";
import { canCommitImport } from "./import/extract";
import { emptyProject, loadReferenceProject, projectFromClientRows } from "./loadReference";
import { GOLDEN_TOTAL, itemBadges, stampItem } from "./model";
import { itemKeyOf } from "./bills";
import { APP_DEFAULT_REPORT_FORMAT, mergeReportFormat, paginateDocument, submissionCsv, visibleColumns } from "./reportFormat";
import { defaultClientColumns, itemMatchesQuery, newWorkingColumn } from "./boqColumns";
import { licenseStatus } from "./platform/crypto";
import {
  applyVendorPack,
  blankEnquiry,
  buyLanes,
  compareFactors,
  coverage,
  enquiryCsv,
  importQuoteRows,
  issueEnquiry,
  laneIdForPack,
  parseQuoteCsv,
  selectLowestInLane,
  selectQuoteLine,
  trackEnquiry,
  upsertFieldDef,
} from "./buyProcurement";
import {
  applySelectedResourceQuotes,
  cloneWholeAnalysis,
  costByCategory,
  diffReplica,
  linkWholeAnalysis,
  SUBCONTRACT_CATEGORY,
  withResults,
} from "./projectCompute";

describe("phase exits", () => {
  it("sample working total is GREEN after QTO posting", () => {
    const project = withResults(loadReferenceProject());
    const total = project.items
      .filter((i) => i.kind === "item")
      .reduce((s, i) => s + (i.result?.amount ?? 0), 0);
    const sub =
      project.items
        .filter((i) => i.kind === "item")
        .reduce((s, i) => s + (i.result?.clientAmount ?? 0) + (i.result?.adjustmentAmount ?? 0), 0);
    expect(moneyClose(total, GOLDEN_TOTAL)).toBe(true);
    expect(moneyClose(sub, total)).toBe(true);
    expect(project.sourceLockedAt).toBeTruthy();
    const diffs = project.items.filter((i) => i.kind === "item" && i.ourQty !== i.clientQty);
    expect(diffs.length).toBe(7);
  });

  it("app default report format keeps the sample GREEN on export CSV", () => {
    const project = withResults(loadReferenceProject());
    const total = project.items
      .filter((i) => i.kind === "item")
      .reduce((s, i) => s + (i.result?.amount ?? 0), 0);
    const csv = submissionCsv(project, APP_DEFAULT_REPORT_FORMAT, total);
    expect(csv).toContain("Grand total");
    expect(csv).toContain("100,826,297.13");
    expect(csv).toContain("Category summary");
    expect(csv).toContain("Grand summary");
    expect(mergeReportFormat(undefined).paper).toBe("a4");
    expect(mergeReportFormat({ companyName: "Acme" }).companyName).toBe("Acme");
    expect(mergeReportFormat({ companyName: "Acme" }).paper).toBe("a4");
    expect(mergeReportFormat({ colWidths: { description: 55 } }).colWidths.description).toBe(55);
    expect(mergeReportFormat({ colWidths: { description: 55 } }).colWidths.sl).toBe(8);
    expect(mergeReportFormat({ pageSummaryColWidths: { description: 80 } }).pageSummaryColWidths.description).toBe(80);
    expect(mergeReportFormat({ pageSummaryColWidths: { description: 80 } }).categorySummaryColWidths.description).toBe(72);
    expect(mergeReportFormat({ grandSummaryColWidths: { amount: 30 } }).grandSummaryColWidths.amount).toBe(30);
  });

  it("imported extra client columns lock with the source bill", () => {
    const cols = [
      ...defaultClientColumns(),
      { id: "c-zone", label: "Zone", role: "extra" as const, valueType: "text" as const },
    ];
    const project = withResults(
      projectFromClientRows(
        "Imported",
        [
          { sl: "1", description: "Preliminaries", qty: null, unit: "", extra: {} },
          { sl: "a", description: "Site set-up", qty: 2, unit: "L/s", extra: { "c-zone": "North" } },
        ],
        cols,
      ),
    );
    expect(project.sourceLockedAt).toBeTruthy();
    expect(project.clientColumns.some((c) => c.id === "c-zone" && c.role === "extra")).toBe(true);
    expect(project.workingColumns).toEqual([]);
    const item = project.items.find((i) => i.kind === "item");
    expect(item?.extra?.["c-zone"]).toBe("North");
    expect(project.clientNodes.find((n) => n.kind === "item")?.extra?.["c-zone"]).toBe("North");
    expect(visibleColumns(APP_DEFAULT_REPORT_FORMAT, project)).toContain("c-zone");
    expect(itemMatchesQuery(item!, "north")).toBe(true);
  });

  it("working columns and extra values do not move the sample GREEN total", () => {
    const project = withResults(loadReferenceProject());
    const col = newWorkingColumn("Zone", []);
    const next = withResults({
      ...project,
      workingColumns: [col],
      items: project.items.map((i) =>
        i.kind === "item" ? { ...i, extra: { ...(i.extra ?? {}), [col.id]: "A" } } : i,
      ),
    });
    const total = next.items
      .filter((i) => i.kind === "item")
      .reduce((s, i) => s + (i.result?.amount ?? 0), 0);
    expect(moneyClose(total, GOLDEN_TOTAL)).toBe(true);
    expect(visibleColumns(APP_DEFAULT_REPORT_FORMAT, next)).not.toContain(col.id);
    const csv = submissionCsv(next, APP_DEFAULT_REPORT_FORMAT, total);
    expect(csv).toContain("100,826,297.13");
    expect(itemMatchesQuery(next.items.find((i) => i.kind === "item")!, "A")).toBe(true);
  });

  it("category summaries plus grand summary stay GREEN", () => {
    const project = withResults(loadReferenceProject());
    const total = project.items
      .filter((i) => i.kind === "item")
      .reduce((s, i) => s + (i.result?.amount ?? 0), 0);
    const pages = paginateDocument(project, APP_DEFAULT_REPORT_FORMAT, total);
    const cats = pages.filter((p) => p.kind === "category-summary");
    const grand = pages[pages.length - 1];
    expect(cats.length).toBeGreaterThan(0);
    expect(grand?.kind).toBe("grand-summary");
    expect(grand?.pageNo).toBe(pages.length);
    expect(pages.every((p, i) => p.pageNo === i + 1)).toBe(true);
    const catSum = cats.reduce((s, p) => s + p.pageAmount, 0);
    expect(moneyClose(catSum, total)).toBe(true);
    expect(moneyClose(grand!.cumulative, GOLDEN_TOTAL)).toBe(true);
    expect(moneyClose(grand!.summaryRows.reduce((s, r) => s + r.amount, 0), total)).toBe(true);
    const demoPages = pages.filter((p) => p.kind === "items" && /demolition/i.test(p.title));
    const demoSummary = cats.find((p) => /demolition/i.test(p.sectionLabel ?? p.title));
    expect(demoPages.length).toBeGreaterThan(1);
    expect(demoSummary?.summaryRows.length).toBe(demoPages.length);
    expect(pages.filter((p) => p.kind === "items").every((p) => p.cumulative === p.pageAmount)).toBe(true);
  });

  it("page summaries sum to the working total", () => {
    const project = withResults(loadReferenceProject());
    const total = project.items
      .filter((i) => i.kind === "item")
      .reduce((s, i) => s + (i.result?.amount ?? 0), 0);
    const fmt = mergeReportFormat({ summaryMode: "page", linesPerPage: 12, pageBreak: true });
    const pages = paginateDocument(project, fmt, total);
    const summaries = pages.filter((p) => p.kind === "page-summary");
    expect(summaries.length).toBe(1);
    expect(summaries[0]!.summaryRows.length).toBeGreaterThan(1);
    const rowSum = summaries[0]!.summaryRows.reduce((s, r) => s + r.amount, 0);
    expect(moneyClose(rowSum, total)).toBe(true);
    expect(moneyClose(summaries[0]!.pageAmount, total)).toBe(true);
    expect(pages[pages.length - 1]?.kind).toBe("page-summary");
    expect(moneyClose(pages[pages.length - 1]!.cumulative, GOLDEN_TOTAL)).toBe(true);
  });

  it("Our qty comes from the take-off sum", () => {
    const project = withResults(loadReferenceProject());
    const item = project.items.find((i) => i.kind === "item")!;
    const next = withResults({
      ...project,
      qtoLines: project.qtoLines.map((l) =>
        l.workingBoqCode === item.boqCode || l.workingBoqCode === itemKeyOf(item)
          ? { ...l, formulaKey: "qty" as const, dims: { l: 42 } }
          : l,
      ),
    });
    const got = next.items.find((i) => i.boqCode === item.boqCode);
    expect(got?.ourQty).toBe(42);
  });

  it("two take-off lines post as a sum onto one item", () => {
    const project = withResults(loadReferenceProject());
    const item = project.items.find((i) => i.kind === "item")!;
    const rest = project.qtoLines.filter((l) => l.workingBoqCode !== item.boqCode && l.workingBoqCode !== itemKeyOf(item));
    const next = withResults({
      ...project,
      qtoLines: [
        ...rest,
        {
          id: "qto-a",
          workCategory: item.workCategory,
          drawing: "A-101",
          locationDesc: "Room 1",
          itemLabel: null,
          subItem: null,
          formulaKey: "qty" as const,
          dims: { l: 10 },
          workingBoqCode: itemKeyOf(item),
        },
        {
          id: "qto-b",
          workCategory: item.workCategory,
          drawing: "A-101",
          locationDesc: "Room 2",
          itemLabel: null,
          subItem: null,
          formulaKey: "qty" as const,
          dims: { l: 2.5 },
          workingBoqCode: itemKeyOf(item),
        },
      ],
    });
    expect(next.items.find((i) => i.boqCode === item.boqCode)?.ourQty).toBe(12.5);
  });

  it("scanned imports cannot commit without review", () => {
    expect(canCommitImport(true, false)).toBe(false);
    expect(canCommitImport(true, true)).toBe(true);
    expect(canCommitImport(false, false)).toBe(true);
  });

  it("expired license is read-only, not a hard lock", () => {
    const started = new Date(Date.now() - 20 * 86400000).toISOString();
    const status = licenseStatus(started, null);
    expect(status.readOnly).toBe(true);
    expect(status.daysLeft).toBeLessThanOrEqual(0);
  });

  it("replica compare hard-conflicts money fields and does not stay silent", () => {
    const local = withResults(loadReferenceProject());
    const replica = withResults({
      ...local,
      margin: { ...local.margin, profitPct: 0.4 },
    });
    const conflicts = diffReplica(local, replica);
    expect(conflicts.some((c) => c.field === "margin")).toBe(true);
  });

  it("rate analysis custom lines become project resources", () => {
    const base = emptyProject("Sync");
    const item = base.items.find((i) => i.kind === "item")!;
    const next = withResults({
      ...base,
      items: base.items.map((i) =>
        i.boqCode === item.boqCode
          ? {
              ...i,
              lines: [
                {
                  factors: [1, null, null, null, null, null],
                  wastagePct: 0,
                  resourceRate: 12.5,
                  description: "Custom cement",
                  projectResourceCode: null,
                  unit: "Bag",
                },
              ],
            }
          : i,
      ),
    });
    const line = next.items.find((i) => i.boqCode === item.boqCode)?.lines[0];
    expect(line?.projectResourceCode).toBeTruthy();
    const rec = next.resources.find((r) => r.project_code === line?.projectResourceCode);
    expect(rec?.description).toBe("Custom cement");
    expect(rec?.unit).toBe("Bag");
    expect((rec?.total_amount ?? 0) > 0).toBe(true);
  });

  it("submit layout uses the working bill when no client BOQ was imported", () => {
    const project = withResults(emptyProject("Working source"));
    expect(project.sourceLockedAt).toBeFalsy();
    expect(project.clientNodes.some((n) => n.kind === "item" && (n.boqCode === "1a" || n.boqCode === itemKeyOf(project.items.find((i) => i.kind === "item")!)))).toBe(true);
    const extra = withResults({
      ...project,
      items: [
        ...project.items,
        {
          ...project.items.find((i) => i.kind === "item")!,
          id: "i-new",
          boqCode: "1b",
          slNo: "b",
          description: "Second working item",
          clientLinkCode: "1b",
        },
      ],
    });
    expect(extra.clientNodes.some((n) => n.boqCode === "1b" || n.boqCode?.endsWith("::1b"))).toBe(true);
  });

  it("selected resource quote sets the project resource rate", () => {
    const base = withResults(emptyProject("Quotes"));
    const item = base.items.find((i) => i.kind === "item")!;
    const withLine = withResults({
      ...base,
      items: base.items.map((i) =>
        i.boqCode === item.boqCode
          ? {
              ...i,
              lines: [
                {
                  factors: [1, null, null, null, null, null],
                  wastagePct: 0,
                  resourceRate: 10,
                  description: "Cement",
                  projectResourceCode: null,
                  unit: "Bag",
                },
              ],
            }
          : i,
      ),
    });
    const code = withLine.items.find((i) => i.boqCode === item.boqCode)!.lines[0]!.projectResourceCode!;
    const quoted = withResults(
      applySelectedResourceQuotes({
        ...withLine,
        resourceQuotes: [
          {
            id: "rq-1",
            projectResourceCode: code,
            vendorName: "Supplier A",
            rate: 18,
            selected: true,
          },
        ],
      }),
    );
    expect(quoted.resources.find((r) => r.project_code === code)?.project_rate).toBe(18);
    expect(quoted.items.find((i) => i.boqCode === item.boqCode)?.lines[0]?.resourceRate).toBe(18);
  });

  it("selected item quote prices the working line instead of analysis", () => {
    const base = withResults(emptyProject("Item quote"));
    const item = base.items.find((i) => i.kind === "item")!;
    const priced = withResults({
      ...base,
      items: base.items.map((i) =>
        i.boqCode === item.boqCode
          ? {
              ...i,
              lines: [
                {
                  factors: [1, null, null, null, null, null],
                  wastagePct: 0,
                  resourceRate: 10,
                  description: "Build-up",
                  projectResourceCode: null,
                  unit: "Nr",
                },
              ],
            }
          : i,
      ),
      itemQuotes: [
        { id: "iq-1", boqCode: item.boqCode, vendorName: "Subbie", rate: 50, selected: true },
      ],
    });
    const got = priced.items.find((i) => i.boqCode === item.boqCode);
    expect(got?.result?.unitCost).toBe(50);
    const cats = costByCategory(priced);
    expect(cats.find(([name]) => name === SUBCONTRACT_CATEGORY)?.[1]).toBe(50);
    expect(got?.lines.length).toBe(1);
    expect(itemBadges(got!, true)).toContain("quoted");
  });

  it("live link follows the parent; clone stays frozen", () => {
    const project = twoPricedItems(10);
    const linked = withResults(linkWholeAnalysis(project, "1b", "1a"));
    expect(linked.items.find((i) => i.boqCode === "1b")?.result?.unitCost).toBe(10);
    expect(itemBadges(linked.items.find((i) => i.boqCode === "1b")!)).toContain("linked");

    const parentEdited = withResults({
      ...linked,
      items: linked.items.map((i) =>
        i.boqCode === "1a" ? { ...i, lines: i.lines.map((l) => ({ ...l, resourceRate: 20 })) } : i,
      ),
    });
    expect(parentEdited.items.find((i) => i.boqCode === "1b")?.result?.unitCost).toBe(20);

    const cloned = withResults(cloneWholeAnalysis(twoPricedItems(10), "1b", "1a"));
    expect(itemBadges(cloned.items.find((i) => i.boqCode === "1b")!)).toContain("cloned");
    const cloneParentEdited = withResults({
      ...cloned,
      items: cloned.items.map((i) =>
        i.boqCode === "1a" ? { ...i, lines: i.lines.map((l) => ({ ...l, resourceRate: 20 })) } : i,
      ),
    });
    expect(cloneParentEdited.items.find((i) => i.boqCode === "1b")?.result?.unitCost).toBe(10);
  });

  it("cloning a typed unit cost freezes that cost on the child", () => {
    const base = withResults({
      ...twoPricedItems(0, true),
      items: twoPricedItems(0, true).items.map((i) =>
        i.boqCode === "1a" ? { ...i, priceMode: "direct" as const, directCost: 80 } : i,
      ),
    });
    const cloned = withResults(cloneWholeAnalysis(base, "1b", "1a"));
    expect(cloned.items.find((i) => i.boqCode === "1b")?.result?.unitCost).toBe(80);
    const parentEdited = withResults({
      ...cloned,
      items: cloned.items.map((i) =>
        i.boqCode === "1a" ? { ...i, priceMode: "direct" as const, directCost: 200 } : i,
      ),
    });
    expect(parentEdited.items.find((i) => i.boqCode === "1b")?.result?.unitCost).toBe(80);
  });

  it("item quote prices the BOQ while another item linking it uses the backup analysis", () => {
    const quoted = withResults({
      ...twoPricedItems(10),
      itemQuotes: [{ id: "iq-1", boqCode: "1a", vendorName: "Subbie", rate: 50, selected: true }],
    });
    const linked = withResults(linkWholeAnalysis(quoted, "1b", "1a"));
    expect(linked.items.find((i) => i.boqCode === "1a")?.result?.unitCost).toBe(50);
    expect(linked.items.find((i) => i.boqCode === "1a")?.lines[0]?.resourceRate).toBe(10);
    expect(linked.items.find((i) => i.boqCode === "1b")?.result?.unitCost).toBe(10);

    const cleared = withResults({
      ...linked,
      itemQuotes: linked.itemQuotes.map((q) => ({ ...q, selected: false })),
    });
    expect(cleared.items.find((i) => i.boqCode === "1a")?.result?.unitCost).toBe(10);
  });

  it("creates a one-line backup when a quote is selected on an empty analysis", () => {
    const base = twoPricedItems(0, true);
    const quoted = withResults({
      ...base,
      itemQuotes: [{ id: "iq-1", boqCode: "1a", vendorName: "Subbie", rate: 40, selected: true }],
    });
    const a = quoted.items.find((i) => i.boqCode === "1a")!;
    expect(a.lines.length).toBe(1);
    expect(a.lines[0]?.resourceRate).toBe(40);
    expect(a.result?.unitCost).toBe(40);
    const linked = withResults(linkWholeAnalysis(quoted, "1b", "1a"));
    expect(linked.items.find((i) => i.boqCode === "1b")?.result?.unitCost).toBe(40);
  });

  it("replica compare treats origin and includes as analysis conflicts", () => {
    const local = withResults(linkWholeAnalysis(twoPricedItems(10), "1b", "1a"));
    const replica = withResults(cloneWholeAnalysis(twoPricedItems(10), "1b", "1a"));
    const conflicts = diffReplica(local, replica);
    expect(conflicts.some((c) => c.field === "analysis" && (c.boqCode === "1b" || c.boqCode.endsWith("::1b")))).toBe(true);
  });

  it("flags items with no analysis backup", () => {
    const project = withResults(emptyProject("Missing"));
    const item = project.items.find((i) => i.kind === "item")!;
    expect(itemBadges(item)).toContain("missing-analysis");
  });

  it("buy lanes follow job resource categories only", () => {
    const project = withResults(loadReferenceProject());
    const lanes = buyLanes(project);
    expect(lanes.some((l) => l.label === "Subcontract works")).toBe(false);
    expect(lanes.some((l) => l.category === "Material")).toBe(true);
    expect(lanes.some((l) => l.category === "Subcontract")).toBe(true);
    expect(project.categories.some((c) => c.description === "Subcontract")).toBe(true);
    expect(project.enquiries.length).toBeGreaterThan(0);
    expect(project.itemQuotes.filter((q) => q.selected)).toEqual([]);
  });

  it("enquiry CSV round-trips rates, spec, duration, and payment into a quote reply", () => {
    const job = buyJob();
    const laneId = `res:${job.resources[0]!.category}`;
    const withField = upsertFieldDef(job, {
      id: "warranty",
      label: "Warranty",
      valueType: "text",
      scope: "line",
      compare: true,
    });
    const pack = blankEnquiry(withField, laneId, "Vendor 1");
    expect(laneIdForPack(pack)).toBe(laneId);
    const csv = enquiryCsv(withField, pack);
    expect(csv.split("\n")[0]).toContain("spec");
    expect(csv.split("\n")[0]).toContain("duration");
    expect(csv.split("\n")[0]).toContain("warranty");
    const rows = parseQuoteCsv(csv, withField.quoteFieldDefs).map((r) => ({
      ...r,
      rate: 12.5,
      quotedQty: 4,
      remarks: "note",
      validUntil: "2026-12-31",
      paymentTerms: "30 days",
      duration: "6 weeks",
      spec: "OPC 53",
      lineFields: { ...r.lineFields, spec: "OPC 53", warranty: "12 months" },
    }));
    expect(rows[0]?.code).toBe(pack.lines[0]?.targetCode);
    const next = importQuoteRows(withField, rows, {
      id: "qr-1",
      vendorName: "Vendor 1",
      enquiryId: pack.id,
      receivedAt: "2026-08-29",
      validUntil: null,
      paymentTerms: "",
      duration: "",
      currency: job.currency,
      headerFields: {},
    });
    const quote = next.resourceQuotes.find((q) => q.projectResourceCode === rows[0]?.code);
    expect(quote?.rate).toBe(12.5);
    expect(quote?.quotedQty).toBe(4);
    expect(quote?.lineFields?.spec).toBe("OPC 53");
    expect(quote?.lineFields?.warranty).toBe("12 months");
    expect(next.quoteReplies).toHaveLength(1);
    expect(next.quoteReplies[0]?.paymentTerms).toBe("30 days");
    expect(next.quoteReplies[0]?.duration).toBe("6 weeks");
  });

  it("complete, partial, and mixed award write into resource rates", () => {
    const job = buyJob();
    const [a, b] = job.codes;
    const laneId = `res:${job.resources.find((r) => r.project_code === a)!.category}`;
    const quoted = {
      ...job,
      resourceQuotes: [
        { id: "rq-a1", projectResourceCode: a!, vendorName: "Vendor 1", rate: 30, selected: false },
        { id: "rq-a2", projectResourceCode: a!, vendorName: "Vendor 2", rate: 22, selected: false },
        { id: "rq-b1", projectResourceCode: b!, vendorName: "Vendor 1", rate: 40, selected: false },
        { id: "rq-b2", projectResourceCode: b!, vendorName: "Vendor 2", rate: 18, selected: false },
      ],
    };
    const complete = withResults(applyVendorPack(quoted, laneId, "Vendor 1"));
    expect(complete.resources.find((r) => r.project_code === a)?.project_rate).toBe(30);
    expect(complete.resources.find((r) => r.project_code === b)?.project_rate).toBe(40);

    const partial = withResults(applyVendorPack(complete, laneId, "Vendor 2", [b!], true));
    expect(partial.resources.find((r) => r.project_code === a)?.project_rate).toBe(30);
    expect(partial.resources.find((r) => r.project_code === b)?.project_rate).toBe(18);
    expect(partial.resourceQuotes.find((q) => q.projectResourceCode === a && q.selected)?.vendorName).toBe("Vendor 1");
    expect(partial.resourceQuotes.find((q) => q.projectResourceCode === b && q.selected)?.vendorName).toBe("Vendor 2");

    const mixed = withResults(selectQuoteLine(quoted, "resource", a!, "rq-a1", true));
    const mixed2 = withResults(selectQuoteLine(mixed, "resource", b!, "rq-b2", true));
    expect(mixed2.resources.find((r) => r.project_code === a)?.project_rate).toBe(30);
    expect(mixed2.resources.find((r) => r.project_code === b)?.project_rate).toBe(18);

    const lowest = withResults(selectLowestInLane(quoted, laneId, true));
    expect(lowest.resources.find((r) => r.project_code === a)?.project_rate).toBe(22);
    expect(lowest.resources.find((r) => r.project_code === b)?.project_rate).toBe(18);
    expect(coverage(lowest, laneId).selected).toBe(2);
  });

  it("does not overwrite a manual resource rate unless forced", () => {
    const job = buyJob();
    const code = job.codes[0]!;
    const laneId = `res:${job.resources.find((r) => r.project_code === code)!.category}`;
    const locked = {
      ...job,
      resources: job.resources.map((r) =>
        r.project_code === code ? { ...r, project_rate: 9, rate_source: "manual" as const } : r,
      ),
      resourceQuotes: [{ id: "rq-m", projectResourceCode: code, vendorName: "Vendor 1", rate: 50, selected: false }],
    };
    const skipped = applyVendorPack(locked, laneId, "Vendor 1", undefined, false);
    expect(skipped.resources.find((r) => r.project_code === code)?.project_rate).toBe(9);
    const forced = applyVendorPack(locked, laneId, "Vendor 1", undefined, true);
    expect(forced.resources.find((r) => r.project_code === code)?.project_rate).toBe(50);
  });

  it("item quote still prices the BOQ and keeps analysis as backup", () => {
    const base = withResults(twoPricedItems(10));
    const awarded = withResults({
      ...base,
      itemQuotes: [
        { id: "iq-1", boqCode: "1a", vendorName: "Subbie A", rate: 80, selected: false },
        { id: "iq-2", boqCode: "1a", vendorName: "Subbie B", rate: 55, selected: true },
      ],
    });
    expect(awarded.items.find((i) => i.boqCode === "1a")?.result?.unitCost).toBe(55);
    expect(awarded.items.find((i) => i.boqCode === "1a")?.lines[0]?.resourceRate).toBe(10);
  });

  it("replica compare flags enquiry and quote-reply money fields", () => {
    const local = withResults(emptyProject("Local"));
    const pack = blankEnquiry(local, "res:Material", "Vendor 1");
    const replica = {
      ...local,
      enquiries: [pack],
      quoteReplies: [
        {
          id: "qr-x",
          vendorName: "Vendor 1",
          enquiryId: pack.id,
          receivedAt: "2026-08-29",
          validUntil: "2026-12-01",
          paymentTerms: "COD",
          duration: "4 weeks",
          currency: local.currency,
          headerFields: {},
        },
      ],
      itemQuotes: [
        {
          id: "iq-x",
          boqCode: "1a",
          vendorName: "Vendor 1",
          rate: 99,
          selected: false,
          validUntil: "2026-12-01",
          paymentTerms: "COD",
        },
      ],
    };
    const withQuote = {
      ...local,
      itemQuotes: [
        {
          id: "iq-x",
          boqCode: "1a",
          vendorName: "Vendor 1",
          rate: 40,
          selected: false,
          validUntil: "2026-09-01",
          paymentTerms: "30 days",
        },
      ],
    };
    const conflicts = diffReplica(withQuote, replica);
    expect(conflicts.some((c) => c.field === "enquiry")).toBe(true);
    expect(conflicts.some((c) => c.field === "quoteReply")).toBe(true);
    expect(conflicts.some((c) => c.field === "itemQuote")).toBe(true);
  });

  it("tracks enquiry status from draft through sent, quoted, and overdue", () => {
    const job = buyJob();
    const laneId = `res:${job.resources[0]!.category}`;
    const draft = blankEnquiry(job, laneId, "Vendor 1");
    expect(trackEnquiry(job, draft)).toBe("draft");
    const issued = issueEnquiry({ ...job, enquiries: [{ ...draft, dueAt: "2099-01-01" }] }, draft.id);
    const sentPack = issued.enquiries[0]!;
    expect(trackEnquiry(issued, sentPack, Date.parse("2026-09-01"))).toBe("sent");
    const overduePack = { ...sentPack, dueAt: "2020-01-01" };
    expect(trackEnquiry({ ...issued, enquiries: [overduePack] }, overduePack, Date.parse("2026-09-01"))).toBe("overdue");
    const quoted = {
      ...issued,
      quoteReplies: [
        {
          id: "qr-track",
          vendorName: "Vendor 1",
          enquiryId: draft.id,
          receivedAt: "2026-09-01",
          validUntil: null,
          paymentTerms: "30 days",
          duration: "6 weeks",
          currency: job.currency,
          headerFields: {},
        },
      ],
    };
    expect(trackEnquiry(quoted, sentPack)).toBe("quoted");
  });

  it("lets the user choose which quote factors appear on compare", () => {
    const job = buyJob();
    const factors = compareFactors(job).map((f) => f.id);
    expect(factors).toContain("rate");
    expect(factors).toContain("spec");
    expect(factors).toContain("duration");
    expect(factors).toContain("payment");
    const custom = upsertFieldDef(job, {
      id: "warranty",
      label: "Warranty",
      valueType: "text",
      scope: "line",
      compare: true,
    });
    expect(compareFactors(custom).some((f) => f.id === "warranty")).toBe(true);
    const hidden = upsertFieldDef(custom, {
      id: "warranty",
      label: "Warranty",
      valueType: "text",
      scope: "line",
      compare: false,
    });
    expect(compareFactors(hidden).some((f) => f.id === "warranty")).toBe(false);
    expect(compareFactors(hidden).some((f) => f.id === "rate")).toBe(true);
  });
});

function buyJob() {
  const base = withResults(emptyProject("Buy job"));
  const item = base.items.find((i) => i.kind === "item")!;
  const next = withResults({
    ...base,
    items: base.items.map((i) =>
      i.boqCode === item.boqCode
        ? {
            ...i,
            lines: [
              {
                factors: [1, null, null, null, null, null],
                wastagePct: 0,
                resourceRate: 10,
                description: "Cement",
                projectResourceCode: null,
                unit: "Bag",
              },
              {
                factors: [1, null, null, null, null, null],
                wastagePct: 0,
                resourceRate: 20,
                description: "Sand",
                projectResourceCode: null,
                unit: "M3",
              },
            ],
          }
        : i,
    ),
  });
  const codes = next.items
    .find((i) => i.boqCode === item.boqCode)!
    .lines.map((l) => l.projectResourceCode!)
    .filter(Boolean);
  return {
    ...next,
    codes,
    resources: next.resources.map((r) => ({ ...r, rate_source: "quote" as const })),
  };
}

function twoPricedItems(rate: number, emptyParent = false) {
  const base = emptyProject("Link clone");
  const template = base.items.find((i) => i.kind === "item")!;
  const line =
    emptyParent || rate === 0
      ? []
      : [
          {
            factors: [1, null, null, null, null, null],
            wastagePct: 0,
            resourceRate: rate,
            description: "Build-up",
            projectResourceCode: null,
            unit: "Nr",
          },
        ];
  return {
    ...base,
    items: [
      ...base.items.map((i) => (i.boqCode === "1a" ? { ...i, lines: line } : i)),
      stampItem({
        ...template,
        id: "i-1b",
        boqCode: "1b",
        slNo: "b",
        description: "Child item",
        clientLinkCode: "1b",
        clientQty: 1,
        ourQty: 1,
        lines: [],
      }),
    ],
    qtoLines: [
      ...base.qtoLines,
      {
        id: "qto-1b",
        workCategory: null,
        drawing: null,
        locationDesc: null,
        itemLabel: "Child item",
        subItem: null,
        formulaKey: "qty" as const,
        dims: { l: 1 },
        workingBoqCode: "1b",
      },
    ],
  };
}
