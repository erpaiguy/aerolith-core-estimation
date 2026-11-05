import { useMemo, useState } from "react";
import { qtoQty } from "@aerolith/calc";
import { DEFAULT_MARGIN, totalMarginPct } from "@aerolith/shared";
import { findItemByKey, itemKeyOf, sortedBills } from "../bills";
import { newId, type LoadedProject, type QtoLine, type WorkingItem } from "../model";
import { blankQueryItem, closeQuery, logQueryReply, trackLabel, trackQuery, upsertQueryItem } from "../tenderQueries";
import { categoryOf, jobFigures, lineCost, num, quotedItem, rateSource } from "./figures";
import { Chip, PageHead } from "./chrome";
import type { Pane } from "./routes";

export type MeasureApi = {
  project: LoadedProject;
  billId: string | null;
  locked: boolean;
  selected: string | null;
  onSelect: (key: string) => void;
  onPatch: (code: string, patch: Partial<WorkingItem>) => void;
  onCommit: (next: LoadedProject) => void;
  onPane: (pane: Pane) => void;
  onQto: (lines: QtoLine[]) => void;
  onAddItem: () => void;
  onAddSection: () => void;
  onRemove: (code: string) => void;
  onAmend: () => void;
  onSeal: () => void;
  onRevision: () => void;
  onEditLine: (index: number) => void;
};

