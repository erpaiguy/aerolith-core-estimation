import { product } from "./analysis.ts";

export type FormulaKey = "qty" | "product" | "area" | "volume" | "perimeter_x_h";

export const FORMULA_KEYS: { key: FormulaKey; label: string }[] = [
  { key: "qty", label: "Qty" },
  { key: "product", label: "Product (Nos × Nos × L × B × H × T)" },
  { key: "area", label: "Area (Nos × Nos × L × B)" },
  { key: "volume", label: "Volume (Nos × Nos × L × B × H)" },
  { key: "perimeter_x_h", label: "Perimeter × H" },
];

export interface QtoDims {
  nos1?: number | null;
  nos2?: number | null;
  l?: number | null;
  b?: number | null;
  h?: number | null;
  t?: number | null;
}

function n(v: number | null | undefined, fallback = 0): number {
  return v == null || !Number.isFinite(v) ? fallback : v;
}

export function qtoQty(key: FormulaKey, dims: QtoDims): number {
  const nos1 = n(dims.nos1, 1);
  const nos2 = n(dims.nos2, 1);
  switch (key) {
    case "qty":
      return n(dims.l);
    case "product":
      return product([dims.nos1, dims.nos2, dims.l, dims.b, dims.h, dims.t]);
    case "area":
      return nos1 * nos2 * n(dims.l) * n(dims.b);
    case "volume":
      return nos1 * nos2 * n(dims.l) * n(dims.b) * n(dims.h);
    case "perimeter_x_h":
      return nos1 * nos2 * 2 * (n(dims.l) + n(dims.b)) * n(dims.h);
  }
}

export function postedQtyByItem(
  lines: Array<{ workingBoqCode: string | null; formulaKey: FormulaKey; dims: QtoDims }>,
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const line of lines) {
    if (!line.workingBoqCode) continue;
    const q = qtoQty(line.formulaKey, line.dims);
    sums.set(line.workingBoqCode, (sums.get(line.workingBoqCode) ?? 0) + q);
  }
  return sums;
}
