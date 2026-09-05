import { formatQty, parseSignedNumber } from "@aerolith/shared";
import { contributesResources, rollupResourceTotals } from "@aerolith/calc";
import type {
  EnquiryLine,
  EnquiryPack,
  ItemQuote,
  LoadedProject,
  ProjectResource,
  QuoteFieldDef,
  QuoteReply,
  ResourceQuote,
  WorkingItem,
} from "./model";
import { BUILTIN_QUOTE_FIELDS } from "./model";
import { applyResourceRate, applySelectedResourceQuotes, deselectResourceQuotes, uid } from "./projectCompute";
import {
  billById,
  findItemByKey,
  itemKeyOf,
  itemsInBill,
  quoteMatchesItem,
} from "./bills";

export type BuyStage = "package" | "send" | "receive" | "compare";

export type SummarySendStatus = "none" | "draft" | "sent";

export interface ResourceSummaryRow {
  kind: "resource" | "boq";
  code: string;
  description: string;
  unit: string | null;
  type: string | null;
  subType: string | null;
  qty: number;
  price: number;
  amount: number;
  source: ProjectResource["rate_source"] | "quote" | null;
  packCount: number;
  packedQty: number;
  send: SummarySendStatus;
  receiveMin: number | null;
  receiveMax: number | null;
  receiveCount: number;
  receiveQuoteId: string | null;
  compareRate: number | null;
  compareVendor: string | null;
  compareQuoteId: string | null;
  laneId: string;
  laneLabel: string;
  enquiry: EnquiryChip;
  packId: string | null;
}

export type BookSource = "Analysis" | "Typed" | "Quote" | "Awarded";
export type EnquiryChip = "none" | "draft" | "sent" | "quoted" | "overdue";

export interface BuyLane {
  id: string;
  category: string;
  label: string;
  count: number;
}

export interface PackTarget {
  kind: "resource" | "boq";
  code: string;
  description: string;
  unit: string | null;
  qty: number;
  spec: string;
  type: string | null;
  subType: string | null;
  rateSource?: ProjectResource["rate_source"];
}

export const BOQ_LANE_ID = "boq:items";

export function buyLanes(project: LoadedProject): BuyLane[] {
  const counts = new Map<string, number>();
  for (const r of project.resources) {
    const cat = (r.category ?? "").trim() || "Uncategorised";
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const lanes: BuyLane[] = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, count]) => ({
      id: `res:${category}`,
      category,
      label: category,
      count,
    }));
  const boqCount = project.items.filter((i) => i.kind === "item").length;
  if (boqCount) {
    lanes.push({ id: BOQ_LANE_ID, category: "BOQ items", label: "BOQ items", count: boqCount });
  }
  return lanes;
}

export function parseLaneId(id: string): { kind: "resource" | "boq"; category: string } {
  if (id === BOQ_LANE_ID || id.startsWith("boq:")) return { kind: "boq", category: id.slice(4) || "items" };
  if (id.startsWith("res:")) return { kind: "resource", category: id.slice(4) };
  return { kind: "resource", category: id };
}

export function resourceRollupForBill(
  project: LoadedProject,
  billId: string | null,
): Map<string, { totalQty: number; totalAmount: number }> {
  const items = itemsInBill(project.items, billId).filter((i) => i.kind === "item");
  const quoted = new Set(project.itemQuotes.filter((q) => q.selected).map((q) => q.boqCode.toLowerCase()));
  return rollupResourceTotals(
    items
      .filter(
        (i) =>
          contributesResources(i.carryMode) &&
          !quoted.has(itemKeyOf(i).toLowerCase()) &&
          !quoted.has(i.boqCode.toLowerCase()),
      )
      .map((i) => ({ ourQty: i.ourQty, lines: i.lines })),
  );
}

export function laneTargets(project: LoadedProject, laneId: string, billId?: string | null): PackTarget[] {
  const { kind, category } = parseLaneId(laneId);
  if (kind === "boq") {
    return itemsInBill(project.items, billId)
      .filter((i) => i.kind === "item")
      .map((i) => {
        const bill = billById(project, i.billId);
        return {
          kind: "boq" as const,
          code: itemKeyOf(i),
          description: i.description,
          unit: i.unit,
          qty: i.ourQty,
          spec: i.description,
          type: bill?.name ?? "BOQ",
          subType: null,
        };
      });
  }
  const roll = billId ? resourceRollupForBill(project, billId) : null;
  return project.resources
    .filter((r) => ((r.category ?? "").trim() || "Uncategorised") === category)
    .map((r) => ({
      kind: "resource" as const,
      code: r.project_code,
      description: r.description ?? r.project_code,
      unit: r.unit,
      qty: roll?.get(r.project_code)?.totalQty ?? r.total_qty ?? 0,
      spec: r.description ?? "",
      type: r.type,
      subType: r.sub_type,
      rateSource: r.rate_source,
    }));
}

