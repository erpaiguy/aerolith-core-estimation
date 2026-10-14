import { FORMULA_KEYS, qtoQty, type FormulaKey, type QtoDims } from "@aerolith/calc";
import { formatQty, formatNos, formatDim, parseSignedNumber, getDisplayFormat } from "@aerolith/shared";
import { useEffect, useLayoutEffect, useMemo, useState, Fragment, type ReactNode } from "react";
import { itemMatchesColumnFilters, itemMatchesQuery } from "../boqColumns";
import type { BoqColumnDef, QtoLine, WorkingItem } from "../model";
import { uid } from "../projectCompute";
import { itemKeyOf } from "../bills";
import { askConfirm } from "../ui/askConfirm";
import { QtyInput } from "../ui/QtyInput";
import { VirtualTable } from "../ui/VirtualTable";
import { Split } from "../ui/Split";
import { PrintActions } from "../ui/PrintActions";
import { usePrintHeader } from "../print/context";
import { jobDocument } from "../print/types";

type DimKey = keyof QtoDims;

const DIM_ORDER: DimKey[] = ["nos1", "nos2", "l", "b", "h", "t"];
const DIM_LABEL: Record<DimKey, string> = {
  nos1: "Nos",
  nos2: "Nos",
  l: "L",
  b: "B",
  h: "H",
  t: "T",
};

const DIMS_FOR: Record<FormulaKey, DimKey[]> = {
  qty: [],
  area: ["nos1", "nos2", "l", "b"],
  volume: ["nos1", "nos2", "l", "b", "h"],
  perimeter_x_h: ["nos1", "nos2", "l", "b", "h"],
  product: ["nos1", "nos2", "l", "b", "h", "t"],
};

const FORMULA_SHORT: Record<FormulaKey, string> = {
  qty: "Qty",
  product: "Product",
  area: "Area",
  volume: "Volume",
  perimeter_x_h: "Perimeter × H",
};

const FORMULA_WORDS: Record<FormulaKey, string> = {
  qty: "Quantity — a typed amount. Not a room measurement.",
  product: "Product of Nos × Nos × L × B × H × T. Blank factors are ignored.",
  area: "Area = Nos × Nos × L × B.",
  volume: "Volume = Nos × Nos × L × B × H.",
  perimeter_x_h: "Perimeter × H = Nos × Nos × 2 × (L + B) × H.",
};

function isQtySeed(line: QtoLine): boolean {
  return (
    line.formulaKey === "qty" &&
    !line.drawing?.trim() &&
    !line.locationDesc?.trim() &&
    !line.subItem?.trim()
  );
}

function dimUnion(keys: FormulaKey[]): DimKey[] {
  const used = new Set<DimKey>();
  for (const k of keys) {
    if (k === "qty") used.add("l");
    else for (const d of DIMS_FOR[k]) used.add(d);
  }
  return DIM_ORDER.filter((d) => used.has(d));
}

function noteText(line: QtoLine): string {
  const parts = [line.itemLabel, line.subItem].filter((s) => s && s.trim());
  return parts.join(" · ");
}

