import { moneyClose, totalMarginPct } from "@aerolith/shared";
import {
  composeResourceLine,
  computeProject,
  contributesResources,
  postedQtyByItem,
  resolveAnalysisUnitCost,
  rollupResourceTotals,
  wouldCreateCycle,
  type ItemInput,
} from "@aerolith/calc";
import {
  billSourceLocked,
  ensureProjectBills,
  findItemByKey,
  itemKeyOf,
  quoteMatchesItem,
  sameItemKey,
  usesWorkingAsSource as billUsesWorkingAsSource,
} from "./bills";
import { effectiveMargin, marginStackKey } from "./marginRules";
import {
  hasAnalysisBackup,
  newId,
  type AnalysisInclude,
  type AnalysisLine,
  type ClientNode,
  type LoadedProject,
  type ProjectResource,
  type ResourceQuote,
  type WorkingItem,
} from "./model";
import type { ConflictItem } from "./platform/types";

export function applyQtoPosting(project: LoadedProject): LoadedProject {
  const sums = postedQtyByItem(
    project.qtoLines.map((l) => ({
      workingBoqCode: l.workingBoqCode,
      formulaKey: l.formulaKey,
      dims: l.dims,
    })),
  );
  return {
    ...project,
    items: project.items.map((i) => {
      if (i.kind !== "item") return i;
      const qty = sums.get(itemKeyOf(i)) ?? sums.get(i.boqCode) ?? 0;
      return { ...i, ourQty: qty };
    }),
  };
}

export function usesWorkingAsSource(project: LoadedProject, billId?: string): boolean {
  return billUsesWorkingAsSource(project, billId);
}

export function workingAsClientNodes(items: WorkingItem[]): ClientNode[] {
  const nodes: ClientNode[] = [{ row: 1, kind: "title", description: "Working bill" }];
  let row = 1;
  let lastBill = "";
  for (const it of items) {
    if (it.billId && it.billId !== lastBill) {
      lastBill = it.billId;
    }
    row += 1;
    if (it.kind === "section") {
      nodes.push({
        row,
        kind: "section",
        sl_no: it.slNo,
        description: it.description,
        billId: it.billId,
        boqCode: itemKeyOf(it),
        extra: it.extra,
      });
    } else {
      nodes.push({
        row,
        kind: "item",
        sl_no: it.slNo,
        description: it.description,
        qty: it.ourQty,
        unit: it.unit ?? undefined,
        billId: it.billId,
        boqCode: itemKeyOf(it),
        extra: it.extra,
      });
    }
  }
  return nodes;
}

export function nextResourceCode(existing: Iterable<string>): string {
  const have = new Set(existing);
  let n = have.size + 1;
  let code = `R${String(n).padStart(3, "0")}`;
  while (have.has(code)) {
    n += 1;
    code = `R${String(n).padStart(3, "0")}`;
  }
  return code;
}

export function blankResource(
  code: string,
  line: {
    description?: string | null;
    unit?: string | null;
    resourceRate?: number;
    wastagePct?: number;
    category?: string | null;
  },
): ProjectResource {
  return {
    project_code: code,
    global_code: null,
    category: line.category || "Material",
    type: null,
    sub_type: null,
    description: line.description || code,
    unit: line.unit ?? null,
    project_wastage_pct: line.wastagePct ?? 0,
    project_rate: line.resourceRate ?? 0,
    rate_source: null,
    total_qty: 0,
    total_amount: 0,
  };
}

/** Lines typed in Rate Analysis become project resources (Buy + dashboard). */
export function syncResourcesFromAnalysis(project: LoadedProject): LoadedProject {
  const byCode = new Map(project.resources.map((r) => [r.project_code, { ...r }]));
  const byDesc = new Map<string, string>();
  for (const r of byCode.values()) {
    const key = (r.description ?? "").trim().toLowerCase();
    if (key) byDesc.set(key, r.project_code);
  }

  const items = project.items.map((item) => {
    if (item.kind !== "item") return item;
    const lines = item.lines.map((line) => {
      const desc = (line.description ?? "").trim();
      let code = line.projectResourceCode;
      if (!code && desc) code = byDesc.get(desc.toLowerCase()) ?? null;
      const useful = Boolean(desc || line.unit || (line.resourceRate ?? 0) !== 0);
      if (!code && useful) {
        code = nextResourceCode(byCode.keys());
        const rec = blankResource(code, line);
        byCode.set(code, rec);
        if (desc) byDesc.set(desc.toLowerCase(), code);
      }
      if (code && !byCode.has(code)) {
        const rec = blankResource(code, line);
        byCode.set(code, rec);
        if (desc) byDesc.set(desc.toLowerCase(), code);
      }
      if (code) {
        const rec = byCode.get(code)!;
        if (desc) rec.description = desc;
        if (line.unit) rec.unit = line.unit;
        rec.project_rate = line.resourceRate ?? rec.project_rate;
        rec.project_wastage_pct = line.wastagePct ?? rec.project_wastage_pct;
      }
      return { ...line, projectResourceCode: code };
    });
    return { ...item, lines };
  });

  return { ...project, items, resources: [...byCode.values()] };
}

