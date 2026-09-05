import { formatMoney, formatQty, moneyClose } from "@aerolith/shared";
import type { LoadedProject, ProjectBill } from "./model";
import { billById, projectGrand } from "./bills";
import {
  amountOf,
  blockOn,
  buildDocument,
  documentLines,
  nextBoqCategorySl,
  TENDER_ADJ_SECTION_KEY,
  formatReportFigure,
  formatReportMoney,
  isFullJobScope,
  moneyUnitLabel,
  mergeReportFormat,
  paginateDocument,
  qtyForLine,
  scopedBillIds,
  type DocLine,
  type ReportFormat,
  type ReportScope,
} from "./reportFormat";

export type QtyByBill = Array<number | null>;

export interface CompareRow {
  kind: "section" | "item" | "adjustment" | "total";
  key: string;
  sl: string;
  description: string;
  unit: string;
  qtyByBill: QtyByBill;
  totalQty: number;
  rate: number;
  amount: number;
  rateLabel?: string | null;
  amountLabel?: string | null;
}

export function shouldPivotQtyByBoq(project: LoadedProject, scope?: ReportScope | null): boolean {
  return scopedBillIds(project, scope).length > 1 && (!scope || scope.billIds === "all");
}

export function compareBills(project: LoadedProject, scope?: ReportScope | null): ProjectBill[] {
  return scopedBillIds(project, scope)
    .map((id) => billById(project, id))
    .filter((b): b is ProjectBill => Boolean(b));
}

function stripContd(label: string): string {
  return label.replace(/\s*\(\s*contd\.?\s*\)\s*$/i, "").replace(/\s*\(\s*continued\s*\)\s*$/i, "").trim();
}

function sectionKey(line: DocLine): string {
  return (line.sl || stripContd(line.description)).toLowerCase();
}

function itemKey(sectionSl: string, line: DocLine): string {
  const sl = (line.sl || "").trim().toLowerCase();
  const sec = sectionSl.trim().toLowerCase();
  if (sl && sec && (sl === sec || sl.startsWith(sec))) return sl;
  return `${sec}::${sl || line.description.toLowerCase()}`;
}

function emptyQty(n: number): QtyByBill {
  return Array.from({ length: n }, () => null);
}

function totalQty(qtyByBill: QtyByBill): number {
  return qtyByBill.reduce<number>((s, q) => s + (q ?? 0), 0);
}

function mergeRate(row: CompareRow, line: DocLine): void {
  const labels = [row.rateLabel, line.rateLabel].filter(Boolean);
  if (labels.length && labels.every((l) => l === labels[0])) row.rateLabel = labels[0] as string;
  else if (labels.length) row.rateLabel = null;
  if (row.rate && line.rate && !moneyClose(row.rate, line.rate)) row.rate = 0;
  else if (!row.rate) row.rate = line.rate;
}

function mergeAmountLabel(row: CompareRow, line: DocLine): void {
  const labels = [row.amountLabel, line.amountLabel].filter(Boolean);
  if (labels.length && labels.every((l) => l === labels[0])) row.amountLabel = labels[0] as string;
  else row.amountLabel = null;
}

