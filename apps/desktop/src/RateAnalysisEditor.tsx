import { composeAnalysis, composeResourceLine, resolveAnalysisUnitCost } from "@aerolith/calc";
import {
  currencyMarker,
  formatDim,
  formatMoney,
  formatMoneyPlain,
  formatQty,
  formatRate,
  getDisplayFormat,
  roundTo,
} from "@aerolith/shared";
import type { AnalysisLine, LoadedProject, ProjectResource, WorkingItem } from "./model";
import { hasAnalysisBackup } from "./model";
import { carryHint, carryOf, formatWorkingAmount, formatWorkingRate } from "./boqCarry";
import { CarryModeControl } from "./CarryModeControl";
import { canLinkAnalysis, toCalcItems } from "./projectCompute";
import { displayItemRef, findItemByKey, itemKeyOf, sortedBills } from "./bills";
import { QtyInput } from "./ui/QtyInput";
import { MenuSelect } from "./ui/MenuSelect";
import type { CSSProperties } from "react";
import { useTableLayout } from "./ui/useColWidths";
import { DataTable, ResizableTh } from "./ui/tableLayout";

const FACTOR_LABELS = ["Nos", "Nos", "Qty 1", "Qty 2", "Qty 3", "Qty 4"] as const;
const RATE_COL_IDS = [
  "resource",
  "nos1",
  "nos2",
  "qty1",
  "qty2",
  "qty3",
  "qty4",
  "qty",
  "wastage",
  "itemQty",
  "unit",
  "rate",
  "amount",
  "act",
] as const;
const RATE_COL_DEFAULTS: Record<(typeof RATE_COL_IDS)[number], number> = {
  resource: 200,
  nos1: 64,
  nos2: 64,
  qty1: 68,
  qty2: 68,
  qty3: 68,
  qty4: 68,
  qty: 68,
  wastage: 72,
  itemQty: 72,
  unit: 56,
  rate: 88,
  amount: 96,
  act: 84,
};

function padFactors(factors: Array<number | null | undefined>): Array<number | null> {
  return Array.from({ length: 6 }, (_, i) => {
    const v = factors[i];
    return v == null ? null : v;
  });
}

function blankLine(seed?: { description?: string; resourceRate?: number }): AnalysisLine {
  return {
    factors: [1, null, null, null, null, null],
    wastagePct: 0,
    resourceRate: seed?.resourceRate ?? 0,
    description: seed?.description ?? "",
    projectResourceCode: null,
    unit: null,
  };
}

