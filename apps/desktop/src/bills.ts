import type { ClientNode, LoadedProject, ProjectBill, WorkingItem } from "./model";
import { newId } from "./model";

export const ITEM_KEY_SEP = "::";
export const DEFAULT_BILL_ID = "bill-1";

export function makeItemKey(billId: string, boqCode: string): string {
  return `${billId}${ITEM_KEY_SEP}${boqCode}`;
}

export function itemKeyOf(item: { billId: string; boqCode: string }): string {
  return makeItemKey(item.billId, item.boqCode);
}

export function isItemKey(key: string): boolean {
  return key.includes(ITEM_KEY_SEP);
}

export function parseItemKey(key: string, fallbackBillId = DEFAULT_BILL_ID): { billId: string; boqCode: string } {
  const i = key.indexOf(ITEM_KEY_SEP);
  if (i <= 0) return { billId: fallbackBillId, boqCode: key };
  return { billId: key.slice(0, i), boqCode: key.slice(i + ITEM_KEY_SEP.length) };
}

export function coerceItemKey(key: string | null | undefined, billId: string): string | null {
  if (!key) return null;
  if (isItemKey(key)) return key;
  return makeItemKey(billId, key);
}

export function defaultBill(name = "BOQ 1", sourceLockedAt: string | null = null, id = DEFAULT_BILL_ID): ProjectBill {
  return {
    id,
    number: 1,
    code: "1",
    name: name.trim() || "BOQ 1",
    issuedRef: "",
    sourceLockedAt,
  };
}

export function nextBill(project: LoadedProject, name: string, issuedRef = ""): ProjectBill {
  const bills = sortedBills(project);
  const n = bills.reduce((m, b) => Math.max(m, b.number), 0) + 1;
  return {
    id: newId("bill"),
    number: n,
    code: String(n),
    name: name.trim() || `BOQ ${n}`,
    issuedRef,
    sourceLockedAt: null,
  };
}

export function sortedBills(project: Pick<LoadedProject, "bills">): ProjectBill[] {
  return [...(project.bills ?? [])].sort((a, b) => a.number - b.number || a.code.localeCompare(b.code));
}

export function billById(project: Pick<LoadedProject, "bills">, billId: string | null | undefined): ProjectBill | undefined {
  if (!billId) return undefined;
  return (project.bills ?? []).find((b) => b.id === billId);
}

export function itemsInBill(items: WorkingItem[], billId: string | null | undefined): WorkingItem[] {
  if (!billId) return items;
  return items.filter((i) => i.billId === billId);
}

export function findItemByKey(items: WorkingItem[], key: string | null | undefined): WorkingItem | undefined {
  if (!key) return undefined;
  const exact = items.find((i) => itemKeyOf(i) === key);
  if (exact) return exact;
  if (isItemKey(key)) {
    const { billId, boqCode } = parseItemKey(key);
    return items.find((i) => i.billId === billId && i.boqCode.toLowerCase() === boqCode.toLowerCase());
  }
  const matches = items.filter((i) => i.boqCode.toLowerCase() === key.toLowerCase());
  return matches.length === 1 ? matches[0] : matches[0];
}

export function sameItemKey(item: { billId: string; boqCode: string }, key: string | null | undefined): boolean {
  if (!key) return false;
  if (itemKeyOf(item) === key) return true;
  if (!isItemKey(key) && item.boqCode.toLowerCase() === key.toLowerCase()) return true;
  return false;
}

export function billTotal(items: WorkingItem[], billId: string): number {
  return items
    .filter((i) => i.kind === "item" && i.billId === billId)
    .reduce((s, i) => s + (i.result?.amount ?? 0), 0);
}

export function projectGrand(items: WorkingItem[]): number {
  return items.filter((i) => i.kind === "item").reduce((s, i) => s + (i.result?.amount ?? 0), 0);
}

export function billSourceLocked(project: LoadedProject, billId: string): boolean {
  const bill = billById(project, billId);
  if (bill) return Boolean(bill.sourceLockedAt);
  return Boolean(project.sourceLockedAt);
}

export function usesWorkingAsSource(project: LoadedProject, billId?: string): boolean {
  if (billId) return !billSourceLocked(project, billId);
  const bills = project.bills ?? [];
  if (!bills.length) return !project.sourceLockedAt;
  return bills.some((b) => !b.sourceLockedAt);
}

export function displayItemRef(project: Pick<LoadedProject, "bills" | "items">, key: string | null | undefined): string {
  if (!key) return "";
  const item = findItemByKey(project.items, key);
  if (!item) {
    const parsed = parseItemKey(key);
    return parsed.boqCode;
  }
  const multi = (project.bills?.length ?? 0) > 1;
  if (!multi) return item.boqCode;
  const bill = billById(project, item.billId);
  return [bill?.code || bill?.name, item.boqCode].filter(Boolean).join(" · ");
}

export function quoteMatchesItem(quote: { boqCode: string; billId?: string }, item: WorkingItem): boolean {
  if (quote.billId && quote.billId !== item.billId) {
    return sameItemKey(item, quote.boqCode);
  }
  return sameItemKey(item, quote.boqCode);
}

function coerceLink(key: string | null | undefined, billId: string): string | null {
  return coerceItemKey(key, billId);
}

