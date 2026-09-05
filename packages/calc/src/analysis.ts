/** Excel PRODUCT ignores blanks; treat null/undefined as 1, keep explicit 0. */
export function product(factors: Array<number | null | undefined>): number {
  let n = 1;
  let any = false;
  for (const f of factors) {
    if (f == null) continue;
    any = true;
    n *= f;
  }
  return any ? n : 0;
}

export interface ResourceLineInput {
  factors: Array<number | null | undefined>;
  wastagePct: number;
  resourceRate: number;
}

export interface ComposedLine {
  qty: number;
  wastageQty: number;
  itemQty: number;
  amount: number;
  totalQty: number;
  totalAmount: number;
}

export function composeResourceLine(
  line: ResourceLineInput,
  analysisQty: number,
): ComposedLine {
  const qty = product(line.factors);
  const wastageQty = qty * (line.wastagePct || 0);
  const itemQty = qty + wastageQty;
  const amount = itemQty * line.resourceRate;
  const totalQty = itemQty * analysisQty;
  const totalAmount = amount * analysisQty;
  return { qty, wastageQty, itemQty, amount, totalQty, totalAmount };
}

export function composeAnalysis(
  lines: ResourceLineInput[],
  analysisQty: number,
): { unitCost: number; costAmount: number; lines: ComposedLine[] } {
  const composed = lines.map((l) => composeResourceLine(l, analysisQty));
  const unitCost = composed.reduce((s, l) => s + l.amount, 0);
  return { unitCost, costAmount: unitCost * analysisQty, lines: composed };
}
