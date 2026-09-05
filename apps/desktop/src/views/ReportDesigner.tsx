import { useState, type DragEvent } from "react";
import { newId } from "../model";
import { Split } from "../ui/Split";
import { ReportLayoutPreview } from "./ReportLayoutPreview";
import {
  applyReportBlocks,
  applyReportLayout,
  BUILTIN_REPORT_TEMPLATES,
  cloneDefaultReportFormat,
  colWidthPct,
  columnLabel,
  formatForBuiltinTemplate,
  listWorkspaceTemplates,
  mergeReportFormat,
  REPORT_BLOCK_META,
  REPORT_BLOCK_TYPES,
  visibleColumns,
  type GrandSummaryColId,
  type ReportBlock,
  type ReportBlockType,
  type ReportColId,
  type ReportFormat,
  type ReportLayoutMode,
  type ReportLineDensity,
  type ReportMoneyStyle,
  type ReportTotalStyle,
  type StoredReportTemplate,
  type UnitSummaryColId,
  type UnitSummaryColWidths,
  type GrandSummaryColWidths,
} from "../reportFormat";

export type ReportFormatPack = {
  templates: StoredReportTemplate[];
  activeId: string | null;
  format?: ReportFormat;
};

function enabledOrder(blocks: ReportBlock[]): ReportBlock[] {
  return blocks.filter((b) => b.enabled);
}

function paletteBlocks(blocks: ReportBlock[]): ReportBlock[] {
  const present = new Set(blocks.filter((b) => b.enabled).map((b) => b.type));
  return REPORT_BLOCK_TYPES.filter((type) => !present.has(type)).map((type) => {
    const hit = blocks.find((b) => b.type === type);
    return hit ?? { type, enabled: false };
  });
}

function moveEnabled(blocks: ReportBlock[], type: ReportBlockType, toIndex: number): ReportBlock[] {
  const on = enabledOrder(blocks);
  const off = blocks.filter((b) => !b.enabled);
  const from = on.findIndex((b) => b.type === type);
  if (from >= 0) {
    const [item] = on.splice(from, 1);
    on.splice(Math.max(0, Math.min(toIndex, on.length)), 0, item);
    return [...on, ...off];
  }
  const item = blocks.find((b) => b.type === type) ?? { type, enabled: true };
  on.splice(Math.max(0, Math.min(toIndex, on.length)), 0, { ...item, enabled: true });
  return [...on, ...off.filter((b) => b.type !== type)];
}

function dropType(e: DragEvent): ReportBlockType | null {
  const t = e.dataTransfer.getData("text/aerolith-block") || e.dataTransfer.getData("text/plain");
  return REPORT_BLOCK_TYPES.includes(t as ReportBlockType) ? (t as ReportBlockType) : null;
}

