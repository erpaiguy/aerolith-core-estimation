import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { PrintColumn, PrintDocument, PrintRow, PrintSection } from "./types";

const PAPER: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  letter: [612, 792],
};

const INK = rgb(0.137, 0.149, 0.176);
const MUTED = rgb(0.353, 0.373, 0.396);
const RULE = rgb(0.137, 0.149, 0.176);
const HEAD = rgb(0.965, 0.953, 0.941);
const BAND = rgb(0.953, 0.933, 0.91);

function pageSize(doc: PrintDocument): [number, number] {
  const base = PAPER[doc.paper] ?? PAPER.a4;
  return doc.orientation === "landscape" ? [base[1], base[0]] : base;
}

function pdfText(value: string): string {
  return value.replace(/₹/g, "INR ").replace(/\u00a0/g, " ").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const clean = pdfText(text).trim();
  if (!clean) return [""];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= width) {
      line = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const trial = chunk + ch;
      if (font.widthOfTextAtSize(trial, size) <= width) chunk = trial;
      else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function colWidths(columns: PrintColumn[], total: number): number[] {
  const sum = columns.reduce((n, c) => n + Math.max(c.width, 1), 0) || 1;
  return columns.map((c) => (Math.max(c.width, 1) / sum) * total);
}

export async function buildPdf(doc: PrintDocument, logo?: Uint8Array | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const image = logo && logo.byteLength ? await pdf.embedPng(logo).catch(() => null) : null;
  const [pageW, pageH] = pageSize(doc);
  const margin = 36;
  const contentW = pageW - margin * 2;
  let page = pdf.addPage([pageW, pageH]);
  let pageNo = 1;
  let y = pageH - margin;

  function footer(target: PDFPage, n: number) {
    const label = doc.format.footer.trim();
    const pages = doc.format.showPageNumbers ? `Page ${n}` : "";
    target.drawText(pdfText(label).slice(0, 90), { x: margin, y: 22, size: 8, font, color: MUTED });
    const stamp = pdfText(pages);
    if (stamp) {
      const w = font.widthOfTextAtSize(stamp, 8);
      target.drawText(stamp, { x: pageW - margin - w, y: 22, size: 8, font, color: MUTED });
    }
  }

  function newPage() {
    footer(page, pageNo);
    pageNo += 1;
    page = pdf.addPage([pageW, pageH]);
    y = pageH - margin;
    drawLetterhead(true);
  }

  function ensure(height: number) {
    if (y - height < 48) newPage();
  }

  function drawLetterhead(continued: boolean) {
    const company = doc.format.companyName.trim();
    const top = y;
    let textX = margin;
    if (doc.format.showLogo && image) {
      const h = 28;
      const w = Math.min(120, (image.width / image.height) * h);
      page.drawImage(image as PDFImage, { x: margin, y: y - h, width: w, height: h });
      textX = margin + w + 10;
    }
    const title = company || (image ? "" : "BidCraft");
    if (title) {
      page.drawText(pdfText(title).slice(0, 70), { x: textX, y: y - 12, size: 12, font: bold, color: INK });
    }
    page.drawText(pdfText(doc.projectName).slice(0, 80), {
      x: textX,
      y: y - (title ? 26 : 12),
      size: 10,
      font,
      color: INK,
    });
    y -= 40;
    if (!continued && doc.format.companyAddress.trim()) {
      for (const line of pdfText(doc.format.companyAddress).split(/\n/).slice(0, 3)) {
        page.drawText(line.slice(0, 110), { x: margin, y, size: 8, font, color: MUTED });
        y -= 10;
      }
    }
    const meta = [doc.documentTitle, doc.revision ? `Revision ${doc.revision}` : ""]
      .filter(Boolean)
      .join("  ·  ");
    page.drawText(pdfText(meta).slice(0, 120), { x: margin, y, size: 9, font: bold, color: INK });
    y -= 8;
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.6, color: RULE });
    y -= 14;
    if (top - y < 36) y = top - 48;
  }

  function drawSection(section: PrintSection) {
    if (section.title) {
      ensure(22);
      page.drawText(pdfText(section.title).slice(0, 90), { x: margin, y, size: 10, font: bold, color: INK });
      y -= 14;
    }
    const widths = colWidths(section.columns, contentW);
    const headLines = section.columns.map((col, i) => wrap(col.label, bold, 7, widths[i] - 8));
    const headH = Math.max(16, ...headLines.map((lines) => lines.length * 9 + 6));
    ensure(headH + 8);
    drawRow(
      section.columns.map((_col, i) => headLines[i]),
      widths,
      headH,
      true,
      section.columns.map((c) => c.align ?? "left"),
      bold,
      7,
    );
    for (const row of section.rows) drawDataRow(row, section.columns, widths);
  }

  function drawDataRow(row: PrintRow, columns: PrintColumn[], widths: number[]) {
    const size = 8;
    const lines = columns.map((_col, i) => wrap(row.cells[i] ?? "", row.kind === "item" ? font : bold, size, widths[i] - 8));
    const height = Math.max(14, ...lines.map((ls) => ls.length * 10 + 4));
    ensure(height);
    const fill = row.kind === "section" ? BAND : row.kind === "total" ? HEAD : null;
    drawRow(
      lines,
      widths,
      height,
      false,
      columns.map((c) => c.align ?? "left"),
      row.kind === "item" ? font : bold,
      size,
      fill,
    );
  }

  function drawRow(
    lines: string[][],
    widths: number[],
    height: number,
    header: boolean,
    align: Array<"left" | "right" | undefined>,
    face: PDFFont,
    size: number,
    fill: ReturnType<typeof rgb> | null = null,
  ) {
    if (header || fill) {
      page.drawRectangle({
        x: margin,
        y: y - height,
        width: contentW,
        height,
        color: header ? HEAD : fill ?? HEAD,
      });
    }
    let x = margin;
    lines.forEach((cell, i) => {
      page.drawRectangle({
        x,
        y: y - height,
        width: widths[i],
        height,
        borderColor: RULE,
        borderWidth: 0.4,
      });
      cell.forEach((line, li) => {
        const text = pdfText(line);
        const tw = face.widthOfTextAtSize(text, size);
        const pad = 4;
        const tx = align[i] === "right" ? x + widths[i] - pad - tw : x + pad;
        page.drawText(text, { x: tx, y: y - 11 - li * 10, size, font: face, color: INK });
      });
      x += widths[i];
    });
    y -= height;
  }

  drawLetterhead(false);
  if (!doc.sections.length) {
    page.drawText("Nothing to print.", { x: margin, y, size: 10, font, color: MUTED });
  }
  for (const section of doc.sections) drawSection(section);
  footer(page, pageNo);
  pdf.setTitle(pdfText(`${doc.projectName} — ${doc.documentTitle}`));
  pdf.setAuthor(pdfText(doc.format.companyName.trim() || "BidCraft"));
  return pdf.save();
}
