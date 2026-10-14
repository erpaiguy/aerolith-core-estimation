import { currencyMarker, formatMoney, formatMoneyPlain, formatQty, formatRate } from "@aerolith/shared";
import { normalizeBoqCarry } from "@aerolith/calc";
import type { LoadedProject, WorkingItem } from "./model";
import { extraClientColumns } from "./boqColumns";
import { billById, billTotal, findItemByKey, projectGrand, sortedBills, usesWorkingAsSource } from "./bills";

export type ReportPaper = "a4" | "a3" | "letter";
export type SubmissionLayoutId = "grand" | "page-totals" | "category-totals" | "category-pages";
export type ReportQtyCol = "issued" | "our" | "both";
export type ReportSummaryMode = "page" | "category";
export type ReportPageKind = "items" | "page-summary" | "category-summary" | "bill-summary" | "grand-summary";
export type ReportContent = "items" | "summaries" | "both";

export interface ReportScope {
  billIds: string[] | "all";
  categoryKeys: string[] | "all";
  content: ReportContent;
}

export function defaultReportScope(): ReportScope {
  return { billIds: "all", categoryKeys: "all", content: "both" };
}

export function categoryKey(billId: string, sl: string, label: string): string {
  return `${billId}::${sl}::${label}`;
}

export function scopedBillIds(project: LoadedProject, scope?: ReportScope | null): string[] {
  const bills = sortedBills(project);
  if (!scope || scope.billIds === "all") return bills.map((b) => b.id);
  return scope.billIds.filter((id) => bills.some((b) => b.id === id));
}

export function listReportCategories(
  project: LoadedProject,
  billIds: string[],
): Array<{ key: string; billId: string; label: string }> {
  const wanted = new Set(billIds);
  const out: Array<{ key: string; billId: string; label: string }> = [];
  let billId = billIds[0] ?? "";
  for (const n of project.clientNodes) {
    if (n.billId && wanted.size && !wanted.has(n.billId)) continue;
    if (n.kind === "section") {
      billId = n.billId || billId;
      const label = String(n.description ?? "").replace(/\s*\(\s*contd\.?\s*\)\s*$/i, "").trim() || "Bill";
      const key = categoryKey(billId, n.sl_no ?? "", label);
      if (!out.some((c) => c.key === key)) out.push({ key, billId, label: [n.sl_no, label].filter(Boolean).join(" ") });
    }
  }
  return out;
}

export function isFullJobScope(project: LoadedProject, scope?: ReportScope | null): boolean {
  if (!scope || scope.billIds === "all") return !scope || scope.categoryKeys === "all";
  if (scope.categoryKeys !== "all") return false;
  const all = sortedBills(project).map((b) => b.id);
  return all.length === scope.billIds.length && all.every((id) => (scope.billIds as string[]).includes(id));
}

export const REPORT_COL_IDS = ["sl", "description", "qty", "ourQty", "unit", "rate", "amount"] as const;
export type ReportColId = (typeof REPORT_COL_IDS)[number];
export type ReportColWidths = Record<ReportColId, number>;

export const DEFAULT_COL_WIDTHS: ReportColWidths = {
  sl: 8,
  description: 30,
  qty: 10,
  ourQty: 10,
  unit: 8,
  rate: 20,
  amount: 24,
};

export const UNIT_SUMMARY_COL_IDS = ["description", "amount"] as const;
export type UnitSummaryColId = (typeof UNIT_SUMMARY_COL_IDS)[number];
export type UnitSummaryColWidths = Record<UnitSummaryColId, number>;

export const GRAND_SUMMARY_COL_IDS = ["sl", "description", "amount"] as const;
export type GrandSummaryColId = (typeof GRAND_SUMMARY_COL_IDS)[number];
export type GrandSummaryColWidths = Record<GrandSummaryColId, number>;

export const DEFAULT_PAGE_SUMMARY_COL_WIDTHS: UnitSummaryColWidths = { description: 72, amount: 28 };
export const DEFAULT_CATEGORY_SUMMARY_COL_WIDTHS: UnitSummaryColWidths = { description: 72, amount: 28 };
export const DEFAULT_GRAND_SUMMARY_COL_WIDTHS: GrandSummaryColWidths = { sl: 12, description: 52, amount: 36 };

export type ReportLayoutMode = "paged" | "continuous";
export type ReportMoneyStyle = "inherit" | "code" | "symbol" | "plain";
export type ReportTotalStyle = "row" | "boxed" | "rule";
export type ReportLineDensity = "compact" | "normal" | "loose";
export type ReportBlockType =
  | "letterhead"
  | "cover"
  | "kpis"
  | "items"
  | "category-total"
  | "page-total"
  | "category-summary"
  | "page-summary"
  | "bill-summary"
  | "grand-total"
  | "footer";

export interface ReportBlock {
  type: ReportBlockType;
  enabled: boolean;
}

export interface StoredReportTemplate {
  id: string;
  name: string;
  format: Record<string, unknown>;
}

export const REPORT_BLOCK_TYPES: ReportBlockType[] = [
  "letterhead",
  "cover",
  "kpis",
  "items",
  "category-total",
  "page-total",
  "category-summary",
  "page-summary",
  "bill-summary",
  "grand-total",
  "footer",
];

export const REPORT_BLOCK_META: Record<ReportBlockType, { label: string; hint: string }> = {
  letterhead: { label: "Letterhead", hint: "Logo, company, job name" },
  cover: { label: "Cover note", hint: "Date, revision, extra header" },
  kpis: { label: "Totals strip", hint: "Grand total and adjustment KPIs" },
  items: { label: "Bill items", hint: "The priced BOQ table" },
  "category-total": { label: "Category totals", hint: "Inline total after each category" },
  "page-total": { label: "Page totals", hint: "Total row at the foot of each sheet" },
  "category-summary": { label: "Category summaries", hint: "Summary sheet per category" },
  "page-summary": { label: "Page summaries", hint: "Summary sheet of page totals" },
  "bill-summary": { label: "Bill summaries", hint: "One summary per BOQ when several are in scope" },
  "grand-total": { label: "Grand total", hint: "Job or packet grand summary" },
  footer: { label: "Footer", hint: "Footer text and page numbers" },
};

