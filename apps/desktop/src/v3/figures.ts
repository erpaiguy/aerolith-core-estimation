import { moneyClose, totalMarginPct } from "@aerolith/shared";
import { billById, itemKeyOf, quoteMatchesItem, sortedBills } from "../bills";
import { costCategoryTree } from "../projectCompute";
import { hasAnalysisBackup, GOLDEN_TOTAL, type LoadedProject, type WorkingItem } from "../model";

export function num(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function pct(fraction: number): string {
  return `${num(fraction * 100, 1)}%`;
}

export type SectionBar = { code: string; name: string; amount: number };

export function sectionBars(project: LoadedProject, billId: string | null): SectionBar[] {
  const items = project.items.filter((i) => !billId || i.billId === billId);
  const bars: SectionBar[] = [];
  let current: SectionBar | null = null;
  for (const item of items) {
    if (item.kind === "section") {
      current = { code: item.boqCode, name: item.description, amount: 0 };
      bars.push(current);
      continue;
    }
    if (!current) {
      current = { code: "", name: "Items", amount: 0 };
      bars.push(current);
    }
    current.amount += item.result?.amount ?? 0;
  }
  return bars.filter((b) => b.amount !== 0 || bars.length < 8);
}

export function jobItems(project: LoadedProject, billId: string | null): WorkingItem[] {
  return project.items.filter((i) => i.kind === "item" && (!billId || i.billId === billId));
}

export function quotedItem(project: LoadedProject, item: WorkingItem): boolean {
  return project.itemQuotes.some((q) => quoteMatchesItem(q, item) && q.selected);
}

export function jobFigures(project: LoadedProject, billId: string | null) {
  const items = jobItems(project, billId);
  const cost = items.reduce((s, i) => s + (i.result?.costAmount ?? 0), 0);
  const margin = items.reduce((s, i) => s + (i.result?.marginAmount ?? 0), 0);
  const total = items.reduce((s, i) => s + (i.result?.amount ?? 0), 0);
  const unpriced = items.filter((i) => !i.result || i.result.rate === 0);
  const qtyDiff = items.filter((i) => i.ourQty !== i.clientQty);
  const missing = items.filter((i) => !hasAnalysisBackup(i) && !quotedItem(project, i));
  const openQueries = (project.queryItems ?? []).filter((q) => !q.closedAt);
  const bill = billId ? billById(project, billId) : sortedBills(project)[0];
  return {
    items,
    cost,
    margin,
    total,
    unpriced,
    qtyDiff,
    missing,
    openQueries,
    green: moneyClose(total, GOLDEN_TOTAL),
    marginPct: totalMarginPct(project.margin),
    tree: costCategoryTree(project, billId),
    sections: sectionBars(project, billId),
    bill,
    sealed: Boolean(project.sealedAt),
  };
}

export function itemLabel(item: WorkingItem): string {
  return `${item.boqCode} ${item.description}`;
}

export function rateSource(project: LoadedProject, item: WorkingItem): string {
  if (!item.result || item.result.rate === 0) return "Unpriced";
  if ((item.analysisOrigin ?? "own") === "link") return "Live link";
  if ((item.analysisOrigin ?? "own") === "clone") return "Clone";
  if (quotedItem(project, item)) return "Vendor rate";
  if (item.priceMode === "direct" || (item.lines.length === 0 && (item.directCost ?? 0) > 0)) return "Direct value";
  if (item.lines.length > 0) return "Build-up";
  return "Rate";
}

export function lineCost(qty: number, rate: number, waste: number): number {
  return qty * (1 + (waste || 0)) * rate;
}

export function resourceByCode(project: LoadedProject, code: string | null | undefined) {
  if (!code) return undefined;
  return project.resources.find((r) => r.project_code === code);
}

export function categoryOf(project: LoadedProject, code: string | null | undefined): string {
  return resourceByCode(project, code)?.category?.trim() || "Uncategorised";
}

export { itemKeyOf };
