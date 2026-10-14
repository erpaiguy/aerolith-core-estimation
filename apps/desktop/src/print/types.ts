import type { ReportFormat, ReportPaper } from "../reportFormat";

export type PrintAlign = "left" | "right";

export type PrintColumn = {
  label: string;
  width: number;
  align?: PrintAlign;
};

export type PrintRow = {
  cells: string[];
  kind?: "item" | "section" | "total";
};

export type PrintSection = {
  title?: string;
  columns: PrintColumn[];
  rows: PrintRow[];
};

/** One printable job document. Letterhead fields come from the shared report format. */
export type PrintDocument = {
  filename: string;
  documentTitle: string;
  projectName: string;
  paper: ReportPaper;
  orientation: "portrait" | "landscape";
  format: ReportFormat;
  revision?: string;
  sections: PrintSection[];
};

export function jobDocument(
  projectName: string,
  revision: string,
  format: ReportFormat,
  title: string,
  sections: PrintSection[],
): PrintDocument {
  return {
    filename: `${projectName} ${title}`,
    documentTitle: title,
    projectName,
    paper: format.paper,
    orientation: format.orientation,
    format,
    revision,
    sections,
  };
}

export function safePdfName(name: string): string {
  const base = name.replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").trim() || "BidCraft";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}