export function defaultReportBlocks(layout: ReportLayoutMode = "paged"): ReportBlock[] {
  const on = new Set<ReportBlockType>(
    layout === "continuous"
      ? ["letterhead", "cover", "kpis", "items", "category-total", "bill-summary", "grand-total", "footer"]
      : ["letterhead", "cover", "kpis", "items", "page-total", "category-summary", "bill-summary", "grand-total", "footer"],
  );
  return REPORT_BLOCK_TYPES.map((type) => ({ type, enabled: on.has(type) }));
}

export function mergeReportBlocks(
  partial?: ReportBlock[] | null,
  layout: ReportLayoutMode = "paged",
): ReportBlock[] {
  const fallback = defaultReportBlocks(layout);
  if (!partial?.length) return fallback;
  const seen = new Set<ReportBlockType>();
  const out: ReportBlock[] = [];
  for (const raw of partial) {
    if (!raw || !REPORT_BLOCK_TYPES.includes(raw.type) || seen.has(raw.type)) continue;
    seen.add(raw.type);
    out.push({ type: raw.type, enabled: Boolean(raw.enabled) });
  }
  for (const b of fallback) {
    if (!seen.has(b.type)) out.push(b);
  }
  return out;
}

export function blockOn(format: ReportFormat, type: ReportBlockType): boolean {
  return format.blocks.some((b) => b.type === type && b.enabled);
}

export function enabledReportBlocks(format: ReportFormat): ReportBlock[] {
  return format.blocks.filter((b) => b.enabled);
}

export interface ReportFormat {
  paper: ReportPaper;
  orientation: "portrait" | "landscape";
  showLogo: boolean;
  companyName: string;
  companyAddress: string;
  extraHeader: string;
  footer: string;
  showDate: boolean;
  showRevision: boolean;
  showKpis: boolean;
  showSection7: boolean;
  showSl: boolean;
  showDescription: boolean;
  showQty: boolean;
  showUnit: boolean;
  showRate: boolean;
  showAmount: boolean;
  qtyColumn: ReportQtyCol;
  fontSize: "sm" | "md" | "lg";
  pageBreak: boolean;
  linesPerPage: number;
  summaryMode: ReportSummaryMode;
  showPageNumbers: boolean;
  showBreakSummaries: boolean;
  showGrandSummary: boolean;
  colWidths: ReportColWidths;
  pageSummaryColWidths: UnitSummaryColWidths;
  categorySummaryColWidths: UnitSummaryColWidths;
  grandSummaryColWidths: GrandSummaryColWidths;
  layoutMode: ReportLayoutMode;
  blocks: ReportBlock[];
  columnOrder: string[];
  moneyStyle: ReportMoneyStyle;
  totalStyle: ReportTotalStyle;
  lineDensity: ReportLineDensity;
}

export const APP_DEFAULT_REPORT_FORMAT: ReportFormat = {
  paper: "a4",
  orientation: "portrait",
  showLogo: true,
  companyName: "",
  companyAddress: "",
  extraHeader: "",
  footer: "",
  showDate: false,
  showRevision: true,
  showKpis: true,
  showSection7: true,
  showSl: true,
  showDescription: true,
  showQty: true,
  showUnit: true,
  showRate: true,
  showAmount: true,
  qtyColumn: "issued",
  fontSize: "md",
  pageBreak: true,
  linesPerPage: 22,
  summaryMode: "category",
  showPageNumbers: true,
  showBreakSummaries: true,
  showGrandSummary: true,
  colWidths: { ...DEFAULT_COL_WIDTHS },
  pageSummaryColWidths: { ...DEFAULT_PAGE_SUMMARY_COL_WIDTHS },
  categorySummaryColWidths: { ...DEFAULT_CATEGORY_SUMMARY_COL_WIDTHS },
  grandSummaryColWidths: { ...DEFAULT_GRAND_SUMMARY_COL_WIDTHS },
  layoutMode: "paged",
  blocks: defaultReportBlocks("paged"),
  columnOrder: ["sl", "description", "qty", "ourQty", "unit", "rate", "amount"],
  moneyStyle: "inherit",
  totalStyle: "row",
  lineDensity: "normal",
};

export function clampLinesPerPage(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : APP_DEFAULT_REPORT_FORMAT.linesPerPage;
  return Math.min(80, Math.max(8, v));
}

export function clampColWidth(n: unknown, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(90, Math.max(4, Math.round(v)));
}

export function mergeWidthMap<T extends Record<string, number>>(
  defaults: T,
  partial?: Partial<T> | Record<string, unknown> | null,
): T {
  const next = { ...defaults };
  if (!partial) return next;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const raw = (partial as Partial<T>)[key];
    if (raw != null) next[key] = clampColWidth(raw, defaults[key]) as T[keyof T];
  }
  return next;
}

export function mergeColWidths(partial?: Partial<ReportColWidths> | Record<string, unknown> | null): ReportColWidths {
  return mergeWidthMap(DEFAULT_COL_WIDTHS, partial);
}

export function colWidthPct(col: string, format: ReportFormat): number {
  return format.colWidths[col as ReportColId] ?? 12;
}

export function summaryColWidthPct(table: "page" | "category" | "grand", col: string, format: ReportFormat): number {
  if (table === "grand") return format.grandSummaryColWidths[col as GrandSummaryColId] ?? 20;
  const w = table === "page" ? format.pageSummaryColWidths : format.categorySummaryColWidths;
  return w[col as UnitSummaryColId] ?? 50;
}

export function cloneDefaultReportFormat(): ReportFormat {
  return mergeReportFormat(undefined);
}

function asLayoutMode(v: unknown, pageBreak?: unknown): ReportLayoutMode {
  if (v === "continuous" || v === "paged") return v;
  if (pageBreak === false) return "continuous";
  return "paged";
}

function asMoneyStyle(v: unknown): ReportMoneyStyle {
  return v === "code" || v === "symbol" || v === "plain" || v === "inherit" ? v : "inherit";
}