function normalizeCategory(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "Uncategorised";
  const upper = t.toUpperCase();
  if (upper === "ID" || upper === "MEP") return upper;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function dimPlaces(key: DimKey): { decimals: number; round: "up" } {
  const fmt = getDisplayFormat();
  if (key === "nos1" || key === "nos2") return { decimals: fmt.nosDecimals, round: "up" };
  return { decimals: fmt.dimDecimals, round: "up" };
}

function dimLabel(key: DimKey, formulas: FormulaKey[]): string {
  if (key === "l" && formulas.every((f) => f === "qty")) return "Qty";
  return DIM_LABEL[key];
}

function formatDimCell(key: DimKey, value: number | null | undefined): string {
  if (value == null) return "";
  if (key === "nos1" || key === "nos2") return formatNos(value);
  return formatDim(value);
}

export function TakeoffInspector({
  item,
  line,
  itemLines,
}: {
  item: WorkingItem | null;
  line: QtoLine | null;
  itemLines: QtoLine[];
}) {
  const posted = itemLines.reduce((s, l) => s + qtoQty(l.formulaKey, l.dims), 0);
  if (!item) {
    return <p className="hint">Choose a bill item. Measurements here become Our qty on Working BOQ.</p>;
  }
  if (!line) {
    return (
      <>
        <p className="hint">{item.boqCode}</p>
        <dl>
          <dt>Client</dt>
          <dd>{formatQty(item.clientQty)}</dd>
          <dt>Our (posted)</dt>
          <dd>{formatQty(item.ourQty)}</dd>
          <dt>Diff</dt>
          <dd>{formatQty(item.ourQty - item.clientQty)}</dd>
        </dl>
        <p className="hint">Select a measurement, or add one.</p>
      </>
    );
  }
  const live = DIMS_FOR[line.formulaKey];
  const seed = isQtySeed(line);
  return (
    <>
      <p className="hint">{item.boqCode}</p>
      {seed ? <span className="source-badge">Quantity</span> : null}
      <p>{FORMULA_WORDS[line.formulaKey]}</p>
      {line.formulaKey === "qty" ? (
        <dl>
          <dt>Quantity</dt>
          <dd>{formatDim(qtoQty(line.formulaKey, line.dims))}</dd>
        </dl>
      ) : (
        <dl>
          {live.map((k) => (
            <Fragment key={k}>
              <dt>{DIM_LABEL[k]}</dt>
              <dd>{line.dims[k] == null ? "blank" : formatDimCell(k, Number(line.dims[k]))}</dd>
            </Fragment>
          ))}
          <dt>This line</dt>
          <dd>{formatDim(qtoQty(line.formulaKey, line.dims))}</dd>
        </dl>
      )}
      <dl>
        <dt>Running total for {item.boqCode}</dt>
        <dd>
          {formatQty(posted)} {item.unit ?? ""}
        </dd>
        <dt>Client</dt>
        <dd>{formatQty(item.clientQty)}</dd>
        <dt>Diff</dt>
        <dd>{formatQty(posted - item.clientQty)}</dd>
      </dl>
    </>
  );
}

export function TakeoffView({
  items,
  lines,
  selected,
  selectedLineId,
  onSelect,
  onSelectLine,
  onChangeLines,
  locked,
  filterColumns = [],
  billSwitcher,
}: {
  items: WorkingItem[];
  lines: QtoLine[];
  selected: string | null;
  selectedLineId: string | null;
  onSelect: (code: string) => void;
  onSelectLine: (id: string | null) => void;
  onChangeLines: (lines: QtoLine[]) => void;
  locked?: boolean;
  filterColumns?: BoqColumnDef[];
  billSwitcher?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [cat, setCat] = useState("All");
  const priced = useMemo(() => items.filter((i) => i.kind === "item"), [items]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      if (!l.workingBoqCode) continue;
      m.set(l.workingBoqCode, (m.get(l.workingBoqCode) ?? 0) + 1);
    }
    return m;
  }, [lines]);

  const cats = useMemo(() => {
    const s = new Set<string>();
    for (const i of priced) s.add(normalizeCategory(i.workCategory));
    return ["All", ...[...s].sort()];
  }, [priced]);

  const visibleItems = useMemo(() => {
    return priced.filter((i) => {
      if (cat !== "All" && normalizeCategory(i.workCategory) !== cat) return false;
      return itemMatchesQuery(i, query) && itemMatchesColumnFilters(i, filters);
    });
  }, [priced, cat, query, filters]);

  const groups = useMemo(() => {
    const visible = new Set(visibleItems.map((i) => itemKeyOf(i)));
    const out: Array<{ section: WorkingItem | null; items: WorkingItem[] }> = [];
    let current: { section: WorkingItem | null; items: WorkingItem[] } = { section: null, items: [] };
    for (const row of items) {
      if (row.kind === "section") {
        if (current.items.length) out.push(current);
        current = { section: row, items: [] };
      } else if (visible.has(itemKeyOf(row))) {
        current.items.push(row);
      }
    }
    if (current.items.length) out.push(current);
    return out;
  }, [items, visibleItems]);

  const item = priced.find((i) => itemKeyOf(i) === selected) ?? null;
  const printHead = usePrintHeader();
  const itemLines = useMemo(
    () => lines.filter((l) => l.workingBoqCode === selected || (item && l.workingBoqCode === item.boqCode)),
    [lines, selected, item],
  );
  const dimCols = useMemo(() => dimUnion(itemLines.map((l) => l.formulaKey)), [itemLines]);

  useLayoutEffect(() => {
    if (selected && visibleItems.some((i) => itemKeyOf(i) === selected)) return;
    const prefer =
      visibleItems.find((i) => i.ourQty !== i.clientQty) ?? visibleItems[0] ?? null;
    if (prefer) onSelect(itemKeyOf(prefer));
  }, [selected, visibleItems, onSelect]);

  useEffect(() => {
    if (!selected) {
      if (selectedLineId) onSelectLine(null);
      return;
    }
    if (selectedLineId && itemLines.some((l) => l.id === selectedLineId)) return;
    onSelectLine(itemLines[0]?.id ?? null);
  }, [selected, itemLines, selectedLineId, onSelectLine]);

  function patch(id: string, next: Partial<QtoLine>) {
    onChangeLines(lines.map((l) => (l.id === id ? { ...l, ...next } : l)));
  }

  function patchDim(id: string, key: DimKey, n: number | null) {
    const line = lines.find((l) => l.id === id);
    if (!line) return;
    patch(id, { dims: { ...line.dims, [key]: n } });
  }

  function addMeasurement() {
    if (!item || locked) return;
    const id = uid("qto");
    onChangeLines([
      ...lines,
      {
        id,
        workCategory: item.workCategory,
        drawing: null,
        locationDesc: null,
        itemLabel: "",
        subItem: null,
        formulaKey: "qty",
        dims: { l: 0 },
        workingBoqCode: itemKeyOf(item),
        billId: item.billId,
      },
    ]);
    onSelectLine(id);
  }

  function duplicateSelected() {
    if (!item || locked || !selectedLineId) return;
    const src = lines.find((l) => l.id === selectedLineId);
    if (!src) return;
    const id = uid("qto");
    onChangeLines([...lines, { ...src, id }]);
    onSelectLine(id);
  }

  async function setAsQuantity() {
    if (!item || locked) return;
    const raw = window.prompt("Our quantity for this item", String(item.ourQty));
    if (raw == null) return;
    const n = parseSignedNumber(raw);
    if (n == null) return;
    const real = itemLines.filter((l) => !isQtySeed(l));
    if (real.length && !(await askConfirm("Replace measurements with a single quantity?"))) return;
    const seed = itemLines.find(isQtySeed);
    const next: QtoLine = {
      id: seed?.id ?? uid("qto"),
      workCategory: item.workCategory,
      drawing: null,
      locationDesc: null,
      itemLabel: item.description,
      subItem: null,
      formulaKey: "qty",
      dims: { l: n },
      workingBoqCode: itemKeyOf(item),
      billId: item.billId,
    };
    onChangeLines([...lines.filter((l) => l.workingBoqCode !== itemKeyOf(item) && l.workingBoqCode !== item.boqCode), next]);
    onSelectLine(next.id);
  }

  function removeLine(id: string) {
    onChangeLines(lines.filter((l) => l.id !== id));
    if (selectedLineId === id) {
      const rest = itemLines.filter((l) => l.id !== id);
      onSelectLine(rest[0]?.id ?? null);
    }
  }

  function dimActive(line: QtoLine, key: DimKey): boolean {
    if (line.formulaKey === "qty") return key === "l";
    return DIMS_FOR[line.formulaKey].includes(key);
  }

  const diff = item ? item.ourQty - item.clientQty : 0;
  const formulas = itemLines.map((l) => l.formulaKey);

  const header = (
    <thead>
      <tr>
        <th>Drawing</th>
        <th>Location</th>
        <th>Note</th>
        <th>Formula</th>
        {dimCols.map((k) => (
          <th key={k} className="num">
            {dimLabel(k, formulas)}
          </th>
        ))}
        <th className="num">This line</th>
        <th />
      </tr>
    </thead>
  );

  function renderRow(index: number) {
    const line = itemLines[index];
    if (!line) return null;
    const seed = isQtySeed(line);
    const qty = qtoQty(line.formulaKey, line.dims);
    return (
      <tr
        key={line.id}
        className={`${selectedLineId === line.id ? "selected" : ""} ${seed ? "qto-seed" : ""}`}
        onClick={() => onSelectLine(line.id)}
      >
        <td>
          <input
            className="cell"
            value={line.drawing ?? ""}
            disabled={locked}
            aria-label="Drawing"
            onFocus={() => onSelectLine(line.id)}
            onChange={(e) => patch(line.id, { drawing: e.target.value || null })}
          />
        </td>
        <td>
          <input
            className="cell"
            value={line.locationDesc ?? ""}
            disabled={locked}
            aria-label="Location"
            onFocus={() => onSelectLine(line.id)}
            onChange={(e) => patch(line.id, { locationDesc: e.target.value || null })}
          />
        </td>
        <td>
          <input
            className="cell"
            value={noteText(line)}
            disabled={locked}
            aria-label="Note"
            onFocus={() => onSelectLine(line.id)}
            onChange={(e) => patch(line.id, { itemLabel: e.target.value, subItem: null })}
          />
        </td>
        <td>
          <select
            value={line.formulaKey}
            disabled={locked}
            aria-label="Formula"
            onFocus={() => onSelectLine(line.id)}
            onChange={(e) => patch(line.id, { formulaKey: e.target.value as FormulaKey })}
          >
            {FORMULA_KEYS.map((f) => (
              <option key={f.key} value={f.key}>
                {FORMULA_SHORT[f.key]}
              </option>
            ))}
          </select>
        </td>
        {dimCols.map((k) => (
          <td key={k} className="num">
            {dimActive(line, k) ? (
              <QtyInput
                className="cell num"
                value={line.dims[k]}
                empty={null}
                disabled={locked}
                decimals={dimPlaces(k).decimals}
                round="up"
                aria-label={dimLabel(k, [line.formulaKey])}
                onClick={() => onSelectLine(line.id)}
                onValue={(n) => patchDim(line.id, k, n)}
              />
            ) : null}
          </td>
        ))}
        <td className="num">
          {formatDim(qty)} {item?.unit ?? ""}
        </td>
        <td>
          <button
            type="button"
            disabled={locked}
            onClick={(e) => {
              e.stopPropagation();
              removeLine(line.id);
            }}
          >
            Remove
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div className="module-workspace takeoff-layout">
      <Split id="takeoff-items" axis="x" defaultSize={280} min={180} max={520}>
      <aside className="takeoff-items" aria-label="Bill items">
        <div className="takeoff-items-tools">
          {billSwitcher}
          <input
            className="takeoff-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items"
            aria-label="Search items"
          />
          {filterColumns.map((c) => (
            <input
              key={c.id}
              className="takeoff-search"
              value={filters[c.id] ?? ""}
              onChange={(e) => setFilters((prev) => ({ ...prev, [c.id]: e.target.value }))}
              placeholder={c.label}
              aria-label={`Filter ${c.label}`}
            />
          ))}
          <select
            className="takeoff-cat"
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            aria-label="Work category"
          >
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {groups.length === 0 ? (
          <p className="hint takeoff-empty-list">No items match.</p>
        ) : (
          groups.map((g, gi) => (
            <div className="takeoff-item-group" key={g.section ? itemKeyOf(g.section) : `loose-${gi}`}>
              {g.section ? <div className="takeoff-section">{g.section.description}</div> : null}
              {g.items.map((row) => {
                const key = itemKeyOf(row);
                const n = counts.get(key) ?? counts.get(row.boqCode) ?? 0;
                const qtyDiff = row.ourQty !== row.clientQty;
                const only = lines.find((l) => l.workingBoqCode === key || l.workingBoqCode === row.boqCode);
                const seedOnly = n === 1 && only != null && isQtySeed(only);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`takeoff-item ${selected === key ? "active" : ""} ${qtyDiff ? "diff" : ""} ${n === 0 ? "bare" : ""}`}
                    onClick={() => onSelect(key)}
                  >
                    <span className="takeoff-item-code">{row.boqCode}</span>
                    <span className="takeoff-item-desc">{row.description}</span>
                    <span className="takeoff-item-meta">
                      Our {formatQty(row.ourQty)} · Client {formatQty(row.clientQty)}
                      {n === 0 ? " · none" : seedOnly ? " · qty" : ` · ${n}`}
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </aside>
      <div className="takeoff-main">
        {!item ? (
          <div className="takeoff-empty">
            <p className="hint">Choose a bill item. Measurements here become Our qty on Working BOQ.</p>
          </div>
        ) : (
          <>
            <div className="module-toolbar takeoff-header">
              <div className="rate-ident">
                <strong>
                  {item.boqCode} · {item.description}
                </strong>
                <span className="hint">
                  {item.unit ?? "No unit"} · Client {formatQty(item.clientQty)} · Our {formatQty(item.ourQty)} · Diff{" "}
                  {formatQty(diff)}
                </span>
              </div>
              <div className="rate-nav">
                <button className="primary" type="button" disabled={locked} onClick={addMeasurement}>
                  Add measurement
                </button>
                <button type="button" disabled={locked || !selectedLineId} onClick={duplicateSelected}>
                  Duplicate
                </button>
                <button type="button" disabled={locked} onClick={setAsQuantity}>
                  Set as quantity
                </button>
              </div>
              <PrintActions
                build={() =>
                  jobDocument(printHead.project.name, `r${printHead.project.revision}`, printHead.format, "Take-off", [
                    {
                      title: item ? `${item.boqCode} · ${item.description}` : "Take-off",
                      columns: [
                        { label: "Item", width: 16 },
                        { label: "Location", width: 34 },
                        { label: "Formula", width: 16 },
                        { label: "Qty", width: 16, align: "right" },
                        { label: "Unit", width: 18 },
                      ],
                      rows: lines
                        .filter((line) => !item || line.workingBoqCode === itemKeyOf(item) || line.workingBoqCode === item.boqCode)
                        .map((line) => ({
                          cells: [
                            line.workingBoqCode ?? "",
                            line.locationDesc || line.itemLabel || "",
                            FORMULA_SHORT[line.formulaKey] ?? line.formulaKey,
                            formatQty(qtoQty(line.formulaKey, line.dims)),
                            item?.unit ?? "",
                          ],
                        })),
                    },
                  ])
                }
              />
            </div>
            {itemLines.length === 0 ? (
              <div className="takeoff-empty">
                <p className="hint">No measurements. Add one, or set a quantity.</p>
              </div>
            ) : (
              <div className="module-body">
                <VirtualTable
                  fill
                  layoutKey="takeoff-lines"
                  rowHeight={36}
                  rowCount={itemLines.length}
                  header={header}
                  renderRow={renderRow}
                />
              </div>
            )}
          </>
        )}
      </div>
      </Split>
    </div>
  );
}
