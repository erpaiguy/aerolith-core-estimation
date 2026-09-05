/** Display defaults: quantities 4 dp, money 2 dp. Calc rounding is unchanged. */

export const QTY_SCALE = 4;
export const MONEY_SCALE = 2;
export const NOS_SCALE = 2;
export const DIM_SCALE = 5;

export type DisplayFormat = {
  currency: string;
  qtyDecimals: number;
  rateDecimals: number;
  amountDecimals: number;
  /** Take-off / rate “Nos” columns. */
  nosDecimals: number;
  /** L, B, H, Qty 1–4, Qty, Item qty, This line. */
  dimDecimals: number;
};

export const DEFAULT_DISPLAY_FORMAT: DisplayFormat = {
  currency: "QAR",
  qtyDecimals: QTY_SCALE,
  rateDecimals: MONEY_SCALE,
  amountDecimals: MONEY_SCALE,
  nosDecimals: NOS_SCALE,
  dimDecimals: DIM_SCALE,
};

export const CURRENCIES: Array<{ code: string; name: string }> = [
  { code: "QAR", name: "Qatari riyal" },
  { code: "AED", name: "UAE dirham" },
  { code: "SAR", name: "Saudi riyal" },
  { code: "KWD", name: "Kuwaiti dinar" },
  { code: "BHD", name: "Bahraini dinar" },
  { code: "OMR", name: "Omani rial" },
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "Pound sterling" },
  { code: "INR", name: "Indian rupee" },
];

function clampPlaces(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(6, Math.max(0, Math.round(value)));
}

export function mergeDisplayFormat(partial?: Partial<DisplayFormat> | null): DisplayFormat {
  const currency = (partial?.currency ?? DEFAULT_DISPLAY_FORMAT.currency).trim().toUpperCase() || DEFAULT_DISPLAY_FORMAT.currency;
  return {
    currency,
    qtyDecimals: clampPlaces(partial?.qtyDecimals, DEFAULT_DISPLAY_FORMAT.qtyDecimals),
    rateDecimals: clampPlaces(partial?.rateDecimals, DEFAULT_DISPLAY_FORMAT.rateDecimals),
    amountDecimals: clampPlaces(partial?.amountDecimals, DEFAULT_DISPLAY_FORMAT.amountDecimals),
    nosDecimals: clampPlaces(partial?.nosDecimals, DEFAULT_DISPLAY_FORMAT.nosDecimals),
    dimDecimals: clampPlaces(partial?.dimDecimals, DEFAULT_DISPLAY_FORMAT.dimDecimals),
  };
}

let active: DisplayFormat = { ...DEFAULT_DISPLAY_FORMAT };

export function configureDisplayFormat(next: Partial<DisplayFormat>): DisplayFormat {
  active = mergeDisplayFormat({ ...active, ...next });
  return active;
}

export function getDisplayFormat(): DisplayFormat {
  return active;
}

export function roundTo(value: number, places: number): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** places;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Excel ROUNDUP: away from zero to `places` decimal digits. */
export function roundUpTo(value: number, places: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value === 0) return 0;
  const f = 10 ** places;
  const scaled = value * f;
  const nearest = Math.round(scaled);
  if (Math.abs(scaled - nearest) < 1e-6) return nearest / f;
  return (value > 0 ? Math.ceil(scaled - 1e-10) : Math.floor(scaled + 1e-10)) / f;
}

export function roundQty(value: number): number {
  return roundTo(value, QTY_SCALE);
}

export function roundMoney(value: number): number {
  return roundTo(value, MONEY_SCALE);
}

/** True if two money amounts match within 1 cent (workbook fixture policy). */
export function moneyClose(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= tolerance;
}

function formatFixed(value: number, decimals: number): string {
  const n = roundTo(value, decimals);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function currencyMarker(currency = active.currency): string {
  const code = currency.trim().toUpperCase();
  if (code === "USD") return "$";
  if (code === "EUR") return "€";
  if (code === "GBP") return "£";
  return code || DEFAULT_DISPLAY_FORMAT.currency;
}

export function formatMoney(
  value: number,
  currency = active.currency,
  decimals = active.amountDecimals,
): string {
  return `${currency} ${formatFixed(value, decimals)}`;
}

export function formatRate(
  value: number,
  currency = active.currency,
  decimals = active.rateDecimals,
): string {
  return `${currency} ${formatFixed(value, decimals)}`;
}

/** Currency figures without the code — use with Rate (QAR) / Amount (QAR) headers. */
export function formatMoneyPlain(
  value: number,
  decimals = active.amountDecimals,
): string {
  return formatFixed(value, decimals);
}

export function formatQty(value: number | null | undefined, decimals = active.qtyDecimals): string {
  if (value == null) return "";
  const n = roundTo(value, decimals);
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

export function formatNos(value: number | null | undefined, decimals = active.nosDecimals): string {
  if (value == null) return "";
  return formatFixed(roundUpTo(value, decimals), decimals);
}

export function formatDim(value: number | null | undefined, decimals = active.dimDecimals): string {
  if (value == null) return "";
  return formatFixed(roundUpTo(value, decimals), decimals);
}

export function formatPct(fraction: number): string {
  return `${roundTo(fraction * 100, 2)}%`;
}

/** True while the user is still typing a signed decimal (including "-", ".", "0."). */
export function isNumericDraft(raw: string): boolean {
  const t = raw.trim().replace(/,/g, "");
  if (t === "" || t === "-" || t === "." || t === "-.") return true;
  return /^-?\d*\.?\d*$/.test(t);
}

/** Parse a signed decimal. Empty / incomplete drafts return null. Commas are ignored. */
export function parseSignedNumber(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (t === "" || t === "-" || t === "." || t === "-.") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
