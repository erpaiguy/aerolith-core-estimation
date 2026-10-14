import { formatMoney, formatQty, getDisplayFormat, roundTo } from "@aerolith/shared";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  extraValue,
  itemMatchesColumnFilters,
  itemMatchesQuery,
  newWorkingColumn,
} from "../boqColumns";
import {
  carryHint,
  carryOf,
  formatWorkingAmount,
  formatWorkingRate,
  workingCostValue,
} from "../boqCarry";
import { CarryModeControl } from "../CarryModeControl";
import { itemBadges, type BoqColumnDef, type ProjectBill, type WorkingItem } from "../model";
import { itemKeyOf, pivotWorkingByBoq, primaryWorkingTwin, type WorkingQtyRow } from "../bills";
import { billQtyHeader, formatCompareQty } from "../submissionCompare";
import { QtyInput } from "../ui/QtyInput";
import { ResetLayoutButton } from "../ui/ResetLayout";
import { PrintActions } from "../ui/PrintActions";
import { usePrintHeader } from "../print/context";
import { jobDocument } from "../print/types";
import { VirtualTable } from "../ui/VirtualTable";

function CostField({
  item,
  quoted,
  locked,
  currency,
  onPatch,
  stopRowClick,
}: {
  item: WorkingItem;
  quoted?: boolean;
  locked?: boolean;
  currency: string;
  onPatch: (code: string, patch: Partial<WorkingItem>) => void;
  stopRowClick?: boolean;
}) {
  const decimals = getDisplayFormat().rateDecimals;
  const value = workingCostValue(item, Boolean(quoted));
  return (
    <QtyInput
      value={value}
      decimals={decimals}
      moneyCurrency={currency}
      disabled={locked || quoted}
      readOnly={Boolean(quoted)}
      aria-label="Unit cost"
      onClick={
        stopRowClick
          ? (e: MouseEvent<HTMLInputElement>) => {
              e.stopPropagation();
            }
          : undefined
      }
      onValue={(n) => {
        const next = n ?? 0;
        if (quoted) return;
        if (roundTo(next, decimals) === roundTo(value, decimals)) return;
        onPatch(itemKeyOf(item), { priceMode: "direct", directCost: next });
      }}
    />
  );
}

export { SourceView, SubmitView } from "./DocumentRenderer";