export function packsForLane(project: LoadedProject, laneId: string): EnquiryPack[] {
  const parsed = parseLaneId(laneId);
  if (parsed.kind === "boq") {
    return (project.enquiries ?? []).filter((p) => p.laneKind === "boq");
  }
  return (project.enquiries ?? []).filter((p) => p.laneKind === "resource" && p.category === parsed.category);
}

export function laneIdForPack(pack: EnquiryPack): string {
  if (pack.laneKind === "boq") return BOQ_LANE_ID;
  return `res:${pack.category ?? "Uncategorised"}`;
}

export function filterTargets(targets: PackTarget[], type: string, subType: string): PackTarget[] {
  return targets.filter((t) => {
    if (type && (t.type?.trim() || "Ungrouped") !== type) return false;
    if (subType && (t.subType?.trim() || "") !== subType) return false;
    return true;
  });
}

export function blankEnquiry(project: LoadedProject, laneId: string, vendorName: string, billId?: string | null): EnquiryPack {
  const parsed = parseLaneId(laneId);
  const targets = laneTargets(project, laneId, billId);
  return {
    id: uid("enq"),
    laneKind: parsed.kind,
    category: parsed.kind === "boq" ? "BOQ items" : parsed.category,
    vendorName,
    status: "draft",
    issuedAt: null,
    dueAt: null,
    notes: "",
    lines: targets.map((t) => ({
      id: uid("el"),
      targetKind: t.kind,
      targetCode: t.code,
      qty: t.qty,
      unit: t.unit,
      spec: t.spec,
      included: true,
    })),
  };
}

function targetDescription(project: LoadedProject, kind: "resource" | "boq", code: string, fallback: string): string {
  if (kind === "resource") {
    return project.resources.find((r) => r.project_code === code)?.description ?? fallback;
  }
  const item = findItemByKey(project.items, code);
  return item?.description ?? fallback;
}

export function upsertEnquiry(project: LoadedProject, pack: EnquiryPack): LoadedProject {
  const list = project.enquiries ?? [];
  const next = list.some((p) => p.id === pack.id) ? list.map((p) => (p.id === pack.id ? pack : p)) : [...list, pack];
  return { ...project, enquiries: next };
}

export function issueEnquiry(project: LoadedProject, packId: string): LoadedProject {
  return {
    ...project,
    enquiries: (project.enquiries ?? []).map((p) =>
      p.id === packId ? { ...p, status: "issued" as const, issuedAt: p.issuedAt ?? new Date().toISOString() } : p,
    ),
  };
}

export function enquiryCsv(project: LoadedProject, pack: EnquiryPack): string {
  const defs = ensureQuoteFields(project).quoteFieldDefs;
  const extra = defs.filter((d) => !d.builtin);
  const header = [
    "lane",
    "vendor",
    "kind",
    "code",
    "description",
    "unit",
    "enquiry_qty",
    "spec",
    "rate",
    "quoted_qty",
    "remarks",
    "valid_until",
    "payment_terms",
    "duration",
    ...extra.map((d) => slugField(d.label)),
  ];
  const lane = pack.category ?? "";
  const rows = pack.lines
    .filter((l) => l.included)
    .map((l) => {
      const desc = targetDescription(project, l.targetKind, l.targetCode, l.spec);
      return [
        csvCell(lane),
        csvCell(pack.vendorName),
        csvCell(l.targetKind),
        csvCell(l.targetCode),
        csvCell(desc),
        csvCell(l.unit ?? ""),
        csvCell(String(l.qty)),
        csvCell(l.spec),
        "",
        "",
        "",
        "",
        "",
        "",
        ...extra.map(() => ""),
      ].join(",");
    });
  return [header.join(","), ...rows].join("\n");
}

function slugField(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
}

export type ParsedQuoteRow = {
  vendor: string;
  kind: "resource" | "boq";
  code: string;
  rate: number;
  quotedQty: number | null;
  remarks: string;
  validUntil: string;
  paymentTerms: string;
  duration: string;
  spec: string;
  lineFields: Record<string, string>;
  headerFields: Record<string, string>;
};

