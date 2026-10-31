import { formatMoney } from "@aerolith/shared";
import { useMemo, useState } from "react";
import { downloadSubmissionCsv } from "../reportExport";
import { costCategoryTree } from "../projectCompute";
import { effectiveMargin } from "../marginRules";
import type { LoadedProject } from "../model";
import { downloadXlsx, tableToXlsx } from "../simpleSheet";
import { ChartFrame, DataCard, ModuleChrome, StatusPill } from "../ui/enterprise";
import { PrintActions } from "../ui/PrintActions";
import { usePrintHeader } from "../print/context";
import { jobDocument } from "../print/types";

type SuiteId = "working" | "category" | "submission";

const SUITES: Array<{ id: SuiteId; name: string; detail: string; columns: string[] }> = [
  {
    id: "working",
    name: "Working summary",
    detail: "Direct cost through the margin stack to the working total.",
    columns: ["Step", "Amount"],
  },
  {
    id: "category",
    name: "Cost by category",
    detail: "Direct cost grouped by resource category.",
    columns: ["Category", "Amount"],
  },
  {
    id: "submission",
    name: "Submission",
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
        title="Suite library"
        detail="Pick a suite, read the chart, then print or download a spreadsheet. Letterhead stays in Settings."
        pill={<StatusPill tone="draft">{project.currency}</StatusPill>}
      >
        <button type="button" onClick={onSettings}>
          Edit letterhead
        </button>
      </ModuleChrome>
      <div className="card-grid">
        {SUITES.map((item) => (
          <DataCard
            key={item.id}
            title={item.name}
            status={item.id === suite ? "Open" : "Suite"}
            tone={item.id === suite ? "sealed" : "draft"}
            lines={[item.detail, item.columns.join(" · "), "Bid Craft"]}
            action={item.id === suite ? "Selected" : "Open suite"}
            selected={item.id === suite}
            onOpen={() => setSuite(item.id)}
          />
        ))}
        {templates.map((template) => (
          <DataCard
            key={template.id}
            title={template.name}
            status="Template"
            tone="saved"
            lines={["Saved letterhead", "Uses the submission suite", "Bid Craft"]}
            action="Preview as submission"
            onOpen={() => setSuite("submission")}
          />
        ))}
      </div>
      <div className="reports-preview">
        <ChartFrame title={chosen.name} bars={bars} format={(value) => formatMoney(value, project.currency)} />
        <aside>
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
              Download .xlsx
            </button>
            {suite === "submission" ? (
              <button type="button" onClick={() => downloadSubmissionCsv(project, header.format, total)}>
                Download submission .csv
              </button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function suiteBars(project: LoadedProject, suite: SuiteId, total: number): Array<{ label: string; value: number }> {
  const items = project.items.filter((item) => item.kind === "item");
  if (suite === "category") {
    return costCategoryTree(project, null).map((node) => ({ label: node.label, value: node.amount }));
  }
  if (suite === "submission") {
    const unpriced = items.filter((item) => !item.result || item.result.rate === 0).length;
    return [
      { label: "Priced rows", value: items.length - unpriced },
      { label: "Unpriced rows", value: unpriced },
    ];
  }
  const cost = items.reduce((sum, item) => sum + (item.result?.costAmount ?? 0), 0);
  const factors = { overhead: 0, profit: 0, logistics: 0, contingency: 0 };
  for (const item of items) {
    const stack = effectiveMargin(project, item);
    const line = item.result?.costAmount ?? 0;
    factors.overhead += line * stack.overheadPct;
    factors.profit += line * stack.profitPct;
    factors.logistics += line * stack.logisticsPct;
    factors.contingency += line * stack.contingencyPct;
  }
  return [
    { label: "Direct cost", value: cost },
    { label: "Overhead", value: factors.overhead },
    { label: "Profit", value: factors.profit },
    { label: "Logistics", value: factors.logistics },
    { label: "Contingency", value: factors.contingency },
    { label: "Working total", value: total },
  ];
}