function asTotalStyle(v: unknown): ReportTotalStyle {
  return v === "boxed" || v === "rule" || v === "row" ? v : "row";
}

function asLineDensity(v: unknown): ReportLineDensity {
  return v === "compact" || v === "loose" || v === "normal" ? v : "normal";
}

export function mergeReportFormat(partial?: Partial<ReportFormat> | Record<string, unknown> | null): ReportFormat {
  if (!partial) {
    return {
      ...APP_DEFAULT_REPORT_FORMAT,
      colWidths: { ...DEFAULT_COL_WIDTHS },
      pageSummaryColWidths: { ...DEFAULT_PAGE_SUMMARY_COL_WIDTHS },
      categorySummaryColWidths: { ...DEFAULT_CATEGORY_SUMMARY_COL_WIDTHS },
      grandSummaryColWidths: { ...DEFAULT_GRAND_SUMMARY_COL_WIDTHS },
      blocks: defaultReportBlocks("paged"),
      columnOrder: [...APP_DEFAULT_REPORT_FORMAT.columnOrder],
    };
  }
  const src = partial as Partial<ReportFormat>;
  const layoutMode = asLayoutMode(src.layoutMode, src.pageBreak);
  const next = { ...APP_DEFAULT_REPORT_FORMAT, ...src, layoutMode };
  next.linesPerPage = clampLinesPerPage(next.linesPerPage);
  next.colWidths = mergeWidthMap(DEFAULT_COL_WIDTHS, src.colWidths);
  next.pageSummaryColWidths = mergeWidthMap(DEFAULT_PAGE_SUMMARY_COL_WIDTHS, src.pageSummaryColWidths);
  next.categorySummaryColWidths = mergeWidthMap(DEFAULT_CATEGORY_SUMMARY_COL_WIDTHS, src.categorySummaryColWidths);
  next.grandSummaryColWidths = mergeWidthMap(DEFAULT_GRAND_SUMMARY_COL_WIDTHS, src.grandSummaryColWidths);
  if (next.summaryMode !== "page" && next.summaryMode !== "category") {
    next.summaryMode = APP_DEFAULT_REPORT_FORMAT.summaryMode;
  }
  next.moneyStyle = asMoneyStyle(src.moneyStyle ?? next.moneyStyle);
  next.totalStyle = asTotalStyle(src.totalStyle ?? next.totalStyle);
  next.lineDensity = asLineDensity(src.lineDensity ?? next.lineDensity);
  next.paper = src.paper === "a3" || src.paper === "letter" || src.paper === "a4" ? src.paper : next.paper === "a3" || next.paper === "letter" ? next.paper : "a4";
  next.columnOrder = Array.isArray(src.columnOrder)
    ? src.columnOrder.filter((c): c is string => typeof c === "string" && c.length > 0)
    : [...APP_DEFAULT_REPORT_FORMAT.columnOrder];
  next.blocks = src.blocks?.length ? mergeReportBlocks(src.blocks, layoutMode) : blocksFromFlags(src, layoutMode);
  if (layoutMode === "continuous") next.pageBreak = false;
  const derived = flagsFromBlocks(next.blocks, layoutMode);
  if (src.showKpis == null) next.showKpis = derived.showKpis;
  if (src.showBreakSummaries == null) next.showBreakSummaries = derived.showBreakSummaries;
  if (src.showGrandSummary == null) next.showGrandSummary = derived.showGrandSummary;
  if (src.showPageNumbers == null) next.showPageNumbers = derived.showPageNumbers;
  if (src.summaryMode == null && derived.summaryMode) next.summaryMode = derived.summaryMode;
  if (src.pageBreak == null && layoutMode !== "continuous") next.pageBreak = derived.pageBreak;
  return next;
}

function blocksFromFlags(src: Partial<ReportFormat>, layout: ReportLayoutMode): ReportBlock[] {
  const base = defaultReportBlocks(layout);
  const touched =
    src.showKpis != null ||
    src.showBreakSummaries != null ||
    src.showGrandSummary != null ||
    src.summaryMode != null ||
    src.pageBreak != null;
  if (!touched) return base;
  const summary = src.summaryMode === "page" || src.summaryMode === "category" ? src.summaryMode : "category";
  const breaks = src.showBreakSummaries ?? true;
  return base.map((b) => {
    if (b.type === "kpis" && src.showKpis != null) return { ...b, enabled: src.showKpis };
    if (b.type === "category-summary") return { ...b, enabled: breaks && summary === "category" };
    if (b.type === "page-summary") return { ...b, enabled: breaks && summary === "page" };
    if (b.type === "grand-total" && src.showGrandSummary != null) return { ...b, enabled: src.showGrandSummary };
    if (b.type === "page-total" && src.pageBreak != null) return { ...b, enabled: layout === "paged" };
    return b;
  });
}

function flagsFromBlocks(blocks: ReportBlock[], layout: ReportLayoutMode) {
  const on = (type: ReportBlockType) => blocks.some((b) => b.type === type && b.enabled);
  const cat = on("category-summary");
  const page = on("page-summary");
  return {
    showKpis: on("kpis"),
    showBreakSummaries: cat || page,
    showGrandSummary: on("grand-total"),
    showPageNumbers: layout === "paged" && on("footer"),
    summaryMode: (cat && !page ? "category" : page && !cat ? "page" : null) as ReportSummaryMode | null,
    pageBreak: layout === "paged",
  };
}

export function applyReportBlocks(format: ReportFormat, blocks: ReportBlock[]): ReportFormat {
  const layout = format.layoutMode;
  const derived = flagsFromBlocks(blocks, layout);
  return mergeReportFormat({
    ...format,
    blocks,
    layoutMode: layout,
    showKpis: derived.showKpis,
    showBreakSummaries: derived.showBreakSummaries,
    showGrandSummary: derived.showGrandSummary,
    showPageNumbers: derived.showPageNumbers,
    summaryMode: derived.summaryMode ?? format.summaryMode,
    pageBreak: layout === "continuous" ? false : derived.pageBreak,
  });
}