function BillPicker({ project, billId, onCommit }: { project: LoadedProject; billId: string | null; onCommit: (id: string) => void }) {
  const bills = sortedBills(project);
  if (bills.length < 2) return null;
  return (
    <label className="l" style={{ maxWidth: 220 }}>
      Bill
      <select className="i" value={billId ?? bills[0]?.id} onChange={(e) => onCommit(e.target.value)}>
        {bills.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}

export function DashboardScreen({ api, onBill }: { api: MeasureApi; onBill: (id: string) => void }) {
  const fig = jobFigures(api.project, api.billId);
  const max = Math.max(...fig.sections.map((s) => s.amount), 1);
  const factors = [
    ["Overhead", api.project.margin.overheadPct],
    ["Profit", api.project.margin.profitPct],
    ["Logistics", api.project.margin.logisticsPct],
    ["Contingency", api.project.margin.contingencyPct],
  ] as const;
  const maxF = Math.max(...factors.map((f) => f[1]), 0.0001);
  const blockers = fig.unpriced.length + fig.missing.length + (fig.openQueries.length ? 1 : 0);
  return (
    <div className="main">
      <PageHead crumb="Overview › Dashboard" title="Job dashboard">
        <BillPicker project={api.project} billId={api.billId} onCommit={onBill} />
        <button className="b" type="button" onClick={() => api.onPane("reports")}>Print summary</button>
        <button className="b p" type="button" onClick={() => api.onPane("estimate")}>Open Working BOQ</button>
      </PageHead>
      <div className="grid4">
        <div className="card" style={{ padding: "8px 14px" }}><div className="k">Direct cost</div><div className="m" style={{ fontSize: 22, fontWeight: 700 }}>{num(fig.cost)}</div><div style={{ color: "#2c4558" }}>{fig.items.length} client lines, {fig.items.length - fig.unpriced.length} priced</div></div>
        <div className="card" style={{ padding: "8px 14px" }}><div className="k">Margin stack</div><div className="m" style={{ fontSize: 22, fontWeight: 700 }}>{num(fig.margin)}</div><div style={{ color: "#2c4558" }}>{num(fig.marginPct * 100, 1)}% on cost</div></div>
        <div className="card" style={{ padding: "8px 14px", borderColor: "#0e6b56", background: "#e5f5ef" }}><div className="k">Working total</div><div className="m" style={{ fontSize: 22, fontWeight: 700 }}>{num(fig.total)}</div><div style={{ color: "#0a4f40", fontWeight: 700 }}>{fig.green ? "GREEN" : "Check total"}</div></div>
        <div className="card" style={{ padding: "8px 14px" }}><div className="k">Submission</div><div style={{ fontSize: 22, fontWeight: 700 }}>{fig.sealed ? "Sealed" : "Not sealed"}</div><div style={{ color: "#2c4558" }}>{blockers} blockers to clear</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <section className="card" style={{ padding: "10px 16px" }}>
            <div className="k" style={{ marginBottom: 4 }}>Working total by section (QAR)</div>
            {fig.sections.map((s) => (
              <div className="row" key={s.code + s.name}>
                <span style={{ width: 170 }}>{s.code} {s.name}</span>
                <div style={{ flex: 1 }}><div className="bar" style={{ width: `${Math.max(4, (s.amount / max) * 100)}%` }} /></div>
                <span className="m" style={{ width: 120, textAlign: "right" }}>{num(s.amount)}</span>
              </div>
            ))}
          </section>
          <section className="card" style={{ padding: "10px 16px" }}>
            <div className="k" style={{ marginBottom: 4 }}>Margin stack on cost</div>
            {factors.map(([name, fraction]) => (
              <div className="row" key={name}>
                <span style={{ width: 170 }}>{name} {num(fraction * 100, 1)}%</span>
                <div style={{ flex: 1 }}><div className="bar" style={{ width: `${(fraction / maxF) * 100}%`, background: "#1d4e73" }} /></div>
                <span className="m" style={{ width: 120, textAlign: "right" }}>{num(fig.cost * fraction)}</span>
              </div>
            ))}
          </section>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <section className="card" style={{ padding: "10px 16px" }}>
            <div className="k">Needs attention</div>
            <button className="ex" type="button" onClick={() => api.onPane("estimate")}><span>Unpriced items</span><Chip kind="w">{fig.unpriced.length}</Chip></button>
            <button className="ex" type="button" onClick={() => api.onPane("register")}><span>Missing rate analysis</span><Chip kind="w">{fig.missing.length}</Chip></button>
            <button className="ex" type="button" onClick={() => api.onPane("buy")}><span>Resources</span><Chip kind="g">{api.project.resources.length}</Chip></button>
            <button className="ex" type="button" onClick={() => api.onPane("queries")}><span>Open client queries</span><Chip kind="w">{fig.openQueries.length}</Chip></button>
            <button className="ex" type="button" onClick={() => api.onPane("takeoff")}><span>Quantity differences</span><Chip kind="w">{fig.qtyDiff.length}</Chip></button>
          </section>
          <section className="card" style={{ padding: "10px 16px" }} aria-label="Resource prices">
            <div className="k">Resource cost by category (QAR)</div>
            {fig.tree.map((node) => (
              <details key={node.key} className="rc" open={node.amount > 0}>
                <summary><strong>{node.label}</strong><span className="m" style={{ textAlign: "right" }}>{num(node.amount)}</span><span className="m" style={{ textAlign: "right" }}>{fig.cost ? num((node.amount / fig.cost) * 100, 1) + "%" : "—"}</span><span /></summary>
                {node.children.slice(0, 6).map((child) => (
                  <div className="sub" key={child.key}><span>{child.label}</span><span className="m" style={{ textAlign: "right" }}>{num(child.amount)}</span><span /><span /></div>
                ))}
              </details>
            ))}
            <button className="b s" type="button" onClick={() => api.onPane("buy")}>Open Resource Prices</button>
          </section>
        </div>
      </div>
    </div>
  );
}

export function SourceScreen({ api, onBill }: { api: MeasureApi; onBill: (id: string) => void }) {
  const [q, setQ] = useState("");
  const nodes = api.project.clientNodes.filter((n) => !api.billId || n.billId === api.billId || !n.billId);
  const rows = nodes.filter((n) => !q || `${n.sl_no ?? ""} ${n.description ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const warnings = rows.filter((n) => n.kind !== "section" && n.kind !== "title" && !n.unit).length;
  return (
    <div className="main">
      <PageHead crumb="Measure › Client BOQ" title="Client BOQ">
        <BillPicker project={api.project} billId={api.billId} onCommit={onBill} />
        <button className="b s" type="button" disabled={api.locked} onClick={api.onAmend}>Import re-issued BOQ</button>
        <button className="b s" type="button" disabled={api.locked} onClick={api.onAmend}>Amend with reason</button>
      </PageHead>
      <div className="grid4">
        <div className="card" style={{ padding: "8px 12px" }}><div className="k">Lines read</div><strong className="m">{rows.length}</strong></div>
        <div className="card" style={{ padding: "8px 12px" }}><div className="k">Sections</div><strong className="m">{api.project.items.filter((i) => i.kind === "section").length}</strong></div>
        <div className="card" style={{ padding: "8px 12px" }}><div className="k">Warnings</div><strong className="m">{warnings}</strong></div>
        <div className="card" style={{ padding: "8px 12px" }}><div className="k">Locked</div><strong>{api.project.sourceLockedAt ? "As issued" : "Open"}</strong></div>
      </div>
      <label className="l" htmlFor="boq-filter">Filter lines<input id="boq-filter" className="i" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter lines" /></label>
      <section className="card scroll">
        <table>
          <thead><tr><th>No.</th><th>Description</th><th>Unit</th><th className="r">Client qty</th></tr></thead>
          <tbody>
            {rows.slice(0, 80).map((n) => (
              <tr key={`${n.billId}-${n.row}`} className={n.kind === "section" || n.kind === "title" ? "sec" : ""}>
                <td className="m">{n.sl_no}</td>
                <td>{n.description}</td>
                <td>{n.unit || (n.kind === "section" ? "" : <Chip kind="w">Unit unclear</Chip>)}</td>
                <td className="m r">{n.qty == null ? "" : num(n.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p style={{ color: "#2c4558" }}>Client quantities never change after the bill is locked. Amendments need a reason and are logged.</p>
    </div>
  );
}

export function TakeoffScreen({ api }: { api: MeasureApi }) {
  const items = api.project.items.filter((i) => i.kind === "item" && (!api.billId || i.billId === api.billId));
  const current = (api.selected && findItemByKey(items, api.selected)) || items[0] || null;
  const key = current ? itemKeyOf(current) : "";
  const lines = api.project.qtoLines.filter((l) => l.workingBoqCode === key || l.workingBoqCode === current?.boqCode);
  function write(next: QtoLine[]) {
    if (!current) return;
    const qty = next.reduce((s, l) => s + qtoQty(l.formulaKey, l.dims), 0);
    api.onCommit({
      ...api.project,
      qtoLines: [...api.project.qtoLines.filter((l) => l.workingBoqCode !== key && l.workingBoqCode !== current.boqCode), ...next],
      items: api.project.items.map((i) => (itemKeyOf(i) === key ? { ...i, ourQty: qty } : i)),
    });
  }
  function add(formula: QtoLine["formulaKey"]) {
    if (!current || api.locked) return;
    write([
      ...lines,
      {
        id: newId("qto"),
        billId: current.billId,
        workCategory: current.workCategory,
        drawing: "",
        locationDesc: "",
        itemLabel: current.description,
        subItem: null,
        formulaKey: formula,
        dims: { nos1: 1, l: 0, b: 0, h: 0 },
        workingBoqCode: key,
      },
    ]);
  }
  return (
    <div className="main">
      <div className="split">
        <section className="card" style={{ width: 280, overflow: "auto" }}>
          {items.map((item) => (
            <button key={itemKeyOf(item)} className="ex" type="button" onClick={() => api.onSelect(itemKeyOf(item))}>
              <span><strong className="m">{item.boqCode}</strong> {item.description}</span>
              <Chip kind={item.ourQty === item.clientQty ? "g" : "w"}>{item.ourQty === item.clientQty ? "Done" : "Open"}</Chip>
            </button>
          ))}
        </section>
        <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <PageHead crumb="Measure › Take-off" title={current ? `${current.boqCode} ${current.description}` : "Take-off"}>
            <button className="b s" type="button" disabled={!current || api.locked} onClick={() => add("area")}>Area</button>
            <button className="b s" type="button" disabled={!current || api.locked} onClick={() => add("product")}>Length</button>
            <button className="b s" type="button" disabled={!current || api.locked} onClick={() => add("qty")}>Count</button>
            <button className="b s" type="button" disabled={api.locked} onClick={() => api.onQto(api.project.qtoLines)}>Repost all lines</button>
          </PageHead>
          <section className="card scroll">
            <table>
              <thead><tr><th>Location</th><th>Drawing</th><th className="r">L</th><th className="r">B</th><th className="r">Qty</th><th /></tr></thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td><input className="i" aria-label="Location" value={line.locationDesc ?? ""} disabled={api.locked} onChange={(e) => write(lines.map((l) => l.id === line.id ? { ...l, locationDesc: e.target.value } : l))} /></td>
                    <td><input className="i" aria-label="Drawing" value={line.drawing ?? ""} disabled={api.locked} onChange={(e) => write(lines.map((l) => l.id === line.id ? { ...l, drawing: e.target.value } : l))} /></td>
                    <td><input className="i m r" aria-label="Length" value={line.dims.l ?? ""} disabled={api.locked} onChange={(e) => write(lines.map((l) => l.id === line.id ? { ...l, dims: { ...l.dims, l: Number(e.target.value) } } : l))} /></td>
                    <td><input className="i m r" aria-label="Breadth" value={line.dims.b ?? ""} disabled={api.locked} onChange={(e) => write(lines.map((l) => l.id === line.id ? { ...l, dims: { ...l.dims, b: Number(e.target.value) } } : l))} /></td>
                    <td className="m r">{num(qtoQty(line.formulaKey, line.dims))}</td>
                    <td><button className="b s d" type="button" disabled={api.locked} onClick={() => write(lines.filter((l) => l.id !== line.id))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
        <aside className="ins">
          <h2>Inspector{current ? ` · ${current.boqCode}` : ""}</h2>
          <div className="row"><span>Client qty</span><span className="m">{current ? num(current.clientQty) : "—"}</span></div>
          <div className="row"><span>Our qty</span><span className="m">{current ? num(current.ourQty) : "—"}</span></div>
          <div className="row"><span>Measured lines</span><span className="m">{lines.length}</span></div>
          <p style={{ color: "#2c4558" }}>Each line records drawing, location, and the quantity formula. Posting writes our quantity for this item only.</p>
        </aside>
      </div>
    </div>
  );
}

export function WorkingScreen({ api }: { api: MeasureApi }) {
  const [filter, setFilter] = useState<"all" | "unpriced" | "diff" | "missing">("all");
  const [q, setQ] = useState("");
  const fig = jobFigures(api.project, api.billId);
  const rows = fig.items.filter((item) => {
    if (q && !`${item.boqCode} ${item.description}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "unpriced") return !item.result || item.result.rate === 0;
    if (filter === "diff") return item.ourQty !== item.clientQty;
    if (filter === "missing") return fig.missing.includes(item);
    return true;
  });
  const sel = api.selected ? findItemByKey(api.project.items, api.selected) : rows[0];
  return (
    <div className="main">
      <PageHead crumb="Price › Working BOQ" title="Working BOQ">
        <button className="b" type="button" disabled={api.locked} onClick={api.onAddSection}>Add section</button>
        <button className="b" type="button" disabled={api.locked} onClick={api.onAddItem}>Add item</button>
        <button className="b p" type="button" onClick={() => api.onPane("analysis")}>Open rate analysis</button>
      </PageHead>
      <p style={{ color: "#2c4558", margin: 0 }}>Quantities come from Take-off, rates from Rate Analysis, margins from the stack. A typed rate is a direct value and has no build-up.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label className="l" htmlFor="work-filter" style={{ flex: 1 }}>Filter lines<input id="work-filter" className="i" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className={`b${filter === "all" ? " on" : ""}`} type="button" onClick={() => setFilter("all")}>All {fig.items.length}</button>
        <button className={`b${filter === "unpriced" ? " on" : ""}`} type="button" onClick={() => setFilter("unpriced")}>Unpriced {fig.unpriced.length}</button>
        <button className={`b${filter === "diff" ? " on" : ""}`} type="button" onClick={() => setFilter("diff")}>Qty differs {fig.qtyDiff.length}</button>
        <button className={`b${filter === "missing" ? " on" : ""}`} type="button" onClick={() => setFilter("missing")}>Missing analysis {fig.missing.length}</button>
      </div>
      <div className="split">
        <section className="card grow scroll">
          <table>
            <thead><tr><th>No.</th><th>Description</th><th>Unit</th><th className="r">Client qty</th><th className="r">Our qty</th><th className="r">Rate (QAR)</th><th className="r">Amount (QAR)</th><th>Rate source</th></tr></thead>
            <tbody>
              {rows.slice(0, 80).map((item) => {
                const key = itemKeyOf(item);
                const on = sel ? itemKeyOf(sel) === key : false;
                return (
                  <tr key={key} className={on ? "on" : ""} onClick={() => api.onSelect(key)}>
                    <td className="m">{item.boqCode}</td>
                    <td>{item.description}</td>
                    <td>{item.unit}</td>
                    <td className="m r">{num(item.clientQty)}</td>
                    <td><input className="i m r" aria-label={`Our qty ${item.boqCode}`} value={item.ourQty} disabled={api.locked} onChange={(e) => api.onPatch(key, { ourQty: Number(e.target.value) })} /></td>
                    <td><input className="i m r" aria-label={`Rate ${item.boqCode}`} value={item.priceMode === "direct" ? item.directCost ?? "" : item.result?.rate ?? ""} disabled={api.locked} onChange={(e) => api.onPatch(key, { directCost: Number(e.target.value), priceMode: "direct", lines: [], analysisOrigin: "own", linkedBoqCode: null })} /></td>
                    <td className="m r">{num(item.result?.amount ?? 0)}</td>
                    <td>{rateSource(api.project, item)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <aside className="ins">
          <h2>Inspector{sel ? ` · ${sel.boqCode}` : ""}</h2>
          {sel && sel.kind === "item" ? (
            <>
              <div className="row"><span>Client qty</span><span className="m">{num(sel.clientQty)} {sel.unit}</span></div>
              <div className="row"><span>Our qty</span><span className="m">{num(sel.ourQty)} {sel.unit}</span></div>
              <div className="row"><span>Rate</span><span className="m">{num(sel.result?.rate ?? 0)}</span></div>
              <div className="row"><span>Source</span><strong>{rateSource(api.project, sel)}</strong></div>
              {sel.ourQty !== sel.clientQty ? <p>The quantity difference is carried into Section 7 of the Submission BOQ.</p> : null}
              <button className="b" type="button" onClick={() => api.onPane("takeoff")}>Open in Take-off</button>
              <button className="b" type="button" onClick={() => api.onPane("analysis")}>Open rate analysis</button>
              <button className="b d" type="button" disabled={api.locked} onClick={() => api.onRemove(itemKeyOf(sel))}>Remove item</button>
            </>
          ) : <p>Select a row.</p>}
        </aside>
      </div>
    </div>
  );
}

export function AnalysisScreen({ api }: { api: MeasureApi }) {
  const items = api.project.items.filter((i) => i.kind === "item");
  const current = (api.selected && findItemByKey(items, api.selected)) || items.find((i) => i.lines.length) || items[0];
  const groups = useMemo(() => {
    if (!current) return [];
    const map = new Map<string, Array<{ line: WorkingItem["lines"][number]; index: number }>>();
    current.lines.forEach((line, index) => {
      const cat = categoryOf(api.project, line.projectResourceCode);
      map.set(cat, [...(map.get(cat) ?? []), { line, index }]);
    });
    return [...map.entries()];
  }, [api.project, current]);
  if (!current) return <div className="main"><h1>Rate analysis</h1><p>Add an item on the Working BOQ first.</p></div>;
  const key = itemKeyOf(current);
  const idx = items.findIndex((i) => itemKeyOf(i) === key);
  const direct = current.lines.reduce((s, line) => s + lineCost(Number(line.factors?.[0] ?? 0), line.resourceRate, line.wastagePct), 0) || current.result?.unitCost || current.directCost || 0;
  return (
    <div className="main">
      <div style={{ fontSize: 13, color: "#2c4558" }}>Rate Analysis › {current.boqCode}</div>
      <PageHead crumb="" title={`${current.boqCode} ${current.description}`}>
        <button className="b s" type="button" disabled={idx <= 0} onClick={() => api.onSelect(itemKeyOf(items[idx - 1]!))}>‹ Prev</button>
        <button className="b s" type="button" disabled={idx >= items.length - 1} onClick={() => api.onSelect(itemKeyOf(items[idx + 1]!))}>Next ›</button>
        <button className="b s" type="button" onClick={() => api.onPane("register")}>Register</button>
        <button className="b s" type="button" onClick={() => api.onPane("clone")}>Link or clone</button>
        <button className="b p" type="button" onClick={() => api.onPane("estimate")}>Post rate to Working BOQ</button>
      </PageHead>
      <div className="tabs">
        <button className="on" type="button">Build-up</button>
        <button type="button" onClick={() => api.onPane("register")}>Analysis sheet</button>
        <button type="button" onClick={() => api.onPane("clone")}>Links</button>
      </div>
      <div className="grid4">
        <div className="card" style={{ padding: "8px 12px" }}><div className="k">Direct cost</div><div className="m" style={{ fontSize: 20, fontWeight: 700 }}>{num(direct)}</div></div>
        <div className="card" style={{ padding: "8px 12px" }}><div className="k">Margin {num(totalMarginPct(api.project.margin) * 100, 1)}%</div><div className="m" style={{ fontSize: 20, fontWeight: 700 }}>{num(current.result?.marginAmount && current.ourQty ? current.result.marginAmount / current.ourQty : direct * totalMarginPct(api.project.margin))}</div></div>
        <div className="card" style={{ padding: "8px 12px" }}><div className="k">Rate per {current.unit || "unit"}</div><div className="m" style={{ fontSize: 20, fontWeight: 700 }}>{num(current.result?.rate ?? 0)}</div></div>
        <div className="card" style={{ padding: "8px 12px" }}><div className="k">Amount</div><div className="m" style={{ fontSize: 20, fontWeight: 700 }}>{num(current.result?.amount ?? 0)}</div></div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="b s" type="button" disabled={api.locked} onClick={() => { api.onPatch(key, { lines: [...current.lines, { factors: [1], wastagePct: 0, resourceRate: 0, description: "New component", unit: current.unit }] }); api.onEditLine(current.lines.length); api.onPane("component"); }}>Add component</button>
        <Chip>{rateSource(api.project, current)}</Chip>
        {quotedItem(api.project, current) ? <Chip kind="n">Quote in bid</Chip> : null}
      </div>
      {groups.map(([cat, lines]) => {
        const sub = lines.reduce((s, row) => s + lineCost(Number(row.line.factors?.[0] ?? 0), row.line.resourceRate, row.line.wastagePct), 0);
        return (
          <details key={cat} className="card" open style={{ padding: "8px 12px" }}>
            <summary><strong>{cat}</strong> <span className="m">{lines.length} · {num(sub)}</span></summary>
            <table>
              <thead><tr><th>#</th><th>Component</th><th className="r">Qty</th><th>Unit</th><th className="r">Price</th><th className="r">Waste</th><th className="r">Cost</th></tr></thead>
              <tbody>
                {lines.map(({ line, index }) => {
                  const qty = Number(line.factors?.[0] ?? 0);
                  return (
                    <tr key={index}>
                      <td className="m">{index + 1}</td>
                      <td><button className="b s" type="button" onClick={() => { api.onEditLine(index); api.onPane("component"); }}>{line.description || line.projectResourceCode || "Component"}</button></td>
                      <td><input className="i m r" aria-label="Qty" disabled={api.locked} value={qty} onChange={(e) => api.onPatch(key, { lines: current.lines.map((l, i) => i === index ? { ...l, factors: [Number(e.target.value)] } : l), priceMode: "analysis" })} /></td>
                      <td>{line.unit}</td>
                      <td><input className="i m r" aria-label="Price" disabled={api.locked} value={line.resourceRate} onChange={(e) => api.onPatch(key, { lines: current.lines.map((l, i) => i === index ? { ...l, resourceRate: Number(e.target.value) } : l), priceMode: "analysis" })} /></td>
                      <td className="m r">{num((line.wastagePct || 0) * 100, 1)}%</td>
                      <td className="m r">{num(lineCost(qty, line.resourceRate, line.wastagePct))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        );
      })}
      {!current.lines.length ? <p>No components yet. Add one, or link or clone another rate.</p> : null}
    </div>
  );
}

export function MarginsScreen({ api }: { api: MeasureApi }) {
  const fig = jobFigures(api.project, api.billId);
  const rows = [
    ["overheadPct", "Overheads", "Company overhead recovery rate"],
    ["profitPct", "Profit", "Decided for this tender"],
    ["logisticsPct", "Logistics", "Company default"],
    ["contingencyPct", "Contingency", "Percentage of direct cost"],
  ] as const;
  return (
    <div className="main">
      <PageHead crumb="Risk and money › Margins" title="Margin stack">
        <button className="b s" type="button" disabled={api.locked} onClick={() => api.onCommit({ ...api.project, margin: { ...DEFAULT_MARGIN } })}>Reset to company default</button>
      </PageHead>
      <p style={{ margin: 0, color: "#2c4558" }}>Each line is a percentage of direct cost, not compounded.</p>
      <section className="card scroll">
        <table>
          <thead><tr><th>Line</th><th>Comes from</th><th className="r">Percent</th><th className="r">Amount</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(([key, label, from]) => (
              <tr key={key}>
                <td>{label}</td>
                <td>{from}</td>
                <td><input className="i m r" aria-label={label} disabled={api.locked} value={num(api.project.margin[key] * 100, 2)} onChange={(e) => api.onCommit({ ...api.project, margin: { ...api.project.margin, [key]: Number(e.target.value) / 100 } })} /></td>
                <td className="m r">{num(fig.cost * api.project.margin[key])}</td>
                <td><Chip>On</Chip></td>
              </tr>
            ))}
            <tr className="sec"><td>Total margin on cost</td><td /><td className="m r">{num(fig.marginPct * 100, 1)}%</td><td className="m r">{num(fig.margin)}</td><td /></tr>
          </tbody>
        </table>
      </section>
      <section className="card" style={{ padding: 12 }}>
        <strong>Margin by cost category</strong>
        <table>
          <thead><tr><th>Category</th><th className="r">Cost</th><th>Margin</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {fig.tree.map((node) => (
              <tr key={node.key}><td>{node.label}</td><td className="m r">{num(node.amount)}</td><td>Job stack</td><td className="m r">{num(node.amount * fig.marginPct)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function QueriesScreen({ api }: { api: MeasureApi }) {
  const items = api.project.queryItems ?? [];
  const [id, setId] = useState(items[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [answer, setAnswer] = useState("");
  const current = items.find((q) => q.id === id) ?? items[0];
  return (
    <div className="main">
      <PageHead crumb="Tender › Client queries" title="Queries">
        <button className="b s" type="button" disabled={api.locked} onClick={() => {
          const item = { ...blankQueryItem(api.project), subject: subject || "New query", question: "", documentRef: api.selected ?? "" };
          api.onCommit(upsertQueryItem(api.project, item));
          setId(item.id);
        }}>New query</button>
      </PageHead>
      <div className="split">
        <section className="card" style={{ width: 320, overflow: "auto", padding: 8 }}>
          {items.map((item) => (
            <button key={item.id} className="ex" type="button" onClick={() => setId(item.id)}>
              <span><strong className="m">{item.number}</strong> {item.subject || "Untitled"}</span>
              <Chip kind={item.closedAt ? "g" : "w"}>{trackLabel(trackQuery(api.project, item))}</Chip>
            </button>
          ))}
          {!items.length ? <p style={{ padding: 8 }}>No queries on this job yet.</p> : null}
        </section>
        <section className="grow" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {current ? (
            <>
              <h2>{current.number} · {current.subject}</h2>
              <label className="l">Subject<input className="i" value={current.subject} disabled={api.locked} onChange={(e) => api.onCommit(upsertQueryItem(api.project, { ...current, subject: e.target.value }))} /></label>
              <label className="l">Question<textarea className="i" rows={4} value={current.question} disabled={api.locked} onChange={(e) => api.onCommit(upsertQueryItem(api.project, { ...current, question: e.target.value }))} /></label>
              <label className="l">Record the answer<textarea className="i" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} /></label>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="b p s" type="button" disabled={api.locked || !answer.trim()} onClick={() => { api.onCommit(logQueryReply(api.project, current.id, { body: answer, fromName: "Client" })); setAnswer(""); }}>Save answer</button>
                <button className="b s" type="button" disabled={api.locked} onClick={() => api.onCommit(current.closedAt ? upsertQueryItem(api.project, { ...current, closedAt: null }) : closeQuery(api.project, current.id))}>{current.closedAt ? "Reopen" : "Save and close query"}</button>
              </div>
              {current.replies.map((reply) => (
                <div key={reply.id} className="card" style={{ padding: 8 }}><strong>{reply.fromName || "Reply"}</strong> <span className="m">{reply.receivedAt.slice(0, 16)}</span><div>{reply.body}</div></div>
              ))}
            </>
          ) : (
            <label className="l">Subject for the first query<input className="i" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          )}
        </section>
      </div>
    </div>
  );
}

export function SubmitScreen({ api }: { api: MeasureApi }) {
  const fig = jobFigures(api.project, api.billId);
  const adjustments = fig.qtyDiff.map((item) => ({ item, delta: (item.ourQty - item.clientQty) * (item.result?.rate ?? 0) }));
  const adj = adjustments.reduce((s, row) => s + row.delta, 0);
  const base = fig.items.reduce((s, item) => s + item.clientQty * (item.result?.rate ?? 0), 0);
  return (
    <div className="main">
      <PageHead crumb="Submit › Submission BOQ" title="Submission BOQ">
        <Chip kind={fig.sealed ? "g" : "w"}>{fig.sealed ? "Sealed" : "Draft, not sealed"}</Chip>
        <button className="b" type="button" onClick={() => api.onPane("reports")}>Preview as client sees it</button>
        <button className="b p" type="button" onClick={() => api.onPane("finalise")}>Go to Finalise</button>
      </PageHead>
      <p style={{ margin: 0, color: "#2c4558" }}>Client quantities, priced with your rates. Where your measured quantity differs, the difference is carried to Section 7.</p>
      <div className="split">
        <section className="card grow scroll">
          <table>
            <thead><tr><th>No.</th><th>Description</th><th>Unit</th><th className="r">Client qty</th><th className="r">Rate (QAR)</th><th className="r">Amount (QAR)</th></tr></thead>
            <tbody>
              {fig.items.slice(0, 40).map((item) => (
                <tr key={itemKeyOf(item)}>
                  <td className="m">{item.boqCode}</td><td>{item.description}</td><td>{item.unit}</td>
                  <td className="m r">{num(item.clientQty)}</td><td className="m r">{num(item.result?.rate ?? 0)}</td>
                  <td className="m r">{num(item.clientQty * (item.result?.rate ?? 0))}</td>
                </tr>
              ))}
              <tr className="sec"><td>7</td><td>Tender adjustments</td><td /><td /><td /><td className="m r">{num(adj)}</td></tr>
              {adjustments.slice(0, 8).map(({ item, delta }) => (
                <tr key={itemKeyOf(item)}><td className="m">{item.boqCode}</td><td>Quantity adjustment {(item.ourQty - item.clientQty).toLocaleString()} {item.unit}</td><td>sum</td><td className="m r">1</td><td /><td className="m r">{num(delta)}</td></tr>
              ))}
              <tr className="sec"><td /><td>Grand total, QAR</td><td /><td /><td /><td className="m r">{num(base + adj)}</td></tr>
            </tbody>
          </table>
        </section>
        <aside className="ins">
          <h2>Inspector</h2>
          <div className="row"><span>Revision</span><strong>{fig.sealed ? `Sealed r${api.project.revision}` : `R${api.project.revision} draft`}</strong></div>
          <div className="row"><span>Sections</span><span className="m">{num(base)}</span></div>
          <div className="row"><span>Section 7</span><span className="m">{num(adj)}</span></div>
          <div className="row"><span>Grand total</span><strong className="m">{num(fig.total)}</strong></div>
          <p>The working total is the figure the seal checks against.</p>
        </aside>
      </div>
    </div>
  );
}

export function FinaliseScreen({ api }: { api: MeasureApi }) {
  const fig = jobFigures(api.project, api.billId);
  const must = [
    fig.unpriced.length ? `${fig.unpriced.length} items have no rate` : "",
    fig.missing.length ? `${fig.missing.length} items have no rate analysis` : "",
  ].filter(Boolean);
  const warnings = [
    fig.qtyDiff.length ? `${fig.qtyDiff.length} items differ from the client quantity` : "",
    fig.openQueries.length ? `${fig.openQueries.length} queries are still open` : "",
  ].filter(Boolean);
  const blocked = must.length > 0;
  return (
    <div className="main">
      <PageHead crumb="Submit › Finalise" title={`Finalise and seal revision R${api.project.revision}`}>
        <button className="b s" type="button" onClick={() => api.onPane("reports")}>Print checklist</button>
        {fig.sealed ? <button className="b" type="button" disabled={api.locked && !fig.sealed} onClick={api.onRevision}>New revision</button> : null}
      </PageHead>
      {blocked ? <div className="banner"><strong>You cannot seal yet.</strong> {must.length} problems must be fixed. Warnings do not stop you once the must-fix list is clear.</div> : <div className="card" style={{ padding: 10, background: "#e5f5ef" }}>Checks passed. You can seal this revision.</div>}
      <div className="split">
        <section className="card grow" style={{ padding: 12 }}>
          <strong>Must fix ({must.length})</strong>
          {must.map((line) => <div key={line} className="ex"><span>{line}</span><button className="b s" type="button" onClick={() => api.onPane(line.includes("analysis") ? "register" : "estimate")}>Open</button></div>)}
          {!must.length ? <p>Passed. Every item has a rate and a build-up or a direct value.</p> : null}
          <strong>Warnings ({warnings.length})</strong>
          {warnings.map((line) => <div key={line} className="row"><Chip kind="w">Warning</Chip><span>{line}</span></div>)}
          <div className="row"><Chip>Passed</Chip><span>Client BOQ {api.project.sourceLockedAt ? "locked as issued" : "still editable"}</span></div>
          <div className="row"><Chip>Passed</Chip><span>Working total {num(fig.total)} {fig.green ? "matches the reference GREEN total" : ""}</span></div>
          <button className="b p" type="button" disabled={api.locked || blocked || fig.sealed} onClick={api.onSeal}>{fig.sealed ? "Sealed" : `Seal revision R${api.project.revision}`}</button>
        </section>
        <aside className="ins">
          <h2>What sealing freezes</h2>
          <p>Quantities, rates and margins. Live-link values at their current numbers. The submission BOQ and Section 7.</p>
          <p>You can keep working after sealing. Changes go into the next revision.</p>
        </aside>
      </div>
    </div>
  );
}