export function RateAnalysisEditor({
  item,
  project,
  resources,
  currency,
  marginPct: _marginPct,
  quoted: _quoted,
  quotedVendor: _quotedVendor,
  cyclic,
  locked,
  onPatch,
  onOpenItem,
  onNewAnalysis: _onNewAnalysis,
  onLinkFrom: _onLinkFrom,
  onCloneFrom: _onCloneFrom,
  onAddInclude,
  onRemoveInclude,
  onUnlink: _onUnlink,
}: {
  item: WorkingItem;
  project: LoadedProject;
  resources: ProjectResource[];
  currency: string;
  marginPct: number;
  quoted?: boolean;
  quotedVendor?: string | null;
  cyclic?: boolean;
  locked?: boolean;
  onPatch: (code: string, patch: Partial<WorkingItem>) => void;
  onOpenItem: (code: string) => void;
  onNewAnalysis: () => void;
  onLinkFrom: (sourceCode: string) => void;
  onCloneFrom: (sourceCode: string) => void;
  onAddInclude: (sourceCode: string, relation: "link" | "clone", factor: number) => void;
  onRemoveInclude: (includeId: string) => void;
  onUnlink: () => void;
}) {
  const others = project.items.filter((i) => i.kind === "item" && itemKeyOf(i) !== itemKeyOf(item));
  const linkable = others.filter((i) => canLinkAnalysis(project, itemKeyOf(item), itemKeyOf(i)));
  const billNames = new Map(sortedBills(project).map((b) => [b.id, b.name]));
  const itemMenu = (items: typeof others, placeholder: string) => [
    { value: "", label: placeholder },
    ...items.map((i) => ({
      value: itemKeyOf(i),
      label: `${displayItemRef(project, itemKeyOf(i))} · ${i.description}`,
      group: billNames.get(i.billId),
    })),
  ];
  const calcItems = toCalcItems(project);
  const analysisCost = resolveAnalysisUnitCost(calcItems, itemKeyOf(item)).unitCost;
  const origin = item.analysisOrigin ?? "own";
  const linked = origin === "link";
  const parent = linked && item.linkedBoqCode ? findItemByKey(others, item.linkedBoqCode) : null;

  function setLines(lines: AnalysisLine[]) {
    onPatch(itemKeyOf(item), { lines, priceMode: "analysis" });
  }

  function patchLine(idx: number, patch: Partial<AnalysisLine>) {
    setLines(item.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function setFactor(idx: number, factorIndex: number, n: number | null) {
    const line = item.lines[idx];
    if (!line) return;
    const factors = padFactors(line.factors);
    factors[factorIndex] = n;
    patchLine(idx, { factors });
  }

  function addLine() {
    setLines([
      ...item.lines,
      blankLine(
        item.lines.length === 0 ? { description: item.description, resourceRate: item.directCost ?? 0 } : undefined,
      ),
    ]);
  }

  function removeLine(idx: number) {
    setLines(item.lines.filter((_, i) => i !== idx));
  }

  function applyResource(idx: number, code: string) {
    if (!code) {
      patchLine(idx, { projectResourceCode: null });
      return;
    }
    const r = resources.find((x) => x.project_code === code);
    if (!r) return;
    patchLine(idx, {
      projectResourceCode: r.project_code,
      description: r.description ?? r.project_code,
      unit: r.unit,
      resourceRate: r.project_rate ?? 0,
      wastagePct: r.project_wastage_pct ?? 0,
    });
  }

  function useDirectCost() {
    onPatch(itemKeyOf(item), { priceMode: "direct", directCost: analysisCost });
  }

  function setDirectCost(raw: number) {
    onPatch(itemKeyOf(item), { priceMode: "direct", directCost: raw });
  }

  const composed = composeAnalysis(item.lines, item.ourQty);
  const ownCost = item.lines.length > 0 ? composed.unitCost : 0;
  const fmt = getDisplayFormat();
  const moneyMark = currencyMarker(currency);
  const { widths, startResize, startRowResize, tableStyle } = useTableLayout("aerolith-rate-v2", RATE_COL_DEFAULTS, 40);
  const colW = (id: (typeof RATE_COL_IDS)[number]) => widths[id] ?? RATE_COL_DEFAULTS[id];
  const fitTotal = RATE_COL_IDS.reduce((s, id) => s + colW(id), 0);
  const pin = (id: (typeof RATE_COL_IDS)[number]): CSSProperties | undefined => {
    if (id === "resource") return { position: "sticky", left: 0, zIndex: 2 };
    if (id === "rate") return { position: "sticky", right: colW("act") + colW("amount"), zIndex: 2 };
    if (id === "amount") return { position: "sticky", right: colW("act"), zIndex: 2 };
    if (id === "act") return { position: "sticky", right: 0, zIndex: 2 };
    return undefined;
  };

  return (
    <div className="rate-editor">
      {cyclic ? (
        <p className="hint">Link cycle detected. Remove the loop or unlink this item.</p>
      ) : null}
      <div className="kpis">
        <div className="kpi">
          <b>
            {formatQty(item.ourQty)} {item.unit ?? ""}
          </b>
          <span>Take-off qty</span>
        </div>
        <div className="kpi">
          <b>
            <QtyInput
              value={item.priceMode === "direct" ? (item.directCost ?? 0) : analysisCost}
              decimals={fmt.rateDecimals}
              moneyCurrency={currency}
              disabled={locked}
              aria-label="Unit cost"
              onValue={(n) => {
                const next = n ?? 0;
                const current = item.priceMode === "direct" ? (item.directCost ?? 0) : analysisCost;
                if (roundTo(next, fmt.rateDecimals) === roundTo(current, fmt.rateDecimals)) return;
                setDirectCost(next);
              }}
            />
          </b>
          <span>Unit cost {item.priceMode === "direct" ? "(direct)" : currency}</span>
        </div>
        <div className="kpi">
          <b>{formatWorkingRate(item, currency)}</b>
          <span>Rate + margin</span>
        </div>
        <div className="kpi">
          <b>{formatWorkingAmount(item, currency)}</b>
          <span>Amount {carryOf(item) === "amountOnly" ? "(lumpsum)" : currency}</span>
        </div>
      </div>
      <label className="field">
        Carry to Working BOQ
        <CarryModeControl
          value={carryOf(item)}
          disabled={locked}
          onChange={(mode) => onPatch(itemKeyOf(item), { carryMode: mode })}
        />
      </label>
      <p className="hint">{carryHint(carryOf(item))}</p>
      {linked ? (
        <p className="hint">
          This item live-links {displayItemRef(project, item.linkedBoqCode)}
          {parent ? ` · ${parent.description}` : ""}. Parent unit cost{" "}
          {formatRate(analysisCost, currency)}. Own resource lines below are kept as backup
          until you unlink or start a new analysis.
        </p>
      ) : null}
      {item.priceMode === "direct" && hasAnalysisBackup(item) ? (
        <p className="hint">
          Direct unit cost is in use. Resource lines and includes stay as backup until you add a
          line or switch to a new / linked analysis.
        </p>
      ) : null}
      {!linked && item.lines.length === 0 && (item.includes ?? []).length === 0 && item.priceMode !== "direct" ? (
        <p className="hint">
          Add a resource line, include another analysis, or type a unit cost.
        </p>
      ) : null}

      {(item.includes ?? []).length > 0 ? (
        <DataTable layoutKey="rate-includes">
          <thead>
            <tr>
              <th>Included analysis</th>
              <th>Relation</th>
              <th className="num">Factor</th>
              <th className="num">Unit cost</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(item.includes ?? []).map((inc) => {
              const live =
                inc.relation === "link"
                  ? resolveAnalysisUnitCost(calcItems, inc.sourceBoqCode).unitCost
                  : (inc.snapshotUnitCost ?? 0);
              return (
                <tr key={inc.id}>
                  <td>
                    <button type="button" className="allow-when-locked" onClick={() => onOpenItem(inc.sourceBoqCode)}>
                      {displayItemRef(project, inc.sourceBoqCode)}
                    </button>
                  </td>
                  <td>{inc.relation === "link" ? "Live link" : "Clone (frozen)"}</td>
                  <td className="num">
                    <QtyInput
                      value={inc.factor}
                      disabled={locked}
                      aria-label="Include factor"
                      onValue={(n) =>
                        onPatch(itemKeyOf(item), {
                          priceMode: "analysis",
                          includes: (item.includes ?? []).map((row) =>
                            row.id === inc.id ? { ...row, factor: n ?? 0 } : row,
                          ),
                        })
                      }
                    />
                  </td>
                  <td className="num">{formatRate(live * inc.factor, currency)}</td>
                  <td>
                    <button type="button" disabled={locked} onClick={() => onRemoveInclude(inc.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      ) : null}

      <div className="actions rate-includes">
        <MenuSelect
          label="Include analysis"
          disabled={locked || linkable.length === 0 || linked}
          value=""
          style={{ margin: 0, minWidth: 220 }}
          options={itemMenu(linkable, "Link include…")}
          onChange={(code) => {
            if (code) onAddInclude(code, "link", 1);
          }}
        />
        <MenuSelect
          label="Include clone"
          disabled={locked || others.length === 0 || linked}
          value=""
          style={{ margin: 0, minWidth: 220 }}
          options={itemMenu(others, "Clone include…")}
          onChange={(code) => {
            if (code) onAddInclude(code, "clone", 1);
          }}
        />
      </div>

      <p className="hint">Own resources {ownCost ? `· ${formatMoney(ownCost, currency)}` : ""}</p>
      <div className="scroll">
        <fieldset className="plain" disabled={locked || linked}>
          <table className="data analysis" style={{ ...tableStyle, width: fitTotal, minWidth: fitTotal }}>
            <colgroup>
              {RATE_COL_IDS.map((id) => (
                <col key={id} style={{ width: colW(id) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <ResizableTh id="resource" label="Resource" widths={widths} extraStyle={pin("resource")} onResize={startResize} onRowResize={startRowResize} />
                {FACTOR_LABELS.map((label, i) => (
                  <ResizableTh
                    key={RATE_COL_IDS[i + 1]}
                    id={RATE_COL_IDS[i + 1]!}
                    label={label}
                    numeric
                    widths={widths}
                    onResize={startResize}
                  />
                ))}
                <ResizableTh id="qty" label="Qty" numeric widths={widths} onResize={startResize} />
                <ResizableTh id="wastage" label="Wastage %" numeric widths={widths} onResize={startResize} />
                <ResizableTh id="itemQty" label="Item qty" numeric widths={widths} onResize={startResize} />
                <ResizableTh id="unit" label="Unit" widths={widths} onResize={startResize} />
                <ResizableTh id="rate" label={`Rate (${moneyMark})`} numeric widths={widths} extraStyle={pin("rate")} onResize={startResize} />
                <ResizableTh id="amount" label={`Amount (${moneyMark})`} numeric widths={widths} extraStyle={pin("amount")} onResize={startResize} />
                <ResizableTh id="act" label="" widths={widths} extraStyle={pin("act")} onResize={startResize} />
              </tr>
            </thead>
            <tbody>
              {item.lines.map((line, idx) => {
                const factors = padFactors(line.factors);
                const built = composeResourceLine(line, item.ourQty);
                return (
                  <tr key={idx}>
                    <td className="desc">
                      <select
                        value={line.projectResourceCode ?? ""}
                        onChange={(e) => applyResource(idx, e.target.value)}
                      >
                        <option value="">Custom (new resource)</option>
                        {resources.map((r) => (
                          <option key={r.project_code} value={r.project_code}>
                            {r.project_code} — {r.description ?? ""}
                          </option>
                        ))}
                      </select>
                      <input
                        className="cell"
                        value={line.description ?? ""}
                        placeholder="Resource description"
                        onChange={(e) => patchLine(idx, { description: e.target.value })}
                      />
                    </td>
                    {factors.map((f, fi) => (
                      <td className="num" key={fi}>
                        <QtyInput
                          value={f}
                          empty={null}
                          disabled={locked}
                          decimals={fi < 2 ? fmt.nosDecimals : fmt.dimDecimals}
                          round="up"
                          aria-label={FACTOR_LABELS[fi]}
                          onValue={(n) => setFactor(idx, fi, n)}
                        />
                      </td>
                    ))}
                    <td className="num">{formatDim(built.qty)}</td>
                    <td className="num">
                      <QtyInput
                        value={roundTo((line.wastagePct || 0) * 100, 4)}
                        empty={0}
                        disabled={locked}
                        decimals={2}
                        round="half"
                        aria-label="Wastage %"
                        onValue={(n) => patchLine(idx, { wastagePct: (n ?? 0) / 100 })}
                      />
                    </td>
                    <td className="num">{formatDim(built.itemQty)}</td>
                    <td>
                      <input
                        className="cell"
                        value={line.unit ?? ""}
                        onChange={(e) => patchLine(idx, { unit: e.target.value })}
                      />
                    </td>
                    <td className="num stick" style={pin("rate")}>
                      <QtyInput
                        value={line.resourceRate}
                        empty={0}
                        disabled={locked}
                        decimals={fmt.rateDecimals}
                        round="half"
                        aria-label={`Rate (${moneyMark})`}
                        onValue={(n) => patchLine(idx, { resourceRate: n ?? 0 })}
                      />
                    </td>
                    <td className="num stick" style={pin("amount")}>{formatMoneyPlain(built.amount, fmt.amountDecimals)}</td>
                    <td className="stick" style={pin("act")}>
                      <button type="button" onClick={() => removeLine(idx)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </fieldset>
      </div>
      <div className="actions rate-foot">
        <button className="primary" type="button" disabled={locked || linked} onClick={addLine}>
          Add resource line
        </button>
        <button type="button" disabled={locked} onClick={useDirectCost}>
          Use direct cost
        </button>
      </div>
    </div>
  );
}
