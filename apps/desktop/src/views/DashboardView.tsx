import { formatMoney, formatPct, totalMarginPct } from "@aerolith/shared";
import { useMemo } from "react";
import type { LoadedProject } from "../model";
import { costCategoryTree, type CostCatNode } from "../projectCompute";
import { effectiveMargin } from "../marginRules";
import { hasAnalysisBackup } from "../model";
import { billTotal, quoteMatchesItem, sortedBills } from "../bills";
import type { LineFocus } from "../lineFocus";
import type { ReactNode } from "react";
import { Split } from "../ui/Split";
import { DataTable } from "../ui/tableLayout";
import { PrintActions } from "../ui/PrintActions";
import { usePrintHeader } from "../print/context";
import { jobDocument } from "../print/types";

export function DashboardView({
  project,
  billId = null,
  license = null,
  onOpenException,
}: {
  project: LoadedProject;
  billId?: string | null;
  license?: ReactNode;
  onOpenException?: (kind: LineFocus) => void;
}) {
  const bills = sortedBills(project);
  const scoped = useMemo(
    () => project.items.filter((i) => i.kind === "item" && (!billId || i.billId === billId)),
    [project.items, billId],
  );
  const cost = scoped.reduce((s, i) => s + (i.result?.costAmount ?? 0), 0);
  const marginAmt = scoped.reduce((s, i) => s + (i.result?.marginAmount ?? 0), 0);
  const total = scoped.reduce((s, i) => s + (i.result?.amount ?? 0), 0);
  const unpriced = scoped.filter((i) => !i.result || i.result.rate === 0).length;
  const diffs = scoped.filter((i) => i.ourQty !== i.clientQty).length;
  const missing = scoped.filter(
    (i) =>
      !hasAnalysisBackup(i) &&
      !project.itemQuotes.some((q) => quoteMatchesItem(q, i) && q.selected),
  ).length;
  const m = project.margin;
  const factors = useMemo(() => {
    const acc = { overheadPct: 0, profitPct: 0, logisticsPct: 0, contingencyPct: 0 };
    for (const i of scoped) {
      const stack = effectiveMargin(project, i);
      const c = i.result?.costAmount ?? 0;
      acc.overheadPct += c * stack.overheadPct;
      acc.profitPct += c * stack.profitPct;
      acc.logisticsPct += c * stack.logisticsPct;
      acc.contingencyPct += c * stack.contingencyPct;
    }
    return acc;
  }, [project, scoped]);
  const tree = useMemo(() => costCategoryTree(project, billId), [project, billId]);
  const catMax = Math.max(1, ...tree.map((n) => n.amount));
  const waterfall = [
    { label: "Direct cost", tone: "cost", value: cost, pct: total ? cost / total : 0 },
    { label: "Overhead", tone: "overhead", value: factors.overheadPct, pct: cost ? factors.overheadPct / cost : m.overheadPct },
    { label: "Profit", tone: "profit", value: factors.profitPct, pct: cost ? factors.profitPct / cost : m.profitPct },
    { label: "Logistics", tone: "logistics", value: factors.logisticsPct, pct: cost ? factors.logisticsPct / cost : m.logisticsPct },
    { label: "Contingency", tone: "contingency", value: factors.contingencyPct, pct: cost ? factors.contingencyPct / cost : m.contingencyPct },
  ];
  const waterMax = Math.max(1, ...waterfall.map((w) => w.value), total);
  const jobAmount = project.items.filter((i) => i.kind === "item").reduce((s, i) => s + (i.result?.amount ?? 0), 0);
  const jobScale = Math.max(jobAmount, 1);

  const header = usePrintHeader();
  return (
    <div className="dashboard-view">
      <div className="module-toolbar">
        <div className="view-title">
          <h1 className="view">Overview</h1>
          <p className="view-lead">Where this job stands before you change a quantity or a rate.</p>
        </div>
        <PrintActions
          build={() =>
            jobDocument(header.project.name, `r${header.project.revision}`, header.format, "Dashboard", [
              {
                title: "Summary",
                columns: [
                  { label: "Item", width: 60 },
                  { label: `Amount (${project.currency})`, width: 40, align: "right" },
                ],
                rows: [
                  ...waterfall.map((row) => ({ cells: [row.label, formatMoney(row.value, project.currency)] })),
                  { kind: "total" as const, cells: [billId ? "This BOQ" : "Working total", formatMoney(total, project.currency)] },
                ],
              },
              {
                title: "Cost by category",
                columns: [
                  { label: "Category", width: 70 },
                  { label: `Amount (${project.currency})`, width: 30, align: "right" },
                ],
                rows: tree.map((node) => ({ cells: [node.label, formatMoney(node.amount, project.currency)] })),
              },
            ])
          }
        />
      </div>
      <div className="dash-body">
      {license}
      <section className="figure-ledger" aria-label="Job figures">
        <article>
          <div>
            <h2>Direct cost</h2>
            <p>Resources on the analysed items, before margin.</p>
          </div>
          <strong>{formatMoney(cost, project.currency)}</strong>
        </article>
        <article>
          <div>
            <h2>Margin {formatPct(cost ? marginAmt / cost : totalMarginPct(m))}</h2>
            <p>Overhead, profit, logistics, and contingency from the rules on Commercial.</p>
          </div>
          <strong>{formatMoney(marginAmt, project.currency)}</strong>
        </article>
        <article className="is-total">
          <div>
            <h2>{billId ? "This building" : "Working total"}</h2>
            <p>Direct cost plus margin. This is the figure the submission is describing.</p>
          </div>
          <strong>{formatMoney(total, project.currency)}</strong>
        </article>
      </section>
      <p className="dash-read">These counts are the work still open. Choose one to open those lines.</p>
      <div className="dash-flags" role="group" aria-label="Pricing flags">
        <button type="button" className="dash-flag" onClick={() => onOpenException?.("unpriced")}>
          <b>{unpriced}</b> unpriced
        </button>
        <button type="button" className="dash-flag" onClick={() => onOpenException?.("diff")}>
          <b>{diffs}</b> qty diffs
        </button>
        <button type="button" className="dash-flag" onClick={() => onOpenException?.("missing")}>
          <b>{missing}</b> missing analysis
        </button>
      </div>
      {bills.length > 1 ? (
        <section className="note boq-grand chart-block">
          <h2>Grand summary</h2>
          <p className="chart-lead">Each building against the whole job. Bars share one track. Amounts share one column. A faded row is outside the building you have open.</p>
          <div className="bar-chart">
          {bills.map((b) => (
            <div className={`bar-row ${billId && billId !== b.id ? "dim" : ""}`} key={b.id}>
              <span>
                {b.code} {b.name}
              </span>
              <div className="bar">
                <i className="cost" style={{ width: `${(billTotal(project.items, b.id) / jobScale) * 100}%` }} />
              </div>
              <strong>{formatMoney(billTotal(project.items, b.id), project.currency)}</strong>
            </div>
          ))}
          <div className="bar-row is-total">
            <span>Working total</span>
            <div className="bar">
              <i className="total" style={{ width: jobAmount > 0 ? "100%" : "0%" }} />
            </div>
            <strong>{formatMoney(jobAmount, project.currency)}</strong>
          </div>
          </div>
        </section>
      ) : null}
      <div className="dash-grid">
        <Split id="dashboard" axis="x" defaultSize={560} min={280} max={900}>
        <section className="note chart-block">
          <h2>Cost by category</h2>
          <p className="chart-lead">Open a category to see the groups inside it. The amount column stays put while the name indents.</p>
          {tree.length === 0 ? (
            <p>No resource rollup yet. Build rates on Price, then set resource prices on Commercial.</p>
          ) : (
            <div className="bar-chart">
            {tree.map((node) => (
              <CostBranch key={node.key} node={node} depth={0} barMax={catMax} currency={project.currency} />
            ))}
            </div>
          )}
        </section>
        <section className="note chart-block">
          <h2>Margin waterfall</h2>
          <p className="chart-lead">Each bar is that amount against the larger of direct cost and the working total. The track ends on the same line in every row.</p>
          <div className="bar-chart">
          {waterfall.map((w) => (
            <div className="bar-row" key={w.label}>
              <span>
                {w.label} <em>{formatPct(w.pct)}</em>
              </span>
              <div className="bar">
                <i className={w.tone} style={{ width: `${(w.value / waterMax) * 100}%` }} />
              </div>
              <strong>{formatMoney(w.value, project.currency)}</strong>
            </div>
          ))}
          <div className="bar-row is-total">
            <span>
              Working total <em>{formatPct(total > 0 ? total / waterMax : 0)}</em>
            </span>
            <div className="bar">
              <i className="total" style={{ width: `${(total / waterMax) * 100}%` }} />
            </div>
            <strong>{formatMoney(total, project.currency)}</strong>
          </div>
          </div>
        </section>
        </Split>
      </div>
      </div>
    </div>
  );
}

