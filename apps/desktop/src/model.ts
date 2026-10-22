import type {
  AnalysisOrigin,
  BoqCarryMode,
  FormulaKey,
  ItemResult,
  PriceMode,
  QtoDims,
  ResourceLineInput,
} from "@aerolith/calc";
import type { MarginStack, QtySource, RateSource } from "@aerolith/shared";
import type { ResourceMasterRow } from "./resourceMaster";

export type Activity =
  | "source"
  | "takeoff"
  | "estimate"
  | "analysis"
  | "margins"
  | "queries"
  | "buy"
  | "submit"
  | "finalise"
  | "masters"
  | "dashboard"
  | "settings";

export type MarginTargetKind = "job" | "bill" | "section" | "category" | "item";
export type MarginFactorKey = keyof MarginStack;

export interface MarginPreset {
  id: string;
  name: string;
  stack: MarginStack;
}

export interface MarginRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Factors this rule writes. One key = unique factor; several = a group. */
  factors: MarginFactorKey[];
  stack: MarginStack;
  presetId: string | null;
  targetKind: MarginTargetKind;
  targetIds: string[];
  notes: string;
}

export interface AnalysisLine extends ResourceLineInput {
  description?: string | null;
  projectResourceCode?: string | null;
  unit?: string | null;
}

export interface AnalysisInclude {
  id: string;
  sourceBoqCode: string;
  relation: "link" | "clone";
  factor: number;
  snapshotUnitCost?: number;
  snapshotLines?: AnalysisLine[];
}

export interface BoqColumnDef {
  id: string;
  label: string;
  role: "sl" | "description" | "qty" | "unit" | "extra";
  valueType: "text" | "number";
}

export interface ProjectBill {
  id: string;
  number: number;
  code: string;
  name: string;
  issuedRef: string;
  sourceLockedAt: string | null;
}

export interface WorkingItem {
  id: string;
  billId: string;
  boqCode: string;
  clientLinkCode: string;
  slNo: string;
  kind: "section" | "item";
  parentCode: string | null;
  description: string;
  boqCategory: string | null;
  workCategory: string | null;
  subWorkCategory: string | null;
  group1: string | null;
  group2: string | null;
  group3: string | null;
  clientQty: number;
  ourQty: number;
  unit: string | null;
  lines: AnalysisLine[];
  directCost?: number;
  priceMode?: PriceMode;
  analysisOrigin?: AnalysisOrigin;
  linkedBoqCode?: string | null;
  includes?: AnalysisInclude[];
  extra?: Record<string, string>;
  /** How this item's rate analysis is carried onto Working / Submission BOQ. */
  carryMode?: BoqCarryMode;
  result?: ItemResult;
}

export interface ClientNode {
  row: number;
  kind: string;
  sl_no?: string;
  description?: string;
  qty?: number;
  unit?: string;
  billId?: string;
  boqCode?: string;
  extra?: Record<string, string>;
}

export interface ProjectResource {
  project_code: string;
  global_code: string | null;
  category: string | null;
  type: string | null;
  sub_type: string | null;
  description: string | null;
  unit: string | null;
  project_wastage_pct: number | null;
  project_rate: number | null;
  rate_source?: RateSource | null;
  total_qty: number | null;
  total_amount: number | null;
}

export interface UnitRow {
  code: string;
  description: string;
  symbol: string;
}

export interface CategoryRow {
  code: string;
  description: string;
}

export interface VendorRow {
  id: string;
  name: string;
}

export interface QtoLine {
  id: string;
  billId?: string;
  workCategory: string | null;
  drawing: string | null;
  locationDesc: string | null;
  itemLabel: string | null;
  subItem: string | null;
  formulaKey: FormulaKey;
  dims: QtoDims;
  workingBoqCode: string | null;
}