/** Buy-side CRUD: keep analysis lines and quotes pointed at the live resource list. */
export function applyProjectResources(
  project: LoadedProject,
  resources: ProjectResource[],
  remap: Record<string, string | null> = {},
): LoadedProject {
  const byNew = new Map(resources.map((r) => [r.project_code, r]));
  const mapCode = (code: string): string | null => {
    if (Object.prototype.hasOwnProperty.call(remap, code)) return remap[code] ?? null;
    return byNew.has(code) ? code : null;
  };
  return {
    ...project,
    resources,
    resourceQuotes: project.resourceQuotes
      .map((q) => {
        const next = mapCode(q.projectResourceCode);
        return next ? { ...q, projectResourceCode: next } : null;
      })
      .filter((q): q is ResourceQuote => q != null),
    items: project.items.map((i) => ({
      ...i,
      lines: i.lines.map((l) => {
        if (!l.projectResourceCode) return l;
        const next = mapCode(l.projectResourceCode);
        if (!next) return { ...l, projectResourceCode: null };
        const rec = byNew.get(next);
        if (!rec) return { ...l, projectResourceCode: next };
        return {
          ...l,
          projectResourceCode: next,
          description: rec.description ?? l.description,
          unit: rec.unit ?? l.unit,
          resourceRate: rec.project_rate ?? l.resourceRate,
          wastagePct: rec.project_wastage_pct ?? l.wastagePct,
        };
      }),
    })),
  };
}

export function toCalcItems(project: LoadedProject): ItemInput[] {
  return project.items
    .filter((i) => i.kind === "item")
    .map((i) => {
      const key = itemKeyOf(i);
      return {
        boqCode: i.boqCode,
        itemKey: key,
        clientQty: i.clientQty,
        ourQty: i.ourQty,
        lines: i.lines,
        directCost: i.directCost,
        quotedUnitCost: selectedItemQuoteRate(project, key),
        priceMode: i.priceMode,
        analysisOrigin: i.analysisOrigin,
        linkedBoqCode: i.linkedBoqCode,
        carryMode: i.carryMode,
        includes: (i.includes ?? []).map((inc) => ({
          sourceBoqCode: inc.sourceBoqCode,
          relation: inc.relation,
          factor: inc.factor,
          snapshotUnitCost: inc.snapshotUnitCost,
        })),
      };
    });
}

function copyLines(lines: AnalysisLine[]): AnalysisLine[] {
  return lines.map((l) => ({ ...l, factors: [...l.factors] }));
}

function mapItem(items: WorkingItem[], key: string, fn: (item: WorkingItem) => WorkingItem): WorkingItem[] {
  return items.map((i) => (sameItemKey(i, key) ? fn(i) : i));
}