export function applyReportLayout(format: ReportFormat, layout: ReportLayoutMode): ReportFormat {
  const blocks = format.blocks.map((b) => {
    if (layout === "continuous" && (b.type === "page-total" || b.type === "page-summary")) return { ...b, enabled: false };
    if (layout === "continuous" && b.type === "category-total") return { ...b, enabled: true };
    if (layout === "paged" && b.type === "page-total") return { ...b, enabled: true };
    return b;
  });
  return applyReportBlocks({ ...format, layoutMode: layout, pageBreak: layout !== "continuous" }, blocks);
}

export function formatReportMoney(amount: number, currency: string, format: ReportFormat): string {
  if (format.moneyStyle === "plain") return formatMoneyPlain(amount);
  if (format.moneyStyle === "symbol") return `${currencyMarker(currency)} ${formatMoneyPlain(amount)}`;
  return formatMoney(amount, currency);
}

export function formatReportRate(rate: number, currency: string, format: ReportFormat): string {
  if (format.moneyStyle === "plain") return formatMoneyPlain(rate);
  if (format.moneyStyle === "symbol") return `${currencyMarker(currency)} ${formatMoneyPlain(rate)}`;
  return formatRate(rate, currency);
}

/** Cell rate/amount: numbers only. Currency belongs on the column header or grand total. */
export function formatReportFigure(amount: number): string {
  return formatMoneyPlain(amount);
}

export function moneyUnitLabel(currency: string, format: ReportFormat): string {
  if (format.moneyStyle === "symbol") return currencyMarker(currency);
  const code = currency.trim().toUpperCase();
  return code || currencyMarker(currency);
}

export const SUBMISSION_LAYOUTS: Array<{ id: SubmissionLayoutId; name: string; hint: string }> = [
  { id: "grand", name: "Items + grand total", hint: "Continuous items, grand total at the bottom" },
  { id: "page-totals", name: "Page totals", hint: "Page totals on each sheet, then a page summary" },
  { id: "category-totals", name: "Category totals", hint: "Category totals in the bill, then a category summary" },
  { id: "category-pages", name: "Category pages", hint: "Page totals per category, category summaries, grand summary" },
];

function blocksOn(types: ReportBlockType[]): ReportBlock[] {
  const on = new Set(types);
  return REPORT_BLOCK_TYPES.map((type) => ({ type, enabled: on.has(type) }));
}

export function formatForSubmissionLayout(id: SubmissionLayoutId, base?: Partial<ReportFormat> | null): ReportFormat {
  const keep = mergeReportFormat(base);
  if (id === "grand") {
    return mergeReportFormat({
      ...keep,
      layoutMode: "continuous",
      pageBreak: false,
      showPageNumbers: false,
      summaryMode: "category",
      blocks: blocksOn(["letterhead", "cover", "items", "grand-total", "footer"]),
    });
  }
  if (id === "page-totals") {
    return mergeReportFormat({
      ...keep,
      layoutMode: "paged",
      pageBreak: true,
      summaryMode: "page",
      blocks: blocksOn(["letterhead", "cover", "items", "page-total", "page-summary", "grand-total", "footer"]),
    });
  }
  if (id === "category-totals") {
    return mergeReportFormat({
      ...keep,
      layoutMode: "continuous",
      pageBreak: false,
      summaryMode: "category",
      blocks: blocksOn(["letterhead", "cover", "items", "category-total", "category-summary", "grand-total", "footer"]),
    });
  }
  return mergeReportFormat({
    ...keep,
    layoutMode: "paged",
    pageBreak: true,
    summaryMode: "category",
    blocks: blocksOn(["letterhead", "cover", "items", "page-total", "category-summary", "grand-total", "footer"]),
  });
}

export function submissionLayoutOf(format: ReportFormat): SubmissionLayoutId {
  const catTot = blockOn(format, "category-total");
  const pageTot = blockOn(format, "page-total");
  const catSum = blockOn(format, "category-summary");
  const pageSum = blockOn(format, "page-summary");
  if (pageTot && catSum) return "category-pages";
  if (catTot && catSum) return "category-totals";
  if (pageTot && pageSum) return "page-totals";
  return "grand";
}

/** All-BOQs wide tables need landscape; three or more qty columns step up to A3. Submission only. */
export function fitSubmissionPaper(billCount: number): { paper: ReportPaper; orientation: "portrait" | "landscape" } {
  if (billCount <= 1) return { paper: "a4", orientation: "portrait" };
  if (billCount >= 3) return { paper: "a3", orientation: "landscape" };
  return { paper: "a4", orientation: "landscape" };
}

/** Client BOQ sheets are always A4 portrait. Paper and orientation stay on Submission. */
export function formatForClientBoq(format?: Partial<ReportFormat> | null): ReportFormat {
  return mergeReportFormat({
    ...(format ?? {}),
    paper: "a4",
    orientation: "portrait",
  });
}

export const BUILTIN_REPORT_TEMPLATES: Array<{ id: string; name: string; hint: string }> = [
  { id: "aerolith-default", name: "Aerolith default", hint: "Paged A4 sheets, category summaries, grand total" },
  { id: "continuous-boq", name: "Continuous BOQ", hint: "One scrolling bill with category totals" },
  { id: "page-totals", name: "Page totals", hint: "Paged sheets with page summaries" },
  { id: "summaries-pack", name: "Summaries pack", hint: "Category and grand summaries, compact type" },
];

export function formatForBuiltinTemplate(id: string): ReportFormat {
  if (id === "continuous-boq") {
    return mergeReportFormat({
      layoutMode: "continuous",
      pageBreak: false,
      showPageNumbers: false,
      showBreakSummaries: false,
      summaryMode: "category",
      blocks: defaultReportBlocks("continuous"),
    });
  }
  if (id === "page-totals") {
    return mergeReportFormat({
      layoutMode: "paged",
      pageBreak: true,
      summaryMode: "page",
      showBreakSummaries: true,
      blocks: REPORT_BLOCK_TYPES.map((type) => ({
        type,
        enabled: ["letterhead", "cover", "kpis", "items", "page-total", "page-summary", "bill-summary", "grand-total", "footer"].includes(type),
      })),
    });
  }
  if (id === "summaries-pack") {
    return mergeReportFormat({
      layoutMode: "paged",
      fontSize: "sm",
      lineDensity: "compact",
      summaryMode: "category",
      showBreakSummaries: true,
      blocks: REPORT_BLOCK_TYPES.map((type) => ({
        type,
        enabled: ["letterhead", "cover", "category-summary", "bill-summary", "grand-total", "footer"].includes(type),
      })),
    });
  }
  return cloneDefaultReportFormat();
}