export function ReportDesigner({
  value,
  onChange,
  templates = [],
  activeId = null,
  onPack,
  compact = false,
  currency = "QAR",
}: {
  value: ReportFormat;
  onChange: (next: ReportFormat) => void;
  templates?: StoredReportTemplate[];
  activeId?: string | null;
  onPack?: (pack: ReportFormatPack) => void;
  compact?: boolean;
  currency?: string;
}) {
  const fmt = mergeReportFormat(value);
  const [selected, setSelected] = useState<ReportBlockType | null>("items");
  const [dropAt, setDropAt] = useState<number | null>(null);
  const listed = listWorkspaceTemplates(templates);
  const active = listed.some((t) => t.id === activeId) ? activeId : "aerolith-default";
  const enabled = enabledOrder(fmt.blocks);
  const unused = paletteBlocks(fmt.blocks);

  function persist(next: ReportFormat) {
    onChange(next);
    if (activeId && !BUILTIN_REPORT_TEMPLATES.some((t) => t.id === activeId)) {
      onPack?.({
        templates: templates.map((t) => (t.id === activeId ? { ...t, format: { ...next } as unknown as Record<string, unknown> } : t)),
        activeId,
        format: next,
      });
    }
  }

  function patch(p: Partial<ReportFormat>) {
    persist(mergeReportFormat({ ...fmt, ...p }));
  }

  function setBlocks(next: ReportBlock[]) {
    persist(applyReportBlocks(fmt, next));
  }

  function applyTemplate(id: string) {
    const builtin = BUILTIN_REPORT_TEMPLATES.some((t) => t.id === id);
    const stored = templates.find((t) => t.id === id);
    const next = builtin ? formatForBuiltinTemplate(id) : stored ? mergeReportFormat(stored.format) : cloneDefaultReportFormat();
    onChange(next);
    onPack?.({ templates, activeId: id, format: next });
  }

  function saveAs() {
    const name = window.prompt("Layout name", "My submission layout");
    if (!name?.trim()) return;
    const id = newId("rpt");
    const nextTemplates = [...templates, { id, name: name.trim(), format: { ...fmt } as unknown as Record<string, unknown> }];
    onPack?.({ templates: nextTemplates, activeId: id, format: fmt });
  }

  function saveCurrent() {
    if (!activeId || BUILTIN_REPORT_TEMPLATES.some((t) => t.id === activeId)) {
      saveAs();
      return;
    }
    onPack?.({
      templates: templates.map((t) => (t.id === activeId ? { ...t, format: { ...fmt } as unknown as Record<string, unknown> } : t)),
      activeId,
      format: fmt,
    });
  }

  function renameCurrent() {
    const cur = templates.find((t) => t.id === activeId);
    if (!cur) return;
    const name = window.prompt("Rename layout", cur.name);
    if (!name?.trim()) return;
    onPack?.({
      templates: templates.map((t) => (t.id === activeId ? { ...t, name: name.trim() } : t)),
      activeId,
      format: fmt,
    });
  }

  function deleteCurrent() {
    if (!activeId || BUILTIN_REPORT_TEMPLATES.some((t) => t.id === activeId)) return;
    if (!window.confirm("Delete this saved layout? The live format stays until you pick another.")) return;
    const next = cloneDefaultReportFormat();
    onPack?.({ templates: templates.filter((t) => t.id !== activeId), activeId: "aerolith-default", format: next });
    onChange(next);
  }

  function onDragStart(type: ReportBlockType, e: DragEvent) {
    e.dataTransfer.setData("text/aerolith-block", type);
    e.dataTransfer.setData("text/plain", type);
    e.dataTransfer.effectAllowed = "move";
  }

  function onCanvasDrop(index: number, e: DragEvent) {
    e.preventDefault();
    setDropAt(null);
    const type = dropType(e);
    if (!type) return;
    setBlocks(moveEnabled(fmt.blocks, type, index));
    setSelected(type);
  }

  function setLayout(layout: ReportLayoutMode) {
    persist(applyReportLayout(fmt, layout));
  }

  const sel = selected && REPORT_BLOCK_META[selected] ? selected : null;

  const fields = (
    <div className={compact ? "report-fields compact report-designer" : "report-fields report-designer"}>
      <h2 className="view">Report layouts</h2>
      <p className="hint">
        {compact
          ? "These options are the Submission BOQ reporting format. Save layouts, drag blocks, and pick paged sheets or continuous scroll."
          : "These options are the Submission BOQ reporting format. The sheet on the right is a field preview — logo, letterhead, columns, and blocks — not job figures."}
      </p>
      <label className="field">
        Layout
        <select value={active ?? "aerolith-default"} onChange={(e) => applyTemplate(e.target.value)}>
          {listed.map((t) => (
            <option key={t.id} value={t.id}>
              {t.builtin ? t.name : `${t.name} (saved)`}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">{listed.find((t) => t.id === active)?.hint}</p>
      <div className="actions">
        <button type="button" onClick={saveCurrent}>
          Save layout
        </button>
        <button type="button" onClick={saveAs}>
          Save as new
        </button>
        {activeId && !BUILTIN_REPORT_TEMPLATES.some((t) => t.id === activeId) ? (
          <>
            <button type="button" onClick={renameCurrent}>
              Rename
            </button>
            <button type="button" onClick={deleteCurrent}>
              Delete
            </button>
          </>
        ) : null}
        <button type="button" onClick={() => applyTemplate("aerolith-default")}>
          Restore Aerolith default
        </button>
      </div>

      <div className="seg report-layout-seg" role="group" aria-label="Page flow">
        <button type="button" className={fmt.layoutMode === "paged" ? "primary" : ""} onClick={() => setLayout("paged")}>
          Paged sheets
        </button>
        <button
          type="button"
          className={fmt.layoutMode === "continuous" ? "primary" : ""}
          onClick={() => setLayout("continuous")}
        >
          Continuous scroll
        </button>
      </div>

      <h3 className="report-sub">Page blocks</h3>
      <p className="hint">Drag from the palette onto the page, or reorder the stack. Arrow buttons also move a block.</p>
      <div className="report-dnd">
        <div className="report-palette" aria-label="Available blocks">
          <p className="report-dnd-label">Palette</p>
          {unused.length === 0 ? <p className="hint">Every block is on the page.</p> : null}
          {unused.map((b) => (
            <button
              key={b.type}
              type="button"
              className="report-chip"
              draggable
              onDragStart={(e) => onDragStart(b.type, e)}
              onClick={() => {
                setBlocks(moveEnabled(fmt.blocks, b.type, enabled.length));
                setSelected(b.type);
              }}
            >
              {REPORT_BLOCK_META[b.type].label}
            </button>
          ))}
        </div>
        <ol
          className="report-canvas"
          aria-label="Page stack"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => onCanvasDrop(enabled.length, e)}
        >
          <p className="report-dnd-label">On the page</p>
          {enabled.map((b, idx) => (
            <li
              key={b.type}
              className={`report-block ${selected === b.type ? "on" : ""} ${dropAt === idx ? "drop" : ""}`}
              draggable
              onDragStart={(e) => onDragStart(b.type, e)}
              onDragOver={(e) => {
                e.preventDefault();
                setDropAt(idx);
              }}
              onDragLeave={() => setDropAt((cur) => (cur === idx ? null : cur))}
              onDrop={(e) => onCanvasDrop(idx, e)}
            >
              <button type="button" className="report-block-pick" onClick={() => setSelected(b.type)}>
                <span className="code">{idx + 1}</span>
                <span>
                  {REPORT_BLOCK_META[b.type].label}
                  <small>{REPORT_BLOCK_META[b.type].hint}</small>
                </span>
              </button>
              <span className="report-block-tools">
                <button type="button" aria-label="Move up" disabled={idx === 0} onClick={() => setBlocks(moveEnabled(fmt.blocks, b.type, idx - 1))}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={idx === enabled.length - 1}
                  onClick={() => setBlocks(moveEnabled(fmt.blocks, b.type, idx + 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label="Remove from page"
                  onClick={() => setBlocks(fmt.blocks.map((x) => (x.type === b.type ? { ...x, enabled: false } : x)))}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ol>
      </div>
      {sel ? <p className="hint">{REPORT_BLOCK_META[sel].label}: {REPORT_BLOCK_META[sel].hint}</p> : null}

      <h3 className="report-sub">Type and money</h3>
      <label className="field">
        Type size
        <select value={fmt.fontSize} onChange={(e) => patch({ fontSize: e.target.value as ReportFormat["fontSize"] })}>
          <option value="sm">Small</option>
          <option value="md">Default</option>
          <option value="lg">Large</option>
        </select>
      </label>
      <label className="field">
        Line setup
        <select value={fmt.lineDensity} onChange={(e) => patch({ lineDensity: e.target.value as ReportLineDensity })}>
          <option value="compact">Compact</option>
          <option value="normal">Normal</option>
          <option value="loose">Loose</option>
        </select>
      </label>
      <label className="field">
        Currency format
        <select value={fmt.moneyStyle} onChange={(e) => patch({ moneyStyle: e.target.value as ReportMoneyStyle })}>
          <option value="inherit">Workspace default (QAR 1,234.00)</option>
          <option value="code">Code then amount</option>
          <option value="symbol">Symbol then amount</option>
          <option value="plain">Amount only</option>
        </select>
      </label>
      <label className="field">
        Total format
        <select value={fmt.totalStyle} onChange={(e) => patch({ totalStyle: e.target.value as ReportTotalStyle })}>
          <option value="row">Highlighted row</option>
          <option value="boxed">Boxed</option>
          <option value="rule">Rule above</option>
        </select>
      </label>

      <h3 className="report-sub">Letterhead</h3>
      <label className="field">
        Company name
        <input value={fmt.companyName} onChange={(e) => patch({ companyName: e.target.value })} placeholder="Aerolith Core" />
      </label>
      <label className="field">
        Address / letterhead
        <textarea rows={compact ? 2 : 3} value={fmt.companyAddress} onChange={(e) => patch({ companyAddress: e.target.value })} />
      </label>
      <label className="field">
        Cover note
        <textarea rows={compact ? 2 : 3} value={fmt.extraHeader} onChange={(e) => patch({ extraHeader: e.target.value })} />
      </label>
      <label className="field">
        Footer
        <input value={fmt.footer} onChange={(e) => patch({ footer: e.target.value })} />
      </label>
      <div className="report-toggles">
        <label>
          <input type="checkbox" checked={fmt.showLogo} onChange={(e) => patch({ showLogo: e.target.checked })} />
          Logo
        </label>
        <label>
          <input type="checkbox" checked={fmt.showDate} onChange={(e) => patch({ showDate: e.target.checked })} />
          Date
        </label>
        <label>
          <input type="checkbox" checked={fmt.showRevision} onChange={(e) => patch({ showRevision: e.target.checked })} />
          Revision
        </label>
        <label>
          <input type="checkbox" checked={fmt.showSection7} onChange={(e) => patch({ showSection7: e.target.checked })} />
          Tender adjustments
        </label>
        <label>
          <input
            type="checkbox"
            checked={fmt.showPageNumbers}
            onChange={(e) => patch({ showPageNumbers: e.target.checked })}
          />
          Page numbers
        </label>
      </div>

      <h3 className="report-sub">Bill table</h3>
      <p className="hint">Toggle columns, then drag to set left-to-right order.</p>
      <div className="report-toggles">
        {(
          [
            ["showSl", "No."],
            ["showDescription", "Description"],
            ["showQty", "Qty"],
            ["showUnit", "Unit"],
            ["showRate", "Rate"],
            ["showAmount", "Amount"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <input type="checkbox" checked={fmt[key]} onChange={(e) => patch({ [key]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
      <ol className="report-cols">
        {visibleColumns(fmt).map((c, idx) => (
          <li
            key={c}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", c);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = e.dataTransfer.getData("text/plain");
              const cols = visibleColumns(fmt);
              const a = cols.indexOf(from);
              if (a < 0) return;
              cols.splice(a, 1);
              cols.splice(idx, 0, from);
              patch({ columnOrder: cols });
            }}
          >
            <span>{columnLabel(c, fmt)}</span>
            <input
              type="number"
              min={4}
              max={90}
              value={colWidthPct(c, fmt)}
              aria-label={`${columnLabel(c, fmt)} width %`}
              onChange={(e) =>
                patch({
                  colWidths: {
                    ...fmt.colWidths,
                    [c as ReportColId]: Number(e.target.value),
                  },
                })
              }
            />
          </li>
        ))}
      </ol>
      <label className="field">
        Qty column
        <select value={fmt.qtyColumn} onChange={(e) => patch({ qtyColumn: e.target.value as ReportFormat["qtyColumn"] })}>
          <option value="issued">Issued qty (default)</option>
          <option value="our">Our qty</option>
          <option value="both">Issued and our</option>
        </select>
      </label>

      {fmt.layoutMode === "paged" ? (
        <label className="field">
          Lines per page
          <input
            type="number"
            min={8}
            max={80}
            value={fmt.linesPerPage}
            onChange={(e) => patch({ linesPerPage: Number(e.target.value) })}
          />
        </label>
      ) : (
        <p className="hint">Continuous mode keeps one scrolling bill. Category totals sit in the table when that block is on.</p>
      )}

      <h3 className="report-sub">Paper</h3>
      <p className="hint">Applies to Submission BOQ. Client BOQ is always A4 portrait. Working BOQ fills the screen.</p>
      <label className="field">
        Paper
        <select value={fmt.paper} onChange={(e) => patch({ paper: e.target.value as ReportFormat["paper"] })}>
          <option value="a4">A4</option>
          <option value="a3">A3</option>
          <option value="letter">Letter</option>
        </select>
      </label>
      <label className="field">
        Orientation
        <select value={fmt.orientation} onChange={(e) => patch({ orientation: e.target.value as ReportFormat["orientation"] })}>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>

      <h3 className="report-sub">Summary column widths (%)</h3>
      <div className="col-widths">
        {(["description", "amount"] as UnitSummaryColId[]).map((c) => (
          <label key={`page-${c}`} className="field">
            Page {c === "description" ? "description" : "amount"}
            <input
              type="number"
              min={4}
              max={90}
              value={fmt.pageSummaryColWidths[c]}
              onChange={(e) =>
                patch({
                  pageSummaryColWidths: { ...fmt.pageSummaryColWidths, [c]: Number(e.target.value) } as UnitSummaryColWidths,
                })
              }
            />
          </label>
        ))}
        {(["description", "amount"] as UnitSummaryColId[]).map((c) => (
          <label key={`cat-${c}`} className="field">
            Category {c === "description" ? "description" : "amount"}
            <input
              type="number"
              min={4}
              max={90}
              value={fmt.categorySummaryColWidths[c]}
              onChange={(e) =>
                patch({
                  categorySummaryColWidths: {
                    ...fmt.categorySummaryColWidths,
                    [c]: Number(e.target.value),
                  } as UnitSummaryColWidths,
                })
              }
            />
          </label>
        ))}
        {(["sl", "description", "amount"] as GrandSummaryColId[]).map((c) => (
          <label key={`grand-${c}`} className="field">
            Grand {c === "sl" ? "No." : c === "description" ? "description" : "amount"}
            <input
              type="number"
              min={4}
              max={90}
              value={fmt.grandSummaryColWidths[c]}
              onChange={(e) =>
                patch({
                  grandSummaryColWidths: {
                    ...fmt.grandSummaryColWidths,
                    [c]: Number(e.target.value),
                  } as GrandSummaryColWidths,
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );

  if (compact) return fields;
  return (
    <Split
      id="settings-report-preview"
      axis="x"
      defaultSize={400}
      min={260}
      max={640}
      primary="end"
      className="report-layout-workspace"
    >
      {fields}
      <ReportLayoutPreview format={fmt} currency={currency} highlight={sel} />
    </Split>
  );
}

export function ReportFormatFields({
  value,
  onChange,
  compact = false,
  templates,
  activeId,
  onPack,
  currency,
}: {
  value: ReportFormat;
  onChange: (next: ReportFormat) => void;
  compact?: boolean;
  templates?: StoredReportTemplate[];
  activeId?: string | null;
  onPack?: (pack: ReportFormatPack) => void;
  currency?: string;
}) {
  return (
    <ReportDesigner
      value={value}
      onChange={onChange}
      compact={compact}
      templates={templates}
      activeId={activeId}
      onPack={onPack}
      currency={currency}
    />
  );
}
