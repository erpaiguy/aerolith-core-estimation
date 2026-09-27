import { formatMoney, formatPct, totalMarginPct } from "@aerolith/shared";
import { useMemo } from "react";
import type { LoadedProject } from "../model";
import { costCategoryTree, type CostCatNode } from "../projectCompute";
import { effectiveMargin } from "../marginRules";
import { hasAnalysisBackup } from "../model";
import { billTotal, quoteMatchesItem, sortedBills } from "../bills";
import type { ReactNode } from "react";
import { Split } from "../ui/Split";
import { DataTable } from "../ui/tableLayout";

export function DashboardView({
  project,
  billId = null,
  license = null,
}: {
  project: LoadedProject;
  billId?: string | null;
  license?: ReactNode;
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
    { label: "Direct cost", value: cost, pct: total ? cost / total : 1 },
    { label: "Overhead", value: factors.overheadPct, pct: cost ? factors.overheadPct / cost : m.overheadPct },
    { label: "Profit", value: factors.profitPct, pct: cost ? factors.profitPct / cost : m.profitPct },
    { label: "Logistics", value: factors.logisticsPct, pct: cost ? factors.logisticsPct / cost : m.logisticsPct },
    { label: "Contingency", value: factors.contingencyPct, pct: cost ? factors.contingencyPct / cost : m.contingencyPct },
  ];
  const waterMax = Math.max(1, ...waterfall.map((w) => w.value), total);
  const jobTotal = Math.max(
    1,
    project.items.filter((i) => i.kind === "item").reduce((s, i) => s + (i.result?.amount ?? 0), 0),
  );

  return (
    <div className="dashboard-view">
      {license}
      <div className="kpis">
        <div className="kpi">
          <span>Cost</span>
          <b>{formatMoney(cost, project.currency)}</b>
        </div>
        <div className="kpi">
          <span>Margin {formatPct(cost ? marginAmt / cost : totalMarginPct(m))}</span>
          <b>{formatMoney(marginAmt, project.currency)}</b>
        </div>
        <div className="kpi kpi-total">
          <span>{billId ? "This BOQ" : "Working total"}</span>
          <b>{formatMoney(total, project.currency)}</b>
        </div>
      </div>
      <p className="dash-flags">
        {unpriced} unpriced
        <span>·</span>
        {diffs} qty diffs
        <span>·</span>
        {missing} missing analysis
      </p>
      {bills.length > 1 ? (
        <div className="note boq-grand">
          <h2>Grand summary</h2>
          {bills.map((b) => (
            <div className={`bar-row ${billId && billId !== b.id ? "dim" : ""}`} key={b.id}>
              <span>
                {b.code} {b.name}
              </span>
              <div className="bar">
                <i style={{ width: `${(billTotal(project.items, b.id) / jobTotal) * 100}%` }} />
              </div>
              <strong>{formatMoney(billTotal(project.items, b.id), project.currency)}</strong>
            </div>
          ))}
          <div className="bar-row">
            <span>Working total</span>
            <div className="bar">
              <i className="total" style={{ width: "100%" }} />
            </div>
            <strong>
              {formatMoney(
                project.items.filter((i) => i.kind === "item").reduce((s, i) => s + (i.result?.amount ?? 0), 0),
                project.currency,
              )}
            </strong>
          </div>
        </div>
      ) : null}
      <div className="dash-grid">
        <Split id="dashboard" axis="x" defaultSize={560} min={280} max={900}>
        <div className="note">
          <h2>Cost by category</h2>
          {tree.length === 0 ? (
            <p>No resource rollup yet. Open Rate Analysis and Resource Prices.</p>
          ) : (
            tree.map((node) => (
              <CostBranch key={node.key} node={node} depth={0} barMax={catMax} currency={project.currency} />
            ))
          )}
        </div>
        <div className="note">
          <h2>Margin waterfall</h2>
          {waterfall.map((w) => (
            <div className="bar-row" key={w.label}>
              <span>
                {w.label} <em>{formatPct(w.pct)}</em>
              </span>
              <div className="bar">
                <i style={{ width: `${(w.value / waterMax) * 100}%` }} />
              </div>
              <strong>{formatMoney(w.value, project.currency)}</strong>
            </div>
          ))}
          <div className="bar-row">
            <span>
              Working total <em>100%</em>
            </span>
            <div className="bar">
              <i className="total" style={{ width: `${(total / waterMax) * 100}%` }} />
            </div>
            <strong>{formatMoney(total, project.currency)}</strong>
          </div>
        </div>
        </Split>
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
        <span title={DEPTH_LABEL[depth] ?? "Group"}>
          <i className="dash-lvl">{DEPTH_LABEL[depth] ?? "Group"}</i>
          {node.label}
        </span>
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
