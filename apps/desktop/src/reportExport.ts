import { downloadText } from "./buyProcurement";
import type { LoadedProject } from "./model";
import {
  blockOn,
  columnLabel,
  formatReportFigure,
  formatReportMoney,
  isFullJobScope,
  mergeReportFormat,
  paginateDocument,
  reportCell,
  visibleColumns,
  type DocLine,
  type ReportFormat,
  type ReportScope,
} from "./reportFormat";
import { billQtyHeader, compareBills, formatCompareQty, submissionItemLines } from "./submissionCompare";
import { formatMoney, formatQty } from "@aerolith/shared";
import { projectGrand } from "./bills";

export type SubmissionExportOpts = { qtyByBoq?: boolean };

/** Prints the submission packet through the shared letterhead. The desktop app opens the system print dialog. */
export function printSubmission(
  project: LoadedProject,
  format: ReportFormat,
  total: number,
  _adj: number,
  scope?: ReportScope | null,
  _opts?: SubmissionExportOpts,
): void {
  void _adj;
  void _opts;
  void import("./print/packet").then(async (packet) => {
    const doc = packet.packetPrintDocument(project, format, total, scope, { title: "Submission BOQ", showRates: true });
    const actions = await import("./print/actions");
    await actions.printDocument(doc);
  });
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
