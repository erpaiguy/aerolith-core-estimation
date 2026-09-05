import { formatQty } from "@aerolith/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LoadedProject, ProjectBill } from "../model";
import {
  buildDocument,
  blockOn,
  colWidthPct,
  columnLabel,
  formatReportMoney,
  formatReportRate,
  isFullJobScope,
  isNumericColumn,
  listReportCategories,
  mergeReportFormat,
  packetAmount,
  paginateDocument,
  documentLines,
  qtyForLine,
  scopedBillIds,
  summaryColWidthPct,
  visibleColumns,
  type DocLine,
  type ReportContent,
  type ReportFormat,
  type ReportPage,
  type ReportScope,
  type StoredReportTemplate,
} from "../reportFormat";
import { billById, billSourceLocked, billTotal, projectGrand, sortedBills } from "../bills";
import { BrandLockup, BrandMark } from "./Brand";
import { Split } from "../ui/Split";
import { ReportDesigner, type ReportFormatPack } from "./ReportDesigner";

function lineCells(line: DocLine, fmt: ReportFormat, currency: string, showRates: boolean): Record<string, string> {
  const qty = qtyForLine(line, fmt);
  return {
    sl: line.sl,
    description: line.description,
    qty: formatQty(qty),
    ourQty: line.ourQty == null ? "" : formatQty(line.ourQty),
    unit: line.unit,
    rate: showRates ? line.rateLabel || formatReportRate(line.rate, currency, fmt) : "—",
    amount: showRates ? line.amountLabel || formatReportMoney(line.amount, currency, fmt) : "—",
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

function ColGroup({ cols, fmt }: { cols: string[]; fmt: ReportFormat }) {
  return (
    <colgroup>
      {cols.map((c) => (
        <col key={c} style={{ width: `${colWidthPct(c, fmt)}%` }} />
      ))}
    </colgroup>
  );
}

function AmountFootRow({
  label,
  amount,
  cols,
  currency,
  fmt,
}: {
  label: string;
  amount: number;
  cols: string[];
  currency: string;
  fmt: ReportFormat;
}) {
  const amountIdx = cols.indexOf("amount");
  if (amountIdx < 0) return null;
  const after = cols.length - amountIdx - 1;
  return (
    <tr className="tot">
      {amountIdx > 0 ? <td colSpan={amountIdx}>{label}</td> : null}
      <td className="num">
        {amountIdx === 0 ? `${label} ${formatReportMoney(amount, currency, fmt)}` : formatReportMoney(amount, currency, fmt)}
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
}: {
  rows: DocLine[];
  fmt: ReportFormat;
  currency: string;
  showRates: boolean;
  pageTotal?: number;
  project?: LoadedProject;
}) {
  const cols = visibleColumns(fmt, project);
  return (
    <table className="doc-table">
      <ColGroup cols={cols} fmt={fmt} />
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c} className={isNumericColumn(c, project) ? "num" : undefined}>
              {columnLabel(c, fmt, project)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={Math.max(cols.length, 1)}>No bill lines yet. Add items on Working BOQ.</td>
          </tr>
        ) : (
          rows.map((line) => {
            if (line.kind === "section") {
              const label = `${line.sl} ${line.description}`.trim();
              return (
                <tr className={line.key === "sec-7" ? "sec adj" : "sec"} key={line.key}>
                  {fmt.showSl && cols.length > 1 ? (
                    <>
                      <td>{line.sl}</td>
                      <td colSpan={cols.length - 1}>{line.description}</td>
                    </>
                  ) : (
                    <td colSpan={Math.max(cols.length, 1)}>{label}</td>
                  )}
                </tr>
              );
            }
            if (line.kind === "total") {
              return (
                <AmountFootRow
                  key={line.key}
                  label={line.description}
                  amount={line.amount}
                  cols={cols}
                  currency={currency}
                  fmt={fmt}
                />
              );
            }
            const cells = lineCells(line, fmt, currency, showRates);
            return (
              <tr className={line.kind === "adjustment" ? "adj" : undefined} key={line.key}>
                {cols.map((c) => (
                  <td key={c} className={isNumericColumn(c, project) ? "num" : undefined}>
                    {cells[c]}
                  </td>
                ))}
              </tr>
            );
          })
        )}
        {showRates && pageTotal != null ? (
          <AmountFootRow label="Page total" amount={pageTotal} cols={cols} currency={currency} fmt={fmt} />
        ) : null}
      </tbody>
    </table>
  );
}

