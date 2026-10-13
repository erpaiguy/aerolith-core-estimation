/** Display and calculation precision. Defaults: dimensions 5 dp, quantity 4 dp, rate 2 dp, amount 2 dp. */

export const QTY_SCALE = 4;
export const MONEY_SCALE = 2;
export const NOS_SCALE = 2;
export const DIM_SCALE = 5;

export type DisplayFormat = {
  currency: string;
  /** Quantity, Nos, and posted take-off totals. */
  qtyDecimals: number;
  rateDecimals: number;
  amountDecimals: number;
  /** Kept in sync with quantity precision. Older saves may still store it. */
  nosDecimals: number;
  /** L, B, H and other measured dimensions. */
  dimDecimals: number;
};

export const DEFAULT_DISPLAY_FORMAT: DisplayFormat = {
  currency: "INR",
  qtyDecimals: QTY_SCALE,
  rateDecimals: MONEY_SCALE,
  amountDecimals: MONEY_SCALE,
  nosDecimals: NOS_SCALE,
  dimDecimals: DIM_SCALE,
};

export const CURRENCIES: Array<{ code: string; name: string }> = [
  { code: "INR", name: "Indian rupee" },
  { code: "QAR", name: "Qatari riyal" },
  { code: "AED", name: "UAE dirham" },
  { code: "SAR", name: "Saudi riyal" },
  { code: "KWD", name: "Kuwaiti dinar" },
  { code: "BHD", name: "Bahraini dinar" },
  { code: "OMR", name: "Omani rial" },
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "Pound sterling" },
];

function clampPlaces(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(6, Math.max(0, Math.round(value)));
}

export function mergeDisplayFormat(partial?: Partial<DisplayFormat> | null): DisplayFormat {
  const currency = (partial?.currency ?? DEFAULT_DISPLAY_FORMAT.currency).trim().toUpperCase() || DEFAULT_DISPLAY_FORMAT.currency;
  const qtyDecimals = clampPlaces(partial?.qtyDecimals, DEFAULT_DISPLAY_FORMAT.qtyDecimals);
  return {
    currency,
    qtyDecimals,
    rateDecimals: clampPlaces(partial?.rateDecimals, DEFAULT_DISPLAY_FORMAT.rateDecimals),
    amountDecimals: clampPlaces(partial?.amountDecimals, DEFAULT_DISPLAY_FORMAT.amountDecimals),
    nosDecimals: clampPlaces(partial?.nosDecimals ?? partial?.qtyDecimals, qtyDecimals),
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

export function resetDisplayFormat(): DisplayFormat {
  active = { ...DEFAULT_DISPLAY_FORMAT };
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

export function roundQty(value: number, places = getDisplayFormat().qtyDecimals): number {
  return roundTo(value, places);
}

export function roundRate(value: number, places = getDisplayFormat().rateDecimals): number {
  return roundTo(value, places);
}

export function roundAmount(value: number, places = getDisplayFormat().amountDecimals): number {
  return roundTo(value, places);
}

export function roundDimValue(value: number, places = getDisplayFormat().dimDecimals): number {
  return roundUpTo(value, places);
}

export function roundMoney(value: number): number {
  return roundAmount(value);
}

/** True if two money amounts match within 1 cent at the default amount precision. */
export function moneyClose(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= tolerance;
}

export function numberLocale(currency = active.currency): string {
  return currency.trim().toUpperCase() === "INR" ? "en-IN" : "en-US";
}

export function formatGrouped(value: number, decimals: number, currency = active.currency): string {
  const n = roundTo(value, decimals);
  return n.toLocaleString(numberLocale(currency), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatFixed(value: number, decimals: number, currency = active.currency): string {
  return formatGrouped(value, decimals, currency);
}

export function currencyMarker(currency = active.currency): string {
  const code = currency.trim().toUpperCase();
  if (code === "INR") return "₹";
  if (code === "USD") return "$";
  if (code === "EUR") return "€";
  if (code === "GBP") return "£";
  return code || DEFAULT_DISPLAY_FORMAT.currency;
}

function moneyPrefix(currency: string): { marker: string; spaced: boolean } {
  const marker = currencyMarker(currency);
  const spaced = marker === currency.trim().toUpperCase();
  return { marker, spaced };
}

export function formatMoney(
  value: number,
  currency = active.currency,
  decimals = active.amountDecimals,
): string {
  const { marker, spaced } = moneyPrefix(currency);
  const body = formatFixed(value, decimals, currency);
  return spaced ? `${marker} ${body}` : `${marker}${body}`;
}

export function formatRate(
  value: number,
  currency = active.currency,
  decimals = active.rateDecimals,
): string {
  const { marker, spaced } = moneyPrefix(currency);
  const body = formatFixed(value, decimals, currency);
  return spaced ? `${marker} ${body}` : `${marker}${body}`;
}

/** Currency figures without the marker — use with Rate (₹) / Amount (₹) headers. */
export function formatMoneyPlain(
  value: number,
  decimals = active.amountDecimals,
  currency = active.currency,
): string {
  return formatFixed(value, decimals, currency);
}

export function formatQty(value: number | null | undefined, decimals = active.qtyDecimals): string {
  if (value == null) return "";
  const n = roundTo(value, decimals);
  return n.toLocaleString(numberLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function formatNos(value: number | null | undefined, decimals = active.qtyDecimals): string {
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