export function parseQuoteCsv(text: string, fieldDefs: QuoteFieldDef[] = []): ParsedQuoteRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const cols = splitCsvLine(lines[0]!).map((c) => c.trim().toLowerCase());
  const idx = (name: string) => cols.indexOf(name);
  const extras = fieldDefs.filter((d) => !d.builtin);
  const out: ParsedQuoteRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const kindRaw = (cells[idx("kind")] ?? "resource").trim().toLowerCase();
    const kind: "resource" | "boq" = kindRaw === "boq" ? "boq" : "resource";
    const code = (cells[idx("code")] ?? "").trim();
    if (!code) continue;
    const lineFields: Record<string, string> = {};
    const headerFields: Record<string, string> = {};
    const spec = (cells[idx("spec")] ?? "").trim();
    if (spec) lineFields.spec = spec;
    for (const def of extras) {
      const i = idx(slugField(def.label));
      if (i < 0) continue;
      const v = (cells[i] ?? "").trim();
      if (!v) continue;
      if (def.scope === "header") headerFields[def.id] = v;
      else lineFields[def.id] = v;
    }
    out.push({
      vendor: (cells[idx("vendor")] ?? "").trim(),
      kind,
      code,
      rate: Number(cells[idx("rate")] ?? 0) || 0,
      quotedQty: parseSignedNumber(cells[idx("quoted_qty")] ?? ""),
      remarks: (cells[idx("remarks")] ?? "").trim(),
      validUntil: (cells[idx("valid_until")] ?? "").trim(),
      paymentTerms: (cells[idx("payment_terms")] ?? "").trim(),
      duration: (cells[idx("duration")] ?? "").trim(),
      spec,
      lineFields,
      headerFields,
    });
  }
  return out;
}