export interface ResourceQuote {
  id: string;
  projectResourceCode: string;
  vendorName: string;
  rate: number;
  selected: boolean;
  enquiryId?: string | null;
  replyId?: string | null;
  quotedQty?: number | null;
  remarks?: string | null;
  validUntil?: string | null;
  paymentTerms?: string | null;
  lineFields?: Record<string, string>;
}

export interface ItemQuote {
  id: string;
  billId?: string;
  boqCode: string;
  vendorName: string;
  rate: number;
  selected: boolean;
  enquiryId?: string | null;
  replyId?: string | null;
  quotedQty?: number | null;
  remarks?: string | null;
  validUntil?: string | null;
  paymentTerms?: string | null;
  lineFields?: Record<string, string>;
}

export type QuoteFieldType = "text" | "number" | "date" | "money";

export interface QuoteFieldDef {
  id: string;
  label: string;
  valueType: QuoteFieldType;
  scope: "header" | "line" | "both";
  /** When true, this factor appears on Compare next to rate. */
  compare: boolean;
  builtin?: boolean;
}

export const BUILTIN_QUOTE_FIELDS: QuoteFieldDef[] = [
  { id: "spec", label: "Specification", valueType: "text", scope: "line", compare: true, builtin: true },
  { id: "duration", label: "Duration", valueType: "text", scope: "header", compare: true, builtin: true },
  { id: "payment", label: "Payment terms", valueType: "text", scope: "header", compare: true, builtin: true },
];

export interface EnquiryLine {
  id: string;
  targetKind: "resource" | "boq";
  targetCode: string;
  qty: number;
  unit: string | null;
  spec: string;
  included: boolean;
}

export interface EnquiryPack {
  id: string;
  laneKind: "resource" | "boq";
  category: string | null;
  vendorName: string;
  status: "draft" | "issued";
  issuedAt: string | null;
  dueAt: string | null;
  notes: string;
  lines: EnquiryLine[];
}

export interface QuoteReply {
  id: string;
  vendorName: string;
  enquiryId: string | null;
  receivedAt: string;
  validUntil: string | null;
  paymentTerms: string;
  /** Delivery / lead time offered on this quote (e.g. 6 weeks). */
  duration: string;
  currency: string;
  headerFields: Record<string, string>;
}

export interface QueryColumnDef {
  id: string;
  label: string;
  valueType: "text" | "number" | "date";
}

export interface QueryAttachment {
  id: string;
  name: string;
  mime: string;
  /** Raw base64 (no data: prefix). */
  data: string;
  createdAt: string;
}

export interface TenderQueryReply {
  id: string;
  listId: string | null;
  receivedAt: string;
  fromName: string;
  body: string;
  needsInfo: boolean;
  needsInfoNote: string;
  fields: Record<string, string>;
  attachments: QueryAttachment[];
}

export interface TenderQueryItem {
  id: string;
  number: string;
  documentRef: string;
  subject: string;
  question: string;
  createdAt: string;
  carriedFromId: string | null;
  closedAt: string | null;
  replies: TenderQueryReply[];
  attachments: QueryAttachment[];
}

export interface TenderQueryListLine {
  id: string;
  itemId: string;
  included: boolean;
  /** Extra wording on this round (follow-up when a reply still needs information). */
  roundNote: string;
  fields: Record<string, string>;
}

export interface TenderQueryList {
  id: string;
  number: number;
  title: string;
  status: "draft" | "sent";
  sentAt: string | null;
  dueAt: string | null;
  notes: string;
  lines: TenderQueryListLine[];
  /** Outgoing sheet columns for this list only. */
  queryColumns: QueryColumnDef[];
  /** Incoming reply columns for this list — need not match queryColumns. */
  replyColumns: QueryColumnDef[];
  attachments: QueryAttachment[];
}

