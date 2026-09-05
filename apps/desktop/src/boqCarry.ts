import type { BoqCarryMode } from "@aerolith/calc";
import { normalizeBoqCarry } from "@aerolith/calc";
import { formatMoney, formatRate } from "@aerolith/shared";
import type { WorkingItem } from "./model";

export const CARRY_MODE_OPTIONS: Array<{ id: BoqCarryMode; label: string }> = [
  { id: "normal", label: "Normal" },
  { id: "rateOnly", label: "Rate only" },
  { id: "amountOnly", label: "Amount only" },
];

export function carryOf(item: Pick<WorkingItem, "carryMode">): BoqCarryMode {
  return normalizeBoqCarry(item.carryMode);
}

export function workingCostValue(
  item: Pick<WorkingItem, "priceMode" | "directCost" | "result">,
  quoted = false,
): number {
  if (quoted) return item.result?.unitCost ?? 0;
  if (item.priceMode === "direct") return item.directCost ?? 0;
  return item.result?.unitCost ?? item.directCost ?? 0;
}

export function formatWorkingCost(
  item: Pick<WorkingItem, "priceMode" | "directCost" | "result">,
  currency: string,
  quoted = false,
): string {
  return formatRate(workingCostValue(item, quoted), currency);
}

export function formatWorkingRate(item: WorkingItem, currency: string): string {
  if (carryOf(item) === "amountOnly") return "Amount Only";
  return formatRate(item.result?.rate ?? 0, currency);
}

export function formatWorkingAmount(item: WorkingItem, currency: string): string {
  if (carryOf(item) === "rateOnly") return "Rate Only";
  return formatMoney(item.result?.amount ?? 0, currency);
}

export function carryHint(mode: BoqCarryMode): string {
  if (mode === "rateOnly") {
    return "Unit rate stays on Working and Submission BOQ. Billed amount is Rate Only and this item is omitted from the resource summary.";
  }
  if (mode === "amountOnly") {
    return "Analysis total is carried as a lumpsum amount on Working and Submission BOQ. Resources still roll into the resource summary.";
  }
  return "Qty × rate is billed on the BOQ and resources roll into the resource summary.";
}