function UnitSummaryTable({ page, fmt, currency }: { page: ReportPage; fmt: ReportFormat; currency: string }) {
  const table = page.kind === "page-summary" ? "page" : "category";
  return (
    <table className="doc-table">
      <colgroup>
        <col style={{ width: `${summaryColWidthPct(table, "description", fmt)}%` }} />
        <col style={{ width: `${summaryColWidthPct(table, "amount", fmt)}%` }} />
      </colgroup>
      <thead>
        <tr>
          <th>Description</th>
          <th className="num">Amount</th>
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
              <td className="num">{formatReportMoney(r.amount, currency, fmt)}</td>
            </tr>
          ))
        )}
        <tr className="tot">
          <td>Page total</td>
          <td className="num">{formatReportMoney(page.pageAmount, currency, fmt)}</td>
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
          <th className="num">Amount</th>
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
              <td className="num">{formatReportMoney(r.amount, currency, fmt)}</td>
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
  const fmt = mergeReportFormat(format);
  const doc = buildDocument(project, scope);
  const showRates = mode === "submit";
  const continuous = fmt.layoutMode === "continuous";
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
        : `Submission BOQ${fmt.showRevision ? ` · revision ${project.revision}${project.sealedAt ? " · sealed" : ""}` : ""} — client layout, our rates, tender adjustments as section 7.`;

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

  const pages = paginateDocument(project, fmt, jobGrand, scope);
  return (
    <div className={`doc-stack${continuous ? " doc-flow-stack" : ""}`}>
      {pages.map((page, idx) => {
        const first = idx === 0;
        const last = idx === pages.length - 1;
        const closingLabel = fullJob ? "Grand total" : "This packet";
        const showHead = !continuous || first;
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
              />
            ) : page.kind === "grand-summary" ? (
              <GrandSummaryTable page={page} fmt={fmt} total={page.pageAmount} currency={project.currency} />
            ) : (
              <UnitSummaryTable page={page} fmt={fmt} currency={project.currency} />
            )}
            {page.kind === "grand-summary" || (last && !fmt.showGrandSummary) ? (
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
  const fmt = mergeReportFormat(format);
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
  canDesign = true,
  onFormat,
  onPack,
  onSeal,
  onNewRevision,
  billFocus = null,
  onBillChange,
  templates = [],
  activeTemplateId = null,
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
  const fmt = mergeReportFormat(format);
  const bills = sortedBills(project);
  const multi = bills.length > 1;
  const [billMode, setBillMode] = useState<"this" | "selected" | "all">(multi ? "this" : "all");
  const [pickedBills, setPickedBills] = useState<string[]>(() => bills.map((b) => b.id));
  const [catMode, setCatMode] = useState<"this" | "selected" | "all">("all");
  const [pickedCats, setPickedCats] = useState<string[]>([]);
  const [thisCat, setThisCat] = useState("");
  const [content, setContent] = useState<ReportContent>("both");

  const billIds: string[] | "all" =
    !multi || billMode === "all"
      ? "all"
      : billMode === "this"
        ? [billFocus || bills[0]?.id || ""]
        : pickedBills.length
          ? pickedBills
          : "all";
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
  const scope: ReportScope = { billIds, categoryKeys, content };
  const packet = packetAmount(project, fmt, { ...scope, content: "items" });
  const previewTotal = isFullJobScope(project, scope) ? total : packet;
  const previewIds = scopedBillIds(project, scope);
  const preview = (
    <DocPreview
      tiled={previewIds.length > 1}
      billIds={previewIds}
      project={project}
      mode="submit"
      format={fmt}
      adj={adj}
      jobGrand={total}
      categoryKeys={categoryKeys}
      content={content}
      total={previewTotal}
      scope={scope}
    />
  );

  function withContent(next: ReportContent): ReportScope {
    return { ...scope, content: next };
  }

  function print(next: ReportContent) {
    void import("../reportExport").then((m) => m.printSubmission(project, fmt, packet, adj, withContent(next)));
  }

  function csv(next: ReportContent) {
    void import("../reportExport").then((m) => m.downloadSubmissionCsv(project, fmt, packet, withContent(next)));
  }

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
        {multi ? (
          <label className="field" style={{ margin: 0 }}>
            BOQs
            <select
              value={billMode}
              onChange={(e) => {
                const v = e.target.value as typeof billMode;
                setBillMode(v);
                if (v === "this" && onBillChange && !billFocus && bills[0]) onBillChange(bills[0].id);
              }}
            >
              <option value="this">This BOQ</option>
              <option value="selected">Selected BOQs</option>
              <option value="all">All BOQs</option>
            </select>
          </label>
        ) : null}
        {multi && billMode === "selected" ? (
          <div className="seg boq-seg boq-stack" role="group" aria-label="Selected BOQs">
            {bills.map((b) => (
              <button
                key={b.id}
                type="button"
                className={pickedBills.includes(b.id) ? "primary" : ""}
                onClick={() =>
                  setPickedBills((prev) => (prev.includes(b.id) ? prev.filter((id) => id !== b.id) : [...prev, b.id]))
                }
                title={b.name}
              >
                <span className="bill-code">{b.code}</span>
                <span className="bill-name">{b.name}</span>
              </button>
            ))}
          </div>
        ) : null}
        {cats.length > 1 ? (
          <label className="field" style={{ margin: 0 }}>
            Categories
            <select value={catMode} onChange={(e) => setCatMode(e.target.value as typeof catMode)}>
              <option value="this">This category</option>
              <option value="selected">Selected categories</option>
              <option value="all">All categories</option>
            </select>
          </label>
        ) : null}
        {cats.length > 1 && catMode === "this" ? (
          <label className="field" style={{ margin: 0 }}>
            Category
            <select value={activeThisCat} onChange={(e) => setThisCat(e.target.value)}>
              {cats.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
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
        <label className="field" style={{ margin: 0 }}>
          Content
          <select value={content} onChange={(e) => setContent(e.target.value as ReportContent)}>
            <option value="items">Complete items</option>
            <option value="summaries">Summaries</option>
            <option value="both">Both (separate outputs)</option>
          </select>
        </label>
        {canExport ? (
          content === "both" ? (
            <>
              <button type="button" onClick={() => print("items")}>
                Print items
              </button>
              <button type="button" onClick={() => print("summaries")}>
                Print summaries
              </button>
              <button type="button" onClick={() => print("both")}>
                Print combined
              </button>
              <button type="button" onClick={() => csv("items")}>
                CSV items
              </button>
              <button type="button" onClick={() => csv("summaries")}>
                CSV summaries
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => print(content)}>
                Print / PDF
              </button>
              <button type="button" onClick={() => csv(content)}>
                Export CSV
              </button>
            </>
          )
        ) : null}
        <span className="hint">
          {project.sealedAt
            ? `Sealed ${new Date(project.sealedAt).toLocaleString()}. Edits need a new revision.`
            : "Seal freezes money fields on this revision. Print uses Save as PDF in the system dialog."}
        </span>
      </div>
      <div className={`module-body ${canDesign && onFormat ? "report-split" : ""}`}>
        {canDesign && onFormat ? (
          <Split id="report-designer" axis="x" defaultSize={380} min={280} max={560} primary="end">
            {preview}
            <div className="report-designer-pane">
              <ReportDesigner
                value={fmt}
                onChange={onFormat}
                compact
                templates={templates}
                activeId={activeTemplateId}
                onPack={onPack}
              />
            </div>
          </Split>
        ) : (
          preview
        )}
      </div>
    </div>
  );
}

export { ReportDesigner as ReportFormatFields, type ReportFormatPack } from "./ReportDesigner";

