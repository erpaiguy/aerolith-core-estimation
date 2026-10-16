import { formatQty, moneyClose } from "@aerolith/shared";
import { composeResourceLine } from "@aerolith/calc";
import { itemKeyOf, quoteMatchesItem, sortedBills } from "./bills";
import { sectionKeysForItem } from "./marginRules";
import { newId, type Activity, type LoadedProject, type WorkingItem } from "./model";
import { materializeAnalysis } from "./projectCompute";
import { formatReportMoney, mergeReportFormat, type ReportFormat } from "./reportFormat";
import { jobDocument, type PrintDocument } from "./print/types";
import { workbookToXlsx, type SheetCell, type WorkSheet } from "./xlsxBook";

export type TradeKey = "labour" | "material" | "subcontract" | "plant" | "other";
export type AdjustmentKind = "overhead" | "profit" | "contingency" | "discount";
export type AdjustmentLevel = "tender" | "bill" | "section";
export type FinalisePane = "summary" | "adjustments" | "revisions" | "checks" | "pack";

export interface FinalAdjustment {
  id: string;
  kind: AdjustmentKind;
  level: AdjustmentLevel;
  /** Empty for the whole tender. A bill id, or a section item key, otherwise. */
  targetId: string;
  /** Fraction of the scoped selling amount. 0.1 is 10%. */
  pct: number;
}

export interface TenderClause {
  id: string;
  kind: "qualification" | "exclusion";
  text: string;
}