const DEPTH_LABEL = ["Category", "Main category", "Sub-category"];

function CostBranch({
  node,
  depth,
  barMax,
  currency,
}: {
  node: CostCatNode;
  depth: number;
  barMax: number;
  currency: string;
}) {
  const hasKids = node.children.length > 0 || node.leaves.length > 0;
  return (
    <details className={`dash-cat depth-${depth}`}>
      <summary className="bar-row">
        <span title={DEPTH_LABEL[depth] ?? "Group"}>{node.label}</span>
        <div className="bar">
          <i style={{ width: `${(node.amount / Math.max(1, barMax)) * 100}%` }} />
        </div>
        <strong>{formatMoney(node.amount, currency)}</strong>
      </summary>
      {hasKids ? (
        <>
          {node.children.map((child) => (
            <CostBranch key={child.key} node={child} depth={depth + 1} barMax={barMax} currency={currency} />
          ))}
          {node.leaves.length ? (
            <DataTable layoutKey="dash-cat-leaves">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Resource</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {node.leaves.map((r) => (
                  <tr key={r.code}>
                    <td>{r.code}</td>
                    <td>{r.name}</td>
                    <td className="num">{formatMoney(r.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : null}
        </>
      ) : (
        <p className="hint">No lines in this category.</p>
      )}
    </details>
  );
}
