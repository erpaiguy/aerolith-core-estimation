import { type MarginStack } from "../../shared/src/policy.ts";
import { type ResourceLineInput } from "./analysis.ts";
import { applyBoqCarry, type BoqCarryMode } from "./carry.ts";
import {
  resolveProjectBoqCosts,
  type AnalysisIncludeInput,
  type AnalysisOrigin,
  type PriceMode,
} from "./resolve.ts";
import { priceLine, quoteQty, submissionForItem, type WorkingQuantities } from "./working.ts";

export type { AnalysisIncludeInput, AnalysisOrigin, PriceMode } from "./resolve.ts";
export type { BoqCarryMode } from "./carry.ts";

export interface ItemInput {
  boqCode: string;
  itemKey?: string;
  clientQty: number;
  ourQty: number;
  lines: ResourceLineInput[];
  /** Used when priceMode is direct, or when there is no build-up yet. */
  directCost?: number;
  /** Selected item (subcontract) quote — replaces analysis as BOQ unit cost only. */
  quotedUnitCost?: number | null;
  priceMode?: PriceMode;
  analysisOrigin?: AnalysisOrigin;
  linkedBoqCode?: string | null;
  includes?: AnalysisIncludeInput[];
  /** Rate analysis carry onto this BOQ item. Default normal (qty × rate). */
  carryMode?: BoqCarryMode;
}

export interface ProjectInput {
  margin: MarginStack;
  items: ItemInput[];
}

export interface ItemResult {
  boqCode: string;
  itemKey?: string;
  quoteQty: number;
  unitCost: number;
  rate: number;
  costAmount: number;
  marginAmount: number;
  amount: number;
  clientAmount: number;
  adjustmentAmount: number;
}

export interface ProjectResult {
  items: ItemResult[];
  costAmount: number;
  marginAmount: number;
  grandTotal: number;
  clientBillTotal: number;
  tenderAdjustmentsTotal: number;
  submissionTotal: number;
}

export function computeProject(input: ProjectInput): ProjectResult {
  const costs = resolveProjectBoqCosts(input.items);
  const items: ItemResult[] = input.items.map((it) => {
    const q: WorkingQuantities = { clientQty: it.clientQty, ourQty: it.ourQty };
    const qq = quoteQty(q);
    const key = it.itemKey || it.boqCode;
    const unitCost = costs.get(key)?.unitCost ?? costs.get(it.boqCode)?.unitCost ?? 0;
    const priced = priceLine(unitCost, qq, input.margin);
    const sub = submissionForItem(it.clientQty, it.ourQty, priced.rate);
    const carried = applyBoqCarry(it.carryMode, priced, {
      clientAmount: sub.find((s) => s.kind === "client_line")?.amount ?? 0,
      adjustmentAmount: sub.find((s) => s.kind === "tender_adjustment")?.amount ?? 0,
    });
    return {
      boqCode: it.boqCode,
      itemKey: it.itemKey,
      quoteQty: qq,
      unitCost,
      rate: priced.rate,
      costAmount: carried.costAmount,
      marginAmount: carried.marginAmount,
      amount: carried.amount,
      clientAmount: carried.clientAmount,
      adjustmentAmount: carried.adjustmentAmount,
    };
  });

  const costAmount = items.reduce((s, i) => s + i.costAmount, 0);
  const marginAmount = items.reduce((s, i) => s + i.marginAmount, 0);
  const grandTotal = items.reduce((s, i) => s + i.amount, 0);
  const clientBillTotal = items.reduce((s, i) => s + i.clientAmount, 0);
  const tenderAdjustmentsTotal = items.reduce((s, i) => s + i.adjustmentAmount, 0);

  return {
    items,
    costAmount,
    marginAmount,
    grandTotal,
    clientBillTotal,
    tenderAdjustmentsTotal,
    submissionTotal: clientBillTotal + tenderAdjustmentsTotal,
  };
}
