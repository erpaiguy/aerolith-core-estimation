import { mergeReportFormat, paginateDocument, type ReportFormat } from "../reportFormat";
import { downloadText } from "../buyProcurement";
import { jobFigures, num } from "./figures";
import type { LoadedProject } from "../model";
import { printDocument } from "../print/actions";
import { jobDocument } from "../print/types";

export type ReportSuite = {
  id: string;
  title: string;
  blurb: string;
  heads: string[];
  rows: string[][];
};

function money(n: number): string {
  return num(n);
}

function billLines(project: LoadedProject, billId: string | null, qty: "issued" | "our"): string[][] {
  const format = mergeReportFormat({ qtyColumn: qty, showSection7: qty === "issued" });
  const pages = paginateDocument(project, format, jobFigures(project, billId).total, {
    billIds: billId ? [billId] : "all",
    categoryKeys: "all",
    content: "both",
  });
  const rows: string[][] = [];
  for (const page of pages) {
    if (page.kind !== "items") {
      rows.push([page.title, "", "", "", "", ""]);
      for (const row of page.summaryRows) rows.push([row.ref, row.description, "", "", "", money(row.amount)]);
      continue;
    }
    for (const line of page.rows) {
      const qtyValue = qty === "our" && line.ourQty != null ? line.ourQty : line.qty;
      rows.push([
        line.sl,
        line.description,
        line.kind === "item" ? line.unit : "",
        line.kind === "section" ? "" : money(qtyValue),
        line.kind === "item" || line.kind === "adjustment" ? money(line.rate) : "",
        money(line.amount),
      ]);
    }
  }
  return rows;
}

export function reportSuites(project: LoadedProject, billId: string | null): ReportSuite[] {
  const fig = jobFigures(project, billId);
  const billHeads = ["No.", "Description", "Unit", "Qty", "Rate (QAR)", "Amount (QAR)"];
  const analysis: string[][] = [];
  for (const item of fig.items) {
    if (!item.lines.length && !(item.directCost ?? 0)) continue;
    analysis.push([item.boqCode, item.description, item.unit ?? "", String(item.lines.length), money(item.result?.unitCost ?? item.directCost ?? 0), money(item.result?.rate ?? 0), money(item.result?.amount ?? 0)]);
    item.lines.forEach((line, index) => {
      const qty = Number(line.factors?.[0] ?? 0);
      const cost = qty * (1 + (line.wastagePct || 0)) * line.resourceRate;
      analysis.push(["", `${index + 1}. ${line.description || line.projectResourceCode || "Component"}`, line.unit ?? "", money(qty), money(line.resourceRate), money(cost), ""]);
    });
  }
  const resources = fig.tree.flatMap((node) => [
    [node.label, money(node.amount), fig.cost ? `${num((node.amount / fig.cost) * 100, 1)}%` : "—", String(node.leaves.length + node.children.length)],
    ...node.children.map((child) => [`  ${child.label}`, money(child.amount), "", String(child.leaves.length)]),
  ]);
  const adjustments = fig.qtyDiff.map((item) => {
    const deltaQty = item.ourQty - item.clientQty;
    const rate = item.result?.rate ?? 0;
    return [item.boqCode, item.description, item.unit ?? "", money(item.clientQty), money(item.ourQty), money(deltaQty), money(deltaQty * rate)];
  });
  const queries = (project.queryItems ?? []).map((item) => [
    item.number,
    item.closedAt ? "Closed" : "Open",
    item.documentRef,
    item.subject || "Untitled",
    item.question,
    item.replies.at(-1)?.body ?? "",
  ]);
  return [
    { id: "submission", title: "Submission BOQ", blurb: "Client bill with rates and Section 7", heads: billHeads, rows: billLines(project, billId, "issued") },
    { id: "working", title: "Working BOQ", blurb: "Internal bill with our quantities", heads: billHeads, rows: billLines(project, billId, "our") },
    { id: "analysis", title: "Rate analysis sheets", blurb: "One block per item, with components and margin", heads: ["No.", "Description", "Unit", "Lines", "Direct", "Rate", "Amount"], rows: analysis },
    { id: "resources", title: "Resource schedule", blurb: "Totals by cost category", heads: ["Category", "Cost (QAR)", "Share", "Groups"], rows: resources },
    { id: "adjustments", title: "Tender adjustments", blurb: "Quantity differences versus the client", heads: ["No.", "Description", "Unit", "Client qty", "Our qty", "Difference", "Amount (QAR)"], rows: adjustments },
    { id: "queries", title: "Client query log", blurb: "Questions and answers with dates", heads: ["No.", "Status", "Ref", "Subject", "Question", "Latest answer"], rows: queries },
  ];
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function downloadSuite(projectName: string, suite: ReportSuite): void {
  const body = [suite.heads, ...suite.rows].map((row) => row.map((cell) => csvCell(cell ?? "")).join(",")).join("\r\n");
  downloadText(`${projectName} ${suite.title}.csv`, body);
}

export async function printSuite(project: LoadedProject, suite: ReportSuite, format: ReportFormat): Promise<void> {
  const width = Math.max(8, Math.floor(100 / Math.max(suite.heads.length, 1)));
  const doc = jobDocument(
    project.name,
    project.sealedAt ? `r${project.revision} sealed` : `r${project.revision} draft`,
    format,
    suite.title,
    [
      {
        title: suite.title,
        columns: suite.heads.map((label, index) => ({
          label,
          width: index === suite.heads.length - 1 ? 100 - width * (suite.heads.length - 1) : width,
          align: index >= Math.max(suite.heads.length - 3, 1) ? "right" : "left",
        })),
        rows: suite.rows.map((cells) => ({
          cells,
          kind: cells[0] && !cells[2] && !cells[3] ? "section" : "item",
        })),
      },
    ],
  );
  await printDocument(doc);
}
