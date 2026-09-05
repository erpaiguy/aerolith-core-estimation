import { composeAnalysis, type ResourceLineInput } from "./analysis.ts";

export type PriceMode = "direct" | "analysis";
export type AnalysisOrigin = "own" | "link" | "clone";

export interface AnalysisIncludeInput {
  sourceBoqCode: string;
  relation: "link" | "clone";
  factor: number;
  snapshotUnitCost?: number;
}

export interface ResolvableItem {
  boqCode: string;
  /** Unique lookup key when issued codes collide across bills. Falls back to boqCode. */
  itemKey?: string;
  lines: ResourceLineInput[];
  directCost?: number;
  quotedUnitCost?: number | null;
  priceMode?: PriceMode;
  analysisOrigin?: AnalysisOrigin;
  linkedBoqCode?: string | null;
  includes?: AnalysisIncludeInput[];
}

export interface ResolveResult {
  unitCost: number;
  cyclic: boolean;
}

function norm(code: string): string {
  return code.toLowerCase();
}

function lookupCode(item: ResolvableItem): string {
  return item.itemKey || item.boqCode;
}

export function indexResolvableItems(items: ResolvableItem[]): Map<string, ResolvableItem> {
  const by = new Map<string, ResolvableItem>();
  const issuedCounts = new Map<string, number>();
  for (const item of items) {
    issuedCounts.set(norm(item.boqCode), (issuedCounts.get(norm(item.boqCode)) ?? 0) + 1);
  }
  for (const item of items) {
    by.set(norm(lookupCode(item)), item);
    const issued = norm(item.boqCode);
    if (issued !== norm(lookupCode(item)) && issuedCounts.get(issued) === 1) {
      by.set(issued, item);
    }
  }
  return by;
}

function liveDeps(item: ResolvableItem | undefined): string[] {
  if (!item) return [];
  const deps: string[] = [];
  if ((item.analysisOrigin ?? "own") === "link" && item.linkedBoqCode) {
    deps.push(norm(item.linkedBoqCode));
  }
  for (const inc of item.includes ?? []) {
    if (inc.relation === "link" && inc.sourceBoqCode) {
      deps.push(norm(inc.sourceBoqCode));
    }
  }
  return deps;
}

/** True if linking host → source (whole-item or include) would cycle. */
export function wouldCreateCycle(
  items: ResolvableItem[],
  hostCode: string,
  sourceCode: string,
): boolean {
  if (norm(hostCode) === norm(sourceCode)) return true;
  const by = indexResolvableItems(items);
  const seen = new Set<string>();
  const stack = [norm(sourceCode)];
  while (stack.length) {
    const code = stack.pop()!;
    if (code === norm(hostCode)) return true;
    if (seen.has(code)) continue;
    seen.add(code);
    for (const dep of liveDeps(by.get(code))) stack.push(dep);
  }
  return false;
}

function priceModeOf(item: ResolvableItem): PriceMode {
  if (item.priceMode === "direct") return "direct";
  if (item.priceMode === "analysis") return "analysis";
  const origin = item.analysisOrigin ?? "own";
  const hasBuild =
    item.lines.length > 0 ||
    (item.includes?.length ?? 0) > 0 ||
    (origin === "link" && Boolean(item.linkedBoqCode));
  return hasBuild ? "analysis" : "direct";
}

function analysisWithIndex(
  by: Map<string, ResolvableItem>,
  boqCode: string,
  visiting: Set<string>,
  cache: Map<string, ResolveResult>,
): ResolveResult {
  const key = norm(boqCode);
  if (visiting.has(key)) return { unitCost: 0, cyclic: true };
  const hit = cache.get(key);
  if (hit) return hit;
  const item = by.get(key);
  if (!item) return { unitCost: 0, cyclic: false };

  if (priceModeOf(item) === "direct") {
    const direct = { unitCost: item.directCost ?? 0, cyclic: false };
    cache.set(key, direct);
    return direct;
  }

  visiting.add(key);
  const origin = item.analysisOrigin ?? "own";
  let result: ResolveResult;
  if (origin === "link" && item.linkedBoqCode) {
    result = analysisWithIndex(by, item.linkedBoqCode, visiting, cache);
  } else {
    let unitCost = item.lines.length > 0 ? composeAnalysis(item.lines, 1).unitCost : 0;
    let cyclic = false;
    for (const inc of item.includes ?? []) {
      const factor = Number.isFinite(inc.factor) ? inc.factor : 1;
      if (inc.relation === "clone") {
        unitCost += (inc.snapshotUnitCost ?? 0) * factor;
        continue;
      }
      const nested = analysisWithIndex(by, inc.sourceBoqCode, visiting, cache);
      cyclic = cyclic || nested.cyclic;
      unitCost += nested.unitCost * factor;
    }
    result = { unitCost, cyclic };
  }
  visiting.delete(key);
  if (!result.cyclic) cache.set(key, result);
  return result;
}

function boqWithIndex(
  by: Map<string, ResolvableItem>,
  boqCode: string,
  cache: Map<string, ResolveResult>,
): ResolveResult {
  const item = by.get(norm(boqCode));
  if (!item) return { unitCost: 0, cyclic: false };
  if (item.quotedUnitCost != null) {
    return { unitCost: item.quotedUnitCost, cyclic: false };
  }
  return analysisWithIndex(by, boqCode, new Set(), cache);
}

/**
 * Unit cost from the item's own analysis (backup), ignoring a selected subcontract quote.
 * Used when another item links or clones this one.
 */
export function resolveAnalysisUnitCost(
  items: ResolvableItem[],
  boqCode: string,
  visiting: Set<string> = new Set(),
): ResolveResult {
  return analysisWithIndex(indexResolvableItems(items), boqCode, visiting, new Map());
}

/** Unit cost that appears on the BOQ: selected quote wins, else analysis/direct. */
export function resolveBoqUnitCost(items: ResolvableItem[], boqCode: string): ResolveResult {
  return boqWithIndex(indexResolvableItems(items), boqCode, new Map());
}

/** Price every item once, sharing the lookup index and analysis cache. */
export function resolveProjectBoqCosts(items: ResolvableItem[]): Map<string, ResolveResult> {
  const by = indexResolvableItems(items);
  const cache = new Map<string, ResolveResult>();
  const out = new Map<string, ResolveResult>();
  for (const item of items) {
    const result = boqWithIndex(by, lookupCode(item), cache);
    out.set(lookupCode(item), result);
    if (item.itemKey && item.itemKey !== item.boqCode) {
      const issuedCount = items.filter((i) => i.boqCode === item.boqCode).length;
      if (issuedCount === 1) out.set(item.boqCode, result);
    }
  }
  return out;
}