export function pivotSubmissionByBoq(
  project: LoadedProject,
  format: ReportFormat,
  scope?: ReportScope | null,
): { bills: ProjectBill[]; rows: CompareRow[] } {
  const bills = compareBills(project, scope);
  const index = new Map(bills.map((b, i) => [b.id, i]));
  const n = bills.length;
  const doc = buildDocument(project, { ...(scope ?? { billIds: "all", categoryKeys: "all", content: "items" }), content: "items" });
  const sectionOrder: string[] = [];
  const sections = new Map<string, { sl: string; description: string; itemKeys: string[] }>();
  const items = new Map<string, CompareRow>();
  let current = "";

  function ensureSection(line: DocLine): string {
    const key = sectionKey(line);
    if (!sections.has(key)) {
      sectionOrder.push(key);
      sections.set(key, { sl: line.sl, description: stripContd(line.description), itemKeys: [] });
    }
    return key;
  }

  for (const line of doc.lines) {
    if (line.kind === "section") {
      current = ensureSection(line);
      continue;
    }
    if (line.kind !== "item") continue;
    const sk = current || ensureSection({ ...line, kind: "section", sl: "", description: "Bill", key: "sec-bill" });
    const key = itemKey(sections.get(sk)?.sl ?? "", line);
    const bi = line.billId ? index.get(line.billId) : undefined;
    let row = items.get(key);
    if (!row) {
      row = {
        kind: "item",
        key,
        sl: line.sl,
        description: line.description,
        unit: line.unit,
        qtyByBill: emptyQty(n),
        totalQty: 0,
        rate: line.rate,
        amount: 0,
        rateLabel: line.rateLabel,
        amountLabel: line.amountLabel,
      };
      items.set(key, row);
      sections.get(sk)?.itemKeys.push(key);
    }
    if (bi == null) continue;
    row.qtyByBill[bi] = qtyForLine(line, format);
    row.amount += line.amount;
    row.unit = row.unit || line.unit;
    mergeRate(row, line);
    mergeAmountLabel(row, line);
  }

  if (format.showSection7 && !doc.fromWorking && doc.adjustments.length) {
    const adjKey = TENDER_ADJ_SECTION_KEY;
    if (!sections.has(adjKey)) {
      const sl = nextBoqCategorySl([...sections.values()].map((s) => s.sl));
      sectionOrder.push(adjKey);
      sections.set(adjKey, { sl, description: "Tender Adjustments", itemKeys: [] });
    }
    for (const i of doc.adjustments) {
      const key = `adj:${i.boqCode}`;
      const bi = index.get(i.billId);
      let row = items.get(key);
      if (!row) {
        row = {
          kind: "adjustment",
          key,
          sl: i.slNo,
          description: i.description,
          unit: i.unit ?? "",
          qtyByBill: emptyQty(n),
          totalQty: 0,
          rate: i.result?.rate ?? 0,
          amount: 0,
        };
        items.set(key, row);
        sections.get(adjKey)?.itemKeys.push(key);
      }
      if (bi == null) continue;
      row.qtyByBill[bi] = i.ourQty - i.clientQty;
      row.amount += i.result?.adjustmentAmount ?? 0;
    }
  }

  const rows: CompareRow[] = [];
  for (const sk of sectionOrder) {
    const sec = sections.get(sk);
    if (!sec) continue;
    rows.push({
      kind: "section",
      key: `sec-${sk}`,
      sl: sec.sl,
      description: sec.description,
      unit: "",
      qtyByBill: emptyQty(n),
      totalQty: 0,
      rate: 0,
      amount: 0,
    });
    const kids: CompareRow[] = [];
    for (const ik of sec.itemKeys) {
      const row = items.get(ik);
      if (!row) continue;
      row.totalQty = totalQty(row.qtyByBill);
      kids.push(row);
      rows.push(row);
    }
    if (kids.length && blockOn(format, "category-total")) {
      rows.push({
        kind: "total",
        key: `cat-${sk}`,
        sl: "",
        description: `Category total · ${sec.sl} ${sec.description}`.trim(),
        unit: "",
        qtyByBill: emptyQty(n),
        totalQty: 0,
        rate: 0,
        amount: amountOf(
          kids.map((k) => ({
            kind: k.kind === "adjustment" ? "adjustment" : "item",
            key: k.key,
            sl: k.sl,
            description: k.description,
            qty: k.totalQty,
            ourQty: null,
            unit: k.unit,
            rate: k.rate,
            amount: k.amount,
          })),
        ),
      });
    }
  }

  return { bills, rows };
}

export function compareQtyMissing(rows: CompareRow[]): number {
  return rows.filter((r) => (r.kind === "item" || r.kind === "adjustment") && r.qtyByBill.some((q) => q == null)).length;
}

export function formatCompareQty(q: number | null): string {
  if (q == null) return "—";
  return formatQty(q);
}

export function compareCellRate(row: CompareRow, _currency: string, _fmt: ReportFormat): string {
  if (row.kind === "section" || row.kind === "total") return "";
  return row.rateLabel || (row.rate ? formatReportFigure(row.rate) : "");
}

