import { formatQty } from "@aerolith/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LoadedProject, ProjectBill } from "../model";
import {
  buildDocument,
  blockOn,
  colWidthPct,
  columnLabel,
  fitSubmissionPaper,
  formatForClientBoq,
  formatForSubmissionLayout,
  formatReportFigure,
  formatReportMoney,
  isFullJobScope,
  isNumericColumn,
  isTenderAdjSectionKey,
  listReportCategories,
  mergeReportFormat,
  packetAmount,
  paginateDocument,
  documentLines,
  qtyForLine,
  scopedBillIds,
  submissionLayoutOf,
  SUBMISSION_LAYOUTS,
  summaryColWidthPct,
  visibleColumns,
  type DocLine,
  type ReportContent,
  type ReportFormat,
  type ReportPage,
  type ReportPaper,
  type ReportScope,
  type StoredReportTemplate,
  type SubmissionLayoutId,
} from "../reportFormat";
import { billById, billIdsFromFocus, billSourceLocked, billTotal, projectGrand, sortedBills } from "../bills";
import { BrandLockup, BrandMark } from "./Brand";
import { MenuSelect } from "../ui/MenuSelect";
import { Split } from "../ui/Split";
import { type ReportFormatPack } from "./ReportDesigner";
import { SubmissionSheet, submissionExceptions } from "./SubmissionSheet";
import { billQtyHeader, compareBills, formatCompareQty, shouldPivotQtyByBoq, submissionItemLines } from "../submissionCompare";

function lineCells(line: DocLine, fmt: ReportFormat, _currency: string, showRates: boolean): Record<string, string> {
  const qty = qtyForLine(line, fmt);
  return {
    sl: line.sl,
    description: line.description,
    qty: formatQty(qty),
    ourQty: line.ourQty == null ? "" : formatQty(line.ourQty),
    unit: line.unit,
    rate: showRates ? line.rateLabel || formatReportFigure(line.rate) : "—",
    amount: showRates ? line.amountLabel || formatReportFigure(line.amount) : "—",
    ...(line.extra ?? {}),
  };
}

function Letterhead({
  project,
  fmt,
  mode,
}: {
  project: LoadedProject;
  fmt: ReportFormat;
  mode: "source" | "submit";
}) {
  const company = fmt.companyName.trim();
  return (
    <div className="doc-letterhead">
      {fmt.showLogo ? (company ? <BrandMark size={32} /> : <BrandLockup size="sm" />) : null}
      <div>
        {company ? <div className="title">{company}</div> : mode === "source" ? <div className="title">{project.name}</div> : null}
        {company ? <div className="title job">{project.name}</div> : mode === "submit" && !company ? <div className="title">{project.name}</div> : null}
        {fmt.companyAddress.trim() ? <div className="addr">{fmt.companyAddress}</div> : null}
      </div>
    </div>
  );
}

function AmountFootRow({
  label,
  amount,
  cols,
  currency,
  fmt,
  withCurrency = false,
  qtyExtra = 0,
}: {
  label: string;
  amount: number;
  cols: string[];
  currency: string;
  fmt: ReportFormat;
  withCurrency?: boolean;
  qtyExtra?: number;
}) {
  const amountIdx = cols.indexOf("amount");
  if (amountIdx < 0) return null;
  const after = cols.length - amountIdx - 1;
  const shown = withCurrency ? formatReportMoney(amount, currency, fmt) : formatReportFigure(amount);
  const lead = amountIdx + qtyExtra;
  return (
    <tr className="tot">
      {lead > 0 ? <td colSpan={lead}>{label}</td> : null}
      <td className="num">
        {lead === 0 ? `${label} ${shown}` : shown}
      </td>
      {Array.from({ length: after }, (_, i) => (
        <td key={i} />
      ))}
    </tr>
  );
}