export function materializeAnalysis(
  source: WorkingItem,
  all: WorkingItem[],
  visiting: Set<string> = new Set(),
): { lines: AnalysisLine[]; includes: AnalysisInclude[] } {
  const key = itemKeyOf(source).toLowerCase();
  if (visiting.has(key)) return { lines: [], includes: [] };
  visiting.add(key);
  if ((source.analysisOrigin ?? "own") === "link" && source.linkedBoqCode) {
    const parent = findItemByKey(all, source.linkedBoqCode);
    if (parent && parent.kind === "item") return materializeAnalysis(parent, all, visiting);
  }
  const calcItems = all
    .filter((i) => i.kind === "item")
    .map((i) => ({
      boqCode: i.boqCode,
      itemKey: itemKeyOf(i),
      clientQty: i.clientQty,
      ourQty: i.ourQty,
      lines: i.lines,
      directCost: i.directCost,
      priceMode: i.priceMode,
      analysisOrigin: i.analysisOrigin,
      linkedBoqCode: i.linkedBoqCode,
      includes: (i.includes ?? []).map((inc) => ({
        sourceBoqCode: inc.sourceBoqCode,
        relation: inc.relation,
        factor: inc.factor,
        snapshotUnitCost: inc.snapshotUnitCost,
      })),
    }));
  const includes: AnalysisInclude[] = (source.includes ?? []).map((inc) => {
    if (inc.relation === "clone") {
      return { ...inc, id: newId("inc"), relation: "clone" as const, snapshotLines: copyLines(inc.snapshotLines ?? []) };
    }
    const src = findItemByKey(all, inc.sourceBoqCode);
    const mat = src ? materializeAnalysis(src, all, new Set(visiting)) : { lines: [] as AnalysisLine[], includes: [] };
    return {
      id: newId("inc"),
      sourceBoqCode: inc.sourceBoqCode,
      relation: "clone" as const,
      factor: inc.factor,
      snapshotUnitCost: resolveAnalysisUnitCost(calcItems, inc.sourceBoqCode).unitCost,
      snapshotLines: copyLines(mat.lines),
    };
  });
  return { lines: copyLines(source.lines), includes };
}

export function canLinkAnalysis(project: LoadedProject, hostCode: string, sourceCode: string): boolean {
  const host = findItemByKey(project.items, hostCode);
  const source = findItemByKey(project.items, sourceCode);
  if (!host || !source) return false;
  return !wouldCreateCycle(toCalcItems(project), itemKeyOf(host), itemKeyOf(source));
}

export function linkWholeAnalysis(project: LoadedProject, hostCode: string, sourceCode: string): LoadedProject {
  if (!canLinkAnalysis(project, hostCode, sourceCode)) return project;
  const source = findItemByKey(project.items, sourceCode);
  if (!source) return project;
  return {
    ...project,
    items: mapItem(project.items, hostCode, (i) => ({
      ...i,
      priceMode: "analysis",
      analysisOrigin: "link",
      linkedBoqCode: itemKeyOf(source),
    })),
  };
}

export function cloneWholeAnalysis(project: LoadedProject, hostCode: string, sourceCode: string): LoadedProject {
  const source = findItemByKey(project.items, sourceCode);
  const host = findItemByKey(project.items, hostCode);
  if (!source || !host || host.kind !== "item" || source.kind !== "item") return project;
  const mat = materializeAnalysis(source, project.items);
  const snapshotCost = resolveAnalysisUnitCost(toCalcItems(project), itemKeyOf(source)).unitCost;
  const hasBuild = mat.lines.length > 0 || mat.includes.length > 0;
  return {
    ...project,
    items: mapItem(project.items, hostCode, (i) => ({
      ...i,
      priceMode: hasBuild ? ("analysis" as const) : ("direct" as const),
      analysisOrigin: "clone" as const,
      linkedBoqCode: null,
      lines: hasBuild ? mat.lines : [],
      includes: mat.includes,
      directCost: hasBuild ? i.directCost : snapshotCost,
    })),
  };
}

export function newBlankAnalysis(project: LoadedProject, hostCode: string): LoadedProject {
  return {
    ...project,
    items: mapItem(project.items, hostCode, (i) => ({
      ...i,
      priceMode: "analysis" as const,
      analysisOrigin: "own" as const,
      linkedBoqCode: null,
      includes: [],
      lines: [],
    })),
  };
}

export function addAnalysisInclude(
  project: LoadedProject,
  hostCode: string,
  sourceCode: string,
  relation: "link" | "clone",
  factor = 1,
): LoadedProject {
  if (relation === "link" && !canLinkAnalysis(project, hostCode, sourceCode)) return project;
  const source = findItemByKey(project.items, sourceCode);
  if (!source || source.kind !== "item") return project;
  const calc = toCalcItems(project);
  const sourceKey = itemKeyOf(source);
  const include: AnalysisInclude =
    relation === "clone"
      ? {
          id: newId("inc"),
          sourceBoqCode: sourceKey,
          relation: "clone",
          factor,
          snapshotUnitCost: resolveAnalysisUnitCost(calc, sourceKey).unitCost,
          snapshotLines: copyLines(materializeAnalysis(source, project.items).lines),
        }
      : { id: newId("inc"), sourceBoqCode: sourceKey, relation: "link", factor };
  return {
    ...project,
    items: mapItem(project.items, hostCode, (i) => ({
      ...i,
      priceMode: "analysis" as const,
      analysisOrigin: i.analysisOrigin === "link" ? "own" : (i.analysisOrigin ?? "own"),
      linkedBoqCode: i.analysisOrigin === "link" ? null : i.linkedBoqCode,
      includes: [...(i.includes ?? []), include],
    })),
  };
}

