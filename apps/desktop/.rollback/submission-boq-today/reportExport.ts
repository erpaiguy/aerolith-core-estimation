import { formatQty } from "@aerolith/shared";
import { downloadText } from "./buyProcurement";
import type { LoadedProject } from "./model";
import {
  blockOn,
  buildDocument,
  colWidthPct,
  columnLabel,
  formatReportMoney,
  formatReportRate,
  isFullJobScope,
  isNumericColumn,
  mergeReportFormat,
  paginateDocument,
  qtyForLine,
  submissionCsv,
  summaryColWidthPct,
  visibleColumns,
  type DocLine,
  type ReportFormat,
  type ReportPage,
  type ReportScope,
} from "./reportFormat";

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
): string {
  const head = cols
    .map((c) => `<th class="${isNumericColumn(c, project) ? "num" : ""}">${esc(columnLabel(c, fmt, project))}</th>`)
    .join("");
  const colgroup = cols.map((c) => `<col style="width:${colWidthPct(c, fmt)}%" />`).join("");
  let body = "";
  for (const line of rows) {
    if (line.kind === "section") {
      const cls = line.key === "sec-7" ? "sec adj" : "sec";
      if (fmt.showSl && cols.length > 1) {
        body += `<tr class="${cls}"><td>${esc(line.sl)}</td><td colspan="${cols.length - 1}">${esc(line.description)}</td></tr>`;
      } else {
        body += `<tr class="${cls}"><td colspan="${Math.max(cols.length, 1)}">${esc(`${line.sl} ${line.description}`.trim())}</td></tr>`;
      }
      continue;
    }
    if (line.kind === "total") {
      const amountIdx = cols.indexOf("amount");
      if (amountIdx < 0) {
        body += `<tr class="tot"><td colspan="${Math.max(cols.length, 1)}">${esc(line.description)} ${esc(formatReportMoney(line.amount, currency, fmt))}</td></tr>`;
      } else {
        const after = cols.length - amountIdx - 1;
        const label = amountIdx > 0 ? `<td colspan="${amountIdx}">${esc(line.description)}</td>` : "";
        const money =
          amountIdx === 0
            ? `${esc(line.description)} ${esc(formatReportMoney(line.amount, currency, fmt))}`
            : esc(formatReportMoney(line.amount, currency, fmt));
        body += `<tr class="tot">${label}<td class="num">${money}</td>${Array.from({ length: after }, () => "<td></td>").join("")}</tr>`;
      }
      continue;
    }
    const qty = qtyForLine(line, fmt);
    const map: Record<string, string> = {
      sl: esc(line.sl),
      description: esc(line.description),
      qty: esc(formatQty(qty)),
      ourQty: line.ourQty == null ? "" : esc(formatQty(line.ourQty)),
      unit: esc(line.unit),
      rate: esc(formatReportRate(line.rate, currency, fmt)),
      amount: esc(formatReportMoney(line.amount, currency, fmt)),
    };
    for (const [k, v] of Object.entries(line.extra ?? {})) map[k] = esc(v);
    const cls = line.kind === "adjustment" ? "adj" : "";
    body += `<tr class="${cls}">${cols
      .map((c) => `<td class="${isNumericColumn(c, project) ? "num" : ""}">${map[c] ?? ""}</td>`)
      .join("")}</tr>`;
  }
  if (pageTotal != null && cols.includes("amount")) {
    const amountIdx = cols.indexOf("amount");
    const after = cols.length - amountIdx - 1;
    const label = amountIdx > 0 ? `<td colspan="${amountIdx}">Page total</td>` : "";
    const money = amountIdx === 0 ? `Page total ${esc(formatReportMoney(pageTotal, currency, fmt))}` : esc(formatReportMoney(pageTotal, currency, fmt));
    body += `<tr class="tot">${label}<td class="num">${money}</td>${Array.from({ length: after }, () => "<td></td>").join("")}</tr>`;
  }
  return `<table class="doc-table"><colgroup>${colgroup}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function unitSummaryHtml(page: ReportPage, currency: string, fmt: ReportFormat): string {
  const table = page.kind === "page-summary" ? "page" : "category";
  const rows = page.summaryRows
    .map((r) => `<tr><td>${esc(r.ref)}. ${esc(r.description)}</td><td class="num">${esc(formatReportMoney(r.amount, currency, fmt))}</td></tr>`)
    .join("");
  return `<table class="doc-table">
    <colgroup>
      <col style="width:${summaryColWidthPct(table, "description", fmt)}%" />
      <col style="width:${summaryColWidthPct(table, "amount", fmt)}%" />
    </colgroup>
    <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="tot"><td>Page total</td><td class="num">${esc(formatReportMoney(page.pageAmount, currency, fmt))}</td></tr>
    </tbody>
  </table>`;
}

function grandSummaryHtml(page: ReportPage, total: number, currency: string, fmt: ReportFormat): string {
  const rows = page.summaryRows
    .map((r) => `<tr><td>${esc(r.ref)}</td><td>${esc(r.description)}</td><td class="num">${esc(formatReportMoney(r.amount, currency, fmt))}</td></tr>`)
    .join("");
  return `<table class="doc-table">
    <colgroup>
      <col style="width:${summaryColWidthPct("grand", "sl", fmt)}%" />
      <col style="width:${summaryColWidthPct("grand", "description", fmt)}%" />
      <col style="width:${summaryColWidthPct("grand", "amount", fmt)}%" />
    </colgroup>
    <thead><tr><th>No.</th><th>Description</th><th class="num">Amount</th></tr></thead>
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
): void {
  const fmt = mergeReportFormat(format);
  const doc = buildDocument(project, scope);
  const cols = visibleColumns(fmt, project);
  const paper = fmt.paper === "letter" ? "letter" : "A4";
  const size = `${paper} ${fmt.orientation}`;
  const fs = fmt.fontSize === "sm" ? "11px" : fmt.fontSize === "lg" ? "14px" : "12px";
  const company = fmt.companyName.trim() || "Aerolith Core";
  const dateLine = fmt.showDate ? new Date().toLocaleDateString() : "";
  const rev = fmt.showRevision ? `Revision ${project.revision}${project.sealedAt ? " · sealed" : ""}` : "";
  const pages = paginateDocument(project, fmt, total, scope);
  const logo = fmt.showLogo ? `<div class="mark" aria-hidden="true"></div>` : "";
  const full = isFullJobScope(project, scope);
  const kpis =
    blockOn(fmt, "kpis")
      ? `<p class="meta">${full ? "Grand total" : "This packet"} ${esc(formatReportMoney(total, project.currency, fmt))} · Tender adjustments ${esc(formatReportMoney(adj, project.currency, fmt))} · ${doc.items.length} priced items</p>`
      : "";
  const sub = `${esc(project.name)}${rev ? ` · ${esc(rev)}` : ""}${dateLine ? ` · ${esc(dateLine)}` : ""}`;

  const sheets = pages
    .map((page, idx) => {
      const first = idx === 0;
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
            )
          : page.kind === "grand-summary"
            ? grandSummaryHtml(page, total, project.currency, fmt)
            : unitSummaryHtml(page, project.currency, fmt);
      const tot =
        page.kind === "grand-summary" || (last && !fmt.showGrandSummary)
          ? `<div class="tot">${full ? "Grand total" : "This packet"} ${esc(formatReportMoney(total, project.currency, fmt))}</div>`
          : "";
      const nums = fmt.showPageNumbers ? `Page ${page.pageNo} of ${pages.length}` : "";
      return `<article class="sheet${fmt.pageBreak ? " break" : ""} dens-${fmt.lineDensity} tot-${fmt.totalStyle}">
        <div class="head">${logo}<div>
          <h1>${esc(company)}</h1>
          ${fmt.companyAddress.trim() ? `<p class="addr">${esc(fmt.companyAddress)}</p>` : ""}
          <p class="sub">${first ? sub : esc(project.name)}</p>
          ${first && fmt.extraHeader.trim() ? `<p class="sub">${esc(fmt.extraHeader)}</p>` : ""}
        </div></div>
        ${first ? kpis : ""}
        <h2 class="sheet-title">${esc(page.title)}</h2>
        ${table}
        ${tot}
        <div class="sheet-foot"><span>${esc(fmt.footer.trim())}</span><span>${nums}</span></div>
      </article>`;
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

export function downloadSubmissionCsv(
  project: LoadedProject,
  format: ReportFormat,
  total: number,
  scope?: ReportScope | null,
): void {
  const safe = project.name.replace(/[^\w\- ]+/g, "").trim() || "submission";
  const tag = scope?.content === "summaries" ? "-summaries" : scope?.content === "items" ? "-items" : "";
  downloadText(`${safe}-r${project.revision}${tag}.csv`, submissionCsv(project, mergeReportFormat(format), total, scope));
}