function BillTable({
  rows,
  fmt,
  currency,
  showRates,
  pageTotal,
  project,
  qtyBills = [],
}: {
  rows: DocLine[];
  fmt: ReportFormat;
  currency: string;
  showRates: boolean;
  pageTotal?: number;
  project?: LoadedProject;
  qtyBills?: ProjectBill[];
}) {
  const cols = visibleColumns(fmt, project);
  const pivot = qtyBills.length > 1;
  const qtyIdx = cols.indexOf("qty");
  const headCols = pivot && qtyIdx >= 0
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
  const numeric = (c: string) => c === "qtyTotal" || c.startsWith("qty:") || isNumericColumn(c, project);
  const colSpanRest = headCols.length - 1;

  return (
    <table className="doc-table">
      <colgroup>
        {headCols.map((c) => (
          <col key={c} style={{ width: `${c.startsWith("qty") ? Math.max(6, Math.round(28 / Math.max(qtyBills.length + 1, 1))) : colWidthPct(c === "qtyTotal" ? "qty" : c, fmt)}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {headCols.map((c) => (
            <th key={c} className={numeric(c) ? "num" : undefined}>
              {labelFor(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={Math.max(headCols.length, 1)}>No bill lines yet. Add items on Working BOQ.</td>
          </tr>
        ) : (
          rows.map((line) => {
            if (line.kind === "section") {
              return (
                <tr className={isTenderAdjSectionKey(line.key) ? "sec adj" : "sec"} key={line.key}>
                  {fmt.showSl && headCols.length > 1 ? (
                    <>
                      <td>{line.sl}</td>
                      <td colSpan={colSpanRest}>{line.description}</td>
                    </>
                  ) : (
                    <td colSpan={Math.max(headCols.length, 1)}>{`${line.sl} ${line.description}`.trim()}</td>
                  )}
                </tr>
              );
            }
            if (line.kind === "total") {
              const grand = /grand total/i.test(line.description);
              return (
                <AmountFootRow
                  key={line.key}
                  label={line.description}
                  amount={line.amount}
                  cols={headCols.map((c) => (c.startsWith("qty") || c === "qtyTotal" ? "skip" : c === "amount" ? "amount" : c))}
                  currency={currency}
                  fmt={fmt}
                  withCurrency={grand}
                />
              );
            }
            const cells = lineCells(line, fmt, currency, showRates);
            return (
              <tr className={line.kind === "adjustment" ? "adj" : undefined} key={line.key}>
                {headCols.map((c) => {
                  if (c === "qtyTotal") {
                    return (
                      <td key={c} className="num">
                        {formatQty(line.totalQty ?? qtyForLine(line, fmt))}
                      </td>
                    );
                  }
                  if (c.startsWith("qty:")) {
                    const i = qtyBills.findIndex((b) => `qty:${b.id}` === c);
                    const q = line.qtyByBill?.[i] ?? null;
                    return (
                      <td key={c} className="num">
                        {formatCompareQty(q)}
                      </td>
                    );
                  }
                  return (
                    <td key={c} className={numeric(c) ? "num" : undefined}>
                      {cells[c] ?? ""}
                    </td>
                  );
                })}
              </tr>
            );
          })
        )}
        {showRates && pageTotal != null ? (
          <AmountFootRow label="Page total" amount={pageTotal} cols={headCols.map((c) => (c === "amount" ? "amount" : c.startsWith("qty") || c === "qtyTotal" ? "skip" : c))} currency={currency} fmt={fmt} />
        ) : null}
      </tbody>
    </table>
  );
}

function UnitSummaryTable({ page, fmt, currency }: { page: ReportPage; fmt: ReportFormat; currency: string }) {
  const table = page.kind === "page-summary" ? "page" : "category";
  const foot = page.kind === "page-summary" ? "Page total" : "Category total";
  return (
    <table className="doc-table">
      <colgroup>
        <col style={{ width: `${summaryColWidthPct(table, "description", fmt)}%` }} />
        <col style={{ width: `${summaryColWidthPct(table, "amount", fmt)}%` }} />
      </colgroup>
      <thead>
        <tr>
          <th>Description</th>
          <th className="num">{columnLabel("amount", fmt, undefined, currency)}</th>
        </tr>
      </thead>
      <tbody>
        {page.summaryRows.length === 0 ? (
          <tr>
            <td colSpan={2}>No pages in this summary.</td>
          </tr>
        ) : (
          page.summaryRows.map((r, i) => (
            <tr key={`${r.ref}-${i}`}>
              <td>
                {r.ref}. {r.description}
              </td>
              <td className="num">{formatReportFigure(r.amount)}</td>
            </tr>
          ))
        )}
        <tr className="tot">
          <td>{foot}</td>
          <td className="num">{formatReportFigure(page.pageAmount)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function GrandSummaryTable({
  page,
  fmt,
  total,
  currency,
}: {
  page: ReportPage;
  fmt: ReportFormat;
  total: number;
  currency: string;
}) {
  return (
    <table className="doc-table">
      <colgroup>
        <col style={{ width: `${summaryColWidthPct("grand", "sl", fmt)}%` }} />
        <col style={{ width: `${summaryColWidthPct("grand", "description", fmt)}%` }} />
        <col style={{ width: `${summaryColWidthPct("grand", "amount", fmt)}%` }} />
      </colgroup>
      <thead>
        <tr>
          <th>No.</th>
          <th>Description</th>
          <th className="num">{columnLabel("amount", fmt, undefined, currency)}</th>
        </tr>
      </thead>
      <tbody>
        {page.summaryRows.length === 0 ? (
          <tr>
            <td colSpan={3}>No summary units.</td>
          </tr>
        ) : (
          page.summaryRows.map((r, i) => (
            <tr key={`${r.ref}-${i}`}>
              <td>{r.ref}</td>
              <td>{r.description}</td>
              <td className="num">{formatReportFigure(r.amount)}</td>
            </tr>
          ))
        )}
        <tr className="tot">
          <td />
          <td>Grand total</td>
          <td className="num">{formatReportMoney(total, currency, fmt)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function SheetFoot({
  fmt,
  pageNo,
  pageCount,
}: {
  fmt: ReportFormat;
  pageNo: number;
  pageCount: number;
}) {
  return (
    <div className="doc-sheet-foot">
      <span>{fmt.footer.trim()}</span>
      {fmt.showPageNumbers ? (
        <span>
          Page {pageNo} of {pageCount}
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}

export function DocumentRenderer({
  project,
  total,
  adj,
  mode,
  format,
  scope,
  projectGrandTotal,
}: {
  project: LoadedProject;
  total: number;
  adj: number;
  mode: "source" | "submit";
  format?: Partial<ReportFormat> | null;
  scope?: ReportScope | null;
  projectGrandTotal?: number;
}) {
  const fmt = mode === "source" ? formatForClientBoq(format) : mergeReportFormat(format);
  const doc = buildDocument(project, scope);
  const showRates = mode === "submit";
  const continuous = mode === "submit" && fmt.layoutMode === "continuous";
  const paperClass = `doc paper-${fmt.paper} orient-${fmt.orientation} type-${fmt.fontSize} dens-${fmt.lineDensity} tot-${fmt.totalStyle}${continuous ? " doc-flow" : ""}`;
  const fullJob = isFullJobScope(project, scope);
  const jobGrand = projectGrandTotal ?? projectGrand(project.items);
  const money = (n: number) => formatReportMoney(n, project.currency, fmt);
  const sub =
    mode === "source"
      ? doc.fromWorking
        ? "Working BOQ is the source. Import a Client BOQ to lock quantities. Rates belong on Submission BOQ."
        : "Client BOQ (locked). Rates belong on Submission BOQ, not here."
      : doc.fromWorking
        ? `Submission BOQ${fmt.showRevision ? ` · revision ${project.revision}${project.sealedAt ? " · sealed" : ""}` : ""} — Working BOQ with rates.`
        : `Submission BOQ${fmt.showRevision ? ` · revision ${project.revision}${project.sealedAt ? " · sealed" : ""}` : ""} — client layout, our rates, tender adjustments as the next BOQ category.`;

  if (mode === "source") {
    return (
      <div className={`${paperClass} doc-sheet`}>
        {blockOn(fmt, "letterhead") ? <Letterhead project={project} fmt={fmt} mode={mode} /> : null}
        {blockOn(fmt, "cover") ? (
          <div className="sub">
            {sub}
            {fmt.showDate ? ` · ${new Date().toLocaleDateString()}` : ""}
          </div>
        ) : null}
        {blockOn(fmt, "cover") && fmt.extraHeader.trim() ? <p className="doc-note">{fmt.extraHeader}</p> : null}
        <BillTable rows={documentLines(doc, fmt)} fmt={fmt} currency={project.currency} showRates={false} project={project} />
        <div className="tot">
          Client BOQ has empty rates. Working BOQ total {money(total)} is not written back here.
          {!fullJob ? ` Project grand ${money(jobGrand)}.` : ""}
        </div>
        {blockOn(fmt, "footer") && fmt.footer.trim() ? <p className="doc-foot">{fmt.footer}</p> : null}
      </div>
    );
  }

  const pages = paginateDocument(project, fmt, jobGrand, scope, {
    itemLines: submissionItemLines(project, fmt, scope),
  });
  const qtyBills = shouldPivotQtyByBoq(project, scope) ? compareBills(project, scope) : [];
  const layout = submissionLayoutOf(fmt);
  return (
    <div className={`doc-stack${continuous ? " doc-flow-stack" : ""}`}>
      {pages.map((page, idx) => {
        const first = idx === 0;
        const last = idx === pages.length - 1;
        const closingLabel = fullJob ? "Grand total" : "This packet";
        const showHead = !continuous || first;
        const showClosingTot =
          (layout === "grand" && last) ||
          ((layout === "page-totals" || layout === "category-totals") && last && page.kind !== "items");
        return (
          <article className={`${paperClass} doc-sheet`} key={page.pageNo}>
            {showHead && blockOn(fmt, "letterhead") ? <Letterhead project={project} fmt={fmt} mode={mode} /> : null}
            {showHead && blockOn(fmt, "cover") ? (
              first ? (
                <div className="sub">
                  {sub}
                  {fmt.showDate ? ` · ${new Date().toLocaleDateString()}` : ""}
                </div>
              ) : (
                <div className="sub">{project.name}</div>
              )
            ) : null}
            {showHead && blockOn(fmt, "cover") && first && fmt.extraHeader.trim() ? <p className="doc-note">{fmt.extraHeader}</p> : null}
            {first && showRates && blockOn(fmt, "kpis") ? (
              <div className="kpis">
                <div className="kpi">
                  <b>{money(total)}</b>
                  <span>{fullJob ? "Grand total" : "This packet"}</span>
                </div>
                {!fullJob ? (
                  <div className="kpi">
                    <b>{money(jobGrand)}</b>
                    <span>Project grand (all BOQs)</span>
                  </div>
                ) : null}
                <div className="kpi">
                  <b>{money(adj)}</b>
                  <span>Tender adjustments</span>
                </div>
                <div className="kpi">
                  <b>{doc.adjustments.length}</b>
                  <span>Adjustment lines</span>
                </div>
                <div className="kpi">
                  <b>{doc.items.length}</b>
                  <span>Priced items</span>
                </div>
              </div>
            ) : null}
            <h2 className="sheet-title">{page.title}</h2>
            {page.kind === "items" ? (
              <BillTable
                rows={page.rows}
                fmt={fmt}
                currency={project.currency}
                showRates={showRates}
                pageTotal={showRates && blockOn(fmt, "page-total") ? page.pageAmount : undefined}
                project={project}
                qtyBills={qtyBills}
              />
            ) : page.kind === "grand-summary" ? (
              <GrandSummaryTable page={page} fmt={fmt} total={page.pageAmount} currency={project.currency} />
            ) : (
              <UnitSummaryTable page={page} fmt={fmt} currency={project.currency} />
            )}
            {showClosingTot ? (
              <div className="tot">
                {closingLabel} {money(total)}
                {!fullJob ? ` · Project grand (all BOQs) ${money(jobGrand)}` : ""}
              </div>
            ) : null}
            {blockOn(fmt, "footer") ? <SheetFoot fmt={fmt} pageNo={page.pageNo} pageCount={pages.length} /> : null}
          </article>
        );
      })}
    </div>
  );
}

function splitBoqColumns<T>(items: T[]): [T[], T[]] {
  const left: T[] = [];
  const right: T[] = [];
  for (let i = 0; i < items.length; i++) (i % 2 === 0 ? left : right).push(items[i]);
  return [left, right];
}

function OneBoqDocument({
  project,
  billId,
  mode,
  format,
  adj,
  jobGrand,
  categoryKeys = "all",
  content = "items",
}: {
  project: LoadedProject;
  billId: string;
  mode: "source" | "submit";
  format?: Partial<ReportFormat> | null;
  adj: number;
  jobGrand: number;
  categoryKeys?: string[] | "all";
  content?: ReportContent;
}) {
  const fmt = mode === "source" ? formatForClientBoq(format) : mergeReportFormat(format);
  const scope: ReportScope = { billIds: [billId], categoryKeys, content };
  const packet =
    mode === "submit"
      ? packetAmount(project, fmt, { ...scope, content: "items" })
      : billTotal(project.items, billId);
  return (
    <DocumentRenderer
      project={project}
      total={packet}
      adj={adj}
      mode={mode}
      format={mode === "submit" ? { ...fmt, showGrandSummary: false } : fmt}
      scope={scope}
      projectGrandTotal={jobGrand}
    />
  );
}

function BoqColumn({
  bills,
  project,
  mode,
  format,
  adj,
  jobGrand,
  categoryKeys,
  content,
}: {
  bills: ProjectBill[];
  project: LoadedProject;
  mode: "source" | "submit";
  format?: Partial<ReportFormat> | null;
  adj: number;
  jobGrand: number;
  categoryKeys?: string[] | "all";
  content?: ReportContent;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const col = ref.current;
    if (!col) return;
    let lock = false;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 1) return;
      const pane = (e.target as HTMLElement | null)?.closest(".doc-boq-pane");
      if (!(pane instanceof HTMLElement) || !col.contains(pane)) return;
      const body = pane.querySelector(".doc-boq-pane-body");
      if (!(body instanceof HTMLElement)) return;
      const atTop = body.scrollTop <= 0;
      const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 2;
      const down = e.deltaY > 0;
      if (down && !atBottom) return;
      if (!down && !atTop) return;
      const panes = [...col.querySelectorAll(":scope > .doc-boq-pane")];
      const idx = panes.indexOf(pane);
      const next = down ? panes[idx + 1] : panes[idx - 1];
      if (!(next instanceof HTMLElement)) return;
      e.preventDefault();
      if (lock) return;
      lock = true;
      next.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        lock = false;
      }, 480);
    };
    col.addEventListener("wheel", onWheel, { passive: false });
    return () => col.removeEventListener("wheel", onWheel);
  }, [bills.length]);

  return (
    <div className="doc-boq-col" ref={ref}>
      {bills.map((bill) => (
        <section className="doc-boq-pane" key={bill.id} aria-label={`${bill.code} ${bill.name}`}>
          <header className="doc-boq-pane-head">
            <span className="code">{bill.code}</span>
            <span className="name">{bill.name}</span>
          </header>
          <div className="doc-boq-pane-body">
            <OneBoqDocument
              project={project}
              billId={bill.id}
              mode={mode}
              format={format}
              adj={adj}
              jobGrand={jobGrand}
              categoryKeys={categoryKeys}
              content={content}
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function DocBoqBoard({
  project,
  billIds,
  mode,
  format,
  adj,
  jobGrand,
  categoryKeys = "all",
  content = "items",
}: {
  project: LoadedProject;
  billIds: string[];
  mode: "source" | "submit";
  format?: Partial<ReportFormat> | null;
  adj: number;
  jobGrand: number;
  categoryKeys?: string[] | "all";
  content?: ReportContent;
}) {
  const bills = billIds.map((id) => billById(project, id)).filter((b): b is ProjectBill => Boolean(b));
  const [left, right] = splitBoqColumns(bills);
  return (
    <div className="doc-boq-board" role="group" aria-label="BOQ columns">
      <BoqColumn
        bills={left}
        project={project}
        mode={mode}
        format={format}
        adj={adj}
        jobGrand={jobGrand}
        categoryKeys={categoryKeys}
        content={content}
      />
      {right.length ? (
        <BoqColumn
          bills={right}
          project={project}
          mode={mode}
          format={format}
          adj={adj}
          jobGrand={jobGrand}
          categoryKeys={categoryKeys}
          content={content}
        />
      ) : null}
    </div>
  );
}

function DocPreview({
  tiled,
  billIds,
  project,
  mode,
  format,
  adj,
  jobGrand,
  categoryKeys,
  content,
  total,
  scope,
}: {
  tiled: boolean;
  billIds: string[];
  project: LoadedProject;
  mode: "source" | "submit";
  format?: Partial<ReportFormat> | null;
  adj: number;
  jobGrand?: number;
  categoryKeys?: string[] | "all";
  content?: ReportContent;
  total: number;
  scope: ReportScope;
}) {
  if (tiled && billIds.length > 1) {
    return (
      <DocBoqBoard
        project={project}
        billIds={billIds}
        mode={mode}
        format={format}
        adj={adj}
        jobGrand={jobGrand ?? projectGrand(project.items)}
        categoryKeys={categoryKeys}
        content={content}
      />
    );
  }
  return (
    <div className="doc-scroll">
      <DocumentRenderer
        project={project}
        total={total}
        adj={adj}
        mode={mode}
        format={format}
        scope={scope}
        projectGrandTotal={jobGrand}
      />
    </div>
  );
}

export function SourceView({
  project,
  total,
  format,
  billId = null,
  onAmend,
}: {
  project: LoadedProject;
  total: number;
  format?: Partial<ReportFormat> | null;
  billId?: string | null;
  onBillChange?: (billId: string | null) => void;
  onAmend?: () => void;
}) {
  const bills = sortedBills(project);
  const focus = billId;
  const locked = focus
    ? billSourceLocked(project, focus)
    : bills.length
      ? bills.every((b) => billSourceLocked(project, b.id))
      : Boolean(project.sourceLockedAt);
  const billIds = focus ? [focus] : bills.map((b) => b.id);
  const scope: ReportScope = {
    billIds: focus ? [focus] : "all",
    categoryKeys: "all",
    content: "items",
  };
  return (
    <div className="module-workspace">
      <div className="module-toolbar">
        {onAmend ? (
          <button type="button" onClick={onAmend}>
            Amend this BOQ
          </button>
        ) : null}
        <span className="source-badge">{locked ? "Client BOQ locked" : "Client BOQ unlocked"}</span>
      </div>
      <div className="module-body">
        <DocPreview
          tiled={!focus && bills.length > 1}
          billIds={billIds}
          project={project}
          mode="source"
          format={format}
          adj={0}
          jobGrand={projectGrand(project.items)}
          total={total}
          scope={scope}
        />
      </div>
    </div>
  );
}

export function SubmitView({
  project,
  total,
  adj,
  locked,
  format,
  canExport = true,
  onFormat,
  onPack,
  onSeal,
  onNewRevision,
  billFocus = null,
  templates = [],
}: {
  project: LoadedProject;
  total: number;
  adj: number;
  locked?: boolean;
  format?: Partial<ReportFormat> | null;
  canExport?: boolean;
  canDesign?: boolean;
  onFormat?: (next: ReportFormat) => void;
  onPack?: (pack: ReportFormatPack) => void;
  onSeal?: () => void;
  onNewRevision?: () => void;
  billFocus?: string | null;
  onBillChange?: (billId: string | null) => void;
  templates?: StoredReportTemplate[];
  activeTemplateId?: string | null;
}) {
  const fmtBase = mergeReportFormat(format);
  const [catMode, setCatMode] = useState<"this" | "selected" | "all">("all");
  const [pickedCats, setPickedCats] = useState<string[]>([]);
  const [thisCat, setThisCat] = useState("");
  const [paperLock, setPaperLock] = useState<"auto" | ReportPaper>("auto");
  const [orientLock, setOrientLock] = useState<"auto" | "portrait" | "landscape">("auto");

  const billIds = billIdsFromFocus(billFocus);
  const cats = useMemo(
    () => listReportCategories(project, scopedBillIds(project, { billIds, categoryKeys: "all", content: "items" })),
    [project, billIds],
  );
  const activeThisCat = thisCat && cats.some((c) => c.key === thisCat) ? thisCat : (cats[0]?.key ?? "");
  const categoryKeys: string[] | "all" =
    catMode === "all" || !cats.length
      ? "all"
      : catMode === "this"
        ? activeThisCat
          ? [activeThisCat]
          : "all"
        : pickedCats.length
          ? pickedCats
          : "all";
  const scope: ReportScope = { billIds, categoryKeys, content: "both" };
  const sheetScope: ReportScope = { ...scope, content: "items" };
  const pivotQty = shouldPivotQtyByBoq(project, scope);
  const billCount = scopedBillIds(project, scope).length;
  const fitted = fitSubmissionPaper(pivotQty ? billCount : 1);
  const fmt = mergeReportFormat({
    ...fmtBase,
    paper: paperLock === "auto" ? (pivotQty ? fitted.paper : fmtBase.paper) : paperLock,
    orientation: orientLock === "auto" ? (pivotQty ? fitted.orientation : fmtBase.orientation) : orientLock,
  });
  const sheetFmt = mergeReportFormat({
    ...fmt,
    blocks: fmt.blocks.map((b) => (b.type === "category-total" ? { ...b, enabled: false } : b)),
  });
  const packet = packetAmount(project, fmt, sheetScope);
  const previewTotal = isFullJobScope(project, scope) ? total : packet;
  const layout = submissionLayoutOf(fmt);
  const flags = submissionExceptions(project, sheetScope, sheetFmt);
  const preview = (
    <DocPreview
      tiled={false}
      billIds={scopedBillIds(project, scope)}
      project={project}
      mode="submit"
      format={fmt}
      adj={adj}
      jobGrand={total}
      categoryKeys={categoryKeys}
      content="both"
      total={previewTotal}
      scope={scope}
    />
  );

  function print() {
    void import("../reportExport").then((m) => m.printSubmission(project, fmt, previewTotal, adj, scope, { qtyByBoq: pivotQty }));
  }

  function csv() {
    void import("../reportExport").then((m) => m.downloadSubmissionCsv(project, fmt, previewTotal, scope, { qtyByBoq: pivotQty }));
  }

  function applyLayout(id: SubmissionLayoutId) {
    if (!onFormat) return;
    const next = formatForSubmissionLayout(id, fmt);
    onFormat(next);
    onPack?.({ templates, activeId: id, format: next });
  }

  function patchFmt(partial: Partial<ReportFormat>) {
    if (!onFormat) return;
    onFormat(mergeReportFormat({ ...fmt, ...partial }));
  }

  const sheet = (
    <div className="submit-left">
      <div className="submit-pane-label">Priced items</div>
      <div className="submit-flags">
        {flags.rateOnly ? <span className="flag">Rate only {flags.rateOnly}</span> : null}
        {flags.amountOnly ? <span className="flag">Amount only {flags.amountOnly}</span> : null}
        {flags.qtyDiffs ? <span className="flag warn">Qty diffs {flags.qtyDiffs}</span> : null}
        {flags.unpriced ? <span className="flag warn">Unpriced {flags.unpriced}</span> : null}
        {flags.missingBoq ? <span className="flag warn">Not on every BOQ {flags.missingBoq}</span> : null}
        {!flags.rateOnly && !flags.amountOnly && !flags.qtyDiffs && !flags.unpriced && !flags.missingBoq ? (
          <span className="flag">No exceptions</span>
        ) : null}
        <span className="packet-total">
          {isFullJobScope(project, scope) ? "Grand total" : "This packet"} {formatReportMoney(previewTotal, project.currency, fmt)}
        </span>
      </div>
      <SubmissionSheet project={project} format={sheetFmt} scope={sheetScope} currency={project.currency} />
    </div>
  );

  return (
    <div className="module-workspace">
      <div className="module-toolbar submit-scope">
        {project.sealedAt ? (
          <button type="button" className="primary" disabled={locked} onClick={onNewRevision}>
            New revision ({project.revision + 1})
          </button>
        ) : (
          <button type="button" className="primary" disabled={locked} onClick={onSeal}>
            Seal
          </button>
        )}
        {cats.length > 1 ? (
          <MenuSelect
            label="Categories"
            value={catMode}
            options={[
              { value: "this", label: "This category" },
              { value: "selected", label: "Selected categories" },
              { value: "all", label: "All categories" },
            ]}
            onChange={setCatMode}
          />
        ) : null}
        {cats.length > 1 && catMode === "this" ? (
          <MenuSelect
            label="Category"
            value={activeThisCat}
            options={cats.map((c) => ({ value: c.key, label: c.label }))}
            onChange={setThisCat}
          />
        ) : null}
        {cats.length > 1 && catMode === "selected" ? (
          <div className="seg" role="group" aria-label="Selected categories">
            {cats.map((c) => (
              <button
                key={c.key}
                type="button"
                className={pickedCats.includes(c.key) ? "primary" : ""}
                onClick={() =>
                  setPickedCats((prev) => (prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key]))
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : null}
        <MenuSelect
          label="Packet"
          value={layout}
          options={SUBMISSION_LAYOUTS.map((l) => ({ value: l.id, label: l.name }))}
          onChange={applyLayout}
        />
        <MenuSelect
          label="Paper"
          value={paperLock}
          options={[
            { value: "auto", label: pivotQty ? `Auto (${fitted.paper.toUpperCase()})` : "Auto" },
            { value: "a4", label: "A4" },
            { value: "a3", label: "A3" },
            { value: "letter", label: "Letter" },
          ]}
          onChange={(v) => {
            setPaperLock(v as "auto" | ReportPaper);
            if (v !== "auto") patchFmt({ paper: v as ReportPaper });
          }}
        />
        <MenuSelect
          label="Orientation"
          value={orientLock}
          options={[
            { value: "auto", label: pivotQty ? `Auto (${fitted.orientation})` : "Auto" },
            { value: "portrait", label: "Portrait" },
            { value: "landscape", label: "Landscape" },
          ]}
          onChange={(v) => {
            setOrientLock(v as "auto" | "portrait" | "landscape");
            if (v !== "auto") patchFmt({ orientation: v as "portrait" | "landscape" });
          }}
        />
        <MenuSelect
          label="Type"
          value={fmt.fontSize}
          options={[
            { value: "sm", label: "Small" },
            { value: "md", label: "Default" },
            { value: "lg", label: "Large" },
          ]}
          onChange={(v) => patchFmt({ fontSize: v as ReportFormat["fontSize"] })}
        />
        {canExport ? (
          <>
            <button type="button" onClick={print}>
              Print / PDF
            </button>
            <button type="button" onClick={csv}>
              Export Excel
            </button>
          </>
        ) : null}
        <span className="hint">
          {project.sealedAt
            ? `Sealed ${new Date(project.sealedAt).toLocaleString()}. Print matches the packet preview.`
            : "Seal freezes this revision. Print / Excel match the packet preview."}
        </span>
      </div>
      <div className="module-body submit-dual">
        <Split id="submit-dual" axis="x" defaultSize={420} min={280} max={720} primary="end">
          {sheet}
          <div className="submit-packet">
            <div className="submit-pane-label">Packet preview</div>
            {preview}
          </div>
        </Split>
      </div>
    </div>
  );
}


export { ReportDesigner as ReportFormatFields, type ReportFormatPack } from "./ReportDesigner";