function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function downloadText(filename: string, body: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printEnquiry(project: LoadedProject, pack: EnquiryPack): void {
  const rows = pack.lines
    .filter((l) => l.included)
    .map((l) => {
      const desc = targetDescription(project, l.targetKind, l.targetCode, l.spec);
      return `<tr><td>${esc(l.targetCode)}</td><td>${esc(desc)}</td><td>${esc(l.spec)}</td><td>${esc(l.unit ?? "")}</td><td>${esc(formatQty(l.qty))}</td><td></td></tr>`;
    })
    .join("");
  const html = `<!doctype html><html><head><title>Enquiry ${esc(pack.vendorName)}</title>
    <style>body{font-family:Segoe UI,sans-serif;padding:24px;color:#1b242c}table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #d9d3c4;padding:6px 8px;text-align:left}th{background:#f3f0e8}</style></head><body>
    <h1>${esc(project.name)}</h1>
    <p>Enquiry to ${esc(pack.vendorName)} · ${esc(pack.category ?? "")}${pack.dueAt ? ` · quote due ${esc(pack.dueAt.slice(0, 10))}` : ""}</p>
    ${pack.notes ? `<p>${esc(pack.notes)}</p>` : ""}
    <p>Please return rate, quoted qty, specification, payment terms, and duration for each line.</p>
    <table><thead><tr><th>Code</th><th>Description</th><th>Specification</th><th>Unit</th><th>Qty</th><th>Rate</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

export function blankReply(project: LoadedProject, vendorName: string, enquiryId: string | null): QuoteReply {
  return {
    id: uid("qr"),
    vendorName,
    enquiryId,
    receivedAt: new Date().toISOString(),
    validUntil: null,
    paymentTerms: "",
    duration: "",
    currency: project.currency,
    headerFields: {},
  };
}

export function upsertReply(project: LoadedProject, reply: QuoteReply): LoadedProject {
  const list = project.quoteReplies ?? [];
  const next = list.some((r) => r.id === reply.id) ? list.map((r) => (r.id === reply.id ? reply : r)) : [...list, reply];
  return { ...project, quoteReplies: next };
}

export function importQuoteRows(
  project: LoadedProject,
  rows: ParsedQuoteRow[],
  reply: QuoteReply,
): LoadedProject {
  const duration = reply.duration || rows.find((r) => r.duration)?.duration || "";
  const payment = reply.paymentTerms || rows.find((r) => r.paymentTerms)?.paymentTerms || "";
  const headerFields = { ...reply.headerFields };
  for (const row of rows) Object.assign(headerFields, row.headerFields);
  let next = upsertReply(project, {
    ...reply,
    duration,
    paymentTerms: payment,
    headerFields,
    validUntil: reply.validUntil || rows.find((r) => r.validUntil)?.validUntil || null,
  });
  for (const row of rows) {
    const vendor = row.vendor || reply.vendorName;
    const extra = {
      quotedQty: row.quotedQty,
      remarks: row.remarks,
      validUntil: row.validUntil || reply.validUntil,
      paymentTerms: row.paymentTerms || payment,
      enquiryId: reply.enquiryId,
      replyId: reply.id,
      lineFields: row.lineFields,
    };
    if (row.kind === "resource") {
      next = upsertResourceQuote(next, {
        projectResourceCode: row.code,
        vendorName: vendor,
        rate: row.rate,
        ...extra,
      });
    } else {
      const item = findItemByKey(next.items, row.code);
      next = upsertItemQuote(next, {
        boqCode: item ? itemKeyOf(item) : row.code,
        billId: item?.billId,
        vendorName: vendor,
        rate: row.rate,
        ...extra,
      });
    }
  }
  return next;
}

function upsertResourceQuote(
  project: LoadedProject,
  patch: Omit<ResourceQuote, "id" | "selected"> & { selected?: boolean },
): LoadedProject {
  const existing = project.resourceQuotes.find(
    (q) => q.projectResourceCode === patch.projectResourceCode && q.vendorName === patch.vendorName,
  );
  if (existing) {
    return {
      ...project,
      resourceQuotes: project.resourceQuotes.map((q) => (q.id === existing.id ? { ...existing, ...patch } : q)),
    };
  }
  return {
    ...project,
    resourceQuotes: [
      ...project.resourceQuotes,
      { id: uid("rq"), selected: false, ...patch },
    ],
  };
}

function upsertItemQuote(
  project: LoadedProject,
  patch: Omit<ItemQuote, "id" | "selected"> & { selected?: boolean },
): LoadedProject {
  const item = findItemByKey(project.items, patch.boqCode);
  const keyed = {
    ...patch,
    boqCode: item ? itemKeyOf(item) : patch.boqCode,
    billId: patch.billId ?? item?.billId,
  };
  const existing = project.itemQuotes.find((q) => q.boqCode === keyed.boqCode && q.vendorName === keyed.vendorName);
  if (existing) {
    return {
      ...project,
      itemQuotes: project.itemQuotes.map((q) => (q.id === existing.id ? { ...existing, ...keyed } : q)),
    };
  }
  return {
    ...project,
    itemQuotes: [...project.itemQuotes, { id: uid("iq"), selected: false, ...keyed }],
  };
}

export function writeQuoteLine(
  project: LoadedProject,
  kind: "resource" | "boq",
  code: string,
  vendorName: string,
  rate: number,
  extra: Partial<ResourceQuote & ItemQuote> = {},
): LoadedProject {
  if (kind === "resource") {
    return upsertResourceQuote(project, { projectResourceCode: code, vendorName, rate, ...extra });
  }
  return upsertItemQuote(project, { boqCode: code, vendorName, rate, ...extra });
}

export function applyVendorPack(
  project: LoadedProject,
  laneId: string,
  vendorName: string,
  codes?: string[],
  forceManual = false,
): LoadedProject {
  const targets = laneTargets(project, laneId);
  const wanted = new Set(codes ?? targets.map((t) => t.code));
  let next = project;
  for (const t of targets) {
    if (!wanted.has(t.code)) continue;
    if (t.kind === "resource" && t.rateSource === "manual" && !forceManual) continue;
    if (t.kind === "resource") {
      const quote = next.resourceQuotes.find((q) => q.projectResourceCode === t.code && q.vendorName === vendorName);
      if (!quote) continue;
      const selected = next.resourceQuotes.map((q) =>
        q.projectResourceCode === t.code ? { ...q, selected: q.id === quote.id } : q,
      );
      next = applyResourceRate({ ...next, resourceQuotes: selected }, t.code, quote.rate, "quote");
    } else {
      const quote = next.itemQuotes.find((q) => q.boqCode === t.code && q.vendorName === vendorName);
      if (!quote) continue;
      next = {
        ...next,
        itemQuotes: next.itemQuotes.map((q) => (q.boqCode === t.code ? { ...q, selected: q.id === quote.id } : q)),
      };
    }
  }
  return applySelectedResourceQuotes(next);
}

export function selectLowestInLane(
  project: LoadedProject,
  laneId: string,
  forceManual = false,
  codes?: string[],
): LoadedProject {
  const wanted = codes ? new Set(codes) : null;
  const targets = laneTargets(project, laneId).filter((t) => !wanted || wanted.has(t.code));
  let next = project;
  for (const t of targets) {
    if (t.kind === "resource") {
      if (t.rateSource === "manual" && !forceManual) continue;
      const quotes = next.resourceQuotes.filter((q) => q.projectResourceCode === t.code);
      if (!quotes.length) continue;
      const best = quotes.reduce((a, b) => (a.rate <= b.rate ? a : b));
      const selected = next.resourceQuotes.map((q) =>
        q.projectResourceCode === t.code ? { ...q, selected: q.id === best.id } : q,
      );
      next = applyResourceRate({ ...next, resourceQuotes: selected }, t.code, best.rate, "quote");
    } else {
      const quotes = next.itemQuotes.filter((q) => q.boqCode === t.code);
      if (!quotes.length) continue;
      const best = quotes.reduce((a, b) => (a.rate <= b.rate ? a : b));
      next = {
        ...next,
        itemQuotes: next.itemQuotes.map((q) => (q.boqCode === t.code ? { ...q, selected: q.id === best.id } : q)),
      };
    }
  }
  return applySelectedResourceQuotes(next);
}

export function clearLineToAnalysis(project: LoadedProject, kind: "resource" | "boq", code: string): LoadedProject {
  if (kind === "resource") {
    return deselectResourceQuotes(project, code);
  }
  return {
    ...project,
    itemQuotes: project.itemQuotes.map((q) => (q.boqCode === code ? { ...q, selected: false } : q)),
  };
}

export function selectQuoteLine(
  project: LoadedProject,
  kind: "resource" | "boq",
  code: string,
  quoteId: string | null,
  forceManual = false,
): LoadedProject {
  if (!quoteId) return clearLineToAnalysis(project, kind, code);
  if (kind === "resource") {
    const res = project.resources.find((r) => r.project_code === code);
    if (res?.rate_source === "manual" && !forceManual) return project;
    const quote = project.resourceQuotes.find((q) => q.id === quoteId);
    if (!quote) return project;
    const selected = project.resourceQuotes.map((q) =>
      q.projectResourceCode === code ? { ...q, selected: q.id === quoteId } : q,
    );
    return applyResourceRate({ ...project, resourceQuotes: selected }, code, quote.rate, "quote");
  }
  return {
    ...project,
    itemQuotes: project.itemQuotes.map((q) => (q.boqCode === code ? { ...q, selected: q.id === quoteId } : q)),
  };
}

export function vendorsInLane(project: LoadedProject, laneId: string): string[] {
  const targets = new Set(laneTargets(project, laneId).map((t) => t.code));
  const names = new Set<string>();
  for (const q of project.resourceQuotes) {
    if (targets.has(q.projectResourceCode)) names.add(q.vendorName);
  }
  for (const q of project.itemQuotes) {
    if (targets.has(q.boqCode)) names.add(q.vendorName);
  }
  for (const p of packsForLane(project, laneId)) names.add(p.vendorName);
  for (const v of project.vendors) names.add(v.name);
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function quotesForTarget(
  project: LoadedProject,
  kind: "resource" | "boq",
  code: string,
): Array<ResourceQuote | ItemQuote> {
  if (kind === "resource") return project.resourceQuotes.filter((q) => q.projectResourceCode === code);
  const item = findItemByKey(project.items, code);
  return item
    ? project.itemQuotes.filter((q) => quoteMatchesItem(q, item))
    : project.itemQuotes.filter((q) => q.boqCode === code);
}

export function coverage(project: LoadedProject, laneId: string, billId?: string | null): { quoted: number; total: number; selected: number } {
  const targets = laneTargets(project, laneId, billId);
  let quoted = 0;
  let selected = 0;
  for (const t of targets) {
    const qs = quotesForTarget(project, t.kind, t.code);
    if (qs.length) quoted += 1;
    if (qs.some((q) => q.selected)) selected += 1;
  }
  return { quoted, total: targets.length, selected };
}

export function rateSpread(
  project: LoadedProject,
  kind: "resource" | "boq",
  code: string,
): { min: number | null; max: number | null; selected: number | null } {
  const qs = quotesForTarget(project, kind, code);
  if (!qs.length) return { min: null, max: null, selected: null };
  const rates = qs.map((q) => q.rate);
  return {
    min: Math.min(...rates),
    max: Math.max(...rates),
    selected: qs.find((q) => q.selected)?.rate ?? null,
  };
}

function lowestQuote(quotes: Array<ResourceQuote | ItemQuote>): ResourceQuote | ItemQuote | null {
  if (!quotes.length) return null;
  return quotes.reduce((a, b) => (a.rate <= b.rate ? a : b));
}

export function resourceSummaryRows(
  project: LoadedProject,
  laneId: string,
  billId?: string | null,
): ResourceSummaryRow[] {
  return laneTargets(project, laneId, billId).map((t) => {
    const qs = quotesForTarget(project, t.kind, t.code);
    const selected = qs.find((q) => q.selected);
    const lowest = lowestQuote(qs);
    const packs = (project.enquiries ?? []).filter((p) =>
      p.lines.some((l) => l.included && l.targetKind === t.kind && l.targetCode === t.code),
    );
    const packedQty = packs.reduce((max, p) => {
      const line = p.lines.find((l) => l.included && l.targetCode === t.code);
      return line ? Math.max(max, line.qty) : max;
    }, 0);
    const sent = packs.some((p) => p.status === "issued");
    const draft = packs.some((p) => p.status === "draft");
    const res = t.kind === "resource" ? project.resources.find((r) => r.project_code === t.code) : undefined;
    const item = t.kind === "boq" ? findItemByKey(project.items, t.code) : undefined;
    const price =
      t.kind === "resource"
        ? (res?.project_rate ?? 0)
        : (selected?.rate ?? item?.result?.unitCost ?? 0);
    const amount =
      t.kind === "resource"
        ? (res?.total_amount ?? t.qty * price)
        : (item?.result?.amount ?? t.qty * price);
    const source =
      t.kind === "resource"
        ? (res?.rate_source ?? null)
        : selected
          ? selected.vendorName === "Custom"
            ? "manual"
            : "quote"
          : null;
    const lane = buyLanes(project).find((l) => l.id === laneId);
    const laneLabel = lane?.label ?? parseLaneId(laneId).category;
    return {
      kind: t.kind,
      code: t.code,
      description: t.description,
      unit: t.unit,
      type: t.type,
      subType: t.subType,
      qty: t.qty,
      price,
      amount,
      source,
      packCount: packs.length,
      packedQty,
      send: sent ? "sent" : draft ? "draft" : "none",
      receiveMin: lowest?.rate ?? null,
      receiveMax: qs.length ? Math.max(...qs.map((q) => q.rate)) : null,
      receiveCount: qs.length,
      receiveQuoteId: lowest?.id ?? null,
      compareRate: selected?.rate ?? null,
      compareVendor: selected?.vendorName ?? null,
      compareQuoteId: selected?.id ?? null,
      laneId,
      laneLabel,
      enquiry: enquiryChipFromPacks(project, packs),
      packId: packs[0]?.id ?? null,
    };
  });
}

function enquiryChipFromPacks(project: LoadedProject, packs: EnquiryPack[]): EnquiryChip {
  if (!packs.length) return "none";
  const statuses = packs.map((p) => trackEnquiry(project, p));
  if (statuses.includes("overdue")) return "overdue";
  if (statuses.includes("quoted")) return "quoted";
  if (statuses.includes("sent")) return "sent";
  return "draft";
}

export function bookSourceOf(row: ResourceSummaryRow): BookSource {
  if (row.compareQuoteId || row.source === "quote") return "Awarded";
  if (row.source === "manual") return "Typed";
  if (row.receiveCount > 0) return "Quote";
  return "Analysis";
}

export function enquiryChipLabel(chip: EnquiryChip): string {
  if (chip === "draft") return "Draft";
  if (chip === "sent") return "Sent";
  if (chip === "quoted") return "Quoted";
  if (chip === "overdue") return "Overdue";
  return "—";
}

export function bookCoverage(
  project: LoadedProject,
  billId?: string | null,
): { total: number; quoted: number; awarded: number; analysis: number } {
  const rows = resourceSummaryAll(project, billId);
  let quoted = 0;
  let awarded = 0;
  let analysis = 0;
  for (const row of rows) {
    if (row.receiveCount > 0) quoted += 1;
    const src = bookSourceOf(row);
    if (src === "Awarded") awarded += 1;
    if (src === "Analysis") analysis += 1;
  }
  return { total: rows.length, quoted, awarded, analysis };
}

export function settleRows(project: LoadedProject, billId?: string | null): ResourceSummaryRow[] {
  return resourceSummaryAll(project, billId).filter((row) => {
    const src = bookSourceOf(row);
    return src === "Analysis" || (row.enquiry === "sent" && row.receiveCount === 0) || row.enquiry === "overdue";
  });
}

export function resourceSummaryAll(project: LoadedProject, billId?: string | null): ResourceSummaryRow[] {
  return buyLanes(project).flatMap((lane) => resourceSummaryRows(project, lane.id, billId));
}

export function coverageAll(
  project: LoadedProject,
  billId?: string | null,
): { quoted: number; total: number; selected: number } {
  return buyLanes(project).reduce(
    (acc, lane) => {
      const c = coverage(project, lane.id, billId);
      return { quoted: acc.quoted + c.quoted, total: acc.total + c.total, selected: acc.selected + c.selected };
    },
    { quoted: 0, total: 0, selected: 0 },
  );
}

export function groupSummaryRows(rows: ResourceSummaryRow[]): Array<{
  laneId: string;
  label: string;
  qty: number;
  amount: number;
  types: Array<{ key: string; label: string; rows: ResourceSummaryRow[] }>;
}> {
  const byLane = new Map<string, ResourceSummaryRow[]>();
  for (const row of rows) {
    const list = byLane.get(row.laneId) ?? [];
    list.push(row);
    byLane.set(row.laneId, list);
  }
  return [...byLane.entries()].map(([laneId, list]) => {
    const byType = new Map<string, ResourceSummaryRow[]>();
    for (const row of list) {
      const key = row.type?.trim() || "Ungrouped";
      const typeList = byType.get(key) ?? [];
      typeList.push(row);
      byType.set(key, typeList);
    }
    return {
      laneId,
      label: list[0]?.laneLabel ?? laneId,
      qty: list.reduce((s, r) => s + r.qty, 0),
      amount: list.reduce((s, r) => s + r.amount, 0),
      types: [...byType.entries()].map(([key, typeRows]) => ({ key, label: key, rows: typeRows })),
    };
  });
}

/** Typed custom rate owns the catalogue and every analysis line that uses this resource. */
export function applyCustomRate(
  project: LoadedProject,
  kind: "resource" | "boq",
  code: string,
  rate: number,
): LoadedProject {
  const n = Number.isFinite(rate) ? rate : 0;
  if (kind === "resource") {
    return applyResourceRate(deselectResourceQuotes(project, code), code, n, "manual");
  }
  const item = findItemByKey(project.items, code);
  const boqCode = item ? itemKeyOf(item) : code;
  const mine = (q: ItemQuote) => (item ? quoteMatchesItem(q, item) : q.boqCode === code);
  const existing = project.itemQuotes.find((q) => mine(q) && q.vendorName === "Custom");
  const id = existing?.id ?? uid("iq");
  const others = project.itemQuotes.filter((q) => mine(q) && q.id !== id).map((q) => ({ ...q, selected: false }));
  const rest = project.itemQuotes.filter((q) => !mine(q));
  return {
    ...project,
    itemQuotes: [
      ...rest,
      ...others,
      {
        id,
        billId: item?.billId,
        boqCode,
        vendorName: "Custom",
        rate: n,
        selected: true,
      },
    ],
  };
}

export function groupTargets(targets: PackTarget[]): Array<{ key: string; label: string; rows: PackTarget[] }> {
  const map = new Map<string, PackTarget[]>();
  for (const t of targets) {
    const type = t.type?.trim() || "Ungrouped";
    const sub = t.subType?.trim();
    const key = sub ? `${type} / ${sub}` : type;
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, rows]) => ({ key, label: key, rows }));
}

export function upsertFieldDef(project: LoadedProject, def: QuoteFieldDef): LoadedProject {
  const list = ensureQuoteFields(project).quoteFieldDefs;
  const next = list.some((d) => d.id === def.id) ? list.map((d) => (d.id === def.id ? def : d)) : [...list, def];
  return { ...project, quoteFieldDefs: next };
}

export function removeFieldDef(project: LoadedProject, id: string): LoadedProject {
  const list = ensureQuoteFields(project).quoteFieldDefs;
  const def = list.find((d) => d.id === id);
  if (!def || def.builtin) return project;
  return { ...project, quoteFieldDefs: list.filter((d) => d.id !== id) };
}

export function ensureQuoteFields(project: LoadedProject): LoadedProject {
  const existing = project.quoteFieldDefs ?? [];
  const byId = new Map(existing.map((d) => [d.id, d]));
  const merged: QuoteFieldDef[] = BUILTIN_QUOTE_FIELDS.map((b) => {
    const prev = byId.get(b.id);
    return prev
      ? { ...b, ...prev, id: b.id, builtin: true, label: prev.label || b.label, compare: prev.compare ?? b.compare }
      : { ...b };
  });
  for (const d of existing) {
    if (BUILTIN_QUOTE_FIELDS.some((b) => b.id === d.id)) continue;
    merged.push({ ...d, compare: d.compare !== false, builtin: false });
  }
  if (
    merged.length === existing.length &&
    merged.every((d, i) => d.id === existing[i]?.id && d.compare === existing[i]?.compare && d.builtin === existing[i]?.builtin)
  ) {
    return project;
  }
  return { ...project, quoteFieldDefs: merged };
}

export type EnquiryTrackStatus = "draft" | "sent" | "quoted" | "overdue";

export function repliesForEnquiry(project: LoadedProject, packId: string): QuoteReply[] {
  return (project.quoteReplies ?? []).filter((r) => r.enquiryId === packId);
}

export function trackEnquiry(project: LoadedProject, pack: EnquiryPack, now = Date.now()): EnquiryTrackStatus {
  if (pack.status !== "issued") return "draft";
  const replies = repliesForEnquiry(project, pack.id);
  if (replies.length) return "quoted";
  if (pack.dueAt) {
    const due = new Date(pack.dueAt).getTime();
    if (Number.isFinite(due) && due < now) return "overdue";
  }
  return "sent";
}

export function trackLabel(status: EnquiryTrackStatus): string {
  if (status === "draft") return "Draft";
  if (status === "sent") return "Sent — awaiting quote";
  if (status === "quoted") return "Quoted";
  return "Overdue";
}

export function enquiryTargets(project: LoadedProject, pack: EnquiryPack | null, laneId: string, billId?: string | null): PackTarget[] {
  const all = laneTargets(project, laneId, billId);
  if (!pack) return all;
  const wanted = new Set(pack.lines.filter((l) => l.included).map((l) => l.targetCode));
  if (!wanted.size) return all;
  return all.filter((t) => wanted.has(t.code));
}

export type CompareFactor = { id: string; label: string; scope: "header" | "line" | "both" | "rate" };

export function compareFactors(project: LoadedProject): CompareFactor[] {
  const defs = ensureQuoteFields(project).quoteFieldDefs.filter((d) => d.compare);
  return [{ id: "rate", label: "Rate", scope: "rate" }, ...defs.map((d) => ({ id: d.id, label: d.label, scope: d.scope }))];
}

export function headerFactorValue(
  project: LoadedProject,
  vendor: string,
  factorId: string,
): string {
  const reply = (project.quoteReplies ?? []).find((r) => r.vendorName === vendor);
  const quote = project.resourceQuotes.find((q) => q.vendorName === vendor) ?? project.itemQuotes.find((q) => q.vendorName === vendor);
  if (factorId === "payment") return reply?.paymentTerms || quote?.paymentTerms || "";
  if (factorId === "duration") return reply?.duration || reply?.headerFields?.duration || "";
  if (factorId === "spec") return "";
  return reply?.headerFields?.[factorId] || "";
}

export function lineFactorValue(
  project: LoadedProject,
  quote: ResourceQuote | ItemQuote | undefined,
  _pack: EnquiryPack | null | undefined,
  _code: string,
  factorId: string,
): string {
  if (!quote) return "";
  if (factorId === "spec") {
    return quote.lineFields?.spec || "";
  }
  if (factorId === "payment") return quote.paymentTerms || "";
  if (factorId === "duration") {
    const reply = replyForQuote(project, quote);
    return reply?.duration || quote.lineFields?.duration || "";
  }
  return quote.lineFields?.[factorId] || "";
}

export function replyForQuote(project: LoadedProject, q: ResourceQuote | ItemQuote | undefined): QuoteReply | undefined {
  if (!q?.replyId) return undefined;
  return (project.quoteReplies ?? []).find((r) => r.id === q.replyId);
}

export function needsManualConfirm(project: LoadedProject, laneId: string, codes?: string[]): boolean {
  const wanted = new Set(codes);
  return laneTargets(project, laneId).some(
    (t) => t.kind === "resource" && t.rateSource === "manual" && (!codes || wanted.has(t.code)),
  );
}

export function syncEnquiryLines(pack: EnquiryPack, targets: PackTarget[]): EnquiryPack {
  const byCode = new Map(pack.lines.map((l) => [l.targetCode, l]));
  const lines: EnquiryLine[] = targets.map((t) => {
    const prev = byCode.get(t.code);
    return (
      prev ?? {
        id: uid("el"),
        targetKind: t.kind,
        targetCode: t.code,
        qty: t.qty,
        unit: t.unit,
        spec: t.spec,
        included: true,
      }
    );
  });
  return { ...pack, lines };
}

export function itemByCode(project: LoadedProject, code: string): WorkingItem | undefined {
  return findItemByKey(project.items, code);
}