export function removeAnalysisInclude(project: LoadedProject, hostCode: string, includeId: string): LoadedProject {
  return {
    ...project,
    items: mapItem(project.items, hostCode, (i) => ({
      ...i,
      includes: (i.includes ?? []).filter((inc) => inc.id !== includeId),
    })),
  };
}

function backupLumpLine(item: WorkingItem, rate: number): AnalysisLine {
  return {
    factors: [1, null, null, null, null, null],
    wastagePct: 0,
    resourceRate: rate,
    description: item.description || "Subcontract backup",
    projectResourceCode: null,
    unit: item.unit,
  };
}

/** Quoted items keep an analysis so others can link or clone them. */
export function ensureQuoteBackups(project: LoadedProject): LoadedProject {
  const selected = project.itemQuotes.filter((q) => q.selected);
  if (selected.length === 0) return project;
  return {
    ...project,
    items: project.items.map((item) => {
      if (item.kind !== "item") return item;
      const quote = selected.find((q) => quoteMatchesItem(q, item));
      if (!quote || hasAnalysisBackup(item)) return item;
      return {
        ...item,
        priceMode: item.priceMode ?? "analysis",
        analysisOrigin: item.analysisOrigin ?? "own",
        lines: [backupLumpLine(item, quote.rate)],
      };
    }),
  };
}

export function withResults(project: LoadedProject): LoadedProject {
  let posted = applyQtoPosting(ensureProjectBills(project));
  posted = {
    ...posted,
    items: posted.items.map((i) =>
      i.kind === "item" && !billSourceLocked(posted, i.billId) ? { ...i, clientQty: i.ourQty } : i,
    ),
  };
  if (usesWorkingAsSource(posted)) {
    const lockedNodes = posted.clientNodes.filter(
      (n) => n.kind !== "title" && n.billId && billSourceLocked(posted, n.billId),
    );
    const unlocked = posted.items.filter((i) => !billSourceLocked(posted, i.billId));
    const rebuilt = workingAsClientNodes(unlocked);
    const title =
      posted.clientNodes.find((n) => n.kind === "title") ??
      ({ row: 1, kind: "title", description: posted.name } as ClientNode);
    const clientNodes = [title, ...lockedNodes, ...rebuilt.filter((n) => n.kind !== "title")].map((n, i) => ({
      ...n,
      row: i + 1,
    }));
    posted = { ...posted, clientNodes };
  }
  posted = syncResourcesFromAnalysis(posted);
  posted = ensureQuoteBackups(posted);
  const quotedItems = new Set(
    posted.itemQuotes.filter((q) => q.selected).map((q) => q.boqCode.toLowerCase()),
  );
  const calcItems = toCalcItems(posted);
  const workingBy = new Map(
    posted.items.filter((i) => i.kind === "item").map((i) => [itemKeyOf(i).toLowerCase(), i]),
  );
  const groups = new Map<string, { stack: typeof posted.margin; items: typeof calcItems }>();
  for (const it of calcItems) {
    const working = workingBy.get((it.itemKey ?? it.boqCode).toLowerCase());
    const stack = working ? effectiveMargin(posted, working) : posted.margin;
    const key = marginStackKey(stack);
    let group = groups.get(key);
    if (!group) {
      group = { stack, items: [] };
      groups.set(key, group);
    }
    group.items.push(it);
  }
  const computedItems = [...groups.values()].flatMap((g) => computeProject({ margin: g.stack, items: g.items }).items);
  const byKey = new Map(computedItems.map((r) => [(r.itemKey ?? r.boqCode).toLowerCase(), r]));
  const items: WorkingItem[] = posted.items.map((i) => ({
    ...i,
    result: i.kind === "item" ? byKey.get(itemKeyOf(i).toLowerCase()) ?? byKey.get(i.boqCode.toLowerCase()) : undefined,
  }));
  const roll = rollupResourceTotals(
    items
      .filter(
        (i) =>
          i.kind === "item" &&
          contributesResources(i.carryMode) &&
          !quotedItems.has(itemKeyOf(i).toLowerCase()) &&
          !quotedItems.has(i.boqCode.toLowerCase()),
      )
      .map((i) => ({ ourQty: i.ourQty, lines: i.lines })),
  );
  return {
    ...posted,
    items,
    resources: posted.resources.map((r) => {
      const got = roll.get(r.project_code);
      return {
        ...r,
        total_qty: got?.totalQty ?? 0,
        total_amount: got?.totalAmount ?? 0,
      };
    }),
  };
}

