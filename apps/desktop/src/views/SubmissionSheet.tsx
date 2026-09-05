import { formatQty } from "@aerolith/shared";
import type { LoadedProject } from "../model";
import {
  amountOf,
  buildDocument,
  columnLabel,
  documentLines,
  formatReportFigure,
  formatReportMoney,
  isTenderAdjSectionKey,
  qtyForLine,
  type DocLine,
  type ReportFormat,
  type ReportScope,
} from "../reportFormat";
import {
  billQtyHeader,
  compareCellAmount,
  compareCellRate,
  compareQtyMissing,
  formatCompareQty,
  pivotSubmissionByBoq,
  shouldPivotQtyByBoq,
  type CompareRow,
} from "../submissionCompare";
import { VirtualTable } from "../ui/VirtualTable";

export function submissionExceptions(
  project: LoadedProject,
  scope: ReportScope,
  format: ReportFormat,
): { rateOnly: number; amountOnly: number; qtyDiffs: number; unpriced: number; missingBoq: number } {
  const lines = documentLines(buildDocument(project, scope), format).filter((l) => l.kind === "item" || l.kind === "adjustment");
  const wanted = new Set(scope.billIds === "all" ? project.items.map((i) => i.billId) : scope.billIds);
  const qtyDiffs = project.items.filter(
    (i) => i.kind === "item" && wanted.has(i.billId) && i.ourQty !== i.clientQty,
  ).length;
  const missingBoq = shouldPivotQtyByBoq(project, scope)
    ? compareQtyMissing(pivotSubmissionByBoq(project, format, scope).rows)
    : 0;
  return {
    rateOnly: lines.filter((l) => l.amountLabel === "Rate Only").length,
    amountOnly: lines.filter((l) => l.rateLabel === "Amount Only").length,
    qtyDiffs,
    unpriced: lines.filter((l) => l.kind === "item" && !l.rate && !l.amount && !l.amountLabel).length,
    missingBoq,
  };
}

function cellRate(line: DocLine): string {
  if (line.kind === "section" || line.kind === "total") return "";
  return line.rateLabel || formatReportFigure(line.rate);
}

function cellAmount(line: DocLine, currency: string, fmt: ReportFormat, grand = false): string {
  if (line.kind === "section") return "";
  if (line.amountLabel) return line.amountLabel;
  return grand ? formatReportMoney(line.amount, currency, fmt) : formatReportFigure(line.amount);
}

export function SubmissionSheet({
  project,
  format,
  scope,
  currency,
}: {
  project: LoadedProject;
  format: ReportFormat;
  scope: ReportScope;
  currency: string;
}) {
  if (shouldPivotQtyByBoq(project, scope)) {
    return <CompareSheet project={project} format={format} scope={scope} currency={currency} />;
  }

  const lines = documentLines(buildDocument(project, { ...scope, content: "items" }), format);
  const packet = amountOf(lines);
  const rows: DocLine[] = [
    ...lines,
    {
      kind: "total",
      key: "submit-grand",
      sl: "",
      description: "Grand total",
      qty: 0,
      ourQty: null,
      unit: "",
      rate: 0,
      amount: packet,
    },
  ];

  const header = (
    <>
      <colgroup>
        <col className="col-code" />
        <col className="col-desc" />
        <col className="col-qty" />
        <col className="col-unit" />
        <col className="col-rate" />
        <col className="col-amt" />
      </colgroup>
      <thead>
        <tr>
          <th>No.</th>
          <th>Description</th>
          <th className="num">{columnLabel("qty", format)}</th>
          <th>Unit</th>
          <th className="num">{columnLabel("rate", format, undefined, currency)}</th>
          <th className="num">{columnLabel("amount", format, undefined, currency)}</th>
        </tr>
      </thead>
    </>
  );

  function renderRow(index: number) {
    const line = rows[index];
    if (!line) return null;
    if (line.kind === "section") {
      return (
        <tr key={line.key} className={isTenderAdjSectionKey(line.key) ? "section adj" : "section"}>
          <td>{line.sl}</td>
          <td colSpan={5}>{line.description}</td>
        </tr>
      );
    }
    const grand = line.key === "submit-grand";
    return (
      <tr key={line.key} className={grand ? "tot submit-grand" : line.kind === "total" ? "tot" : line.kind === "adjustment" ? "adj" : ""}>
        <td>{line.sl}</td>
        <td>{line.description}</td>
        <td className="num">{line.kind === "total" ? "" : formatQty(qtyForLine(line, format))}</td>
        <td>{line.unit}</td>
        <td className="num">{cellRate(line)}</td>
        <td className="num">{cellAmount(line, currency, format, grand)}</td>
      </tr>
    );
  }

  return (
    <div className="submit-sheet">
      <VirtualTable layoutKey="submit-sheet" fill wrap header={header} rowCount={rows.length} renderRow={renderRow} />
    </div>
  );
}

