import { unzipSync } from "fflate";

export type ExtractKind = "csv" | "xlsx" | "docx" | "pdf" | "image" | "text";

export interface ExtractedBill {
  kind: ExtractKind;
  text: string;
  needsReview: boolean;
  note: string;
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "tif", "tiff", "webp", "bmp"]);

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function canCommitImport(needsReview: boolean, reviewed: boolean): boolean {
  return !needsReview || reviewed;
}

function looksScanned(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.length < 3 || text.replace(/\s/g, "").length < 40;
}

export async function extractBill(file: File): Promise<ExtractedBill> {
  const ext = extOf(file.name);
  if (IMAGE_EXT.has(ext)) {
    return {
      kind: "image",
      text: "",
      needsReview: true,
      note: "Scanned image. OCR is always a draft — you must review quantities before creating the project.",
    };
  }
  if (ext === "xlsx" || ext === "xlsm") {
    const text = await extractXlsx(new Uint8Array(await file.arrayBuffer()));
    return {
      kind: "xlsx",
      text,
      needsReview: looksScanned(text),
      note: "Spreadsheet cells mapped as a client bill. Check section vs item rows before commit.",
    };
  }
  if (ext === "docx") {
    const text = await extractDocx(new Uint8Array(await file.arrayBuffer()));
    return {
      kind: "docx",
      text,
      needsReview: looksScanned(text),
      note: "Word paragraphs converted to rows. Review layout before commit.",
    };
  }
  if (ext === "pdf") {
    const text = await extractPdf(new Uint8Array(await file.arrayBuffer()));
    const scanned = looksScanned(text);
    return {
      kind: "pdf",
      text,
      needsReview: true,
      note: scanned
        ? "This PDF has little or no text layer (likely a scan). OCR stays draft until you review it."
        : "PDF text layer extracted. Confirm page breaks and quantities, then create the project.",
    };
  }
  const text = await file.text();
  return {
    kind: ext === "csv" ? "csv" : "text",
    text,
    needsReview: false,
    note: "Delimited text. Map columns, then create the working bill.",
  };
}

function xmlTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
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

async function extractXlsx(bytes: Uint8Array): Promise<string> {
  const files = unzipSync(bytes);
  const shared = files["xl/sharedStrings.xml"] ? decode(files["xl/sharedStrings.xml"]) : "";
  const strings = xmlTags(shared, "si").map((si) =>
    xmlTags(si, "t")
      .map(xmlText)
      .join(""),
  );
  const sheetName =
    Object.keys(files).find((k) => /^xl\/worksheets\/sheet1\.xml$/i.test(k)) ??
    Object.keys(files).find((k) => /xl\/worksheets\/sheet\d+\.xml$/i.test(k));
  if (!sheetName) return "";
  const sheet = decode(files[sheetName]);
  const rows = xmlTags(sheet, "row");
  const lines: string[] = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)];
    const values: string[] = [];
    for (const cell of cells) {
      const attrs = cell[1];
      const inner = cell[2];
      const ref = /r="([A-Z]+[0-9]+)"/i.exec(attrs)?.[1] ?? "";
      const idx = colIndex(ref);
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const v = xmlText(xmlTags(inner, "v")[0] ?? xmlTags(inner, "t")[0] ?? inner);
      const value = type === "s" ? (strings[Number(v)] ?? v) : v;
      while (values.length < idx) values.push("");
      values[idx] = value;
    }
    if (values.some((c) => c.trim())) lines.push(values.join("\t"));
  }
  return lines.join("\n");
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const files = unzipSync(bytes);
  const xml = files["word/document.xml"] ? decode(files["word/document.xml"]) : "";
  const paras = xmlTags(xml, "w:p");
  return paras
    .map((p) =>
      xmlTags(p, "w:t")
        .map(xmlText)
        .join("")
        .replace(/\t+/g, "\t")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const doc = await pdfjs.getDocument({ data: copy }).promise;
  const lines: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let row = "";
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = "transform" in item ? Number((item.transform as number[])[5] ?? 0) : 0;
      if (lastY != null && Math.abs(y - lastY) > 2) {
        if (row.trim()) lines.push(row.trim());
        row = "";
      }
      row += (row && !row.endsWith(" ") ? " " : "") + item.str;
      lastY = y;
    }
    if (row.trim()) lines.push(row.trim());
    lines.push("");
  }
  return lines.join("\n");
}