export function ensureProjectBills(project: LoadedProject): LoadedProject {
  const bills = project.bills?.length
    ? sortedBills(project)
    : [defaultBill(project.name || "BOQ 1", project.sourceLockedAt)];
  const fallback = bills[0]!.id;

  const items = project.items.map((item) => {
    const billId = item.billId || fallback;
    return {
      ...item,
      billId,
      linkedBoqCode: coerceLink(item.linkedBoqCode, billId),
      includes: (item.includes ?? []).map((inc) => ({
        ...inc,
        sourceBoqCode: coerceItemKey(inc.sourceBoqCode, billId) ?? inc.sourceBoqCode,
      })),
    };
  });

  const qtoLines = project.qtoLines.map((line) => {
    const coerced = coerceItemKey(line.workingBoqCode, fallback);
    if (!line.workingBoqCode || !coerced) return { ...line, billId: line.billId || fallback };
    const found = findItemByKey(items, coerced) ?? findItemByKey(items, line.workingBoqCode);
    const billId = found?.billId || line.billId || fallback;
    return {
      ...line,
      billId,
      workingBoqCode: found ? itemKeyOf(found) : coerced,
    };
  });

  const itemQuotes = project.itemQuotes.map((q) => {
    const key = coerceItemKey(q.boqCode, q.billId || fallback) ?? q.boqCode;
    const found = findItemByKey(items, key);
    return {
      ...q,
      billId: found?.billId || q.billId || fallback,
      boqCode: found ? itemKeyOf(found) : key,
    };
  });

  const clientNodes: ClientNode[] = project.clientNodes.map((n) => ({
    ...n,
    billId: n.billId || fallback,
    boqCode: n.boqCode ? coerceItemKey(n.boqCode, n.billId || fallback) ?? n.boqCode : n.boqCode,
  }));

  const enquiries = (project.enquiries ?? []).map((pack) => ({
    ...pack,
    lines: pack.lines.map((line) => {
      if (line.targetKind !== "boq") return line;
      const key = coerceItemKey(line.targetCode, fallback) ?? line.targetCode;
      const found = findItemByKey(items, key);
      return { ...line, targetCode: found ? itemKeyOf(found) : key };
    }),
  }));

  const sourceLockedAt = bills.every((b) => b.sourceLockedAt)
    ? bills[0]!.sourceLockedAt
    : bills.length === 1
      ? bills[0]!.sourceLockedAt
      : null;

  return {
    ...project,
    bills,
    items,
    qtoLines,
    itemQuotes,
    clientNodes,
    enquiries,
    sourceLockedAt,
  };
}

export function visibleItems(project: LoadedProject, billId: string | null): WorkingItem[] {
  return billId ? itemsInBill(project.items, billId) : project.items;
}

/** Left BOQ rail: a bill id is that BOQ; null (All BOQs) is the whole job. */
export function billIdsFromFocus(billFocus: string | null): string[] | "all" {
  return billFocus ? [billFocus] : "all";
}

export type WorkingQtyRow = {
  kind: "section" | "item";
  key: string;
  code: string;
  description: string;
  unit: string;
  twins: Array<WorkingItem | null>;
  qtyByBill: Array<number | null>;
  ourByBill: Array<number | null>;
  totalQty: number;
};

/** Fold colliding issued codes into one row with a qty column per BOQ. */
export function pivotWorkingByBoq(items: WorkingItem[], bills: ProjectBill[]): WorkingQtyRow[] {
  const index = new Map(bills.map((b, i) => [b.id, i]));
  const n = bills.length;
  const empty = (): Array<number | null> => Array.from({ length: n }, () => null);
  const emptyTwins = (): Array<WorkingItem | null> => Array.from({ length: n }, () => null);
  const sectionOrder: string[] = [];
  const sections = new Map<string, { code: string; description: string; itemKeys: string[] }>();
  const byCode = new Map<string, WorkingQtyRow>();
  let current = "";

  function ensureSection(item: WorkingItem): string {
    const key = (item.boqCode || item.slNo || item.description).trim().toLowerCase() || "bill";
    if (!sections.has(key)) {
      sectionOrder.push(key);
      sections.set(key, { code: item.boqCode || item.slNo, description: item.description, itemKeys: [] });
    }
    return key;
  }

  for (const item of items) {
    const bi = index.get(item.billId);
    if (item.kind === "section") {
      current = ensureSection(item);
      continue;
    }
    if (item.kind !== "item") continue;
    const sk = current || ensureSection({ ...item, kind: "section", boqCode: "", description: "Bill" });
    const code = (item.boqCode || "").trim().toLowerCase() || item.description.toLowerCase();
    let row = byCode.get(code);
    if (!row) {
      row = {
        kind: "item",
        key: code,
        code: item.boqCode,
        description: item.description,
        unit: item.unit ?? "",
        twins: emptyTwins(),
        qtyByBill: empty(),
        ourByBill: empty(),
        totalQty: 0,
      };
      byCode.set(code, row);
      sections.get(sk)?.itemKeys.push(code);
    }
    if (bi == null) continue;
    row.twins[bi] = item;
    row.qtyByBill[bi] = item.clientQty;
    row.ourByBill[bi] = item.ourQty;
    row.unit = row.unit || (item.unit ?? "");
    if (!row.description) row.description = item.description;
  }

  const out: WorkingQtyRow[] = [];
  for (const sk of sectionOrder) {
    const sec = sections.get(sk);
    if (!sec) continue;
    out.push({
      kind: "section",
      key: `sec-${sk}`,
      code: sec.code,
      description: sec.description,
      unit: "",
      twins: emptyTwins(),
      qtyByBill: empty(),
      ourByBill: empty(),
      totalQty: 0,
    });
    for (const ik of sec.itemKeys) {
      const row = byCode.get(ik);
      if (!row) continue;
      row.totalQty = row.qtyByBill.reduce<number>((s, q) => s + (q ?? 0), 0);
      out.push(row);
    }
  }
  return out;
}

export function primaryWorkingTwin(row: WorkingQtyRow, selected?: string | null): WorkingItem | null {
  if (selected) {
    const hit = row.twins.find((t) => t && itemKeyOf(t) === selected);
    if (hit) return hit;
  }
  return row.twins.find((t) => t) ?? null;
}