export function listWorkspaceTemplates(stored?: StoredReportTemplate[] | null): Array<{
  id: string;
  name: string;
  hint: string;
  builtin: boolean;
}> {
  const user = (stored ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    hint: "Saved in this workspace",
    builtin: false,
  }));
  return [
    ...BUILTIN_REPORT_TEMPLATES.map((t) => ({ ...t, builtin: true })),
    ...user,
  ];
}

export function templateFormat(
  id: string | null | undefined,
  stored?: StoredReportTemplate[] | null,
): ReportFormat | null {
  if (!id) return null;
  const builtin = BUILTIN_REPORT_TEMPLATES.some((t) => t.id === id);
  if (builtin) return formatForBuiltinTemplate(id);
  const hit = stored?.find((t) => t.id === id);
  return hit ? mergeReportFormat(hit.format) : null;
}

export interface DocLine {
  kind: "section" | "item" | "adjustment" | "total";
  key: string;
  sl: string;
  description: string;
  qty: number;
  ourQty: number | null;
  unit: string;
  rate: number;
  amount: number;
  /** Item carry label when amount is not billed money (Rate Only). */
  amountLabel?: string | null;
  /** Item carry label when rate is not used for billing (Amount Only). */
  rateLabel?: string | null;
  extra?: Record<string, string>;
  billId?: string;
  categoryKey?: string;
  /** Qty per bill when All BOQs is pivoted into one wide table. */
  qtyByBill?: Array<number | null>;
  totalQty?: number;
}

export interface BuiltDocument {
  fromWorking: boolean;
  items: WorkingItem[];
  adjustments: WorkingItem[];
  lines: DocLine[];
}

export interface ReportSummaryRow {
  ref: string;
  description: string;
  amount: number;
  cumulative: number;
}

export interface ReportPage {
  kind: ReportPageKind;
  pageNo: number;
  title: string;
  sectionLabel?: string;
  rows: DocLine[];
  pageAmount: number;
  carriedForward: number;
  cumulative: number;
  summaryRows: ReportSummaryRow[];
}

export function matchWorkingItem(project: LoadedProject, n: LoadedProject["clientNodes"][number]): WorkingItem | undefined {
  const billId = n.billId;
  const inBill = project.items.filter((i) => i.kind === "item" && (!billId || i.billId === billId));
  if (n.boqCode) {
    const byKey = findItemByKey(inBill, n.boqCode) ?? findItemByKey(project.items, n.boqCode);
    if (byKey && (!billId || byKey.billId === billId)) return byKey;
    const byIssued = inBill.find((i) => i.boqCode === n.boqCode);
    if (byIssued) return byIssued;
  }
  return (
    inBill.find((i) => i.slNo === n.sl_no && i.description === n.description) ??
    inBill.find((i) => i.clientLinkCode && i.description === n.description) ??
    inBill.find((i) => i.description === n.description)
  );
}

export function buildDocument(project: LoadedProject, scope?: ReportScope | null): BuiltDocument {
  const billIds = scopedBillIds(project, scope);
  const wantedBills = new Set(billIds);
  const wantedCats = !scope || scope.categoryKeys === "all" ? null : new Set(scope.categoryKeys);
  const items = project.items.filter((i) => i.kind === "item" && wantedBills.has(i.billId));
  const fromWorking = billIds.length ? billIds.every((id) => usesWorkingAsSource(project, id)) : usesWorkingAsSource(project);
  const adjustments = fromWorking ? [] : items.filter((i) => i.ourQty !== i.clientQty);
  const nodes = project.clientNodes
    .filter((n) => n.kind === "section" || n.kind === "item")
    .filter((n) => !n.billId || wantedBills.has(n.billId))
    .filter((n) => fromWorking || !String(n.description ?? "").toLowerCase().includes("tender adjustment"));

  const lines: DocLine[] = [];
  let currentBill = billIds[0] ?? "";
  let currentCat = "";
  for (const n of nodes) {
    if (n.billId) currentBill = n.billId;
    if (n.kind === "section") {
      const label = String(n.description ?? "").replace(/\s*\(\s*contd\.?\s*\)\s*$/i, "").trim() || "Bill";
      currentCat = categoryKey(currentBill, n.sl_no ?? "", label);
      if (wantedCats && !wantedCats.has(currentCat)) continue;
      lines.push({
        kind: "section",
        key: `sec-${n.row}`,
        sl: n.sl_no ?? "",
        description: n.description ?? "",
        qty: 0,
        ourQty: null,
        unit: "",
        rate: 0,
        amount: 0,
        extra: n.extra,
        billId: currentBill,
        categoryKey: currentCat,
      });
      continue;
    }
    if (wantedCats && currentCat && !wantedCats.has(currentCat)) continue;
    const match = matchWorkingItem(project, n);
    const issued = n.qty ?? match?.ourQty ?? 0;
    const rate = match?.result?.rate ?? 0;
    const carry = normalizeBoqCarry(match?.carryMode);
    const billed =
      carry === "rateOnly"
        ? 0
        : carry === "amountOnly"
          ? (match?.result?.amount ?? 0)
          : issued * rate;
    lines.push({
      kind: "item",
      key: `item-${n.row}`,
      sl: n.sl_no ?? "",
      description: n.description ?? "",
      qty: issued,
      ourQty: match?.ourQty ?? null,
      unit: n.unit ?? match?.unit ?? "",
      rate,
      amount: billed,
      amountLabel: carry === "rateOnly" ? "Rate Only" : null,
      rateLabel: carry === "amountOnly" ? "Amount Only" : null,
      extra: n.extra ?? match?.extra,
      billId: n.billId || match?.billId || currentBill,
      categoryKey: currentCat,
    });
  }
  return { fromWorking, items, adjustments, lines };
}

