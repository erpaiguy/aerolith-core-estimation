import { formatQty } from "@aerolith/shared";
import type { LoadedProject } from "../model";
import {
  buildDocument,
  columnLabel,
  colWidthPct,
  documentLines,
  formatForClientBoq,
  formatReportFigure,
  isNumericColumn,
  mergeReportFormat,
  paginateDocument,
  qtyForLine,
  visibleColumns,
  type DocLine,
  type ReportFormat,
  type ReportPage,
  type ReportScope,
} from "../reportFormat";
import type { PrintColumn, PrintDocument, PrintRow, PrintSection } from "./types";

function cellsFor(line: DocLine, fmt: ReportFormat, cols: string[], showRates: boolean): string[] {
  const qty = qtyForLine(line, fmt);
  const map: Record<string, string> = {
    sl: line.sl,
    description: line.description,
    qty: formatQty(qty),
    ourQty: line.ourQty == null ? "" : formatQty(line.ourQty),
    unit: line.unit,
    rate: showRates ? line.rateLabel || formatReportFigure(line.rate) : "",
    amount: showRates ? line.amountLabel || formatReportFigure(line.amount) : "",
    ...(line.extra ?? {}),
  };
  return cols.map((c) => map[c] ?? "");
}

function itemSection(page: ReportPage, fmt: ReportFormat, project: LoadedProject, currency: string, showRates: boolean): PrintSection {
  const cols = visibleColumns(fmt, project).filter((c) => showRates || (c !== "rate" && c !== "amount"));
  const columns: PrintColumn[] = cols.map((c) => ({
    label: columnLabel(c, fmt, project, currency),
    width: colWidthPct(c, fmt),
    align: isNumericColumn(c, project) ? "right" : "left",
  }));
  const rows: PrintRow[] = page.rows.map((line) => ({
    kind: line.kind === "section" ? "section" : line.kind === "total" || line.kind === "adjustment" ? "total" : "item",
    cells: cellsFor(line, fmt, cols, showRates),
  }));
  return { title: page.title, columns, rows };
}

function summarySection(page: ReportPage, fmt: ReportFormat, currency: string): PrintSection {
  const columns: PrintColumn[] = [
    { label: "Description", width: 70 },
    { label: columnLabel("amount", fmt, undefined, currency), width: 30, align: "right" },
  ];
  const rows: PrintRow[] = page.summaryRows.map((row) => ({
    kind: "item" as const,
    cells: [`${row.ref ? `${row.ref}. ` : ""}${row.description}`, formatReportFigure(row.amount)],
  }));
  if (page.kind === "grand-summary") {
    rows.push({ kind: "total", cells: ["Grand total", formatReportFigure(page.pageAmount)] });
  }
  return { title: page.title, columns, rows };
}

export function packetPrintDocument(
  project: LoadedProject,
  format: ReportFormat | Partial<ReportFormat> | null | undefined,
  total: number,
  scope: ReportScope | null | undefined,
  opts: { title: string; showRates: boolean; client?: boolean },
): PrintDocument {
  const fmt = opts.client ? formatForClientBoq(format) : mergeReportFormat(format);
  const sections = opts.client
    ? [
        itemSection(
          {
            kind: "items",
            pageNo: 1,
            title: opts.title,
            rows: documentLines(buildDocument(project, scope), fmt),
            pageAmount: total,
            carriedForward: 0,
            cumulative: total,
            summaryRows: [],
          },
          fmt,
          project,
          project.currency,
          false,
        ),
      ]
    : paginateDocument(project, fmt, total, scope).map((page) =>
        page.kind === "items"
          ? itemSection(page, fmt, project, project.currency, opts.showRates)
          : summarySection(page, fmt, project.currency),
      );
  return {
    filename: `${project.name} ${opts.title}`,
    documentTitle: opts.title,
    projectName: project.name,
    paper: fmt.paper,
    orientation: fmt.orientation,
    format: fmt,
    revision: project.sealedAt ? `r${project.revision} sealed` : `r${project.revision}`,
    sections,
  };
}