export function compareCellAmount(row: CompareRow, currency: string, fmt: ReportFormat, withCurrency = false): string {
  if (row.kind === "section") return "";
  if (row.amountLabel) return row.amountLabel;
  if (withCurrency || row.kind === "total" && row.key === "submit-grand") return formatReportMoney(row.amount, currency, fmt);
  return formatReportFigure(row.amount);
}

export function compareRowsToDocLines(rows: CompareRow[]): DocLine[] {
  return rows.map((r) => ({
    kind: r.kind,
    key: r.key,
    sl: r.sl,
    description: r.description,
    qty: r.totalQty,
    ourQty: null,
    unit: r.unit,
    rate: r.rate,
    amount: r.amount,
    rateLabel: r.rateLabel,
    amountLabel: r.amountLabel,
    qtyByBill: r.qtyByBill,
    totalQty: r.totalQty,
  }));
}

export function submissionItemLines(project: LoadedProject, format: ReportFormat, scope?: ReportScope | null): DocLine[] {
  const fmt = mergeReportFormat(format);
  if (shouldPivotQtyByBoq(project, scope)) {
    return compareRowsToDocLines(pivotSubmissionByBoq(project, fmt, scope).rows);
  }
  return documentLines(buildDocument(project, scope), fmt);
}

export function billQtyHeader(bill: ProjectBill): string {
  return bill.code || String(bill.number);
}

export function compareCsvRows(
  project: LoadedProject,
  format: ReportFormat,
  scope: ReportScope | null | undefined,
  currency: string,
): string[][] {
  const { bills, rows } = pivotSubmissionByBoq(project, format, scope);
  const unit = moneyUnitLabel(currency, format);
  const qtyHeads = [...bills.map((b) => `Qty ${billQtyHeader(b)}`), "Qty total"];
  const head = ["No.", "Description", ...qtyHeads, "Unit", `Rate (in ${unit})`, `Amount (in ${unit})`];
  const out: string[][] = [head];
  for (const row of rows) {
    if (row.kind === "section") {
      out.push([row.sl, row.description, ...qtyHeads.map(() => ""), "", "", ""]);
      continue;
    }
    if (row.kind === "total") {
      out.push(["", row.description, ...qtyHeads.map(() => ""), "", "", compareCellAmount(row, currency, format)]);
      continue;
    }
    out.push([
      row.sl,
      row.description,
      ...row.qtyByBill.map((q) => formatCompareQty(q)),
      formatQty(row.totalQty),
      row.unit,
      compareCellRate(row, currency, format),
      compareCellAmount(row, currency, format),
    ]);
  }
  return out;
}

export function submissionCompareCsv(
  project: LoadedProject,
  format: ReportFormat,
  total: number,
  scope?: ReportScope | null,
): string {
  const fmt = mergeReportFormat(format);
  const content = scope?.content ?? "both";
  const rows: string[][] = content === "summaries" ? [] : compareCsvRows(project, fmt, scope, project.currency);
  if (content !== "items") {
    const pages = paginateDocument(project, fmt, total, scope, { itemLines: submissionItemLines(project, fmt, scope) });
    for (const page of pages.filter((p) => p.kind !== "items")) {
      rows.push([]);
      rows.push([page.title]);
      rows.push(["No.", "Description", "Amount"]);
      for (const r of page.summaryRows) {
        rows.push([r.ref, r.description, formatReportFigure(r.amount)]);
      }
    }
  }
  const { bills } = pivotSubmissionByBoq(project, fmt, scope);
  const pad = bills.length + 1;
  const full = isFullJobScope(project, scope);
  rows.push(["", full ? "Grand total" : "This packet", ...Array.from({ length: pad }, () => ""), "", "", formatMoney(total, project.currency)]);
  if (!full) {
    rows.push(["", "Project grand (all BOQs)", ...Array.from({ length: pad }, () => ""), "", "", formatMoney(projectGrand(project.items), project.currency)]);
  }
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}
