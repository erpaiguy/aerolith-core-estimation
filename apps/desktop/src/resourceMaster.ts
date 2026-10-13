import { unzipSync, zipSync, strToU8 } from "fflate";
import { roundRate } from "@aerolith/shared";

/** Bump when the bundled workbook should refresh rows the user has not edited. */
export const RESOURCE_SEED_VERSION = 1;

export type ResourceMasterRow = {
  code: string;
  name: string;
  category: string;
  subCategory: string;
  unit: string;
  rate: number;
  notes: string;
  /** True after a person edits, imports, or converts the row. Seed upgrades leave it alone. */
  userEdited: boolean;
};

export type ProjectResourceSeed = {
  project_code: string;
  global_code: string | null;
  category: string | null;
  type: string | null;
  sub_type: string | null;
  description: string | null;
  unit: string | null;
  project_wastage_pct: number | null;
  project_rate: number | null;
  rate_source: "global" | "quote" | "manual";
  total_qty: number | null;
  total_amount: number | null;
};

const HEADERS = ["code", "name", "category", "sub-category", "unit", "rate (inr)", "notes"] as const;

function xmlTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ?? "");
  return out;
}

function xmlText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function colIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function sheetRows(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes);
  const sharedRaw = files["xl/sharedStrings.xml"];
  const shared = sharedRaw ? decode(sharedRaw) : "";
  const strings = xmlTags(shared, "si").map((si) => xmlTags(si, "t").map(xmlText).join(""));
  const sheetName =
    Object.keys(files).find((k) => /^xl\/worksheets\/sheet1\.xml$/i.test(k)) ??
    Object.keys(files).find((k) => /xl\/worksheets\/sheet\d+\.xml$/i.test(k));
  if (!sheetName) return [];
  const sheet = decode(files[sheetName]);
  const rows: string[][] = [];
  for (const row of xmlTags(sheet, "row")) {
    const cells = [...row.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)];
    const values: string[] = [];
    for (const cell of cells) {
      const attrs = cell[1] ?? "";
      const inner = cell[2] ?? "";
      const ref = /r="([A-Z]+[0-9]+)"/i.exec(attrs)?.[1] ?? "";
      const idx = ref ? colIndex(ref) : values.length;
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      let value = "";
      if (type === "inlineStr") {
        value = xmlTags(inner, "t").map(xmlText).join("");
      } else {
        const v = xmlText(xmlTags(inner, "v")[0] ?? "");
        value = type === "s" ? (strings[Number(v)] ?? v) : v;
      }
      while (values.length < idx) values.push("");
      values[idx] = value;
    }
    if (values.some((c) => c.trim())) rows.push(values);
  }
  return rows;
}

function headerIndex(header: string[]): Record<(typeof HEADERS)[number], number> {
  const normalized = header.map((h) => h.trim().toLowerCase());
  const idx = {} as Record<(typeof HEADERS)[number], number>;
  for (const name of HEADERS) {
    const at = normalized.findIndex((h) => h === name || (name.startsWith("rate") && h.startsWith("rate")));
    if (at < 0) throw new Error(`Resource workbook is missing the ${name} column.`);
    idx[name] = at;
  }
  return idx;
}

