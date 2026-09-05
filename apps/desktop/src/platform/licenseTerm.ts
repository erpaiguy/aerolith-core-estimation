export type LicenseUnit = "day" | "month" | "year";

export type LicenseTerm = {
  amount: number;
  unit: LicenseUnit;
};

export const LICENSE_TERM_PRESETS: Array<{ id: string; label: string; term: LicenseTerm }> = [
  { id: "1d", label: "1 day", term: { amount: 1, unit: "day" } },
  { id: "3d", label: "3 days", term: { amount: 3, unit: "day" } },
  { id: "7d", label: "7 days", term: { amount: 7, unit: "day" } },
  { id: "10d", label: "10 days", term: { amount: 10, unit: "day" } },
  { id: "14d", label: "14 days", term: { amount: 14, unit: "day" } },
  { id: "21d", label: "21 days", term: { amount: 21, unit: "day" } },
  { id: "1m", label: "1 month", term: { amount: 1, unit: "month" } },
  { id: "3m", label: "3 months", term: { amount: 3, unit: "month" } },
  { id: "6m", label: "6 months", term: { amount: 6, unit: "month" } },
  { id: "1y", label: "1 year", term: { amount: 1, unit: "year" } },
  { id: "2y", label: "2 years", term: { amount: 2, unit: "year" } },
  { id: "3y", label: "3 years", term: { amount: 3, unit: "year" } },
  { id: "5y", label: "5 years", term: { amount: 5, unit: "year" } },
];

export function normalizeLicenseKey(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

export function generateLicenseKey(): string {
  return `AERO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function parseLicenseTerm(amountRaw: string, unit: LicenseUnit): LicenseTerm | null {
  const amount = Math.floor(Number(amountRaw));
  if (!Number.isFinite(amount) || amount < 1 || amount > 3650) return null;
  return { amount, unit };
}

export function licenseExpiresAt(from: Date, term: LicenseTerm): Date {
  const d = new Date(from.getTime());
  if (term.unit === "day") d.setDate(d.getDate() + term.amount);
  else if (term.unit === "month") d.setMonth(d.getMonth() + term.amount);
  else d.setFullYear(d.getFullYear() + term.amount);
  return d;
}

export function formatLicenseTerm(term: LicenseTerm): string {
  const plural = term.amount === 1 ? "" : "s";
  if (term.unit === "day") return `${term.amount} day${plural}`;
  if (term.unit === "month") return `${term.amount} month${plural}`;
  return `${term.amount} year${plural}`;
}
