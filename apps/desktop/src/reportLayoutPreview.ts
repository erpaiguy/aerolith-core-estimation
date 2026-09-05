import {
  blockOn,
  columnLabel,
  enabledReportBlocks,
  moneyUnitLabel,
  visibleColumns,
  type ReportBlockType,
  type ReportFormat,
} from "./reportFormat";

export type PreviewColumn = { id: string; label: string; numeric: boolean };

export type LayoutPreviewModel = {
  paperLabel: string;
  flowLabel: string;
  company: string;
  address: string;
  cover: string;
  footer: string;
  job: string;
  logo: boolean;
  date: boolean;
  revision: boolean;
  pageNumbers: boolean;
  section7: boolean;
  columns: PreviewColumn[];
  blocks: ReportBlockType[];
};

const NUMERIC = new Set(["qty", "ourQty", "rate", "amount"]);

export function layoutPreviewModel(fmt: ReportFormat, currency = "QAR"): LayoutPreviewModel {
  const paper = fmt.paper === "letter" ? "Letter" : fmt.paper.toUpperCase();
  const orient = fmt.orientation === "landscape" ? "landscape" : "portrait";
  return {
    paperLabel: `${paper} ${orient}`,
    flowLabel: fmt.layoutMode === "paged" ? "Paged sheets" : "Continuous scroll",
    company: fmt.companyName.trim() || "Company name",
    address: fmt.companyAddress.trim() || "Address / letterhead",
    cover: fmt.extraHeader.trim() || "Cover note",
    footer: fmt.footer.trim() || "Footer",
    job: "Job name",
    logo: fmt.showLogo,
    date: fmt.showDate,
    revision: fmt.showRevision,
    pageNumbers: fmt.layoutMode === "paged" && fmt.showPageNumbers && blockOn(fmt, "footer"),
    section7: fmt.showSection7,
    columns: visibleColumns(fmt).map((id) => ({
      id,
      label: columnLabel(id, fmt, undefined, currency),
      numeric: NUMERIC.has(id),
    })),
    blocks: enabledReportBlocks(fmt).map((b) => b.type),
  };
}

export function conceptualCell(col: string, kind: "section" | "item" | "total", topic: string): string {
  if (kind === "section") {
    if (col === "description") return topic;
    return "";
  }
  if (kind === "total") {
    if (col === "description") return topic;
    if (col === "amount") return "Amount";
    return "";
  }
  if (col === "sl") return "No.";
  if (col === "description") return topic;
  if (col === "qty" || col === "ourQty") return "Qty";
  if (col === "unit") return "Unit";
  if (col === "rate") return "Rate";
  if (col === "amount") return "Amount";
  return "";
}

export function moneyStyleHint(fmt: ReportFormat, currency: string): string {
  const unit = moneyUnitLabel(currency, fmt);
  if (fmt.moneyStyle === "plain") return "Rate / Amount cells: figure only";
  if (fmt.moneyStyle === "symbol") return `Rate / Amount cells: ${unit} then figure`;
  if (fmt.moneyStyle === "code") return `Rate / Amount cells: ${currency} then figure`;
  return `Rate / Amount headings carry ${unit}`;
}
