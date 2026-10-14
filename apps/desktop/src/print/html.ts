import logoSvg from "../brand/kit/bidcraft/logo-on-light.svg?raw";
import type { PrintDocument } from "./types";

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

function pageCss(doc: PrintDocument): string {
  const name = doc.paper === "a3" ? "A3" : doc.paper === "letter" ? "letter" : "A4";
  return `${name} ${doc.orientation}`;
}

export function documentHtml(doc: PrintDocument): string {
  const company = doc.format.companyName.trim();
  const logo = doc.format.showLogo ? `<div class="logo">${logoSvg}</div>` : "";
  const address = doc.format.companyAddress.trim()
    ? `<p class="addr">${esc(doc.format.companyAddress)}</p>`
    : "";
  const sections = doc.sections
    .map((section) => {
      const head = section.columns
        .map((col) => `<th class="${col.align === "right" ? "num" : ""}">${esc(col.label)}</th>`)
        .join("");
      const cols = section.columns.map((col) => `<col style="width:${Math.max(col.width, 1)}%"/>`).join("");
      const body = section.rows
        .map((row) => {
          const cells = section.columns
            .map((col, i) => `<td class="${col.align === "right" ? "num" : ""}">${esc(row.cells[i] ?? "")}</td>`)
            .join("");
          return `<tr class="${row.kind ?? "item"}">${cells}</tr>`;
        })
        .join("");
      return `${section.title ? `<h2>${esc(section.title)}</h2>` : ""}<table><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(doc.projectName)} — ${esc(doc.documentTitle)}</title>
<style>
  @page { size: ${pageCss(doc)}; margin: 12mm; }
  html, body { margin: 0; color: #23262d; font: 12px/1.35 "Segoe UI", sans-serif; }
  .logo svg { height: 32px; width: auto; display: block; }
  header { display: flex; gap: 12px; align-items: center; min-height: 48px; margin-bottom: 10px; }
  h1 { font-size: 16px; margin: 0; font-weight: 600; }
  h2 { font-size: 13px; margin: 14px 0 6px; }
  .job { margin: 2px 0 0; }
  .addr, .meta { color: #5a5f65; margin: 0; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 8px; }
  th, td { border: 1px solid #23262d; padding: 4px 6px; vertical-align: top; overflow-wrap: anywhere; }
  th { font-size: 9px; letter-spacing: 0.04em; text-transform: uppercase; background: #f6f4f0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.section td { font-weight: 650; background: #f3eee8; }
  tr.total td { font-weight: 650; background: #efeae4; }
  footer { margin-top: 16px; color: #5a5f65; font-size: 10px; border-top: 1px solid #23262d; padding-top: 6px; }
</style></head><body>
<header>${logo}<div>
  ${company ? `<h1>${esc(company)}</h1>` : ""}
  <p class="job">${esc(doc.projectName)}</p>
  ${address}
  <p class="meta">${esc(doc.documentTitle)}${doc.revision ? ` · Revision ${esc(doc.revision)}` : ""}</p>
</div></header>
${sections || "<p>Nothing to print.</p>"}
<footer>${esc(doc.format.footer.trim())}</footer>
</body></html>`;
}
