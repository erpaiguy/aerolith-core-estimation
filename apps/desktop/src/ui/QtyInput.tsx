import { useEffect, useState, type MouseEvent } from "react";
import { formatGrouped, formatRate, isNumericDraft, parseSignedNumber, roundTo, roundUpTo } from "@aerolith/shared";

function committedText(
  value: number | null | undefined,
  decimals?: number,
  round: "up" | "half" = "half",
  moneyCurrency?: string,
): string {
  if (value == null || !Number.isFinite(value)) return "";
  if (moneyCurrency) return formatRate(value, moneyCurrency, decimals);
  if (decimals == null) return String(value);
  const n = round === "up" ? roundUpTo(value, decimals) : roundTo(value, decimals);
  return formatGrouped(n, decimals);
}

export function QtyInput({
  value,
  onValue,
  empty = 0,
  disabled,
  readOnly,
  className = "cell num",
  "aria-label": ariaLabel,
  onClick,
  decimals,
  round = "half",
  moneyCurrency,
}: {
  value: number | null | undefined;
  onValue: (n: number | null) => void;
  /** Value written when the field is cleared. Use `null` for optional quantities. */
  empty?: number | null;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  "aria-label"?: string;
  onClick?: (e: MouseEvent<HTMLInputElement>) => void;
  /** When set, blur rounds and idle display uses this many decimal places. */
  decimals?: number;
  round?: "up" | "half";
  /** Idle display uses `formatRate` (currency code, grouping, rate decimals). */
  moneyCurrency?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(committedText(value, decimals, round, moneyCurrency));

  useEffect(() => {
    const shown = committedText(value, decimals, round, moneyCurrency);
    if (!focused) {
      setDraft(shown);
      return;
    }
    const parsed = parseSignedNumber(draft);
    const external = parsed == null || value == null || Math.abs(parsed - value) > 1e-6;
    if (external) {
      setDraft(shown);
      setFocused(false);
    }
  }, [value, focused, decimals, round, moneyCurrency, draft]);

  function snap(n: number): number {
    if (decimals == null) return n;
    return round === "up" ? roundUpTo(n, decimals) : roundTo(n, decimals);
  }

  function commitRaw(raw: string, persist: boolean) {
    if (!isNumericDraft(raw)) return;
    setDraft(raw);
    const parsed = parseSignedNumber(raw);
    if (raw.trim() === "") {
      onValue(empty);
      return;
    }
    if (parsed != null) onValue(persist ? snap(parsed) : parsed);
    else if (persist) onValue(empty);
  }

  return (
    <input
      className={className}
      inputMode="decimal"
      aria-label={ariaLabel}
      disabled={disabled}
      readOnly={readOnly}
      value={focused ? draft : committedText(value, decimals, round, moneyCurrency)}
      onClick={onClick}
      onFocus={() => {
        setFocused(true);
        setDraft(value == null || !Number.isFinite(value) ? "" : String(value));
      }}
      onChange={(e) => commitRaw(e.target.value, false)}
      onBlur={() => {
        commitRaw(draft, true);
        setFocused(false);
      }}
    />
  );
}