export interface LoadedProject {
  name: string;
  locationNote: string;
  margin: MarginStack;
  /** Named reusable factor groups. */
  marginPresets: MarginPreset[];
  /** Scoped overlays on the job stack. Later / more specific wins per factor. */
  marginRules: MarginRule[];
  currency: string;
  qtySource: QtySource;
  bills: ProjectBill[];
  items: WorkingItem[];
  clientNodes: ClientNode[];
  clientColumns: BoqColumnDef[];
  workingColumns: BoqColumnDef[];
  resources: ProjectResource[];
  /** Project copy of the global resource master. Missing on older jobs until copied. */
  resourceMaster?: ResourceMasterRow[];
  units: UnitRow[];
  categories: CategoryRow[];
  vendors: VendorRow[];
  qtoLines: QtoLine[];
  resourceQuotes: ResourceQuote[];
  itemQuotes: ItemQuote[];
  enquiries: EnquiryPack[];
  quoteReplies: QuoteReply[];
  quoteFieldDefs: QuoteFieldDef[];
  /** Tender-document clarifications for this job only. */
  queryItems: TenderQueryItem[];
  queryLists: TenderQueryList[];
  sourceLockedAt: string | null;
  sealedAt: string | null;
  revision: number;
  /** Final adjustments, frozen revisions, cover letter, and qualifications. */
  commercial?: import("./finalise").TenderCommercial;
  catalogVersion?: number;
  importNeedsReview?: boolean;
  isDemo?: boolean;
}

export const GOLDEN_TOTAL = 100826297.13;

export function newId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function stampItem(item: Omit<WorkingItem, "id" | "clientLinkCode" | "billId"> & Partial<Pick<WorkingItem, "id" | "clientLinkCode" | "billId">>): WorkingItem {
  return {
    ...item,
    id: item.id ?? newId("it"),
    billId: item.billId || "bill-1",
    clientLinkCode: item.clientLinkCode ?? item.boqCode,
    includes: item.includes ?? [],
    extra: item.extra ?? {},
    analysisOrigin: item.analysisOrigin ?? "own",
    linkedBoqCode: item.linkedBoqCode ?? null,
  };
}

export function hasAnalysisBackup(item: WorkingItem): boolean {
  if (item.kind !== "item") return false;
  if (item.lines.length > 0) return true;
  if ((item.includes ?? []).length > 0) return true;
  if ((item.analysisOrigin ?? "own") === "link" && item.linkedBoqCode) return true;
  if (item.priceMode === "direct" && (item.directCost ?? 0) > 0) return true;
  if ((item.directCost ?? 0) > 0 && item.lines.length === 0 && (item.analysisOrigin ?? "own") !== "link") {
    return true;
  }
  return false;
}

export type ItemBadge = "unpriced" | "qty-diff" | "missing-analysis" | "linked" | "cloned" | "quoted" | "rate-only" | "amount-only";

export function itemBadges(item: WorkingItem, quoted = false): ItemBadge[] {
  if (item.kind !== "item") return [];
  const badges: ItemBadge[] = [];
  if (!item.result || item.result.rate === 0) badges.push("unpriced");
  if (item.ourQty !== item.clientQty) badges.push("qty-diff");
  if (!quoted && !hasAnalysisBackup(item)) badges.push("missing-analysis");
  if ((item.analysisOrigin ?? "own") === "link") badges.push("linked");
  if ((item.analysisOrigin ?? "own") === "clone") badges.push("cloned");
  if (quoted) badges.push("quoted");
  if (item.carryMode === "rateOnly") badges.push("rate-only");
  if (item.carryMode === "amountOnly") badges.push("amount-only");
  return badges;
}

export function inferParents(items: WorkingItem[]): WorkingItem[] {
  let section: string | null = null;
  let bill: string | null = null;
  return items.map((it) => {
    if (it.billId !== bill) {
      bill = it.billId;
      section = null;
    }
    if (it.kind === "section") {
      section = it.boqCode;
      return { ...it, parentCode: null };
    }
    return { ...it, parentCode: it.parentCode ?? section };
  });
}