function CompareSheet({
  project,
  format,
  scope,
  currency,
}: {
  project: LoadedProject;
  format: ReportFormat;
  scope: ReportScope;
  currency: string;
}) {
  const { bills, rows: pivoted } = pivotSubmissionByBoq(project, format, scope);
  const packet = amountOf(
    pivoted
      .filter((r) => r.kind === "item" || r.kind === "adjustment")
      .map((r) => ({
        kind: r.kind === "adjustment" ? "adjustment" : "item",
        key: r.key,
        sl: r.sl,
        description: r.description,
        qty: r.totalQty,
        ourQty: null,
        unit: r.unit,
        rate: r.rate,
        amount: r.amount,
      })),
  );
  const extra = bills.length + 1;
  const rest = 4 + extra;
  const rows: CompareRow[] = [
    ...pivoted,
    {
      kind: "total",
      key: "submit-grand",
      sl: "",
      description: "Grand total",
      unit: "",
      qtyByBill: bills.map(() => null),
      totalQty: 0,
      rate: 0,
      amount: packet,
    },
  ];

  const header = (
    <>
      <colgroup>
        <col className="col-code" />
        <col className="col-desc" />
        {bills.map((b) => (
          <col key={b.id} className="col-qty" />
        ))}
        <col className="col-qty" />
        <col className="col-unit" />
        <col className="col-rate" />
        <col className="col-amt" />
      </colgroup>
      <thead>
        <tr>
          <th>No.</th>
          <th>Description</th>
          {bills.map((b) => (
            <th key={b.id} className="num qty-bill" title={b.name}>
              Qty {billQtyHeader(b)}
            </th>
          ))}
          <th className="num qty-bill">Qty total</th>
          <th>Unit</th>
          <th className="num">{columnLabel("rate", format, undefined, currency)}</th>
          <th className="num">{columnLabel("amount", format, undefined, currency)}</th>
        </tr>
      </thead>
    </>
  );

  function renderRow(index: number) {
    const row = rows[index];
    if (!row) return null;
    if (row.kind === "section") {
      return (
        <tr key={row.key} className={isTenderAdjSectionKey(row.key) ? "section adj" : "section"}>
          <td>{row.sl}</td>
          <td colSpan={rest}>{row.description}</td>
        </tr>
      );
    }
    const grand = row.key === "submit-grand";
    const partial = (row.kind === "item" || row.kind === "adjustment") && row.qtyByBill.some((q) => q == null);
    return (
      <tr
        key={row.key}
        className={[
          grand ? "tot submit-grand" : row.kind === "total" ? "tot" : row.kind === "adjustment" ? "adj" : "",
          partial ? "qty-partial" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <td>{row.sl}</td>
        <td>{row.description}</td>
        {row.kind === "total"
          ? Array.from({ length: extra }, (_, i) => <td key={i} className="num" />)
          : [
              ...row.qtyByBill.map((q, i) => (
                <td key={bills[i]?.id ?? i} className={`num ${q == null ? "qty-miss" : ""}`}>
                  {formatCompareQty(q)}
                </td>
              )),
              <td key="tot" className="num qty-total">
                {formatQty(row.totalQty)}
              </td>,
            ]}
        <td>{row.unit}</td>
        <td className="num">{compareCellRate(row, currency, format)}</td>
        <td className="num">{compareCellAmount(row, currency, format, grand)}</td>
      </tr>
    );
  }

  return (
    <div className="submit-sheet submit-sheet-compare">
      <VirtualTable layoutKey={`submit-sheet-byboq-${bills.length}`} fill wrap header={header} rowCount={rows.length} renderRow={renderRow} />
    </div>
  );
}
