import { composeResourceLine, type ResourceLineInput } from "./analysis.ts";

export interface RollupLine extends ResourceLineInput {
  projectResourceCode?: string | null;
}

export function rollupResourceTotals(
  items: Array<{ ourQty: number; lines: RollupLine[] }>,
): Map<string, { totalQty: number; totalAmount: number }> {
  const out = new Map<string, { totalQty: number; totalAmount: number }>();
  for (const item of items) {
    for (const line of item.lines) {
      const code = line.projectResourceCode;
      if (!code) continue;
      const c = composeResourceLine(line, item.ourQty);
      const prev = out.get(code) ?? { totalQty: 0, totalAmount: 0 };
      out.set(code, {
        totalQty: prev.totalQty + c.totalQty,
        totalAmount: prev.totalAmount + c.totalAmount,
      });
    }
  }
  return out;
}
