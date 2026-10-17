import { formatMoney, formatQty, formatRate } from "@aerolith/shared";
import { formatWorkingAmount } from "../boqCarry";
import { resolveAnalysisUnitCost } from "@aerolith/calc";
import { useEffect, useMemo, useState } from "react";
import { filterableColumns, itemMatchesColumnFilters, itemMatchesQuery } from "../boqColumns";
import { itemBadges, type LoadedProject } from "../model";
import { displayItemRef, itemKeyOf, quoteMatchesItem, sortedBills } from "../bills";
import {
  addAnalysisInclude,
  canLinkAnalysis,
  cloneWholeAnalysis,
  linkWholeAnalysis,
  newBlankAnalysis,
  removeAnalysisInclude,
  toCalcItems,
} from "../projectCompute";
import { RateAnalysisEditor } from "../RateAnalysisEditor";
import { MenuSelect } from "../ui/MenuSelect";
import { Split } from "../ui/Split";
import { PrintActions } from "../ui/PrintActions";
import { usePrintHeader } from "../print/context";
import { jobDocument } from "../print/types";

export function RateAnalysisView({
  project,
  rateCode,
  marginPct,
  locked,
  onSelect,
  onPatch,
  onProject,
  onBack,
  billId = null,
}: {
  project: LoadedProject;
  rateCode: string | null;
  marginPct: number;
  locked?: boolean;
  onSelect: (code: string) => void;
  onPatch: (code: string, patch: Partial<LoadedProject["items"][number]>) => void;
  onProject: (next: LoadedProject) => void;
  onBack: () => void;
  billId?: string | null;
}) {
  const extras = filterableColumns(project);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const items = useMemo(() => {
    const allPriced = project.items.filter((i) => i.kind === "item");
    const priced = billId ? allPriced.filter((i) => i.billId === billId) : allPriced;
    const listed = priced.filter((i) => itemMatchesQuery(i, query) && itemMatchesColumnFilters(i, filters));
    if (!rateCode || listed.some((i) => itemKeyOf(i) === rateCode)) return listed;
    const current = allPriced.find((i) => itemKeyOf(i) === rateCode);
    return current ? [...listed, current] : listed;
  }, [project.items, query, filters, rateCode, billId]);
  const index = Math.max(0, items.findIndex((i) => itemKeyOf(i) === rateCode));
  const item = items[index] ?? null;
  const header = usePrintHeader();
  const prev = index > 0 ? items[index - 1] : null;
  const next = index < items.length - 1 ? items[index + 1] : null;
  const quoted = item
    ? project.itemQuotes.some((q) => quoteMatchesItem(q, item) && q.selected)
    : false;
  const quotedVendor = item
    ? (project.itemQuotes.find((q) => quoteMatchesItem(q, item) && q.selected)?.vendorName ?? null)
    : null;
  const cyclic = item ? resolveAnalysisUnitCost(toCalcItems(project), itemKeyOf(item)).cyclic : false;
  const linkItems = project.items.filter((i) => i.kind === "item" && itemKeyOf(i) !== (item ? itemKeyOf(item) : ""));
  const linkBillNames = new Map(sortedBills(project).map((b) => [b.id, b.name]));
  const linkOptions = [
    { value: "", label: "From…" },
    ...linkItems.map((i) => ({
      value: itemKeyOf(i),
      label: displayItemRef(project, itemKeyOf(i)),
      group: linkBillNames.get(i.billId),
    })),
  ];

  const groups = useMemo(() => {
    const sections = project.items.filter((i) => i.kind === "section" && (!billId || i.billId === billId));
    const out: Array<{ section: (typeof project.items)[number] | null; items: typeof items }> = [];
    const seen = new Set<string>();
    for (const s of sections) {
      const kids = items.filter((i) => i.parentCode === s.boqCode && i.billId === s.billId);
      if (!kids.length) continue;
      kids.forEach((i) => seen.add(itemKeyOf(i)));
      out.push({ section: s, items: kids });
    }
    const loose = items.filter((i) => !seen.has(itemKeyOf(i)));
    if (loose.length) out.push({ section: null, items: loose });
    return out;
  }, [project.items, items, billId]);

  useEffect(() => {
    const pool = project.items.filter((i) => i.kind === "item" && (!billId || i.billId === billId));
    if (rateCode && pool.some((i) => itemKeyOf(i) === rateCode)) return;
    const first = pool[0];
    if (first) onSelect(itemKeyOf(first));
    // Only follow BOQ focus; onSelect identity is not part of the contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- billId is the trigger
  }, [billId]);

  const itemList = (
    <aside className="takeoff-items rate-items" aria-label="Priced items">
      <div className="takeoff-items-tools">
        <input
          className="takeoff-search"
          placeholder="Search items"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter items"
        />
        {extras.map((c) => (
          <input
            key={c.id}
            className="takeoff-search"
            placeholder={c.label}
            value={filters[c.id] ?? ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, [c.id]: e.target.value }))}
          />
        ))}
      </div>
      {groups.map((g, gi) => (
        <div className="takeoff-item-group" key={g.section ? itemKeyOf(g.section) : `loose-${gi}`}>
          {g.section ? <div className="takeoff-section">{g.section.description}</div> : null}
          {g.items.map((row) => {
            const key = itemKeyOf(row);
            const q = project.itemQuotes.some((x) => quoteMatchesItem(x, row) && x.selected);
            const missing = itemBadges(row, q).includes("missing-analysis");
            return (
              <button
                key={key}
                type="button"
                className={`takeoff-item ${rateCode === key ? "active" : ""} ${missing ? "bare" : ""}`}
                onClick={() => onSelect(key)}
              >
                <span className="takeoff-item-code">{row.boqCode}</span>
                <span className="takeoff-item-desc">{row.description}</span>
                <span className="takeoff-item-foot">
                  <span className="takeoff-item-unit">{row.unit || "No unit"}</span>
                  <span className="takeoff-item-amt">
                    {missing ? "No analysis" : formatWorkingAmount(row, project.currency)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );

  if (!item) {
    return (
      <div className="module-workspace rate-analysis rate-layout">
        <Split id="rate-items" axis="x" defaultSize={280} min={180} max={520}>
        {itemList}
        <div className="takeoff-main">
          <div className="module-toolbar">
            <button type="button" className="allow-when-locked" onClick={onBack}>
              Back to Working BOQ
            </button>
            <span className="hint">Choose an item, then build its rate.</span>
            <PrintActions
              build={() =>
                jobDocument(header.project.name, `r${header.project.revision}`, header.format, "Rate Analysis", [
                  {
                    title: "Items",
                    columns: [
                      { label: "Code", width: 16 },
                      { label: "Description", width: 54 },
                      { label: `Rate (${project.currency})`, width: 30, align: "right" },
                    ],
                    rows: items.map((row) => ({
                      cells: [row.boqCode, row.description, formatRate(row.result?.rate ?? 0, project.currency)],
                    })),
                  },
                ])
              }
            />
          </div>
        </div>
        </Split>
      </div>
    );
  }

  return (
    <div className="module-workspace rate-analysis rate-layout">
      <Split id="rate-items" axis="x" defaultSize={280} min={180} max={520}>
      {itemList}
      <div className="takeoff-main">
        <div className="module-toolbar takeoff-header">
          <div className="rate-ident">
            <strong>
              {item.boqCode} · {item.description}
            </strong>
            <span className="hint">
              {item.unit ?? "No unit"} · Item {index + 1} of {items.length}
              {quoted ? ` · quoted${quotedVendor ? ` (${quotedVendor})` : ""}` : ""}
            </span>
          </div>
          <div className="rate-head-actions">
          <div className="rate-nav">
            <button type="button" className="allow-when-locked" onClick={onBack}>
              Working BOQ
            </button>
            <button type="button" className="allow-when-locked" disabled={!prev} onClick={() => prev && onSelect(itemKeyOf(prev))}>
              Previous
            </button>
            <button type="button" className="allow-when-locked" disabled={!next} onClick={() => next && onSelect(itemKeyOf(next))}>
              Next
            </button>
          </div>
          <PrintActions
            build={() =>
              jobDocument(header.project.name, `r${header.project.revision}`, header.format, "Rate Analysis", [
                {
                  title: `${item.boqCode} · ${item.description}`,
                  columns: [
                    { label: "Resource", width: 46 },
                    { label: "Unit", width: 14 },
                    { label: `Rate (${project.currency})`, width: 20, align: "right" },
                    { label: "Wastage %", width: 20, align: "right" },
                  ],
                  rows: item.lines.map((line) => ({
                    cells: [
                      line.description || line.projectResourceCode || "Resource",
                      line.unit ?? "",
                      formatMoney(line.resourceRate, project.currency),
                      formatQty(line.wastagePct),
                    ],
                  })),
                },
              ])
            }
          />
          </div>
        </div>
        <div className="rate-actions">
          <button type="button" disabled={locked} onClick={() => onProject(newBlankAnalysis(project, itemKeyOf(item)))}>
            New analysis
          </button>
          <MenuSelect
            className="rate-mini"
            label="Link whole"
            disabled={locked}
            value=""
            options={linkOptions}
            onChange={(from) => {
              if (!from) return;
              if (!canLinkAnalysis(project, itemKeyOf(item), from)) return;
              onProject(linkWholeAnalysis(project, itemKeyOf(item), from));
            }}
          />
          <MenuSelect
            className="rate-mini"
            label="Clone whole"
            disabled={locked}
            value=""
            options={linkOptions}
            onChange={(from) => {
              if (from) onProject(cloneWholeAnalysis(project, itemKeyOf(item), from));
            }}
          />
          {item.analysisOrigin === "link" ? (
            <button
              type="button"
              disabled={locked}
              onClick={() =>
                onPatch(itemKeyOf(item), { analysisOrigin: "own", linkedBoqCode: null, priceMode: "analysis" })
              }
            >
              Unlink
            </button>
          ) : null}
        </div>
        {quoted ? (
          <div className="banner quote">
            BOQ from quote{quotedVendor ? ` (${quotedVendor})` : ""} — this sheet is backup.
          </div>
        ) : null}
        <div className="module-body">
          <RateAnalysisEditor
            item={item}
            project={project}
            resources={project.resources}
            currency={project.currency}
            marginPct={marginPct}
            quoted={quoted}
            quotedVendor={quotedVendor}
            cyclic={cyclic}
            onPatch={onPatch}
            locked={locked}
            onOpenItem={onSelect}
            onNewAnalysis={() => onProject(newBlankAnalysis(project, itemKeyOf(item)))}
            onLinkFrom={(source) => {
              if (!canLinkAnalysis(project, itemKeyOf(item), source)) return;
              onProject(linkWholeAnalysis(project, itemKeyOf(item), source));
            }}
            onCloneFrom={(source) => onProject(cloneWholeAnalysis(project, itemKeyOf(item), source))}
            onAddInclude={(source, relation, factor) =>
              onProject(addAnalysisInclude(project, itemKeyOf(item), source, relation, factor))
            }
            onRemoveInclude={(id) => onProject(removeAnalysisInclude(project, itemKeyOf(item), id))}
            onUnlink={() =>
              onPatch(itemKeyOf(item), { analysisOrigin: "own", linkedBoqCode: null, priceMode: "analysis" })
            }
          />
        </div>
      </div>
      </Split>
    </div>
  );
}
