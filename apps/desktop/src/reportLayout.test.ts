import { describe, expect, it } from "vitest";
import { moneyClose } from "@aerolith/shared";
import { GOLDEN_TOTAL } from "./model";
import { projectGrand } from "./bills";
import { withResults } from "./projectCompute";
import { loadCampusSampleProject, loadReferenceProject } from "./loadReference";
import {
  amountOf,
  applyReportLayout,
  blockOn,
  buildDocument,
  columnLabel,
  documentLines,
  fitSubmissionPaper,
  formatForBuiltinTemplate,
  formatForClientBoq,
  formatForSubmissionLayout,
  mergeReportFormat,
  nextBoqCategorySl,
  paginateDocument,
  submissionLayoutOf,
  TENDER_ADJ_SECTION_KEY,
  APP_DEFAULT_REPORT_FORMAT,
} from "./reportFormat";
import { conceptualCell, layoutPreviewModel } from "./reportLayoutPreview";
import { submissionItemLines } from "./submissionCompare";
import { submissionExceptions } from "./views/SubmissionSheet";

describe("user-defined report layouts", () => {
  it("keeps the Aerolith default as paged category summaries", () => {
    const fmt = mergeReportFormat(undefined);
    expect(fmt.layoutMode).toBe("paged");
    expect(fmt.pageBreak).toBe(true);
    expect(blockOn(fmt, "category-summary")).toBe(true);
    expect(blockOn(fmt, "grand-total")).toBe(true);
    expect(blockOn(fmt, "items")).toBe(true);
    expect(fmt.moneyStyle).toBe("inherit");
  });

  it("continuous BOQ template is one scrolling bill with category totals", () => {
    const fmt = formatForBuiltinTemplate("continuous-boq");
    expect(fmt.layoutMode).toBe("continuous");
    expect(fmt.pageBreak).toBe(false);
    expect(blockOn(fmt, "category-total")).toBe(true);
    expect(blockOn(fmt, "page-total")).toBe(false);
    expect(blockOn(fmt, "category-summary")).toBe(false);
    const project = withResults(loadReferenceProject());
    const pages = paginateDocument(project, fmt, projectGrand(project.items));
    const items = pages.filter((p) => p.kind === "items");
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((p) => p.rows.some((r) => r.kind === "total"))).toBe(true);
    expect(pages.filter((p) => p.kind === "category-summary")).toHaveLength(0);
  });

  it("legacy pageBreak false becomes continuous", () => {
    expect(mergeReportFormat({ pageBreak: false }).layoutMode).toBe("continuous");
  });

  it("category totals do not double-count the GREEN total", () => {
    const project = withResults(loadReferenceProject());
    const fmt = formatForBuiltinTemplate("continuous-boq");
    const built = documentLines(buildDocument(project), fmt);
    expect(built.some((l) => l.kind === "total")).toBe(true);
    expect(moneyClose(amountOf(built), GOLDEN_TOTAL)).toBe(true);
  });

  it("switching to continuous layout updates blocks", () => {
    const next = applyReportLayout(APP_DEFAULT_REPORT_FORMAT, "continuous");
    expect(next.layoutMode).toBe("continuous");
    expect(next.pageBreak).toBe(false);
    expect(blockOn(next, "category-total")).toBe(true);
    expect(blockOn(next, "page-total")).toBe(false);
  });

  it("priced submission sheet matches GREEN without changing packet money", () => {
    const project = withResults(loadReferenceProject());
    const fmt = mergeReportFormat(undefined);
    const scope = { billIds: "all" as const, categoryKeys: "all" as const, content: "items" as const };
    const flags = submissionExceptions(project, scope, fmt);
    expect(flags.rateOnly).toBe(0);
    expect(flags.amountOnly).toBe(0);
    expect(moneyClose(amountOf(documentLines(buildDocument(project, scope), fmt)), GOLDEN_TOTAL)).toBe(true);
    expect(moneyClose(projectGrand(project.items), GOLDEN_TOTAL)).toBe(true);
  });

  it("four packet layouts paginate as one bill stream, not per-BOQ summary sheets", () => {
    const project = withResults(loadCampusSampleProject());
    const grand = projectGrand(project.items);
    const scope = { billIds: "all" as const, categoryKeys: "all" as const, content: "both" as const };
    const grandFmt = formatForSubmissionLayout("grand");
    const grandPages = paginateDocument(project, grandFmt, grand, scope, {
      itemLines: submissionItemLines(project, grandFmt, scope),
    });
    expect(submissionLayoutOf(grandFmt)).toBe("grand");
    expect(grandPages.every((p) => p.kind === "items")).toBe(true);
    expect(grandPages.some((p) => p.kind === "bill-summary")).toBe(false);

    const pageFmt = formatForSubmissionLayout("page-totals");
    const pagePages = paginateDocument(project, pageFmt, grand, scope, {
      itemLines: submissionItemLines(project, pageFmt, scope),
    });
    expect(pagePages.filter((p) => p.kind === "page-summary")).toHaveLength(1);
    expect(pagePages.some((p) => p.kind === "grand-summary" || p.kind === "bill-summary")).toBe(false);
    expect(moneyClose(pagePages.find((p) => p.kind === "page-summary")!.pageAmount, grand)).toBe(true);

    const catFmt = formatForSubmissionLayout("category-totals");
    const catPages = paginateDocument(project, catFmt, grand, scope, {
      itemLines: submissionItemLines(project, catFmt, scope),
    });
    expect(catPages.filter((p) => p.kind === "category-summary")).toHaveLength(1);
    expect(catPages.some((p) => p.kind === "bill-summary")).toBe(false);
    expect(moneyClose(catPages.find((p) => p.kind === "category-summary")!.pageAmount, grand)).toBe(true);

    const catPageFmt = formatForSubmissionLayout("category-pages");
    const catPagePages = paginateDocument(project, catPageFmt, grand, scope, {
      itemLines: submissionItemLines(project, catPageFmt, scope),
    });
    expect(catPagePages.filter((p) => p.kind === "category-summary").length).toBeGreaterThan(1);
    expect(catPagePages[catPagePages.length - 1]?.kind).toBe("grand-summary");
    expect(moneyClose(catPagePages[catPagePages.length - 1]!.pageAmount, grand)).toBe(true);
  });

  it("All BOQs auto-fits A3 landscape once three qty columns are in play", () => {
    expect(fitSubmissionPaper(1)).toEqual({ paper: "a4", orientation: "portrait" });
    expect(fitSubmissionPaper(2)).toEqual({ paper: "a4", orientation: "landscape" });
    expect(fitSubmissionPaper(3)).toEqual({ paper: "a3", orientation: "landscape" });
    expect(columnLabel("rate", APP_DEFAULT_REPORT_FORMAT, undefined, "QAR")).toBe("Rate (in QAR)");
    expect(columnLabel("amount", APP_DEFAULT_REPORT_FORMAT, undefined, "QAR")).toBe("Amount (in QAR)");
  });

  it("Client BOQ stays A4 portrait when Submission is A3 landscape", () => {
    const fmt = formatForClientBoq({ paper: "a3", orientation: "landscape" });
    expect(fmt.paper).toBe("a4");
    expect(fmt.orientation).toBe("portrait");
  });
});

