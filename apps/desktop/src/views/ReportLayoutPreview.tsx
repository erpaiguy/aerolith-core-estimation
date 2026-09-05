import type { ReactNode } from "react";
import { REPORT_BLOCK_META, type ReportBlockType, type ReportFormat } from "../reportFormat";
import { conceptualCell, layoutPreviewModel, moneyStyleHint } from "../reportLayoutPreview";

function PreviewTable({
  columns,
  rows,
}: {
  columns: ReturnType<typeof layoutPreviewModel>["columns"];
  rows: Array<{ kind: "section" | "item" | "total"; topic: string }>;
}) {
  if (!columns.length) {
    return <p className="rpt-empty">No bill columns are on.</p>;
  }
  return (
    <table className="doc-table rpt-table">
      <colgroup>
        {columns.map((c) => (
          <col key={c.id} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.id} className={c.numeric ? "num" : undefined}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row.kind}-${i}`} className={row.kind === "section" ? "sec" : row.kind === "total" ? "tot" : undefined}>
            {columns.map((c) => (
              <td key={c.id} className={c.numeric ? "num" : undefined}>
                {conceptualCell(c.id, row.kind, row.topic)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BlockFrame({
  type,
  highlight,
  children,
}: {
  type: ReportBlockType;
  highlight?: ReportBlockType | null;
  children: ReactNode;
}) {
  return (
    <section
      className={`rpt-block${highlight === type ? " on" : ""}`}
      aria-label={REPORT_BLOCK_META[type].label}
    >
      {children}
    </section>
  );
}

export function ReportLayoutPreview({
  format,
  currency = "QAR",
  highlight = null,
}: {
  format: ReportFormat;
  currency?: string;
  highlight?: ReportBlockType | null;
}) {
  const model = layoutPreviewModel(format, currency);
  const paperClass = `rpt-sheet paper-${format.paper} orient-${format.orientation} type-${format.fontSize} dens-${format.lineDensity} tot-${format.totalStyle}${
    format.layoutMode === "continuous" ? " flow" : ""
  }`;
  const itemRows: Array<{ kind: "section" | "item" | "total"; topic: string }> = [
    { kind: "section", topic: "Category heading" },
    { kind: "item", topic: "Item description" },
    { kind: "item", topic: "Item description" },
  ];
  if (model.section7) itemRows.push({ kind: "section", topic: "Next category — Tender adjustments" }, { kind: "item", topic: "Adjustment line" });
  if (model.blocks.includes("category-total")) itemRows.push({ kind: "total", topic: "Category total" });
  if (model.blocks.includes("page-total")) itemRows.push({ kind: "total", topic: "Page total" });

  return (
    <aside className="rpt-preview" aria-label="Report layout preview">
      <p className="rpt-preview-kicker">Submission BOQ preview</p>
      <p className="rpt-preview-meta">
        {model.paperLabel} · {model.flowLabel}
      </p>
      <p className="hint">{moneyStyleHint(format, currency)}. Field labels only — job figures stay on Submission BOQ.</p>
      <div className={paperClass}>
        {model.blocks.map((type) => {
          if (type === "letterhead") {
            return (
              <BlockFrame key={type} type={type} highlight={highlight}>
                <div className="doc-letterhead">
                  {model.logo ? (
                    <div className="rpt-logo" aria-hidden="true">
                      Logo
                    </div>
                  ) : null}
                  <div>
                    <div className="title">{model.company}</div>
                    <div className="title job">{model.job}</div>
                    <div className="addr">{model.address}</div>
                  </div>
                </div>
              </BlockFrame>
            );
          }
          if (type === "cover") {
            const bits = ["Submission BOQ"];
            if (model.revision) bits.push("Revision");
            if (model.date) bits.push("Date");
            return (
              <BlockFrame key={type} type={type} highlight={highlight}>
                <div className="sub">{bits.join(" · ")}</div>
                <p className="doc-note">{model.cover}</p>
              </BlockFrame>
            );
          }
          if (type === "kpis") {
            return (
              <BlockFrame key={type} type={type} highlight={highlight}>
                <div className="kpis rpt-kpis">
                  {["Grand total", "Tender adjustments", "Priced items"].map((label) => (
                    <div key={label} className="kpi">
                      <b>—</b>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </BlockFrame>
            );
          }
          if (type === "items") {
            return (
              <BlockFrame key={type} type={type} highlight={highlight}>
                <h2 className="sheet-title">Bill items</h2>
                <PreviewTable columns={model.columns} rows={itemRows} />
              </BlockFrame>
            );
          }
          if (type === "category-total" || type === "page-total") {
            return model.blocks.includes("items") ? null : (
              <BlockFrame key={type} type={type} highlight={highlight}>
                <p className="rpt-topic">{REPORT_BLOCK_META[type].label}</p>
              </BlockFrame>
            );
          }
          if (type === "category-summary" || type === "page-summary" || type === "bill-summary") {
            const topic =
              type === "category-summary" ? "Category" : type === "page-summary" ? "Page" : "Bill";
            return (
              <BlockFrame key={type} type={type} highlight={highlight}>
                <h2 className="sheet-title">{REPORT_BLOCK_META[type].label}</h2>
                <PreviewTable
                  columns={[
                    { id: "description", label: topic, numeric: false },
                    { id: "amount", label: "Amount", numeric: true },
                  ]}
                  rows={[
                    { kind: "item", topic: `${topic} heading` },
                    { kind: "total", topic: "Total" },
                  ]}
                />
              </BlockFrame>
            );
          }
          if (type === "grand-total") {
            return (
              <BlockFrame key={type} type={type} highlight={highlight}>
                <h2 className="sheet-title">Grand total</h2>
                <PreviewTable
                  columns={[
                    { id: "sl", label: "No.", numeric: false },
                    { id: "description", label: "Description", numeric: false },
                    { id: "amount", label: "Amount", numeric: true },
                  ]}
                  rows={[{ kind: "total", topic: "Grand total" }]}
                />
              </BlockFrame>
            );
          }
          if (type === "footer") {
            return (
              <BlockFrame key={type} type={type} highlight={highlight}>
                <div className="doc-sheet-foot">
                  <span>{model.footer}</span>
                  {model.pageNumbers ? <span>Page 1 of n</span> : <span />}
                </div>
              </BlockFrame>
            );
          }
          return null;
        })}
      </div>
    </aside>
  );
}