export function applyResourceRate(
  project: LoadedProject,
  code: string,
  rate: number,
  source: "quote" | "manual",
): LoadedProject {
  return {
    ...project,
    resources: project.resources.map((r) =>
      r.project_code === code ? { ...r, project_rate: rate, rate_source: source } : r,
    ),
    items: project.items.map((i) => ({
      ...i,
      lines: i.lines.map((l) =>
        l.projectResourceCode === code ? { ...l, resourceRate: rate } : l,
      ),
    })),
  };
}

export function deselectResourceQuotes(project: LoadedProject, code: string): LoadedProject {
  return {
    ...project,
    resourceQuotes: project.resourceQuotes.map((q) =>
      q.projectResourceCode === code ? { ...q, selected: false } : q,
    ),
  };
}

/** Selected material/labour quotes own the project rate (and analysis lines). */
export function applySelectedResourceQuotes(project: LoadedProject): LoadedProject {
  const picked = new Map<string, number>();
  for (const q of project.resourceQuotes) {
    if (q.selected) picked.set(q.projectResourceCode, q.rate);
  }
  let next = project;
  for (const [code, rate] of picked) {
    next = applyResourceRate(next, code, rate, "quote");
  }
  return next;
}

export function selectedItemQuoteRate(project: LoadedProject, boqCode: string): number | undefined {
  const item = findItemByKey(project.items, boqCode);
  const q = item
    ? project.itemQuotes.find((x) => quoteMatchesItem(x, item) && x.selected)
    : project.itemQuotes.find((x) => x.boqCode.toLowerCase() === boqCode.toLowerCase() && x.selected);
  return q ? q.rate : undefined;
}

export const SUBCONTRACT_CATEGORY = "Sub-contract";

export function subcontractItems(project: LoadedProject): Array<{
  boqCode: string;
  description: string;
  vendorName: string;
  amount: number;
}> {
  const rows: Array<{ boqCode: string; description: string; vendorName: string; amount: number }> = [];
  for (const item of project.items) {
    if (item.kind !== "item") continue;
    const quote = project.itemQuotes.find((q) => quoteMatchesItem(q, item) && q.selected);
    if (!quote) continue;
    rows.push({
      boqCode: itemKeyOf(item),
      description: item.description,
      vendorName: quote.vendorName,
      amount: item.result?.costAmount ?? quote.rate * item.ourQty,
    });
  }
  return rows;
}

export function costByCategory(project: LoadedProject, billId?: string | null): Array<[string, number]> {
  return costCategoryTree(project, billId).map((n) => [n.label, n.amount]);
}

export type CostLeaf = { code: string; name: string; amount: number };
export type CostCatNode = {
  key: string;
  label: string;
  amount: number;
  children: CostCatNode[];
  leaves: CostLeaf[];
};

function labelOf(value: string | null | undefined, fallback = "Uncategorised"): string {
  const t = (value ?? "").trim();
  return t || fallback;
}