describe("settings report layout preview", () => {
  it("uses placeholders instead of job figures and follows letterhead toggles", () => {
    const fmt = mergeReportFormat({
      companyName: "Acme Estimating",
      showLogo: true,
      showDate: true,
      showRevision: false,
      extraHeader: "Tender cover",
      footer: "Confidential",
    });
    const model = layoutPreviewModel(fmt, "QAR");
    expect(model.company).toBe("Acme Estimating");
    expect(model.job).toBe("Job name");
    expect(model.logo).toBe(true);
    expect(model.date).toBe(true);
    expect(model.revision).toBe(false);
    expect(model.cover).toBe("Tender cover");
    expect(model.footer).toBe("Confidential");
    expect(model.columns.some((c) => c.label.startsWith("Rate"))).toBe(true);
    expect(conceptualCell("description", "item", "Item description")).toBe("Item description");
    expect(conceptualCell("amount", "item", "Item description")).toBe("Amount");
  });

  it("hides logo and page numbers when those options are off", () => {
    const fmt = mergeReportFormat({ showLogo: false, showPageNumbers: false, layoutMode: "paged" });
    const model = layoutPreviewModel(fmt, "QAR");
    expect(model.logo).toBe(false);
    expect(model.pageNumbers).toBe(false);
    expect(model.company).toBe("Company name");
    expect(model.address).toBe("Address / letterhead");
  });

  it("adds an Our qty column and drops Rate when those bill options change", () => {
    const fmt = mergeReportFormat({ qtyColumn: "both", showRate: false });
    const model = layoutPreviewModel(fmt, "AED");
    expect(model.columns.map((c) => c.id)).toEqual(["sl", "description", "qty", "ourQty", "unit", "amount"]);
    expect(model.columns.find((c) => c.id === "amount")?.label).toBe("Amount (in AED)");
  });

  it("numbers tender adjustments as the next BOQ category, not a fixed 7", () => {
    expect(nextBoqCategorySl(["1", "2", "6"])).toBe("7");
    expect(nextBoqCategorySl(["1", "2", "3", "4", "5", "6", "7", "8", "9"])).toBe("10");
    expect(nextBoqCategorySl(["A", "B", "C"])).toBe("D");
    expect(nextBoqCategorySl([])).toBe("1");

    const campus = withResults(loadCampusSampleProject());
    const fmt = mergeReportFormat(undefined);
    const lines = documentLines(buildDocument(campus), fmt);
    const adj = lines.find((l) => l.key === TENDER_ADJ_SECTION_KEY);
    expect(adj?.kind).toBe("section");
    expect(adj?.description).toBe("Tender Adjustments");
    expect(adj?.sl).not.toBe("7");
    const joinery = lines.find((l) => l.kind === "section" && /joinery/i.test(l.description));
    expect(joinery?.sl).toBe("7");
    expect(Number(adj?.sl)).toBeGreaterThan(Number(joinery?.sl));
  });
});