export interface RevisionLineSnap {
  key: string;
  billCode: string;
  billName: string;
  slNo: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface TenderRevision {
  id: string;
  number: number;
  frozenAt: string;
  note: string;
  sell: number;
  lines: RevisionLineSnap[];
}

export interface TenderCommercial {
  adjustments: FinalAdjustment[];
  /** What-if copy. Null means the preview matches the applied adjustments. */
  draft: FinalAdjustment[] | null;
  clauses: TenderClause[];
  coverLetter: string;
  revisions: TenderRevision[];
}

export interface TradeAmounts {
  labour: number;
  material: number;
  subcontract: number;
  plant: number;
  other: number;
}

export interface SummaryRow {
  id: string;
  level: "tender" | "bill" | "section";
  depth: number;
  label: string;
  cost: number;
  margin: number;
  sell: number;
  offer: number;
  preview: number;
  labour: number;
  material: number;
  subcontract: number;
  plant: number;
  other: number;
}

export interface SubmissionIssue {
  id: string;
  kind: "unpriced" | "outlier" | "query" | "qualification";
  severity: "block" | "warn";
  title: string;
  detail: string;
  activity: Activity;
  itemKey?: string;
  pane?: FinalisePane;
}

export interface RevisionDiff {
  key: string;
  status: "added" | "removed" | "changed";
  description: string;
  slNo: string;
  billCode: string;
  qtyA: number | null;
  qtyB: number | null;
  rateA: number | null;
  rateB: number | null;
  amountA: number | null;
  amountB: number | null;
}

const KINDS = new Set<AdjustmentKind>(["overhead", "profit", "contingency", "discount"]);
const LEVELS = new Set<AdjustmentLevel>(["tender", "bill", "section"]);
const TRADES: TradeKey[] = ["labour", "material", "subcontract", "plant", "other"];

export function emptyCommercial(): TenderCommercial {
  return { adjustments: [], draft: null, clauses: [], coverLetter: "", revisions: [] };
}

export function commercialOf(project: LoadedProject): TenderCommercial {
  return project.commercial ?? emptyCommercial();
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseCommercial(raw: unknown): TenderCommercial {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const adjustments = parseAdjustments(src.adjustments);
  const draftRaw = src.draft;
  return {
    adjustments,
    draft: Array.isArray(draftRaw) ? parseAdjustments(draftRaw) : null,
    clauses: parseClauses(src.clauses),
    coverLetter: str(src.coverLetter),
    revisions: parseRevisions(src.revisions),
  };
}

function parseAdjustments(raw: unknown): FinalAdjustment[] {
  if (!Array.isArray(raw)) return [];
  const out: FinalAdjustment[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const kind = str(rec.kind) as AdjustmentKind;
    const level = str(rec.level) as AdjustmentLevel;
    if (!KINDS.has(kind) || !LEVELS.has(level)) continue;
    out.push({
      id: str(rec.id) || newId("adj"),
      kind,
      level,
      targetId: level === "tender" ? "" : str(rec.targetId),
      pct: num(rec.pct),
    });
  }
  return out;
}

function parseClauses(raw: unknown): TenderClause[] {
  if (!Array.isArray(raw)) return [];
  const out: TenderClause[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const kind = str(rec.kind);
    if (kind !== "qualification" && kind !== "exclusion") continue;
    out.push({ id: str(rec.id) || newId("cl"), kind, text: str(rec.text) });
  }
  return out;
}

function parseRevisions(raw: unknown): TenderRevision[] {
  if (!Array.isArray(raw)) return [];
  const out: TenderRevision[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const number = Math.floor(num(rec.number));
    if (number < 1) continue;
    const lines: RevisionLineSnap[] = [];
    if (Array.isArray(rec.lines)) {
      for (const line of rec.lines) {
        if (!line || typeof line !== "object") continue;
        const item = line as Record<string, unknown>;
        const key = str(item.key);
        if (!key) continue;
        lines.push({
          key,
          billCode: str(item.billCode),
          billName: str(item.billName),
          slNo: str(item.slNo),
          description: str(item.description),
          qty: num(item.qty),
          rate: num(item.rate),
          amount: num(item.amount),
        });
      }
    }
    out.push({
      id: str(rec.id) || newId("rev"),
      number,
      frozenAt: str(rec.frozenAt),
      note: str(rec.note),
      sell: num(rec.sell),
      lines,
    });
  }
  return out.sort((a, b) => a.number - b.number);
}

export function tradeOf(category: string | null | undefined): TradeKey {
  const text = (category ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!text) return "other";
  if (text.startsWith("lab") || text.includes("labor")) return "labour";
  if (text.startsWith("plant") || text.includes("equip") || text.includes("machinery")) return "plant";
  if (text.startsWith("sub")) return "subcontract";
  if (text.startsWith("mat")) return "material";
  return "other";
}

function emptyTrades(): TradeAmounts {
  return { labour: 0, material: 0, subcontract: 0, plant: 0, other: 0 };
}

export function tradeSplit(project: LoadedProject, item: WorkingItem): TradeAmounts {
  const cost = item.kind === "item" ? (item.result?.costAmount ?? 0) : 0;
  const out = emptyTrades();
  if (!cost) return out;
  const quoted = (project.itemQuotes ?? []).some((q) => q.selected && quoteMatchesItem(q, item));
  if (quoted) {
    out.subcontract = cost;
    return out;
  }
  const lines =
    (item.analysisOrigin ?? "own") === "link" ? materializeAnalysis(item, project.items).lines : item.lines;
  if (!lines.length) {
    out.other = cost;
    return out;
  }
  const resources = new Map(project.resources.map((r) => [r.project_code, r]));
  const raw = emptyTrades();
  let sum = 0;
  for (const line of lines) {
    const amount = composeResourceLine(line, item.ourQty || 0).totalAmount;
    if (!amount) continue;
    sum += amount;
    const category = line.projectResourceCode ? resources.get(line.projectResourceCode)?.category : null;
    raw[tradeOf(category)] += amount;
  }
  if (!sum) {
    out.other = cost;
    return out;
  }
  const scale = cost / sum;
  for (const key of TRADES) out[key] = raw[key] * scale;
  const drift = cost - TRADES.reduce((s, key) => s + out[key], 0);
  out.other += drift;
  return out;
}

export function previewAdjustments(commercial: TenderCommercial): FinalAdjustment[] {
  return commercial.draft ?? commercial.adjustments;
}

export function adjustmentApplies(project: LoadedProject, item: WorkingItem, row: FinalAdjustment): boolean {
  if (item.kind !== "item") return false;
  if (row.level === "tender") return true;
  if (row.level === "bill") return row.targetId === item.billId;
  if (row.level === "section") {
    const keys = sectionKeysForItem(project.items, item);
    return keys.some((key) => key.toLowerCase() === row.targetId.toLowerCase());
  }
  return false;
}

export function adjustmentFactor(
  project: LoadedProject,
  item: WorkingItem,
  rows: FinalAdjustment[],
): { add: number; discount: number } {
  let add = 0;
  let discount = 0;
  for (const row of rows) {
    if (!adjustmentApplies(project, item, row)) continue;
    if (row.kind === "discount") discount += row.pct;
    else add += row.pct;
  }
  return { add, discount };
}

export function adjustedAmount(base: number, factor: { add: number; discount: number }): number {
  return base * (1 + factor.add - factor.discount);
}

function offerOf(project: LoadedProject, item: WorkingItem, rows: FinalAdjustment[]): number {
  const base = item.result?.amount ?? 0;
  return adjustedAmount(base, adjustmentFactor(project, item, rows));
}

type Bucket = TradeAmounts & { cost: number; margin: number; sell: number; offer: number; preview: number };

function emptyBucket(): Bucket {
  return { ...emptyTrades(), cost: 0, margin: 0, sell: 0, offer: 0, preview: 0 };
}

function addBucket(into: Bucket, extra: Bucket): void {
  into.cost += extra.cost;
  into.margin += extra.margin;
  into.sell += extra.sell;
  into.offer += extra.offer;
  into.preview += extra.preview;
  for (const key of TRADES) into[key] += extra[key];
}

function itemBucket(project: LoadedProject, item: WorkingItem, applied: FinalAdjustment[], draft: FinalAdjustment[]): Bucket {
  const trades = tradeSplit(project, item);
  const sell = item.result?.amount ?? 0;
  const cost = item.result?.costAmount ?? 0;
  return {
    ...trades,
    cost,
    margin: item.result?.marginAmount ?? sell - cost,
    sell,
    offer: offerOf(project, item, applied),
    preview: offerOf(project, item, draft),
  };
}

function moneyCents(n: number): number {
  const rounded = Math.round(n * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function rowFrom(id: string, level: SummaryRow["level"], depth: number, label: string, bucket: Bucket): SummaryRow {
  return {
    id,
    level,
    depth,
    label,
    cost: moneyCents(bucket.cost),
    margin: moneyCents(bucket.margin),
    sell: moneyCents(bucket.sell),
    offer: moneyCents(bucket.offer),
    preview: moneyCents(bucket.preview),
    labour: moneyCents(bucket.labour),
    material: moneyCents(bucket.material),
    subcontract: moneyCents(bucket.subcontract),
    plant: moneyCents(bucket.plant),
    other: moneyCents(bucket.other),
  };
}

export function tenderSummary(project: LoadedProject): SummaryRow[] {
  const commercial = commercialOf(project);
  const applied = commercial.adjustments;
  const draft = previewAdjustments(commercial);
  const buckets = new Map<string, Bucket>();
  for (const item of project.items) {
    if (item.kind !== "item") continue;
    buckets.set(itemKeyOf(item).toLowerCase(), itemBucket(project, item, applied, draft));
  }
  const rows: SummaryRow[] = [];
  const tender = emptyBucket();
  for (const bill of sortedBills(project)) {
    const billBucket = emptyBucket();
    const sections = project.items.filter((item) => item.kind === "section" && item.billId === bill.id);
    const billItems = project.items.filter((item) => item.kind === "item" && item.billId === bill.id);
    for (const item of billItems) {
      const bucket = buckets.get(itemKeyOf(item).toLowerCase());
      if (bucket) addBucket(billBucket, bucket);
    }
    rows.push(rowFrom(bill.id, "bill", 0, `${bill.code} ${bill.name}`.trim(), billBucket));
    addBucket(tender, billBucket);
    for (const section of sections) {
      const key = itemKeyOf(section);
      const depth = sectionKeysForItem(project.items, section).length;
      const sectionBucket = emptyBucket();
      for (const item of billItems) {
        const ancestors = sectionKeysForItem(project.items, item);
        if (!ancestors.some((ancestor) => ancestor.toLowerCase() === key.toLowerCase())) continue;
        const bucket = buckets.get(itemKeyOf(item).toLowerCase());
        if (bucket) addBucket(sectionBucket, bucket);
      }
      rows.push(
        rowFrom(key, "section", depth + 1, `${section.slNo} ${section.description}`.trim(), sectionBucket),
      );
    }
  }
  rows.push(rowFrom("tender", "tender", 0, "Tender", tender));
  return rows;
}

export function snapshotLines(project: LoadedProject): RevisionLineSnap[] {
  const bills = new Map(sortedBills(project).map((bill) => [bill.id, bill]));
  const commercial = commercialOf(project);
  return project.items
    .filter((item) => item.kind === "item")
    .map((item) => {
      const bill = bills.get(item.billId);
      const amount = offerOf(project, item, commercial.adjustments);
      const qty = item.ourQty;
      return {
        key: itemKeyOf(item),
        billCode: bill?.code ?? "",
        billName: bill?.name ?? "",
        slNo: item.slNo,
        description: item.description,
        qty,
        rate: qty ? amount / qty : (item.result?.rate ?? 0),
        amount,
      };
    });
}

export function freezeRevision(project: LoadedProject, note = "", now = new Date().toISOString()): LoadedProject {
  const commercial = commercialOf(project);
  const used = new Set(commercial.revisions.map((rev) => rev.number));
  let number = Math.max(1, Math.floor(project.revision) || 1);
  while (used.has(number)) number += 1;
  const lines = snapshotLines(project);
  const revision: TenderRevision = {
    id: newId("rev"),
    number,
    frozenAt: now,
    note: note.trim(),
    sell: lines.reduce((sum, line) => sum + line.amount, 0),
    lines,
  };
  return {
    ...project,
    revision: number + 1,
    commercial: { ...commercial, revisions: [...commercial.revisions, revision] },
  };
}

export function compareSnapshots(left: RevisionLineSnap[], right: RevisionLineSnap[]): RevisionDiff[] {
  const a = new Map(left.map((line) => [line.key.toLowerCase(), line]));
  const b = new Map(right.map((line) => [line.key.toLowerCase(), line]));
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const diffs: RevisionDiff[] = [];
  for (const key of keys) {
    const lineA = a.get(key);
    const lineB = b.get(key);
    const sample = lineB ?? lineA;
    if (!sample) continue;
    if (!lineA || !lineB) {
      diffs.push({
        key: sample.key,
        status: lineA ? "removed" : "added",
        description: sample.description,
        slNo: sample.slNo,
        billCode: sample.billCode,
        qtyA: lineA?.qty ?? null,
        qtyB: lineB?.qty ?? null,
        rateA: lineA?.rate ?? null,
        rateB: lineB?.rate ?? null,
        amountA: lineA?.amount ?? null,
        amountB: lineB?.amount ?? null,
      });
      continue;
    }
    const qtyChanged = lineA.qty !== lineB.qty;
    const rateChanged = !moneyClose(lineA.rate, lineB.rate);
    const amountChanged = !moneyClose(lineA.amount, lineB.amount);
    if (!qtyChanged && !rateChanged && !amountChanged) continue;
    diffs.push({
      key: lineA.key,
      status: "changed",
      description: lineB.description || lineA.description,
      slNo: lineB.slNo || lineA.slNo,
      billCode: lineB.billCode || lineA.billCode,
      qtyA: lineA.qty,
      qtyB: lineB.qty,
      rateA: lineA.rate,
      rateB: lineB.rate,
      amountA: lineA.amount,
      amountB: lineB.amount,
    });
  }
  return diffs;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function submissionChecks(project: LoadedProject): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const priced = project.items.filter((item) => item.kind === "item");
  for (const item of priced) {
    const rate = item.result?.rate ?? 0;
    if (!item.result || rate === 0) {
      issues.push({
        id: `unpriced:${itemKeyOf(item)}`,
        kind: "unpriced",
        severity: "block",
        title: "Unpriced line",
        detail: `${item.boqCode} ${item.description} has no rate.`.trim(),
        activity: "estimate",
        itemKey: itemKeyOf(item),
      });
    }
  }
  const byUnit = new Map<string, WorkingItem[]>();
  for (const item of priced) {
    const rate = item.result?.rate ?? 0;
    if (rate <= 0) continue;
    const unit = (item.unit ?? "").trim().toLowerCase() || "(no unit)";
    const group = byUnit.get(unit) ?? [];
    group.push(item);
    byUnit.set(unit, group);
  }
  for (const [unit, group] of byUnit) {
    if (group.length < 4) continue;
    const mid = median(group.map((item) => item.result?.rate ?? 0));
    if (mid <= 0) continue;
    for (const item of group) {
      const rate = item.result?.rate ?? 0;
      const high = rate > mid * 3;
      const low = rate < mid / 3;
      if (!high && !low) continue;
      const times = rate / mid;
      issues.push({
        id: `outlier:${itemKeyOf(item)}`,
        kind: "outlier",
        severity: "warn",
        title: "Outlier rate",
        detail: `${item.boqCode} is ${times.toFixed(1)}× the median rate for ${unit}.`,
        activity: "analysis",
        itemKey: itemKeyOf(item),
      });
    }
  }
  for (const query of project.queryItems ?? []) {
    if (query.closedAt) continue;
    issues.push({
      id: `query:${query.id}`,
      kind: "query",
      severity: "warn",
      title: "Open query",
      detail: `${query.number} ${query.subject}`.trim(),
      activity: "queries",
    });
  }
  const qualifications = commercialOf(project).clauses.filter(
    (clause) => clause.kind === "qualification" && clause.text.trim(),
  );
  if (!qualifications.length) {
    issues.push({
      id: "qualification",
      kind: "qualification",
      severity: "block",
      title: "Missing qualifications",
      detail: "Add at least one qualification before you issue the pack.",
      activity: "finalise",
      pane: "pack",
    });
  }
  return issues;
}

function money(project: LoadedProject, format: ReportFormat, amount: number): string {
  return formatReportMoney(amount, project.currency, format);
}

function coverText(project: LoadedProject): string {
  const letter = commercialOf(project).coverLetter.trim();
  if (letter) return letter;
  return `Please find our offer for ${project.name || "this tender"}. The priced bills, summary, qualifications, and exclusions follow.`;
}

export function submissionPackDocument(project: LoadedProject, format: ReportFormat = mergeReportFormat(null)): PrintDocument {
  const commercial = commercialOf(project);
  const summary = tenderSummary(project).filter((row) => row.level !== "section" || row.sell || row.offer);
  const commercialRows = summary.map((row) => ({
    kind: row.level === "tender" ? ("total" as const) : row.level === "bill" ? ("section" as const) : ("item" as const),
    cells: [row.label, money(project, format, row.cost), money(project, format, row.margin), money(project, format, row.sell), money(project, format, row.offer)],
  }));
  const splitRows = summary.map((row) => ({
    kind: row.level === "tender" ? ("total" as const) : row.level === "bill" ? ("section" as const) : ("item" as const),
    cells: [
      row.label,
      money(project, format, row.labour),
      money(project, format, row.material),
      money(project, format, row.subcontract),
      money(project, format, row.plant),
      money(project, format, row.other),
    ],
  }));
  const sections = [
    {
      title: "Cover letter",
      columns: [{ label: "Offer", width: 100 }],
      rows: coverText(project)
        .split(/\n+/)
        .filter((line) => line.trim())
        .map((line) => ({ cells: [line] })),
    },
    {
      title: "Tender summary",
      columns: [
        { label: "BOQ / section", width: 36 },
        { label: "Cost", width: 16, align: "right" as const },
        { label: "Margin", width: 16, align: "right" as const },
        { label: "Sell", width: 16, align: "right" as const },
        { label: "Offer", width: 16, align: "right" as const },
      ],
      rows: commercialRows,
    },
    {
      title: "Cost split",
      columns: [
        { label: "BOQ / section", width: 28 },
        { label: "Labour", width: 14, align: "right" as const },
        { label: "Material", width: 14, align: "right" as const },
        { label: "Subcontract", width: 16, align: "right" as const },
        { label: "Plant", width: 14, align: "right" as const },
        { label: "Other", width: 14, align: "right" as const },
      ],
      rows: splitRows,
    },
  ];
  for (const bill of sortedBills(project)) {
    const lines = project.items.filter((item) => item.billId === bill.id);
    const rows: Array<{ kind: "section" | "item" | "total"; cells: string[] }> = lines.map((item) => {
      if (item.kind === "section") {
        const key = itemKeyOf(item);
        const amount = project.items
          .filter((child) => child.kind === "item" && child.billId === bill.id)
          .filter((child) => sectionKeysForItem(project.items, child).some((ancestor) => ancestor.toLowerCase() === key.toLowerCase()))
          .reduce((sum, child) => sum + offerOf(project, child, commercial.adjustments), 0);
        return { kind: "section" as const, cells: [item.slNo, item.description, "", "", "", money(project, format, amount)] };
      }
      const amount = offerOf(project, item, commercial.adjustments);
      const qty = item.ourQty;
      const rate = qty ? amount / qty : (item.result?.rate ?? 0);
      return {
        kind: "item" as const,
        cells: [item.slNo, item.description, formatQty(qty), item.unit ?? "", money(project, format, rate), money(project, format, amount)],
      };
    });
    const total = lines
      .filter((item) => item.kind === "item")
      .reduce((sum, item) => sum + offerOf(project, item, commercial.adjustments), 0);
    rows.push({ kind: "total", cells: ["", `${bill.code} total`, "", "", "", money(project, format, total)] });
    sections.push({
      title: `${bill.code} ${bill.name}`.trim(),
      columns: [
        { label: "No.", width: 10 },
        { label: "Description", width: 40 },
        { label: "Qty", width: 10, align: "right" as const },
        { label: "Unit", width: 8 },
        { label: "Rate", width: 16, align: "right" as const },
        { label: "Amount", width: 16, align: "right" as const },
      ],
      rows,
    });
  }
  const qualifications = commercial.clauses.filter((clause) => clause.kind === "qualification" && clause.text.trim());
  const exclusions = commercial.clauses.filter((clause) => clause.kind === "exclusion" && clause.text.trim());
  sections.push({
    title: "Qualifications",
    columns: [{ label: "Qualification", width: 100 }],
    rows: (qualifications.length ? qualifications : [{ text: "None stated." }]).map((clause) => ({ cells: [clause.text] })),
  });
  sections.push({
    title: "Exclusions",
    columns: [{ label: "Exclusion", width: 100 }],
    rows: (exclusions.length ? exclusions : [{ text: "None stated." }]).map((clause) => ({ cells: [clause.text] })),
  });
  return jobDocument(
    project.name,
    `r${project.revision}`,
    format,
    "Submission pack",
    sections,
  );
}

function sheetName(name: string, used: Set<string>): string {
  const clean = name.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim() || "Sheet";
  const base = clean.slice(0, 31);
  let next = base;
  let n = 2;
  while (used.has(next.toLowerCase())) {
    const suffix = ` ${n}`;
    next = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(next.toLowerCase());
  return next;
}

export function submissionPackXlsx(project: LoadedProject): Uint8Array {
  const commercial = commercialOf(project);
  const used = new Set<string>();
  const summary = tenderSummary(project);
  const summaryRows: SheetCell[][] = [
    ["BOQ / section", "Cost", "Margin", "Sell", "Offer", "Preview", "Labour", "Material", "Subcontract", "Plant", "Other"],
    ...summary.map((row) => [
      row.label,
      row.cost,
      row.margin,
      row.sell,
      row.offer,
      row.preview,
      row.labour,
      row.material,
      row.subcontract,
      row.plant,
      row.other,
    ]),
  ];
  const sheets: WorkSheet[] = [
    {
      name: sheetName("Cover", used),
      rows: [
        ["Project", project.name],
        ["Location", project.locationNote],
        ["Revision", `r${project.revision}`],
        ["Currency", project.currency],
        [],
        [coverText(project)],
      ],
    },
    { name: sheetName("Summary", used), rows: summaryRows },
  ];
  for (const bill of sortedBills(project)) {
    const rows: SheetCell[][] = [["No.", "Description", "Qty", "Unit", "Rate", "Amount"]];
    for (const item of project.items.filter((row) => row.billId === bill.id)) {
      if (item.kind === "section") {
        rows.push([item.slNo, item.description, null, null, null, null]);
        continue;
      }
      const amount = offerOf(project, item, commercial.adjustments);
      const qty = item.ourQty;
      rows.push([item.slNo, item.description, qty, item.unit ?? "", qty ? amount / qty : (item.result?.rate ?? 0), amount]);
    }
    sheets.push({ name: sheetName(`${bill.code} ${bill.name}`.trim(), used), rows });
  }
  const clauseRows = (kind: "qualification" | "exclusion"): SheetCell[][] => {
    const lines = commercial.clauses.filter((clause) => clause.kind === kind && clause.text.trim());
    return [[kind === "qualification" ? "Qualification" : "Exclusion"], ...(lines.length ? lines.map((clause) => [clause.text]) : [["None stated."]])];
  };
  sheets.push({ name: sheetName("Qualifications", used), rows: clauseRows("qualification") });
  sheets.push({ name: sheetName("Exclusions", used), rows: clauseRows("exclusion") });
  return workbookToXlsx(sheets);
}

export function withCommercial(project: LoadedProject, patch: Partial<TenderCommercial>): LoadedProject {
  return { ...project, commercial: { ...commercialOf(project), ...patch } };
}

export function editDraft(project: LoadedProject, next: FinalAdjustment[]): LoadedProject {
  return withCommercial(project, { draft: next.map((row) => ({ ...row })) });
}

export function applyDraft(project: LoadedProject): LoadedProject {
  const commercial = commercialOf(project);
  if (!commercial.draft) return project;
  return withCommercial(project, { adjustments: commercial.draft.map((row) => ({ ...row })), draft: null });
}

export function discardDraft(project: LoadedProject): LoadedProject {
  return withCommercial(project, { draft: null });
}