/** Stable key for the appended Tender Adjustments heading (SL is the next BOQ category number). */
export const TENDER_ADJ_SECTION_KEY = "sec-adj";

export function isTenderAdjSectionKey(key: string | undefined): boolean {
  return key === TENDER_ADJ_SECTION_KEY || key === `sec-${TENDER_ADJ_SECTION_KEY}`;
}

function topLevelCategorySl(sl: string): string {
  const token = sl.trim().replace(/\(\s*contd\.?\s*\)|\(\s*continued\s*\)/gi, "").trim().split(/[.\s]/)[0] ?? "";
  return token;
}

/** Next category number after existing BOQ headings — not a hardcoded "7". */
export function nextBoqCategorySl(sectionSls: string[]): string {
  const tops = sectionSls.map(topLevelCategorySl).filter(Boolean);
  const nums = tops.filter((s) => /^\d+$/.test(s)).map(Number);
  if (nums.length) return String(Math.max(...nums) + 1);
  const letters = tops.filter((s) => /^[A-Za-z]$/.test(s));
  if (letters.length) {
    const max = letters.map((s) => s.toUpperCase()).reduce((a, b) => (a > b ? a : b));
    if (max === "Z") return "AA";
    const next = String.fromCharCode(max.charCodeAt(0) + 1);
    return letters.every((s) => s === s.toLowerCase()) ? next.toLowerCase() : next;
  }
  return "1";
}

export function documentLines(doc: BuiltDocument, format: ReportFormat): DocLine[] {
  const lines: DocLine[] = [...doc.lines];
  if (format.showSection7 && !doc.fromWorking) {
    const sl = nextBoqCategorySl(lines.filter((l) => l.kind === "section").map((l) => l.sl));
    lines.push({
      kind: "section",
      key: TENDER_ADJ_SECTION_KEY,
      sl,
      description: "Tender Adjustments",
      qty: 0,
      ourQty: null,
      unit: "",
      rate: 0,
      amount: 0,
    });
    doc.adjustments.forEach((i, idx) => {
      lines.push({
        kind: "adjustment",
        key: i.id,
        sl: `${sl}.${idx + 1}`,
        description: i.description,
        qty: i.ourQty - i.clientQty,
        ourQty: i.ourQty,
        unit: i.unit ?? "",
        rate: i.result?.rate ?? 0,
        amount: i.result?.adjustmentAmount ?? 0,
        billId: i.billId,
      });
    });
  }
  return decorateCategoryTotals(lines, format);
}

export function decorateCategoryTotals(lines: DocLine[], format: ReportFormat): DocLine[] {
  if (!blockOn(format, "category-total")) return lines;
  const groups = groupsByCategory(lines);
  if (!groups.length) return lines;
  const out: DocLine[] = [];
  for (const g of groups) {
    out.push(...g.lines);
    out.push({
      kind: "total",
      key: `cat-tot-${g.sl}-${g.label}`,
      sl: "",
      description: `Category total · ${headingFor(g)}`,
      qty: 0,
      ourQty: null,
      unit: "",
      rate: 0,
      amount: amountOf(g.lines),
      billId: g.lines.find((l) => l.billId)?.billId,
      categoryKey: g.lines.find((l) => l.categoryKey)?.categoryKey,
    });
  }
  return out;
}

export function visibleColumns(format: ReportFormat, project?: LoadedProject): string[] {
  const cols: string[] = [];
  if (format.showSl) cols.push("sl");
  if (format.showDescription) cols.push("description");
  for (const c of extraClientColumns(project)) cols.push(c.id);
  if (format.showQty) {
    cols.push("qty");
    if (format.qtyColumn === "both") cols.push("ourQty");
  }
  if (format.showUnit) cols.push("unit");
  if (format.showRate) cols.push("rate");
  if (format.showAmount) cols.push("amount");
  if (!format.columnOrder.length) return cols;
  const wanted = new Set(cols);
  const ordered = format.columnOrder.filter((c) => wanted.has(c));
  const rest = cols.filter((c) => !ordered.includes(c));
  return [...ordered, ...rest];
}

export function columnLabel(c: string, format: ReportFormat, project?: LoadedProject, currency?: string): string {
  const extra = extraClientColumns(project).find((col) => col.id === c);
  if (extra) return extra.label;
  if (c === "sl") return "No.";
  if (c === "description") return "Description";
  if (c === "qty") return format.qtyColumn === "our" ? "Our qty" : "Qty";
  if (c === "ourQty") return "Our qty";
  if (c === "unit") return "Unit";
  if (c === "rate") return currency ? `Rate (in ${moneyUnitLabel(currency, format)})` : "Rate";
  if (c === "amount") return currency ? `Amount (in ${moneyUnitLabel(currency, format)})` : "Amount";
  return c;
}

export function isNumericColumn(c: string, project?: LoadedProject): boolean {
  if (c === "qty" || c === "ourQty" || c === "rate" || c === "amount") return true;
  return extraClientColumns(project).find((col) => col.id === c)?.valueType === "number";
}

export function qtyForLine(line: DocLine, format: ReportFormat): number {
  if (format.qtyColumn === "our" && line.ourQty != null) return line.ourQty;
  return line.qty;
}

export function moneyAmount(line: DocLine): number {
  return line.kind === "item" || line.kind === "adjustment" ? line.amount : 0;
}

export function amountOf(lines: DocLine[]): number {
  return lines.reduce((s, l) => s + moneyAmount(l), 0);
}

export function packetAmount(project: LoadedProject, format: ReportFormat, scope?: ReportScope | null): number {
  return amountOf(documentLines(buildDocument(project, scope), mergeReportFormat(format)));
}

function isContinuationSection(line: DocLine): boolean {
  return line.kind === "section" && /\(\s*contd\.?\s*\)|\(\s*continued\s*\)/i.test(line.description);
}

