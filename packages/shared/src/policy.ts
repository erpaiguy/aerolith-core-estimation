export type QtySource =
  | "client_qty"
  | "qto_qty"
  | "client_plus_adjustments";

export type NodeKind = "section" | "item";

export type RateSource = "global" | "quote" | "manual";

export interface MarginStack {
  overheadPct: number;
  profitPct: number;
  logisticsPct: number;
  contingencyPct: number;
}

export function totalMarginPct(m: MarginStack): number {
  return m.overheadPct + m.profitPct + m.logisticsPct + m.contingencyPct;
}

export const DEFAULT_MARGIN: MarginStack = {
  overheadPct: 0.1,
  profitPct: 0.3,
  logisticsPct: 0.025,
  contingencyPct: 0.05,
};

export const DECISIONS = {
  qtySourceDefault: "client_plus_adjustments" as QtySource,
  currency: "INR",
  licenseGraceDays: 14,
  defaultProjectFolder: "Documents/Aerolith/Projects",
  starterPack: true,
  conflictUi: "inspector-queue",
  moneyTolerance: 0.01,
} as const;
