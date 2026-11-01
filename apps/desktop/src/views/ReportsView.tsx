import { formatMoney } from "@aerolith/shared";
import { useMemo, useState } from "react";
import { downloadSubmissionCsv } from "../reportExport";
import { costCategoryTree } from "../projectCompute";
import { effectiveMargin } from "../marginRules";
import type { LoadedProject } from "../model";
import { downloadXlsx, tableToXlsx } from "../simpleSheet";
import { ChartFrame, ModuleChrome, StatusPill } from "../ui/enterprise";
import { PrintActions } from "../ui/PrintActions";
import { usePrintHeader } from "../print/context";
import { jobDocument } from "../print/types";

type SuiteId = "working" | "category" | "submission";

const SUITES: Array<{ id: SuiteId; name: string; detail: string; columns: string[] }> = [
  {
    id: "working",
    name: "Executive summary",
    detail: "Direct cost through the margin stack to the working total.",
    columns: ["Step", "Amount"],
  },
  {
    id: "category",
    name: "Material / cost list",
    detail: "Direct cost grouped by resource category.",
    columns: ["Category", "Amount"],
  },
  {
    id: "submission",
    name: "Tender submission",
    detail: "Priced rows against rows that still have no rate.",
    columns: ["State", "Rows"],
  },
];

export function ReportsView({
  project,
  total,
  templates,
  onSettings,
}: {
  project: LoadedProject;
  total: number;
  templates: Array<{ id: string; name: string }>;
  onSettings: () => void;
}) {
  const [suite, setSuite] = useState<SuiteId>("working");
  const header = usePrintHeader();
  const chosen = SUITES.find((item) => item.id === suite) ?? SUITES[0]!;
  const priced = project.items.filter((item) => item.kind === "item");
  const unpriced = priced.filter((item) => !item.result || item.result.rate === 0).length;
  const bars = useMemo(() => suiteBars(project, suite, total), [project, suite, total]);
  const rows = bars.map((bar) => [bar.label, formatMoney(bar.value, project.currency)]);

  return (
    <div className="enterprise-module reports-hub">
      <ModuleChrome
        kicker="Reports"
        title="Report library"
        detail="Pick a template, preview the chart, then export PDF, Excel, or keep the letterhead in Settings."
        pill={<StatusPill tone="draft">{project.currency}</StatusPill>}
      >
        <button type="button" onClick={onSettings}>
          Edit letterhead
        </button>
      </ModuleChrome>
      <div className="reports-library">
        <aside className="report-list" aria-label="Report templates">
          {SUITES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === suite ? "on" : ""}
              onClick={() => setSuite(item.id)}
            >
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </button>
          ))}
          {templates.map((template) => (
            <button key={template.id} type="button" onClick={() => setSuite("submission")}>
              <strong>{template.name}</strong>
              <small>Saved letterhead · submission suite</small>
            </button>
          ))}
        </aside>
        <div className="report-preview-pane">
          <ChartFrame title={chosen.name} bars={bars} format={(value) => formatMoney(value, project.currency)} />
          <h2>Columns</h2>
          <ul>
            {chosen.columns.map((column) => (
              <li key={column}>{column}</li>
            ))}
          </ul>
          <p className="hint">{unpriced} unpriced rows on this job.</p>
          <div className="tb-group">
            <PrintActions
              build={() =>
                jobDocument(header.project.name, `r${header.project.revision}`, header.format, chosen.name, [
                  {
                    title: chosen.name,
                    columns: [
                      { label: chosen.columns[0] ?? "Label", width: 60 },
                      { label: chosen.columns[1] ?? "Value", width: 40, align: "right" },
                    ],
                    rows: [
                      ...rows.map((row) => ({ cells: row })),
                      { kind: "total" as const, cells: ["Working total", formatMoney(total, project.currency)] },
                    ],
                  },
                ])
              }
            />
            <button
              type="button"
              onClick={() =>
                downloadXlsx(
                  `${project.name} ${chosen.name}.xlsx`,
                  tableToXlsx(chosen.name, chosen.columns, rows),
                )
              }
            >
              Export Excel
            </button>
            {suite === "submission" ? (
              <button type="button" onClick={() => downloadSubmissionCsv(project, header.format, total)}>
                Export CSV
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function suiteBars(project: LoadedProject, suite: SuiteId, total: number) {
  if (suite === "category") {
    return costCategoryTree(project).map((node) => ({ label: node.label, value: node.amount }));
  }
  if (suite === "submission") {
    const items = project.items.filter((item) => item.kind === "item");
    const unpriced = items.filter((item) => !item.result || item.result.rate === 0).length;
    return [
      { label: "Priced", value: items.length - unpriced },
      { label: "Unpriced", value: unpriced },
    ];
  }
  const items = project.items.filter((item) => item.kind === "item");
  let cost = 0;
  let overhead = 0;
  let profit = 0;
  let logistics = 0;
  let contingency = 0;
  for (const item of items) {
    const c = item.result?.costAmount ?? 0;
    const stack = effectiveMargin(project, item);
    cost += c;
    overhead += c * stack.overheadPct;
    profit += c * stack.profitPct;
    logistics += c * stack.logisticsPct;
    contingency += c * stack.contingencyPct;
  }
  return [
    { label: "Direct cost", value: cost },
    { label: "Overhead", value: overhead },
    { label: "Profit", value: profit },
    { label: "Logistics", value: logistics },
    { label: "Contingency", value: contingency },
    { label: "Working total", value: total },
  ];
}