export function Inspector({
  item,
  currency,
  rateOpen,
  locked,
  sourceLocked,
  itemQuoteLabel,
  linkedLabel,
  onOpenRate,
  onPatch,
  onRemove,
  extraColumns = [],
}: {
  item: WorkingItem;
  currency: string;
  rateOpen: boolean;
  locked?: boolean;
  sourceLocked?: boolean;
  itemQuoteLabel?: string | null;
  linkedLabel?: string | null;
  onOpenRate: () => void;
  onPatch: (code: string, patch: Partial<WorkingItem>) => void;
  onRemove: (code: string) => void;
  extraColumns?: Array<BoqColumnDef & { locked?: boolean }>;
}) {
  const quoted = Boolean(itemQuoteLabel);
  const badges = itemBadges(item, quoted);
  const freezeClient = Boolean(sourceLocked || locked);
  const origin = item.analysisOrigin ?? "own";
  const badgeLabel = (b: string) =>
    b === "unpriced"
      ? "Unpriced"
      : b === "qty-diff"
        ? "Qty diff"
        : b === "linked"
          ? "Linked"
          : b === "cloned"
            ? "Cloned"
              : b === "quoted"
                ? "Quoted"
                : b === "rate-only"
                  ? "Rate only"
                  : b === "amount-only"
                    ? "Amount only"
                    : "No analysis";
  return (
    <div>
      <p className="hint">{item.boqCode}</p>
      {badges.length ? (
        <div className="badge-row">
          {badges.map((b) => (
            <span key={b} className={`badge ${b}`}>
              {b === "unpriced" ? "Unpriced" : b === "qty-diff" ? "Qty diff" : badgeLabel(b)}
            </span>
          ))}
        </div>
      ) : null}
      <label className="field">
        Description
        <input
          value={item.description}
          disabled={locked}
          onChange={(e) => onPatch(itemKeyOf(item), { description: e.target.value })}
        />
      </label>
      {item.kind === "item" && (
        <>
          <label className="field">
            Client qty (source)
            <QtyInput
              value={item.clientQty}
              disabled={freezeClient}
              readOnly={freezeClient}
              aria-label="Client qty"
              onValue={(n) => onPatch(itemKeyOf(item), { clientQty: n ?? 0 })}
            />
          </label>
          <label className="field">
            Our qty (from take-off)
            <QtyInput value={item.ourQty} disabled readOnly aria-label="Our qty" onValue={() => undefined} />
          </label>
          <label className="field">
            Unit
            <input
              value={item.unit ?? ""}
              disabled={locked}
              onChange={(e) => onPatch(itemKeyOf(item), { unit: e.target.value })}
            />
          </label>
          {extraColumns.map((col) => (
            <label className="field" key={col.id}>
              {col.label}
              {col.locked ? " (client)" : ""}
              {col.valueType === "number" ? (
                <QtyInput
                  value={(() => {
                    const raw = extraValue(item, col.id).trim();
                    if (raw === "") return null;
                    const n = Number(raw.replace(/,/g, ""));
                    return Number.isFinite(n) ? n : null;
                  })()}
                  empty={null}
                  disabled={locked || col.locked}
                  readOnly={col.locked}
                  aria-label={col.label}
                  onValue={(n) =>
                    onPatch(itemKeyOf(item), { extra: { ...(item.extra ?? {}), [col.id]: n == null ? "" : String(n) } })
                  }
                />
              ) : (
                <input
                  value={extraValue(item, col.id)}
                  disabled={locked || col.locked}
                  readOnly={col.locked}
                  onChange={(e) =>
                    onPatch(itemKeyOf(item), { extra: { ...(item.extra ?? {}), [col.id]: e.target.value } })
                  }
                />
              )}
            </label>
          ))}
          {itemQuoteLabel ? (
            <p className="hint">
              BOQ priced from item quote ({itemQuoteLabel}). Rate analysis is kept as a backup
              for link and clone.
            </p>
          ) : null}
          <label className="field">
            Unit cost
            <CostField
              item={item}
              quoted={Boolean(itemQuoteLabel)}
              locked={locked}
              currency={currency}
              onPatch={onPatch}
            />
          </label>
          <p className="hint">
            {origin === "link"
              ? `Live link to ${linkedLabel || item.linkedBoqCode}.`
              : origin === "clone"
                ? "Cloned analysis (independent)."
                : (item.includes ?? []).length
                  ? `${item.lines.length} resource ${item.lines.length === 1 ? "line" : "lines"} · ${(item.includes ?? []).length} included ${
                      (item.includes ?? []).length === 1 ? "analysis" : "analyses"
                    }.`
                  : `${item.lines.length} rate-analysis ${item.lines.length === 1 ? "line" : "lines"}.`}
          </p>
          <p>
            Rate {formatWorkingRate(item, currency)} · Amount {formatWorkingAmount(item, currency)}
          </p>
          <label className="field">
            Carry to BOQ
            <CarryModeControl
              value={carryOf(item)}
              disabled={locked}
              onChange={(mode) => onPatch(itemKeyOf(item), { carryMode: mode })}
            />
          </label>
          <p className="hint">{carryHint(carryOf(item))}</p>
          <div className="actions">
            <button className="primary" type="button" onClick={onOpenRate} disabled={rateOpen || item.kind !== "item"}>
              {rateOpen ? "Editing rate analysis" : "Rate analysis"}
            </button>
            <button type="button" disabled={locked} onClick={() => onRemove(itemKeyOf(item))}>
              Delete item
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function EstimateView({
  items,
  selected,
  onSelect,
  onOpenRate,
  currency,
  onPatch,
  onAdd,
  onAddSection,
  onRemove,
  locked,
  sourceLocked,
  quotedCodes,
  clientColumns = [],
  workingColumns = [],
  onAddColumn,
  onRemoveColumn,
  showBillColumn = false,
  billLabel,
  addDisabled = false,
  tools,
  bills = [],
  clientLocked,
}: {
  items: WorkingItem[];
  selected: string | null;
  onSelect: (code: string) => void;
  onOpenRate: (code: string) => void;
  currency: string;
  onPatch: (code: string, patch: Partial<WorkingItem>) => void;
  onAdd: () => void;
  onAddSection: () => void;
  onRemove: (code: string) => void;
  locked?: boolean;
  sourceLocked?: boolean;
  quotedCodes?: Set<string>;
  clientColumns?: BoqColumnDef[];
  workingColumns?: BoqColumnDef[];
  onAddColumn?: (col: BoqColumnDef) => void;
  onRemoveColumn?: (id: string) => void;
  showBillColumn?: boolean;
  billLabel?: (billId: string) => string;
  addDisabled?: boolean;
  tools?: ReactNode;
  bills?: ProjectBill[];
  clientLocked?: (billId: string) => boolean;
}) {
  const freezeClient = Boolean(sourceLocked || locked);
  const clientExtras = clientColumns.filter((c) => c.role === "extra");
  const extras = [...clientExtras, ...workingColumns];
  const printHeader = usePrintHeader();
  const pivot = bills.length > 1;
  const extraCount = extras.length;
  const qtyCols = pivot ? bills.length + 1 : 2;
  const colCount = 1 + (showBillColumn && !pivot ? 1 : 0) + 1 + extraCount + qtyCols + 6;
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const pivotAll = useMemo(() => (pivot ? pivotWorkingByBoq(items, bills) : null), [pivot, items, bills]);
  const display = useMemo(() => {
    type Row =
      | { type: "bill"; key: string; label: string }
      | { type: "item"; key: string; item: WorkingItem }
      | { type: "pivot"; key: string; row: WorkingQtyRow };
    if (pivotAll) {
      const q = query.trim();
      const active = Object.values(filters).some((v) => v.trim());
      const matched = new Set(
        pivotAll
          .filter(
            (r) =>
              r.kind === "item" &&
              r.twins.some((t) => t && itemMatchesQuery(t, q) && itemMatchesColumnFilters(t, filters)),
          )
          .map((r) => r.key),
      );
      const out: Row[] = [];
      let pending: WorkingQtyRow | null = null;
      for (const row of pivotAll) {
        if (row.kind === "section") {
          pending = row;
          continue;
        }
        if (!q && !active ? true : matched.has(row.key)) {
          if (pending) {
            out.push({ type: "pivot", key: pending.key, row: pending });
            pending = null;
          }
          out.push({ type: "pivot", key: row.key, row });
        }
      }
      return out;
    }
    const q = query.trim();
    const active = Object.values(filters).some((v) => v.trim());
    let filtered = items;
    if (q || active) {
      const matched = new Set(
        items
          .filter((i) => i.kind === "item" && itemMatchesQuery(i, q) && itemMatchesColumnFilters(i, filters))
          .map((i) => itemKeyOf(i)),
      );
      const out: WorkingItem[] = [];
      let section: WorkingItem | null = null;
      let pending = false;
      for (const row of items) {
        if (row.kind === "section") {
          section = row;
          pending = true;
        } else if (matched.has(itemKeyOf(row))) {
          if (pending && section) {
            out.push(section);
            pending = false;
          }
          out.push(row);
        }
      }
      filtered = out;
    }
    const out: Row[] = [];
    let last = "";
    for (const row of filtered) {
      if (showBillColumn && row.billId !== last) {
        last = row.billId;
        out.push({ type: "bill", key: `bill-${last}`, label: billLabel?.(last) ?? last });
      }
      out.push({ type: "item", key: itemKeyOf(row), item: row });
    }
    return out;
  }, [pivotAll, items, query, filters, showBillColumn, billLabel]);
  const header = (
    <>
      <colgroup>
        <col className="col-code" />
        {showBillColumn && !pivot ? <col className="col-bill" /> : null}
        <col className="col-desc" />
        {extras.map((c) => (
          <col key={c.id} className="col-extra" />
        ))}
        {pivot
          ? bills.map((b) => <col key={b.id} className="col-qty" />)
          : <col key="client" className="col-qty" />}
        {pivot ? <col key="qty-total" className="col-qty" /> : <col key="our" className="col-qty" />}
        <col className="col-unit" />
        <col className="col-cost" />
        <col className="col-rate" />
        <col className="col-amt" />
        <col className="col-flags" />
        <col className="col-act" />
      </colgroup>
    <thead>
      <tr>
        <th>Code</th>
        {showBillColumn && !pivot ? <th>BOQ</th> : null}
        <th>Description</th>
        {extras.map((c) => (
          <th key={c.id} title={c.role === "extra" && clientExtras.some((x) => x.id === c.id) ? "Locked client BOQ column" : c.label}>
            {c.label}
            {workingColumns.some((w) => w.id === c.id) && !locked ? (
              <button
                type="button"
                className="col-remove"
                onClick={() => onRemoveColumn?.(c.id)}
                title="Remove column"
              >
                ×
              </button>
            ) : null}
          </th>
        ))}
        {pivot
          ? bills.map((b) => (
              <th key={b.id} className="num qty-bill" title={b.name}>
                Qty {billQtyHeader(b)}
              </th>
            ))
          : (
              <th key="client" className="num">
                Client
              </th>
            )}
        {pivot ? (
          <th key="qty-total" className="num qty-bill">
            Qty total
          </th>
        ) : (
          <th key="our" className="num">
            Our
          </th>
        )}
        <th>Unit</th>
        <th className="num">Cost</th>
        <th className="num">Rate</th>
        <th className="num">Amount</th>
        <th>Flags</th>
        <th />
      </tr>
    </thead>
    </>
  );

  function pivotRate(row: WorkingQtyRow): string {
    const twins = row.twins.filter((t): t is WorkingItem => Boolean(t));
    if (!twins.length) return "";
    if (twins.every((t) => carryOf(t) === "amountOnly")) return "Amount Only";
    return formatWorkingRate(twins[0]!, currency);
  }

  function pivotAmount(row: WorkingQtyRow): string {
    const twins = row.twins.filter((t): t is WorkingItem => Boolean(t));
    if (!twins.length) return "";
    if (twins.every((t) => carryOf(t) === "rateOnly")) return "Rate Only";
    const sum = twins.reduce((s, t) => s + (carryOf(t) === "rateOnly" ? 0 : (t.result?.amount ?? 0)), 0);
    return formatMoney(sum, currency);
  }

  function extraCells(row: WorkingItem) {
    return extras.map((c) => {
      const lockedCol = clientExtras.some((x) => x.id === c.id);
      return (
        <td key={c.id}>
          {c.valueType === "number" ? (
            <QtyInput
              value={(() => {
                const raw = extraValue(row, c.id).trim();
                if (raw === "") return null;
                const n = Number(raw.replace(/,/g, ""));
                return Number.isFinite(n) ? n : null;
              })()}
              empty={null}
              disabled={locked || lockedCol}
              readOnly={lockedCol}
              aria-label={c.label}
              onClick={(e) => e.stopPropagation()}
              onValue={(n) =>
                onPatch(itemKeyOf(row), {
                  extra: { ...(row.extra ?? {}), [c.id]: n == null ? "" : String(n) },
                })
              }
            />
          ) : (
            <input
              className="cell"
              value={extraValue(row, c.id)}
              disabled={locked || lockedCol}
              readOnly={lockedCol}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onPatch(itemKeyOf(row), { extra: { ...(row.extra ?? {}), [c.id]: e.target.value } })}
            />
          )}
        </td>
      );
    });
  }

  function renderRow(index: number) {
    const entry = display[index];
    if (!entry) return null;
    if (entry.type === "bill") {
      return (
        <tr key={entry.key} className="section">
          <td colSpan={colCount}>{entry.label}</td>
        </tr>
      );
    }
    if (entry.type === "pivot") {
      const row = entry.row;
      const primary = primaryWorkingTwin(row, selected);
      const mid = extraCount + qtyCols + 5;
      if (row.kind === "section") {
        return (
          <tr key={row.key} className="section">
            <td>{row.code}</td>
            <td colSpan={mid}>
              <input className="cell" value={row.description} disabled readOnly />
            </td>
            <td />
            <td />
          </tr>
        );
      }
      const twins = row.twins.filter((t): t is WorkingItem => Boolean(t));
      const quoted = twins.some((t) => quotedCodes?.has(itemKeyOf(t)) || quotedCodes?.has(t.boqCode));
      const badges = [...new Set(twins.flatMap((t) => itemBadges(t, quotedCodes?.has(itemKeyOf(t)) || quotedCodes?.has(t.boqCode))))];
      const selectedOn = Boolean(primary && selected === itemKeyOf(primary));
      const qtyDiff = twins.some((t) => t.ourQty !== t.clientQty);
      const partial = row.qtyByBill.some((q) => q == null);
      return (
        <tr
          key={row.key}
          className={`${selectedOn ? "selected" : ""} ${qtyDiff ? "diff" : ""} ${partial ? "qty-partial" : ""}`}
          onClick={() => primary && onSelect(itemKeyOf(primary))}
        >
          <td>{row.code}</td>
          <td>
            <input
              className="cell"
              value={primary?.description ?? row.description}
              disabled={locked || !primary}
              onChange={(e) => primary && onPatch(itemKeyOf(primary), { description: e.target.value })}
            />
          </td>
          {primary ? extraCells(primary) : extras.map((c) => <td key={c.id} />)}
          {bills.map((b, i) => {
            const twin = row.twins[i];
            const q = row.qtyByBill[i];
            const freeze = Boolean(locked || (twin && clientLocked?.(twin.billId)));
            return (
              <td
                key={b.id}
                className={`num ${q == null ? "qty-miss" : ""}`}
                title={twin ? `${b.name}${twin.ourQty !== twin.clientQty ? ` · Our ${formatQty(twin.ourQty)}` : ""}` : `${b.name} · not on this BOQ`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (twin) onSelect(itemKeyOf(twin));
                }}
              >
                {twin ? (
                  <QtyInput
                    value={twin.clientQty}
                    disabled={freeze}
                    readOnly={freeze}
                    aria-label={`Qty ${billQtyHeader(b)}`}
                    onClick={(e) => e.stopPropagation()}
                    onValue={(n) => onPatch(itemKeyOf(twin), { clientQty: n ?? 0 })}
                  />
                ) : (
                  formatCompareQty(null)
                )}
              </td>
            );
          })}
          <td className="num qty-total">{formatQty(row.totalQty)}</td>
          <td>
            <input
              className="cell"
              value={primary?.unit ?? row.unit}
              disabled={locked || !primary}
              onChange={(e) => primary && onPatch(itemKeyOf(primary), { unit: e.target.value })}
            />
          </td>
          <td className="num">
            {primary ? (
              <CostField
                item={primary}
                quoted={quoted}
                locked={locked || !primary}
                currency={currency}
                onPatch={onPatch}
                stopRowClick
              />
            ) : null}
          </td>
          <td className="num">{pivotRate(row)}</td>
          <td className="num">{pivotAmount(row)}</td>
          <td>
            <div className="badge-row">
              {badges.map((b) => (
                <span key={b} className={`badge ${b}`} title={b}>
                  {b === "unpriced"
                    ? "U"
                    : b === "qty-diff"
                      ? "Δ"
                      : b === "linked"
                        ? "L"
                        : b === "cloned"
                          ? "C"
                          : b === "quoted"
                            ? "Q"
                            : b === "rate-only"
                              ? "R"
                              : b === "amount-only"
                                ? "A"
                                : "M"}
                </span>
              ))}
            </div>
          </td>
          <td>
            <div className="row-actions">
              <button
                type="button"
                disabled={!primary}
                onClick={(e) => {
                  e.stopPropagation();
                  if (primary) onOpenRate(itemKeyOf(primary));
                }}
              >
                Rate
              </button>
              <button type="button" disabled={locked || !primary} onClick={() => primary && onRemove(itemKeyOf(primary))}>
                Delete
              </button>
            </div>
          </td>
        </tr>
      );
    }
    const row = entry.item;
    if (row.kind === "section") {
      return (
        <tr key={row.id} className="section">
          <td>{row.boqCode}</td>
          {showBillColumn ? <td>{billLabel?.(row.billId) ?? row.billId}</td> : null}
          <td colSpan={7 + extraCount + (showBillColumn ? 1 : 0)}>
            <input
              className="cell"
              value={row.description}
              disabled={locked}
              onChange={(e) => onPatch(itemKeyOf(row), { description: e.target.value })}
            />
          </td>
          <td />
          <td>
            <button type="button" disabled={locked} onClick={() => onRemove(itemKeyOf(row))}>
              Delete
            </button>
          </td>
        </tr>
      );
    }
    const key = itemKeyOf(row);
    const quoted = Boolean(quotedCodes?.has(key) || quotedCodes?.has(row.boqCode));
    const badges = itemBadges(row, quoted);
    return (
      <tr
        key={row.id}
        className={`${selected === key ? "selected" : ""} ${row.ourQty !== row.clientQty ? "diff" : ""}`}
        onClick={() => onSelect(key)}
      >
        <td>{row.boqCode}</td>
        {showBillColumn ? <td>{billLabel?.(row.billId) ?? row.billId}</td> : null}
        <td>
          <input
            className="cell"
            value={row.description}
            disabled={locked}
              onChange={(e) => onPatch(itemKeyOf(row), { description: e.target.value })}
          />
        </td>
        {extraCells(row)}
        <td className="num">
          <QtyInput
            value={row.clientQty}
            disabled={freezeClient}
            readOnly={freezeClient}
            aria-label="Client qty"
            onClick={(e) => e.stopPropagation()}
            onValue={(n) => onPatch(itemKeyOf(row), { clientQty: n ?? 0 })}
          />
        </td>
        <td className="num">{formatQty(row.ourQty)}</td>
        <td>
          <input
            className="cell"
            value={row.unit ?? ""}
            disabled={locked}
            onChange={(e) => onPatch(itemKeyOf(row), { unit: e.target.value })}
          />
        </td>
        <td className="num">
          <CostField
            item={row}
            quoted={quoted}
            locked={locked}
            currency={currency}
            onPatch={onPatch}
            stopRowClick
          />
        </td>
        <td className="num">{formatWorkingRate(row, currency)}</td>
        <td className="num">{formatWorkingAmount(row, currency)}</td>
        <td>
          <div className="badge-row">
            {badges.map((b) => (
              <span key={b} className={`badge ${b}`} title={b}>
                {b === "unpriced"
                  ? "U"
                  : b === "qty-diff"
                    ? "Δ"
                    : b === "linked"
                      ? "L"
                      : b === "cloned"
                        ? "C"
                    : b === "quoted"
                      ? "Q"
                      : b === "rate-only"
                        ? "R"
                        : b === "amount-only"
                          ? "A"
                          : "M"}
              </span>
            ))}
          </div>
        </td>
        <td>
          <div className="row-actions">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenRate(itemKeyOf(row));
              }}
            >
              Rate
            </button>
            <button type="button" disabled={locked} onClick={() => onRemove(itemKeyOf(row))}>
              Delete
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="module-workspace working-boq">
      <div className="module-toolbar">
        <div className="tb-group">
          <button className="primary" type="button" disabled={locked || addDisabled} onClick={onAdd}>
            Add item
          </button>
          <button type="button" disabled={locked || addDisabled} onClick={onAddSection}>
            Add section
          </button>
        </div>
        <div className="tb-group tb-bills">{tools}</div>
        <div className="tb-group">
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              const label = window.prompt("Column name");
              if (!label?.trim()) return;
              onAddColumn?.(newWorkingColumn(label, workingColumns));
            }}
          >
            Add column
          </button>
          <ResetLayoutButton ids={[pivot ? `working-qty-${bills.length}` : "working-qty", "boq-rail-estimate"]} />
        </div>
        <div className="tb-group tb-find">
          <input
            className="filter"
            placeholder="Filter items"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {extras.map((c) => (
            <input
              key={c.id}
              className="filter"
              placeholder={c.label}
              value={filters[c.id] ?? ""}
              onChange={(e) => setFilters((prev) => ({ ...prev, [c.id]: e.target.value }))}
            />
          ))}
        </div>
        {freezeClient ? <span className="source-badge">Client BOQ locked</span> : null}
        <PrintActions
          build={() =>
            jobDocument(printHeader.project.name, `r${printHeader.project.revision}`, printHeader.format, "Working BOQ", [
              {
                title: "Working BOQ",
                columns: [
                  { label: "No.", width: 10 },
                  { label: "Description", width: 36 },
                  { label: "Client qty", width: 12, align: "right" },
                  { label: "Our qty", width: 12, align: "right" },
                  { label: "Unit", width: 8 },
                  { label: `Rate (${currency})`, width: 11, align: "right" },
                  { label: `Amount (${currency})`, width: 11, align: "right" },
                ],
                rows: display.map((row) => {
                  if (row.type === "bill") return { kind: "section" as const, cells: [row.label, "", "", "", "", "", ""] };
                  if (row.type === "pivot") {
                    const sample = row.row.twins.find((twin) => twin) ?? null;
                    return {
                      kind: row.row.kind === "section" ? ("section" as const) : ("item" as const),
                      cells: [
                        row.row.code,
                        row.row.description,
                        formatQty(row.row.totalQty),
                        formatQty(sample?.ourQty ?? row.row.totalQty),
                        row.row.unit,
                        formatMoney(sample?.result?.rate ?? 0, currency),
                        formatMoney(sample?.result?.amount ?? 0, currency),
                      ],
                    };
                  }
                  return {
                    kind: row.item.kind === "section" ? ("section" as const) : ("item" as const),
                    cells: [
                      row.item.slNo || row.item.boqCode,
                      row.item.description,
                      formatQty(row.item.clientQty),
                      formatQty(row.item.ourQty),
                      row.item.unit ?? "",
                      formatMoney(row.item.result?.rate ?? 0, currency),
                      formatMoney(row.item.result?.amount ?? 0, currency),
                    ],
                  };
                }),
              },
            ])
          }
        />
      </div>
      <div className="module-body">
        <VirtualTable fill layoutKey={pivot ? `working-qty-${bills.length}` : "working-qty"} rowHeight={28} rowCount={display.length} header={header} renderRow={renderRow} />
      </div>
    </div>
  );
}