function num(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function normalizeResourceRow(input: Partial<ResourceMasterRow> | null | undefined): ResourceMasterRow | null {
  if (!input) return null;
  const code = String(input.code ?? "").trim();
  if (!code) return null;
  return {
    code,
    name: String(input.name ?? "").trim(),
    category: String(input.category ?? "").trim(),
    subCategory: String(input.subCategory ?? "").trim(),
    unit: String(input.unit ?? "").trim(),
    rate: Number.isFinite(Number(input.rate)) ? Number(input.rate) : 0,
    notes: String(input.notes ?? "").trim(),
    userEdited: Boolean(input.userEdited),
  };
}

export function parseResourceWorkbook(bytes: Uint8Array): ResourceMasterRow[] {
  const table = sheetRows(bytes);
  if (!table.length) return [];
  const cols = headerIndex(table[0] ?? []);
  const rows: ResourceMasterRow[] = [];
  const seen = new Set<string>();
  for (const line of table.slice(1)) {
    const row = normalizeResourceRow({
      code: line[cols.code] ?? "",
      name: line[cols.name] ?? "",
      category: line[cols.category] ?? "",
      subCategory: line[cols["sub-category"]] ?? "",
      unit: line[cols.unit] ?? "",
      rate: num(line[cols["rate (inr)"]] ?? ""),
      notes: line[cols.notes] ?? "",
      userEdited: false,
    });
    if (!row) continue;
    const key = row.code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellInline(ref: string, value: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
}

function cellNumber(ref: string, value: number): string {
  return `<c r="${ref}"><v>${value}</v></c>`;
}

export function resourceMasterToXlsx(rows: ResourceMasterRow[]): Uint8Array {
  const header = ["Code", "Name", "Category", "Sub-category", "Unit", "Rate (INR)", "Notes"];
  const body = [
    `<row r="1">${header.map((h, i) => cellInline(`${String.fromCharCode(65 + i)}1`, h)).join("")}</row>`,
    ...rows.map((row, index) => {
      const r = index + 2;
      return `<row r="${r}">${[
        cellInline(`A${r}`, row.code),
        cellInline(`B${r}`, row.name),
        cellInline(`C${r}`, row.category),
        cellInline(`D${r}`, row.subCategory),
        cellInline(`E${r}`, row.unit),
        cellNumber(`F${r}`, row.rate),
        cellInline(`G${r}`, row.notes),
      ].join("")}</row>`;
    }),
  ].join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Resources" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  };
  return zipSync(files, { level: 6 });
}

export function cloneResourceMaster(rows: ResourceMasterRow[]): ResourceMasterRow[] {
  return rows.map((row) => ({ ...row, userEdited: false }));
}

export function mergeResourceSeed(
  existing: ResourceMasterRow[] | undefined,
  seed: ResourceMasterRow[],
  previousVersion: number | undefined,
  nextVersion = RESOURCE_SEED_VERSION,
): { rows: ResourceMasterRow[]; version: number } {
  if (previousVersion === nextVersion && existing) {
    return { rows: existing.map((row) => normalizeResourceRow(row)).filter((row): row is ResourceMasterRow => Boolean(row)), version: nextVersion };
  }
  const byCode = new Map((existing ?? []).map((row) => [row.code.trim().toUpperCase(), row]));
  const seen = new Set<string>();
  const rows: ResourceMasterRow[] = [];
  for (const item of seed) {
    const key = item.code.trim().toUpperCase();
    seen.add(key);
    const prev = byCode.get(key);
    if (prev?.userEdited) rows.push(prev);
    else rows.push({ ...item, userEdited: false });
  }
  for (const prev of existing ?? []) {
    if (!seen.has(prev.code.trim().toUpperCase())) rows.push(prev);
  }
  return { rows, version: nextVersion };
}

export function importResourceRows(existing: ResourceMasterRow[], incoming: ResourceMasterRow[]): ResourceMasterRow[] {
  const next = existing.map((row) => ({ ...row }));
  const index = new Map(next.map((row, i) => [row.code.trim().toUpperCase(), i]));
  for (const row of incoming) {
    const key = row.code.trim().toUpperCase();
    const at = index.get(key);
    const edited = { ...row, userEdited: true };
    if (at == null) {
      index.set(key, next.length);
      next.push(edited);
    } else {
      next[at] = edited;
    }
  }
  return next;
}

export function convertMasterRates(rows: ResourceMasterRow[], factor: number): ResourceMasterRow[] {
  if (!Number.isFinite(factor) || factor === 1) return rows.map((row) => ({ ...row }));
  return rows.map((row) => ({
    ...row,
    rate: roundRate(row.rate * factor),
    userEdited: true,
  }));
}

export function pushRateToMaster(master: ResourceMasterRow[], row: ResourceMasterRow): ResourceMasterRow[] {
  const key = row.code.trim().toUpperCase();
  let found = false;
  const next = master.map((item) => {
    if (item.code.trim().toUpperCase() !== key) return item;
    found = true;
    return { ...item, rate: row.rate, userEdited: true };
  });
  if (!found) next.push({ ...row, code: row.code.trim(), userEdited: true });
  return next;
}

export function masterToProjectResource(row: ResourceMasterRow): ProjectResourceSeed {
  return {
    project_code: row.code,
    global_code: row.code,
    category: row.category || null,
    type: row.category || null,
    sub_type: row.subCategory || null,
    description: row.name || null,
    unit: row.unit || null,
    project_wastage_pct: 0,
    project_rate: row.rate,
    rate_source: "global",
    total_qty: 0,
    total_amount: 0,
  };
}

export function searchResourceMaster(rows: ResourceMasterRow[], query: string): ResourceMasterRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    [row.code, row.name, row.category, row.subCategory, row.unit, row.notes].join("\n").toLowerCase().includes(needle),
  );
}

let seedCache: ResourceMasterRow[] | null = null;

export async function bundledResourceSeed(): Promise<ResourceMasterRow[]> {
  if (seedCache) return seedCache;
  const url = new URL("./resources/BidCraft-Default-Resources-INR.xlsx", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the bundled resource master (${response.status}).`);
  const rows = parseResourceWorkbook(new Uint8Array(await response.arrayBuffer()));
  if (rows.length < 300) throw new Error(`Bundled resource master is incomplete (${rows.length} rows).`);
  seedCache = rows;
  return rows;
}

export function parseStoredResourceMaster(raw: string | undefined | null): ResourceMasterRow[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.map((row) => normalizeResourceRow(row as Partial<ResourceMasterRow>)).filter((row): row is ResourceMasterRow => Boolean(row));
  } catch {
    return undefined;
  }
}
