/** How a priced analysis is carried onto the working / submission BOQ item. */
export type BoqCarryMode = "normal" | "rateOnly" | "amountOnly";

export function normalizeBoqCarry(value: unknown): BoqCarryMode {
  return value === "rateOnly" || value === "amountOnly" ? value : "normal";
}

/** Rate-only items keep a unit rate but do not roll resources into the job recap. Amount-only still does. */
export function contributesResources(mode?: BoqCarryMode | null): boolean {
  return normalizeBoqCarry(mode) !== "rateOnly";
}

export interface CarriedMoney {
  costAmount: number;
  marginAmount: number;
  amount: number;
  clientAmount: number;
  adjustmentAmount: number;
}

/**
 * Apply BOQ carry after qty × rate. PriceLine identity is unchanged.
 * Rate only: billed money is zero. Amount only: analysis total as a lumpsum (no tender-adjustment split).
 */
export function applyBoqCarry(
  mode: BoqCarryMode | undefined,
  priced: { costAmount: number; marginAmount: number; amount: number },
  submission: { clientAmount: number; adjustmentAmount: number },
): CarriedMoney {
  const carry = normalizeBoqCarry(mode);
  if (carry === "rateOnly") {
    return {
      costAmount: 0,
      marginAmount: 0,
      amount: 0,
      clientAmount: 0,
      adjustmentAmount: 0,
    };
  }
  if (carry === "amountOnly") {
    return {
      costAmount: priced.costAmount,
      marginAmount: priced.marginAmount,
      amount: priced.amount,
      clientAmount: priced.amount,
      adjustmentAmount: 0,
    };
  }
  return {
    costAmount: priced.costAmount,
    marginAmount: priced.marginAmount,
    amount: priced.amount,
    clientAmount: submission.clientAmount,
    adjustmentAmount: submission.adjustmentAmount,
  };
}
