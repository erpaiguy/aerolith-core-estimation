import { type MarginStack, totalMarginPct } from "../../shared/src/policy.ts";

export interface WorkingQuantities {
  clientQty: number;
  ourQty: number;
}

export function qtyDiff(q: WorkingQuantities): number {
  return q.ourQty - q.clientQty;
}

/** This reference project: quote qty = our (QTO) qty. */
export function quoteQty(q: WorkingQuantities): number {
  return q.ourQty;
}

export interface PricedLine {
  unitCost: number;
  marginRate: number;
  rate: number;
  costAmount: number;
  marginAmount: number;
  amount: number;
}

export function priceLine(
  unitCost: number,
  qty: number,
  margin: MarginStack,
): PricedLine {
  const m = totalMarginPct(margin);
  const marginRate = unitCost * m;
  const rate = unitCost + marginRate;
  return {
    unitCost,
    marginRate,
    rate,
    costAmount: unitCost * qty,
    marginAmount: marginRate * qty,
    amount: rate * qty,
  };
}

export interface SubmissionLine {
  kind: "client_line" | "tender_adjustment";
  qty: number;
  rate: number;
  amount: number;
}

/**
 * Client-plus-adjustments: original bill uses client qty at the working rate;
 * qty diffs become tender-adjustment lines at the same rate.
 */
export function submissionForItem(
  clientQty: number,
  ourQty: number,
  rate: number,
): SubmissionLine[] {
  const lines: SubmissionLine[] = [
    {
      kind: "client_line",
      qty: clientQty,
      rate,
      amount: clientQty * rate,
    },
  ];
  const diff = ourQty - clientQty;
  if (diff !== 0) {
    lines.push({
      kind: "tender_adjustment",
      qty: diff,
      rate,
      amount: diff * rate,
    });
  }
  return lines;
}
