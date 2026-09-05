import { downloadText } from "./buyProcurement";
import type { LoadedProject } from "./model";
import {
  blockOn,
  buildDocument,
  colWidthPct,
  columnLabel,
  formatReportFigure,
  formatReportMoney,
  isFullJobScope,
  isNumericColumn,
  isTenderAdjSectionKey,
  mergeReportFormat,
  paginateDocument,
  reportCell,
  submissionLayoutOf,
  summaryColWidthPct,
  visibleColumns,
  type DocLine,
  type ReportFormat,
  type ReportPage,
  type ReportScope,
} from "./reportFormat";
import { billQtyHeader, compareBills, formatCompareQty, submissionItemLines } from "./submissionCompare";
import { formatMoney, formatQty } from "@aerolith/shared";
import { projectGrand } from "./bills";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function billTableHtml(
  rows: DocLine[],
  cols: string[],
  fmt: ReportFormat,
  currency: string,
  pageTotal?: number,
  project?: LoadedProject,
  qtyBills: ReturnType<typeof compareBills> = [],
): string {
  const pivot = qtyBills.length > 1 && rows.some((r) => r.qtyByBill?.length);
  const qtyIdx = cols.indexOf("qty");
  const headCols =
    pivot && qtyIdx >= 0
      ? [...cols.slice(0, qtyIdx), ...qtyBills.map((b) => `qty:${b.id}`), "qtyTotal", ...cols.slice(qtyIdx + 1)]
      : cols;
  const labelFor = (c: string) => {
    if (c === "qtyTotal") return "Qty total";
    if (c.startsWith("qty:")) {
      const bill = qtyBills.find((b) => `qty:${b.id}` === c);
      return bill ? `Qty ${billQtyHeader(bill)}` : "Qty";
    }
    return columnLabel(c, fmt, project, currency);
  };
  const num = (c: string) => c === "qtyTotal" || c.startsWith("qty:") || isNumericColumn(c, project);
  const head = headCols.map((c) => `<th class="${num(c) ? "num" : ""}">${esc(labelFor(c))}</th>`).join("");
  const qtyW = Math.max(6, Math.round(28 / Math.max(qtyBills.length + 1, 1)));
  const colgroup = headCols
    .map((c) => `<col style="width:${c.startsWith("qty") || c === "qtyTotal" ? qtyW : colWidthPct(c, fmt)}%" />`)
    .join("");
  let body = "";
  for (const line of rows) {
    if (line.kind === "section") {
      const cls = isTenderAdjSectionKey(line.key) ? "sec adj" : "sec";
      if (fmt.showSl && headCols.length > 1) {
        body += `<tr class="${cls}"><td>${esc(line.sl)}</td><td colspan="${headCols.length - 1}">${esc(line.description)}</td></tr>`;
      } else {
        body += `<tr class="${cls}"><td colspan="${Math.max(headCols.length, 1)}">${esc(`${line.sl} ${line.description}`.trim())}</td></tr>`;
      }
      continue;
    }
    if (line.kind === "total") {
      const amountIdx = headCols.indexOf("amount");
      const grand = /grand total/i.test(line.description);
      const money = grand ? formatReportMoney(line.amount, currency, fmt) : formatReportFigure(line.amount);
      if (amountIdx < 0) {
        body += `<tr class="tot"><td colspan="${Math.max(headCols.length, 1)}">${esc(line.description)} ${esc(money)}</td></tr>`;
      } else {
        const after = headCols.length - amountIdx - 1;
        const label = amountIdx > 0 ? `<td colspan="${amountIdx}">${esc(line.description)}</td>` : "";
        body += `<tr class="tot">${label}<td class="num">${amountIdx === 0 ? `${esc(line.description)} ${esc(money)}` : esc(money)}</td>${Array.from({ length: after }, () => "<td></td>").join("")}</tr>`;
      }
      continue;
    }
    const map: Record<string, string> = {
      sl: esc(reportCell(line, "sl", fmt, currency)),
      description: esc(reportCell(line, "description", fmt, currency)),
      qty: esc(reportCell(line, "qty", fmt, currency)),
      ourQty: esc(reportCell(line, "ourQty", fmt, currency)),
      unit: esc(reportCell(line, "unit", fmt, currency)),
      rate: esc(reportCell(line, "rate", fmt, currency)),
      amount: esc(reportCell(line, "amount", fmt, currency)),
    };
    for (const [k, v] of Object.entries(line.extra ?? {})) map[k] = esc(v);
    const cls = line.kind === "adjustment" ? "adj" : "";
    body += `<tr class="${cls}">${headCols
      .map((c) => {
        if (c === "qtyTotal") return `<td class="num">${esc(formatQty(line.totalQty ?? line.qty))}</td>`;
        if (c.startsWith("qty:")) {
          const i = qtyBills.findIndex((b) => `qty:${b.id}` === c);
          return `<td class="num">${esc(formatCompareQty(line.qtyByBill?.[i] ?? null))}</td>`;
        }
        return `<td class="${num(c) ? "num" : ""}">${map[c] ?? ""}</td>`;
      })
      .join("")}</tr>`;
  }
  if (pageTotal != null && headCols.includes("amount")) {
    const amountIdx = headCols.indexOf("amount");
    const after = headCols.length - amountIdx - 1;
    const label = amountIdx > 0 ? `<td colspan="${amountIdx}">Page total</td>` : "";
    const money = formatReportFigure(pageTotal);
    body += `<tr class="tot">${label}<td class="num">${amountIdx === 0 ? `Page total ${esc(money)}` : esc(money)}</td>${Array.from({ length: after }, () => "<td></td>").join("")}</tr>`;
  }
  return `<table class="doc-table"><colgroup>${colgroup}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
export type SubmissionExportOpts = { qtyByBoq?: boolean };

function unitSummaryHtml(page: ReportPage, currency: string, fmt: ReportFormat): string {
  const table = page.kind === "page-summary" ? "page" : "category";
  const foot = page.kind === "page-summary" ? "Page total" : "Category total";
  const rows = page.summaryRows
    .map((r) => `<tr><td>${esc(r.ref)}. ${esc(r.description)}</td><td class="num">${esc(formatReportFigure(r.amount))}</td></tr>`)
    .join("");
  return `<table class="doc-table">
    <colgroup>
      <col style="width:${summaryColWidthPct(table, "description", fmt)}%" />
      <col style="width:${summaryColWidthPct(table, "amount", fmt)}%" />
    </colgroup>
    <thead><tr><th>Description</th><th class="num">${esc(columnLabel("amount", fmt, undefined, currency))}</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="tot"><td>${foot}</td><td class="num">${esc(formatReportFigure(page.pageAmount))}</td></tr>
    </tbody>
  </table>`;
}

function grandSummaryHtml(page: ReportPage, total: number, currency: string, fmt: ReportFormat): string {
  const rows = page.summaryRows
    .map((r) => `<tr><td>${esc(r.ref)}</td><td>${esc(r.description)}</td><td class="num">${esc(formatReportFigure(r.amount))}</td></tr>`)
    .join("");
  return `<table class="doc-table">
    <colgroup>
      <col style="width:${summaryColWidthPct("grand", "sl", fmt)}%" />
      <col style="width:${summaryColWidthPct("grand", "description", fmt)}%" />
      <col style="width:${summaryColWidthPct("grand", "amount", fmt)}%" />
    </colgroup>
    <thead><tr><th>No.</th><th>Description</th><th class="num">${esc(columnLabel("amount", fmt, undefined, currency))}</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="tot"><td></td><td>Grand total</td><td class="num">${esc(formatReportMoney(total, currency, fmt))}</td></tr>
    </tbody>
  </table>`;
}

export function printSubmission(
  project: LoadedProject,
  format: ReportFormat,
  total: number,
  adj: number,
  scope?: ReportScope | null,
  opts?: SubmissionExportOpts,
): void {
  const fmt = mergeReportFormat(format);
  const doc = buildDocument(project, scope);
  const cols = visibleColumns(fmt, project);
  const paper = fmt.paper === "a3" ? "A3" : fmt.paper === "letter" ? "letter" : "A4";
  const size = `${paper} ${fmt.orientation}`;
  const fs = fmt.fontSize === "sm" ? "11px" : fmt.fontSize === "lg" ? "14px" : "12px";
  const company = fmt.companyName.trim() || "Aerolith Core";
  const dateLine = fmt.showDate ? new Date().toLocaleDateString() : "";
  const rev = fmt.showRevision ? `Revision ${project.revision}${project.sealedAt ? " · sealed" : ""}` : "";
  const itemLines = submissionItemLines(project, fmt, scope);
  const pages = paginateDocument(project, fmt, total, scope, { itemLines });
  const qtyBills = opts?.qtyByBoq ? compareBills(project, scope) : [];
  const layout = submissionLayoutOf(fmt);
  const pageCount = pages.length;
  const logo = fmt.showLogo ? `<div class="mark" aria-hidden="true"></div>` : "";
  const full = isFullJobScope(project, scope);
  const kpis =
    blockOn(fmt, "kpis")
      ? `<p class="meta">${full ? "Grand total" : "This packet"} ${esc(formatReportMoney(total, project.currency, fmt))} · Tender adjustments ${esc(formatReportMoney(adj, project.currency, fmt))} · ${doc.items.length} priced items</p>`
      : "";
  const sub = `${esc(project.name)}${rev ? ` · ${esc(rev)}` : ""}${dateLine ? ` · ${esc(dateLine)}` : ""}`;

  function article(title: string, table: string, idx: number, totHtml: string): string {
    const first = idx === 0;
    const nums = fmt.showPageNumbers ? `Page ${idx + 1} of ${pageCount}` : "";
    return `<article class="sheet${fmt.pageBreak ? " break" : ""} dens-${fmt.lineDensity} tot-${fmt.totalStyle}">
        <div class="head">${logo}<div>
          <h1>${esc(company)}</h1>
          ${fmt.companyAddress.trim() ? `<p class="addr">${esc(fmt.companyAddress)}</p>` : ""}
          <p class="sub">${first ? sub : esc(project.name)}</p>
          ${first && fmt.extraHeader.trim() ? `<p class="sub">${esc(fmt.extraHeader)}</p>` : ""}
        </div></div>
        ${first ? kpis : ""}
        <h2 class="sheet-title">${esc(title)}</h2>
        ${table}
        ${totHtml}
        <div class="sheet-foot"><span>${esc(fmt.footer.trim())}</span><span>${nums}</span></div>
      </article>`;
  }

  const sheets = pages
    .map((page, idx) => {
      const last = idx === pages.length - 1;
      const table =
        page.kind === "items"
          ? billTableHtml(
              page.rows,
              cols,
              fmt,
              project.currency,
              blockOn(fmt, "page-total") ? page.pageAmount : undefined,
              project,
              qtyBills,
            )
          : page.kind === "grand-summary"
            ? grandSummaryHtml(page, total, project.currency, fmt)
            : unitSummaryHtml(page, project.currency, fmt);
      const showClosing =
        (layout === "grand" && last) ||
        ((layout === "page-totals" || layout === "category-totals") && last && page.kind !== "items");
      const tot = showClosing
        ? `<div class="tot">${full ? "Grand total" : "This packet"} ${esc(formatReportMoney(total, project.currency, fmt))}</div>`
        : "";
      return article(page.title, table, idx, tot);
    })
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(project.name)}</title>
<style>
  @page { size: ${size}; margin: 12mm; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #1a1f24; font-size: ${fs}; margin: 0; }
  .sheet { padding: 0 0 8mm; }
  .sheet.break { page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
  .mark { width: 32px; height: 32px; background: #185a5c; flex-shrink: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; letter-spacing: -0.03em; }
  .sheet-title { font-size: 13px; margin: 0 0 10px; }
  .sub, .meta, .sheet-foot { color: #5a6570; }
  .addr { white-space: pre-wrap; margin: 0 0 8px; }
  table.doc-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .doc-table th, .doc-table td { text-align: left; padding: 5px 7px; border: 1px solid #1a1f24; vertical-align: top; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
  .doc-table th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; background: #e8ebef; }
  .doc-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; overflow-wrap: normal; word-break: normal; }
  .doc-table tr.sec td { font-weight: 650; background: #eef1f4; }
  .doc-table tr.adj td { color: #b45309; }
  .doc-table tr.cf td { background: #f7f8fa; }
  .doc-table tr.tot td { font-weight: 650; background: #e8ebef; }
  .tot-boxed .doc-table tr.tot td { border: 2px solid #1a1f24; }
  .tot-rule .doc-table tr.tot td { background: transparent; border-top: 2px solid #1a1f24; }
  .dens-compact .doc-table th, .dens-compact .doc-table td { padding: 3px 6px; }
  .dens-loose .doc-table th, .dens-loose .doc-table td { padding: 8px 10px; }
  .tot { text-align: right; font-weight: 650; font-size: 14px; margin-top: 12px; }
  .sheet-foot { display: flex; justify-content: space-between; margin-top: 14px; font-size: 11px; border-top: 1px solid #d0d5db; padding-top: 6px; }
</style></head><body>
  ${sheets}
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    window.alert("Allow pop-ups to print or save as PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function csvLine(cells: string[]): string {
  return cells.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
}

export function downloadSubmissionCsv(
  project: LoadedProject,
  format: ReportFormat,
  total: number,
  scope?: ReportScope | null,
  opts?: SubmissionExportOpts,
): void {
  const fmt = mergeReportFormat(format);
  const itemLines = submissionItemLines(project, fmt, scope);
  const pages = paginateDocument(project, fmt, total, scope, { itemLines });
  const qtyBills = opts?.qtyByBoq ? compareBills(project, scope) : [];
  const cols = visibleColumns(fmt, project);
  const pivot = qtyBills.length > 1;
  const qtyIdx = cols.indexOf("qty");
  const headCols =
    pivot && qtyIdx >= 0
      ? [...cols.slice(0, qtyIdx), ...qtyBills.map((b) => `qty:${b.id}`), "qtyTotal", ...cols.slice(qtyIdx + 1)]
      : cols;
  const labelFor = (c: string) => {
    if (c === "qtyTotal") return "Qty total";
    if (c.startsWith("qty:")) {
      const bill = qtyBills.find((b) => `qty:${b.id}` === c);
      return bill ? `Qty ${billQtyHeader(bill)}` : "Qty";
    }
    return columnLabel(c, fmt, project, project.currency);
  };
  const rows: string[][] = [headCols.map(labelFor)];

  const emitLine = (line: DocLine) => {
    if (line.kind === "section") {
      rows.push(headCols.map((_c, i) => (i === 0 ? line.sl : i === 1 ? line.description : "")));
      return;
    }
    if (line.kind === "total") {
      const grand = /grand total/i.test(line.description);
      rows.push(
        headCols.map((c) =>
          c === "description"
            ? line.description
            : c === "amount"
              ? grand
                ? formatReportMoney(line.amount, project.currency, fmt)
                : formatReportFigure(line.amount)
              : "",
        ),
      );
      return;
    }
    rows.push(
      headCols.map((c) => {
        if (c === "qtyTotal") return formatQty(line.totalQty ?? line.qty);
        if (c.startsWith("qty:")) {
          const i = qtyBills.findIndex((b) => `qty:${b.id}` === c);
          return formatCompareQty(line.qtyByBill?.[i] ?? null);
        }
        return reportCell(line, c, fmt, project.currency);
      }),
    );
  };

  for (const page of pages) {
    if (page.kind === "items") {
      for (const line of page.rows) emitLine(line);
      if (blockOn(fmt, "page-total") && headCols.includes("amount")) {
        rows.push(headCols.map((c) => (c === "description" ? "Page total" : c === "amount" ? formatReportFigure(page.pageAmount) : "")));
      }
      continue;
    }
    rows.push([]);
    rows.push([page.title]);
    rows.push(["No.", "Description", columnLabel("amount", fmt, undefined, project.currency)]);
    for (const r of page.summaryRows) {
      rows.push([r.ref, r.description, formatReportFigure(r.amount)]);
    }
    if (page.kind === "grand-summary") {
      rows.push(["", "Grand total", formatReportMoney(page.pageAmount, project.currency, fmt)]);
    } else {
      const foot = page.kind === "page-summary" ? "Page total" : "Category total";
      rows.push(["", foot, formatReportFigure(page.pageAmount)]);
    }
  }

  const full = isFullJobScope(project, scope);
  const last = pages[pages.length - 1];
  if (last?.kind !== "grand-summary") {
    rows.push(
      headCols.map((c) =>
        c === "description" ? (full ? "Grand total" : "This packet") : c === "amount" ? formatReportMoney(total, project.currency, fmt) : "",
      ),
    );
  }
  if (!full) {
    rows.push(
      headCols.map((c) =>
        c === "description" ? "Project grand (all BOQs)" : c === "amount" ? formatMoney(projectGrand(project.items), project.currency) : "",
      ),
    );
  }

  const safe = project.name.replace(/[^\w\- ]+/g, "").trim() || "submission";
  downloadText(`${safe}-r${project.revision}.csv`, rows.map(csvLine).join("\n"));
}