/** Resource cost tree: category → main category (type) → sub-category, scoped to one BOQ or the whole job. */
export function costCategoryTree(project: LoadedProject, billId?: string | null): CostCatNode[] {
  const items = project.items.filter((i) => i.kind === "item" && (!billId || i.billId === billId));
  const resBy = new Map(project.resources.map((r) => [r.project_code, r]));
  type Bucket = { amount: number; leaves: Map<string, CostLeaf> };
  const buckets = new Map<string, Bucket>();

  function add(cat: string, main: string, sub: string, leaf: CostLeaf) {
    if (!leaf.amount) return;
    const key = `${cat}\0${main}\0${sub}`;
    let b = buckets.get(key);
    if (!b) {
      b = { amount: 0, leaves: new Map() };
      buckets.set(key, b);
    }
    b.amount += leaf.amount;
    const prev = b.leaves.get(leaf.code);
    if (prev) prev.amount += leaf.amount;
    else b.leaves.set(leaf.code, { ...leaf });
  }

  for (const item of items) {
    if (!contributesResources(item.carryMode)) continue;
    const quoted = project.itemQuotes.find((q) => quoteMatchesItem(q, item) && q.selected);
    if (quoted) {
      add(
        SUBCONTRACT_CATEGORY,
        labelOf(item.workCategory, "BOQ"),
        labelOf(item.boqCategory, item.boqCode),
        {
          code: itemKeyOf(item),
          name: quoted.vendorName ? `${item.description} · ${quoted.vendorName}` : item.description,
          amount: item.result?.costAmount ?? quoted.rate * item.ourQty,
        },
      );
      continue;
    }
    const lines =
      (item.analysisOrigin ?? "own") === "link"
        ? materializeAnalysis(item, project.items).lines
        : item.lines;
    if (!lines.length) {
      const amt = item.result?.costAmount ?? 0;
      if (!amt) continue;
      add("Uncategorised", labelOf(item.workCategory, "Direct"), labelOf(item.boqCategory, item.boqCode), {
        code: itemKeyOf(item),
        name: item.description,
        amount: amt,
      });
      continue;
    }
    for (const line of lines) {
      const built = composeResourceLine(line, item.ourQty);
      if (!built.totalAmount) continue;
      const rec = line.projectResourceCode ? resBy.get(line.projectResourceCode) : undefined;
      add(
        labelOf(rec?.category),
        labelOf(rec?.type),
        labelOf(rec?.sub_type, rec?.description ?? "Uncategorised"),
        {
          code: rec?.project_code || line.projectResourceCode || `${itemKeyOf(item)}:${line.description ?? "line"}`,
          name: rec?.description || line.description || "Resource",
          amount: built.totalAmount,
        },
      );
    }
  }

  const cats = new Map<string, CostCatNode>();
  for (const [key, bucket] of buckets) {
    const [cat, main, sub] = key.split("\0") as [string, string, string];
    let catNode = cats.get(cat);
    if (!catNode) {
      catNode = { key: cat, label: cat, amount: 0, children: [], leaves: [] };
      cats.set(cat, catNode);
    }
    let mainNode = catNode.children.find((c) => c.key === `${cat}\0${main}`);
    if (!mainNode) {
      mainNode = { key: `${cat}\0${main}`, label: main, amount: 0, children: [], leaves: [] };
      catNode.children.push(mainNode);
    }
    const subNode: CostCatNode = {
      key,
      label: sub,
      amount: bucket.amount,
      children: [],
      leaves: [...bucket.leaves.values()].sort((a, b) => b.amount - a.amount),
    };
    mainNode.children.push(subNode);
    mainNode.amount += bucket.amount;
    catNode.amount += bucket.amount;
  }

  const sortNodes = (nodes: CostCatNode[]) => {
    nodes.sort((a, b) => b.amount - a.amount);
    for (const n of nodes) sortNodes(n.children);
  };
  const out = [...cats.values()];
  sortNodes(out);
  return out;
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function push(
  conflicts: ConflictItem[],
  field: string,
  boqCode: string,
  local: string,
  replica: string,
) {
  conflicts.push({ id: uid("cf"), field, boqCode, local, replica });
}

/** Hard conflicts only — cost, rates, quotes, QTO qty, margin. Never silent-merge money. */
export function diffReplica(local: LoadedProject, replica: LoadedProject): ConflictItem[] {
  const conflicts: ConflictItem[] = [];
  if (
    !moneyClose(totalMarginPct(local.margin), totalMarginPct(replica.margin)) ||
    local.margin.overheadPct !== replica.margin.overheadPct ||
    local.margin.profitPct !== replica.margin.profitPct ||
    local.margin.logisticsPct !== replica.margin.logisticsPct ||
    local.margin.contingencyPct !== replica.margin.contingencyPct ||
    JSON.stringify(local.marginRules ?? []) !== JSON.stringify(replica.marginRules ?? []) ||
    JSON.stringify(local.marginPresets ?? []) !== JSON.stringify(replica.marginPresets ?? [])
  ) {
    push(
      conflicts,
      "margin",
      "*",
      `${totalMarginPct(local.margin)}`,
      `${totalMarginPct(replica.margin)}`,
    );
  }

  const otherItems = new Map(
    replica.items.filter((i) => i.kind === "item").map((i) => [itemKeyOf(i).toLowerCase(), i]),
  );
  for (const item of local.items.filter((i) => i.kind === "item")) {
    const r = otherItems.get(itemKeyOf(item).toLowerCase());
    if (!r) continue;
    const code = itemKeyOf(item);
    if (item.ourQty !== r.ourQty) {
      push(conflicts, "ourQty", code, String(item.ourQty), String(r.ourQty));
    }
    const lc = item.result?.unitCost ?? item.directCost ?? 0;
    const rc = r.result?.unitCost ?? r.directCost ?? 0;
    if (!moneyClose(lc, rc)) {
      push(conflicts, "cost", code, String(lc), String(rc));
    }
    const lr = item.result?.rate ?? 0;
    const rr = r.result?.rate ?? 0;
    if (!moneyClose(lr, rr)) {
      push(conflicts, "rate", code, String(lr), String(rr));
    }
    const originL = `${item.priceMode ?? ""}:${item.analysisOrigin ?? "own"}:${item.linkedBoqCode ?? ""}:${JSON.stringify(item.includes ?? [])}`;
    const originR = `${r.priceMode ?? ""}:${r.analysisOrigin ?? "own"}:${r.linkedBoqCode ?? ""}:${JSON.stringify(r.includes ?? [])}`;
    if (originL !== originR) {
      push(conflicts, "analysis", code, item.analysisOrigin ?? "own", r.analysisOrigin ?? "own");
    }
  }

  const otherRes = new Map(replica.resources.map((r) => [r.project_code, r]));
  for (const res of local.resources) {
    const r = otherRes.get(res.project_code);
    if (!r) continue;
    if (!moneyClose(res.project_rate ?? 0, r.project_rate ?? 0)) {
      push(
        conflicts,
        "resourceRate",
        res.project_code,
        String(res.project_rate ?? 0),
        String(r.project_rate ?? 0),
      );
    }
  }

  const quoteKey = (q: { projectResourceCode?: string; boqCode?: string; vendorName: string }) =>
    `${q.projectResourceCode ?? q.boqCode ?? ""}:${q.vendorName}`;
  const otherRq = new Map(replica.resourceQuotes.map((q) => [quoteKey(q), q]));
  for (const q of local.resourceQuotes) {
    const r = otherRq.get(quoteKey(q));
    if (!r) continue;
    if (
      !moneyClose(q.rate, r.rate) ||
      q.selected !== r.selected ||
      (q.validUntil ?? "") !== (r.validUntil ?? "") ||
      (q.paymentTerms ?? "") !== (r.paymentTerms ?? "")
    ) {
      push(conflicts, "resourceQuote", q.projectResourceCode, String(q.rate), String(r.rate));
    }
  }
  const otherIq = new Map(replica.itemQuotes.map((q) => [quoteKey(q), q]));
  for (const q of local.itemQuotes) {
    const r = otherIq.get(quoteKey(q));
    if (!r) continue;
    if (
      !moneyClose(q.rate, r.rate) ||
      q.selected !== r.selected ||
      (q.validUntil ?? "") !== (r.validUntil ?? "") ||
      (q.paymentTerms ?? "") !== (r.paymentTerms ?? "")
    ) {
      push(conflicts, "itemQuote", q.boqCode, String(q.rate), String(r.rate));
    }
  }

  if (JSON.stringify(local.enquiries ?? []) !== JSON.stringify(replica.enquiries ?? [])) {
    push(conflicts, "enquiry", "*", String((local.enquiries ?? []).length), String((replica.enquiries ?? []).length));
  }
  if (JSON.stringify(local.quoteReplies ?? []) !== JSON.stringify(replica.quoteReplies ?? [])) {
    push(
      conflicts,
      "quoteReply",
      "*",
      String((local.quoteReplies ?? []).length),
      String((replica.quoteReplies ?? []).length),
    );
  }
  if (JSON.stringify(local.quoteFieldDefs ?? []) !== JSON.stringify(replica.quoteFieldDefs ?? [])) {
    push(
      conflicts,
      "quoteField",
      "*",
      String((local.quoteFieldDefs ?? []).length),
      String((replica.quoteFieldDefs ?? []).length),
    );
  }
  if (JSON.stringify(local.queryItems ?? []) !== JSON.stringify(replica.queryItems ?? [])) {
    push(conflicts, "tenderQuery", "*", String((local.queryItems ?? []).length), String((replica.queryItems ?? []).length));
  }
  if (JSON.stringify(local.queryLists ?? []) !== JSON.stringify(replica.queryLists ?? [])) {
    push(conflicts, "tenderQueryList", "*", String((local.queryLists ?? []).length), String((replica.queryLists ?? []).length));
  }

  return conflicts;
}

export function applyReplicaPick(
  project: LoadedProject,
  replica: LoadedProject,
  row: ConflictItem,
): LoadedProject {
  if (row.field === "margin") {
    return {
      ...project,
      margin: replica.margin,
      marginRules: replica.marginRules ?? [],
      marginPresets: replica.marginPresets ?? [],
    };
  }
  if (row.field === "resourceRate") {
    return applyResourceRate(project, row.boqCode, Number(row.replica) || 0, "manual");
  }
  if (row.field === "resourceQuote") {
    return {
      ...project,
      resourceQuotes: replica.resourceQuotes.filter((q) => q.projectResourceCode === row.boqCode).length
        ? replica.resourceQuotes.map((q) => {
            const local = project.resourceQuotes.find(
              (x) => x.projectResourceCode === q.projectResourceCode && x.vendorName === q.vendorName,
            );
            return local
              ? {
                  ...local,
                  rate: q.rate,
                  selected: q.selected,
                  validUntil: q.validUntil,
                  paymentTerms: q.paymentTerms,
                  quotedQty: q.quotedQty,
                  remarks: q.remarks,
                  lineFields: q.lineFields,
                }
              : q;
          })
        : project.resourceQuotes,
    };
  }
  if (row.field === "itemQuote") {
    return {
      ...project,
      itemQuotes: project.itemQuotes.map((q) => {
        const r = replica.itemQuotes.find((x) => x.boqCode === q.boqCode && x.vendorName === q.vendorName);
        return r ? { ...q, ...r, id: q.id } : q;
      }),
    };
  }
  if (row.field === "enquiry") {
    return { ...project, enquiries: replica.enquiries ?? [] };
  }
  if (row.field === "quoteReply") {
    return { ...project, quoteReplies: replica.quoteReplies ?? [] };
  }
  if (row.field === "quoteField") {
    return { ...project, quoteFieldDefs: replica.quoteFieldDefs ?? [] };
  }
  if (row.field === "tenderQuery") {
    return { ...project, queryItems: replica.queryItems ?? [] };
  }
  if (row.field === "tenderQueryList") {
    return { ...project, queryLists: replica.queryLists ?? [] };
  }
  const other = findItemByKey(replica.items, row.boqCode);
  if (!other) return project;
  if (row.field === "ourQty") {
    const hasLine = project.qtoLines.some((l) => l.workingBoqCode === row.boqCode || l.workingBoqCode === other.boqCode);
    const qto = hasLine
      ? project.qtoLines.map((l) =>
          l.workingBoqCode === row.boqCode || l.workingBoqCode === other.boqCode
            ? { ...l, formulaKey: "qty" as const, dims: { l: other.ourQty } }
            : l,
        )
      : [
          ...project.qtoLines,
          {
            id: uid("qto"),
            billId: other.billId,
            workCategory: other.workCategory,
            drawing: null,
            locationDesc: null,
            itemLabel: other.description,
            subItem: null,
            formulaKey: "qty" as const,
            dims: { l: other.ourQty },
            workingBoqCode: itemKeyOf(other),
          },
        ];
    return { ...project, qtoLines: qto };
  }
  return {
    ...project,
    items: mapItem(project.items, row.boqCode, (i) => ({
      ...i,
      lines: other.lines,
      directCost: other.directCost,
      priceMode: other.priceMode,
      analysisOrigin: other.analysisOrigin,
      linkedBoqCode: other.linkedBoqCode,
      includes: other.includes ?? [],
    })),
  };
}
