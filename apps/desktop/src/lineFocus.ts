import { quoteMatchesItem } from "./bills";
import { hasAnalysisBackup, type WorkingItem } from "./model";

export type LineFocus = "unpriced" | "diff" | "missing";

export const LINE_FOCUS_LABEL: Record<LineFocus, string> = {
  unpriced: "Unpriced",
  diff: "Qty diffs",
  missing: "Missing analysis",
};

type Quote = { boqCode: string; billId?: string; selected?: boolean };

/** Same predicates as the dashboard counts. */
export function itemInFocus(item: WorkingItem, focus: LineFocus, quotes: readonly Quote[]): boolean {
  if (item.kind !== "item") return false;
  if (focus === "unpriced") return !item.result || item.result.rate === 0;
  if (focus === "diff") return item.ourQty !== item.clientQty;
  const quoted = quotes.some((quote) => quote.selected && quoteMatchesItem(quote, item));
  return !hasAnalysisBackup(item) && !quoted;
}