function chunkItemPages(lines: DocLine[], limit: number, pageBreak: boolean): DocLine[][] {
  const chunks: DocLine[][] = [];
  let cur: DocLine[] = [];
  for (const line of lines) {
    if (isContinuationSection(line) && cur.length > 0) {
      chunks.push(cur);
      cur = [];
    }
    if (pageBreak && cur.length >= limit) {
      chunks.push(cur);
      cur = [];
    }
    if (pageBreak && line.kind === "section" && cur.length > 0 && cur.length >= limit - 1) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(line);
  }
  if (cur.length) chunks.push(cur);
  return chunks.length ? chunks : [[]];
}

function chunkTitle(chunk: DocLine[], fallback: string, index: number, count: number): string {
  const sec = chunk.find((l) => l.kind === "section");
  if (sec) return `${sec.sl} ${sec.description}`.trim();
  if (count > 1) return `${fallback} (${index + 1} of ${count})`;
  return fallback;
}

interface CategoryGroup {
  sl: string;
  label: string;
  lines: DocLine[];
}

function groupsByCategory(lines: DocLine[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  let cur: CategoryGroup | null = null;
  let pendingHead: DocLine[] = [];
  for (const line of lines) {
    if (line.kind === "section" && line.key.startsWith("bill-head-")) {
      if (cur) cur.lines.push(line);
      else pendingHead.push(line);
      continue;
    }
    if (line.kind === "section") {
      const sameSection = Boolean(cur && cur.sl && line.sl && cur.sl === line.sl);
      if (sameSection && cur) {
        cur.lines.push(line);
        continue;
      }
      if (cur) groups.push(cur);
      cur = {
        sl: line.sl,
        label: line.description.replace(/\s*\(\s*contd\.?\s*\)\s*$/i, "").replace(/\s*\(\s*continued\s*\)\s*$/i, "").trim(),
        lines: [...pendingHead, line],
      };
      pendingHead = [];
    } else {
      if (!cur) cur = { sl: "", label: "Bill", lines: [...pendingHead] };
      pendingHead = [];
      cur.lines.push(line);
    }
  }
  if (cur) groups.push(cur);
  return groups.length ? groups : [{ sl: "", label: "Bill", lines }];
}

function headingFor(g: CategoryGroup): string {
  return [g.sl, g.label].filter(Boolean).join(" ").trim() || "Bill";
}

function rowsFromPages(pages: Array<{ title: string; pageAmount: number; sectionLabel?: string }>): ReportSummaryRow[] {
  let run = 0;
  return pages.map((p, i) => {
    run += p.pageAmount;
    return {
      ref: String(i + 1),
      description: p.title,
      amount: p.pageAmount,
      cumulative: run,
    };
  });
}

export function paginateDocument(
  project: LoadedProject,
  format: ReportFormat,
  workingTotal: number,
  scope?: ReportScope | null,
  opts?: { itemLines?: DocLine[] },
): ReportPage[] {
  const fmt = mergeReportFormat(format);
  const scopeNorm = scope ?? defaultReportScope();
  const layout = submissionLayoutOf(fmt);
  const billIds = scopedBillIds(project, scopeNorm);
  const multiBill = billIds.length > 1;
  const unifyBills = multiBill || Boolean(opts?.itemLines);
  const includeItems = scopeNorm.content !== "summaries" && blockOn(fmt, "items");
  const includeCatSummary = scopeNorm.content !== "items" && blockOn(fmt, "category-summary");
  const includePageSummary = scopeNorm.content !== "items" && blockOn(fmt, "page-summary");
  const includeGrandPage = layout === "category-pages" && scopeNorm.content !== "items" && fmt.showGrandSummary;
  const perCategoryPages = layout === "category-pages";
  const builtAll = buildDocument(project, scopeNorm);
  const fullJob = isFullJobScope(project, scopeNorm);
  const packet = amountOf(documentLines(builtAll, fmt));
  const jobGrand = projectGrand(project.items);
  const drafts: Omit<ReportPage, "pageNo">[] = [];

  const pushItems = (rows: DocLine[], title: string, sectionLabel?: string) => {
    const amt = amountOf(rows);
    drafts.push({
      kind: "items",
      title,
      sectionLabel,
      rows,
      pageAmount: amt,
      carriedForward: 0,
      cumulative: amt,
      summaryRows: [],
    });
    return amt;
  };

  const paginateStream = (stream: DocLine[], billName: string) => {
    const start = drafts.length;
    if (perCategoryPages) {
      for (const g of groupsByCategory(stream)) {
        const heading = headingFor(g);
        const chunks = chunkItemPages(g.lines, clampLinesPerPage(fmt.linesPerPage), fmt.pageBreak);
        const catStart = drafts.length;
        if (includeItems) {
          chunks.forEach((chunk, i) => {
            pushItems(chunk, chunkTitle(chunk, heading, i, chunks.length), heading);
          });
        }
        if (includeCatSummary) {
          const itemPages = includeItems
            ? drafts.slice(catStart).filter((p) => p.kind === "items")
            : [{ title: heading, pageAmount: amountOf(g.lines), sectionLabel: heading }];
          const summaryRows = rowsFromPages(itemPages);
          const catAmt = itemPages.reduce((s, p) => s + p.pageAmount, 0);
          drafts.push({
            kind: "category-summary",
            title: `Category summary · ${heading}`,
            sectionLabel: heading,
            rows: [],
            pageAmount: catAmt,
            carriedForward: 0,
            cumulative: catAmt,
            summaryRows,
          });
        }
      }
    } else {
      const chunks = chunkItemPages(stream, clampLinesPerPage(fmt.linesPerPage), fmt.pageBreak);
      if (includeItems) {
        chunks.forEach((chunk, i) => {
          pushItems(chunk, chunkTitle(chunk, billName, i, chunks.length));
        });
      }
      if (includePageSummary) {
        const itemPages = includeItems
          ? drafts.slice(start).filter((p) => p.kind === "items")
          : chunks.map((chunk, i) => ({ title: chunkTitle(chunk, billName, i, chunks.length), pageAmount: amountOf(chunk) }));
        const summaryRows = rowsFromPages(itemPages);
        const sum = itemPages.reduce((s, p) => s + p.pageAmount, 0);
        drafts.push({
          kind: "page-summary",
          title: "Page summary",
          rows: [],
          pageAmount: sum,
          carriedForward: 0,
          cumulative: sum,
          summaryRows,
        });
      }
      if (includeCatSummary && layout === "category-totals") {
        const cats = groupsByCategory(stream).filter((g) => g.lines.some((l) => l.kind === "item" || l.kind === "adjustment"));
        const summaryRows = rowsFromPages(cats.map((g) => ({ title: headingFor(g), pageAmount: amountOf(g.lines) })));
        const sum = cats.reduce((s, g) => s + amountOf(g.lines), 0);
        drafts.push({
          kind: "category-summary",
          title: "Category summary",
          rows: [],
          pageAmount: sum,
          carriedForward: 0,
          cumulative: sum,
          summaryRows,
        });
      }
    }
    return drafts.slice(start);
  };

  if (unifyBills) {
    const stream = opts?.itemLines ?? documentLines(builtAll, fmt);
    paginateStream(stream, project.name);
  } else {
    for (const billId of billIds.length ? billIds : [""]) {
      const bill = billById(project, billId);
      const billName = bill?.name || "BOQ";
      const billScope: ReportScope = { billIds: billId ? [billId] : "all", categoryKeys: scopeNorm.categoryKeys, content: "items" };
      const built = billId ? buildDocument(project, billScope) : builtAll;
      const stream = opts?.itemLines ?? documentLines(built, fmt);
      paginateStream(stream, billName);
    }
  }

  if (includeGrandPage) {
    const bills = sortedBills(project);
    const catPages = drafts.filter((p) => p.kind === "category-summary");
    let summaryRows;
    if (unifyBills) {
      const sources = catPages.length ? catPages : drafts.filter((p) => p.kind === "items");
      summaryRows = rowsFromPages(sources.map((p) => ({ title: p.sectionLabel ?? p.title, pageAmount: p.pageAmount })));
    } else if (fullJob && bills.length > 1) {
      let run = 0;
      summaryRows = bills.map((b) => {
        const amount = billTotal(project.items, b.id);
        run += amount;
        return { ref: b.code, description: b.name, amount, cumulative: run };
      });
    } else {
      const sources = catPages.length ? catPages : drafts.filter((p) => p.kind === "items");
      summaryRows = rowsFromPages(sources.map((p) => ({ title: p.sectionLabel ?? p.title, pageAmount: p.pageAmount })));
    }
    if (!fullJob) {
      summaryRows.push({
        ref: "",
        description: "Project grand (all BOQs)",
        amount: jobGrand,
        cumulative: jobGrand,
      });
    }
    const shown = fullJob ? workingTotal || jobGrand : packet;
    drafts.push({
      kind: "grand-summary",
      title: fullJob ? "Grand summary" : "This packet",
      rows: [],
      pageAmount: shown,
      carriedForward: 0,
      cumulative: shown,
      summaryRows,
    });
  }

  if (drafts.length === 0) {
    drafts.push({
      kind: "items",
      title: "Bill",
      rows: opts?.itemLines ?? documentLines(builtAll, fmt),
      pageAmount: 0,
      carriedForward: 0,
      cumulative: 0,
      summaryRows: [],
    });
  }

  return drafts.map((p, i) => ({ ...p, pageNo: i + 1 }));
}

export function reportCell(line: DocLine, c: string, format: ReportFormat, _currency: string): string {
  if (c === "sl") return line.sl;
  if (c === "description") return line.description;
  if (c === "qty") return formatQty(qtyForLine(line, format));
  if (c === "ourQty") return line.ourQty == null ? "" : formatQty(line.ourQty);
  if (c === "unit") return line.unit;
  if (c === "rate") return line.rateLabel || formatReportFigure(line.rate);
  if (c === "amount") return line.amountLabel || formatReportFigure(line.amount);
  return line.extra?.[c] ?? "";
}

export function submissionCsv(
  project: LoadedProject,
  format: ReportFormat,
  total: number,
  scope?: ReportScope | null,
): string {
  const fmt = mergeReportFormat(format);
  const doc = buildDocument(project, scope);
  const cols = visibleColumns(fmt, project);
  const rows: string[][] = [cols.map((c) => columnLabel(c, fmt, project, project.currency))];
  const content = scope?.content ?? "both";
  if (content !== "summaries") {
    for (const line of documentLines(doc, fmt)) {
      if (line.kind === "section") {
        rows.push(cols.map((c) => (c === "description" ? `${line.sl} ${line.description}`.trim() : c === "sl" ? line.sl : "")));
        continue;
      }
      if (line.kind === "total") {
        const grand = /grand total/i.test(line.description);
        rows.push(
          cols.map((c) =>
            c === "description"
              ? line.description
              : c === "amount"
                ? grand
                  ? formatReportMoney(line.amount, project.currency, fmt)
                  : formatReportFigure(line.amount)
                : "",
          ),
        );
        continue;
      }
      rows.push(cols.map((c) => reportCell(line, c, fmt, project.currency)));
    }
  }

  const pages = paginateDocument(project, fmt, total, scope);
  for (const page of pages.filter((p) => p.kind !== "items")) {
    rows.push([]);
    rows.push([page.title]);
    rows.push(["No.", "Description", columnLabel("amount", fmt, undefined, project.currency)]);
    for (const r of page.summaryRows) {
      rows.push([r.ref, r.description, formatReportFigure(r.amount)]);
    }
    if (page.kind === "grand-summary") {
      rows.push(["", "Grand total", formatReportMoney(page.pageAmount, project.currency, fmt)]);
    } else {
      const foot = page.kind === "page-summary" ? "Page total" : "Category total";
      rows.push(["", foot, formatReportFigure(page.pageAmount)]);
    }
  }

  const full = isFullJobScope(project, scope);
  rows.push(
    cols.map((c) =>
      c === "description"
        ? full
          ? "Grand total"
          : "This packet"
        : c === "amount"
          ? formatMoney(total, project.currency)
          : "",
    ),
  );
  if (!full) {
    rows.push(
      cols.map((c) =>
        c === "description" ? "Project grand (all BOQs)" : c === "amount" ? formatMoney(projectGrand(project.items), project.currency) : "",
      ),
    );
  }
  return rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
