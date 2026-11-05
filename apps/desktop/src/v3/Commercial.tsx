import { useMemo, useState } from "react";
import { findItemByKey, itemKeyOf } from "../bills";
import {
  applyVendorPack,
  blankEnquiry,
  buyLanes,
  issueEnquiry,
  laneTargets,
  quotesForTarget,
  selectLowestInLane,
  selectQuoteLine,
  upsertEnquiry,
  vendorsInLane,
  writeQuoteLine,
} from "../buyProcurement";
import { applyResourceRate } from "../projectCompute";
import { cloneWholeAnalysis, linkWholeAnalysis } from "../projectCompute";
import type { LoadedProject, WorkingItem } from "../model";
import { appendFollowUp, readFollowUps, type Pane } from "./routes";
import { categoryOf, jobFigures, lineCost, num, rateSource } from "./figures";
import { Chip, PageHead } from "./chrome";

type Api = {
  project: LoadedProject;
  billId: string | null;
  locked: boolean;
  selected: string | null;
  resourceCode: string | null;
  lineIndex: number | null;
  onSelect: (key: string) => void;
  onResource: (code: string) => void;
  onCommit: (next: LoadedProject) => void;
  onPatch: (code: string, patch: Partial<WorkingItem>) => void;
  onPane: (pane: Pane) => void;
};

function PriceTabs({ pane, api, count }: { pane: Pane; api: Api; count: number }) {
  const tabs: Array<[Pane, string]> = [
    ["buy", `Project resources ${count}`],
    ["enquiries", `Enquiries ${api.project.enquiries?.length ?? 0}`],
    ["compare", "Compare and choose for bid"],
    ["followup", "Follow-up log"],
  ];
  return (
    <div className="tabs">
      {tabs.map(([id, label]) => (
        <button key={id} type="button" className={pane === id ? "on" : ""} onClick={() => api.onPane(id)}>{label}</button>
      ))}
    </div>
  );
}

export function PricesScreen({ api }: { api: Api }) {
  const fig = jobFigures(api.project, api.billId);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const rows = api.project.resources.filter((r) => {
    const label = (r.category ?? "").trim();
    if (cat && label !== cat) return false;
    if (q && !`${r.project_code} ${r.description ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  return (
    <div className="main">
      <PageHead crumb="Commercial › Resource Prices" title="Resource prices used in this bid">
        <button className="b s" type="button" onClick={() => api.onPane("masters")}>Add from masters</button>
        <button className="b s" type="button" disabled={api.locked} onClick={() => api.onPane("resource")}>Create resource</button>
        <button className="b s" type="button" onClick={() => api.onPane("enquiries")}>Create enquiry</button>
      </PageHead>
      <PriceTabs pane="buy" api={api} count={api.project.resources.length} />
      <div className="split">
        <section className="card" style={{ width: 240, padding: 8, overflow: "auto" }}>
          <button className={`ex${!cat ? " on" : ""}`} type="button" onClick={() => setCat("")}><span>All categories</span></button>
          {fig.tree.map((node) => (
            <button key={node.key} className="ex" type="button" onClick={() => setCat(node.label)}>
              <span><strong>{node.label}</strong><div className="m">{num(node.amount)}</div></span>
            </button>
          ))}
        </section>
        <section className="card grow scroll">
          <div style={{ padding: 8 }}><label className="l" htmlFor="res-filter">Filter resources<input id="res-filter" className="i" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
          <table>
            <thead><tr><th>Resource</th><th>Unit</th><th className="r">Bid price</th><th className="r">Best quote</th><th>Status</th></tr></thead>
            <tbody>
              {rows.slice(0, 60).map((r) => {
                const quotes = quotesForTarget(api.project, "resource", r.project_code);
                const best = quotes.length ? Math.min(...quotes.map((row) => row.rate)) : null;
                const selected = quotes.find((row) => row.selected);
                return (
                  <tr key={r.project_code} className={api.resourceCode === r.project_code ? "on" : ""}>
                    <td><button className="b s" type="button" onClick={() => { api.onResource(r.project_code); api.onPane("resource"); }}>{r.description || r.project_code}</button><div style={{ color: "#2c4558", fontSize: 12 }}>{r.project_code} · {r.category}</div></td>
                    <td>{r.unit}</td>
                    <td className="m r">{num(r.project_rate ?? 0)}</td>
                    <td className="m r">{best == null ? "—" : num(best)}</td>
                    <td>{selected ? <Chip>Quote in bid</Chip> : quotes.length ? <Chip kind="n">Quotes in</Chip> : <Chip kind="w">No quote</Chip>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

export function ResourceScreen({ api }: { api: Api }) {
  const resource = api.project.resources.find((r) => r.project_code === api.resourceCode) ?? api.project.resources[0];
  if (!resource) {
    return (
      <div className="main">
        <PageHead crumb="Resource prices › Detail" title="Resource detail" />
        <p>This job has no resources yet. Add one from Masters, or create a blank resource.</p>
        <button className="b p" type="button" disabled={api.locked} onClick={() => {
          const code = `R-${api.project.resources.length + 1}`;
          api.onCommit({ ...api.project, resources: [...api.project.resources, { project_code: code, global_code: null, category: "Material", type: null, sub_type: null, description: "New resource", unit: "nr", project_wastage_pct: 0, project_rate: 0, rate_source: "manual", total_qty: 0, total_amount: 0 }] });
          api.onResource(code);
        }}>Create resource</button>
      </div>
    );
  }
  const quotes = quotesForTarget(api.project, "resource", resource.project_code);
  function save(patch: Partial<typeof resource>) {
    api.onCommit({ ...api.project, resources: api.project.resources.map((r) => r.project_code === resource.project_code ? { ...r, ...patch } : r) });
  }
  return (
    <div className="main">
      <PageHead crumb="Resource prices › Detail" title={resource.description || resource.project_code}>
        <button className="b" type="button" onClick={() => api.onPane("buy")}>Back to prices</button>
        <button className="b" type="button" onClick={() => api.onPane("enquiries")}>Send enquiry</button>
      </PageHead>
      <div className="split">
        <section className="card grow" style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label className="l">Code<input className="i" value={resource.project_code} disabled /></label>
          <label className="l">Unit<input className="i" disabled={api.locked} value={resource.unit ?? ""} onChange={(e) => save({ unit: e.target.value })} /></label>
          <label className="l" style={{ gridColumn: "1 / -1" }}>Description<input className="i" disabled={api.locked} value={resource.description ?? ""} onChange={(e) => save({ description: e.target.value })} /></label>
          <label className="l">Category<input className="i" disabled={api.locked} value={resource.category ?? ""} onChange={(e) => save({ category: e.target.value })} /></label>
          <label className="l">Type<input className="i" disabled={api.locked} value={resource.type ?? ""} onChange={(e) => save({ type: e.target.value })} /></label>
          <label className="l">Wastage %<input className="i m" disabled={api.locked} value={num((resource.project_wastage_pct ?? 0) * 100, 2)} onChange={(e) => save({ project_wastage_pct: Number(e.target.value) / 100 })} /></label>
          <label className="l">Bid price (QAR)<input className="i m" disabled={api.locked} value={resource.project_rate ?? 0} onChange={(e) => api.onCommit(applyResourceRate(api.project, resource.project_code, Number(e.target.value), "manual"))} /></label>
          <div style={{ gridColumn: "1 / -1" }}><Chip>{resource.rate_source === "quote" ? "Quote in bid" : resource.rate_source === "manual" ? "Typed price" : "Master price"}</Chip></div>
        </section>
        <aside className="ins">
          <h2>Quotes</h2>
          {quotes.map((quote) => (
            <div key={quote.id} className="row">
              <span>{quote.vendorName}</span>
              <span className="m">{num(quote.rate)}</span>
              <button className="b s" type="button" disabled={api.locked || quote.selected} onClick={() => api.onCommit(selectQuoteLine(api.project, "resource", resource.project_code, quote.id, true))}>{quote.selected ? "In bid" : "Use"}</button>
            </div>
          ))}
          {!quotes.length ? <p>No supplier quotes yet.</p> : null}
          <QuoteAdder api={api} code={resource.project_code} />
        </aside>
      </div>
    </div>
  );
}

function QuoteAdder({ api, code }: { api: Api; code: string }) {
  const [vendor, setVendor] = useState(api.project.vendors[0]?.name ?? "");
  const [rate, setRate] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!vendor || !rate || api.locked) return; api.onCommit(writeQuoteLine(api.project, "resource", code, vendor, Number(rate))); setRate(""); }}>
      <label className="l">Supplier<input className="i" list="vendors" value={vendor} onChange={(e) => setVendor(e.target.value)} /></label>
      <datalist id="vendors">{api.project.vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
      <label className="l">Rate<input className="i m" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
      <button className="b p s" type="submit" disabled={api.locked}>Add quote</button>
    </form>
  );
}

export function EnquiriesScreen({ api }: { api: Api }) {
  const lanes = buyLanes(api.project);
  const packs = api.project.enquiries ?? [];
  const [id, setId] = useState(packs[0]?.id ?? "");
  const [lane, setLane] = useState(lanes[0]?.id ?? "");
  const [vendor, setVendor] = useState(api.project.vendors[0]?.name ?? "");
  const [due, setDue] = useState("");
  const current = packs.find((p) => p.id === id) ?? null;
  return (
    <div className="main">
      <PageHead crumb="Commercial › Resource Prices" title="Supplier enquiries">
        <button className="b p" type="button" disabled={api.locked || !lane || !vendor} onClick={() => {
          const pack = { ...blankEnquiry(api.project, lane, vendor, api.billId), dueAt: due || null };
          api.onCommit(upsertEnquiry(api.project, pack));
          setId(pack.id);
        }}>New enquiry</button>
      </PageHead>
      <PriceTabs pane="enquiries" api={api} count={api.project.resources.length} />
      <div className="split">
        <section className="card" style={{ width: 300, overflow: "auto", padding: 8 }}>
          {packs.map((pack) => (
            <button key={pack.id} className="ex" type="button" onClick={() => setId(pack.id)}>
              <span><strong>{pack.vendorName}</strong><div>{pack.category} · {pack.lines.filter((l) => l.included).length} lines</div></span>
              <Chip kind={pack.status === "issued" ? "n" : "w"}>{pack.status === "issued" ? "Sent" : "Draft"}</Chip>
            </button>
          ))}
          {!packs.length ? <p>No enquiries yet. Choose a category and a supplier, then create a draft.</p> : null}
        </section>
        <section className="grow" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <label className="l">Category<select className="i" value={lane} onChange={(e) => setLane(e.target.value)}>{lanes.map((l) => <option key={l.id} value={l.id}>{l.label} ({l.count})</option>)}</select></label>
            <label className="l">Supplier<input className="i" value={vendor} onChange={(e) => setVendor(e.target.value)} list="enq-vendors" /></label>
            <datalist id="enq-vendors">{api.project.vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
            <label className="l">Reply due<input className="i" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
          </div>
          {current ? (
            <>
              <h2>{current.vendorName} · {current.status === "issued" ? "Sent" : "Draft"}</h2>
              <section className="card scroll">
                <table>
                  <thead><tr><th /><th>Code</th><th>Resource</th><th className="r">Qty</th><th>Unit</th></tr></thead>
                  <tbody>
                    {current.lines.map((line) => (
                      <tr key={line.id}>
                        <td><input type="checkbox" checked={line.included} disabled={api.locked || current.status === "issued"} aria-label={`Include ${line.targetCode}`} onChange={(e) => api.onCommit(upsertEnquiry(api.project, { ...current, lines: current.lines.map((l) => l.id === line.id ? { ...l, included: e.target.checked } : l) }))} /></td>
                        <td className="m">{line.targetCode}</td>
                        <td>{line.spec}</td>
                        <td className="m r">{num(line.qty)}</td>
                        <td>{line.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="b" type="button" disabled={api.locked} onClick={() => api.onCommit(upsertEnquiry(api.project, current))}>Save draft</button>
                <button className="b p" type="button" disabled={api.locked || current.status === "issued"} onClick={() => api.onCommit(issueEnquiry(api.project, current.id))}>Send enquiry</button>
                <button className="b" type="button" onClick={() => api.onPane("compare")}>Compare replies</button>
              </div>
            </>
          ) : <p style={{ color: "#2c4558" }}>Client name and our rates are not included on the enquiry sheet.</p>}
        </section>
      </div>
    </div>
  );
}

export function CompareScreen({ api }: { api: Api }) {
  const lanes = buyLanes(api.project);
  const [lane, setLane] = useState(lanes[0]?.id ?? "");
  const targets = lane ? laneTargets(api.project, lane, api.billId).slice(0, 40) : [];
  const vendors = lane ? vendorsInLane(api.project, lane) : [];
  return (
    <div className="main">
      <PageHead crumb="Commercial › Resource Prices" title="Compare quotes and choose the price for the bid">
        <label className="l">Category<select className="i" value={lane} onChange={(e) => setLane(e.target.value)}>{lanes.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
      </PageHead>
      <PriceTabs pane="compare" api={api} count={api.project.resources.length} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="b p s" type="button" disabled={api.locked || !lane} onClick={() => api.onCommit(selectLowestInLane(api.project, lane, true))}>Lowest per resource</button>
        {vendors.slice(0, 4).map((name) => (
          <button key={name} className="b s" type="button" disabled={api.locked} onClick={() => api.onCommit(applyVendorPack(api.project, lane, name, undefined, true))}>Use {name}</button>
        ))}
      </div>
      <section className="card scroll">
        <table>
          <thead>
            <tr><th>Resource</th><th className="r">Bid price</th>{vendors.map((name) => <th key={name} className="r">{name}</th>)}</tr>
          </thead>
          <tbody>
            {targets.map((t) => {
              const quotes = quotesForTarget(api.project, t.kind, t.code);
              const current = t.kind === "resource" ? api.project.resources.find((r) => r.project_code === t.code)?.project_rate : null;
              return (
                <tr key={t.code}>
                  <td>{t.description}<div className="m">{t.code}</div></td>
                  <td className="m r">{num(current ?? 0)}</td>
                  {vendors.map((name) => {
                    const quote = quotes.find((q) => q.vendorName === name);
                    return (
                      <td key={name} className={quote?.selected ? "sel" : ""}>
                        {quote ? <button className="b s" type="button" disabled={api.locked} onClick={() => api.onCommit(selectQuoteLine(api.project, t.kind, t.code, quote.id, true))}>{num(quote.rate)}{quote.selected ? " · in bid" : ""}</button> : <span style={{ color: "#6b8397" }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function FollowScreen({ api }: { api: Api }) {
  const packs = api.project.enquiries ?? [];
  const [id, setId] = useState(packs[0]?.id ?? "");
  const [channel, setChannel] = useState("Email");
  const [note, setNote] = useState("");
  const rows = packs.flatMap((pack) => readFollowUps(pack.notes, pack.id, pack.vendorName));
  const current = packs.find((p) => p.id === id);
  return (
    <div className="main">
      <PageHead crumb="Commercial › Resource Prices" title="Follow-up log" />
      <PriceTabs pane="followup" api={api} count={api.project.resources.length} />
      <div className="split">
        <section className="card grow scroll">
          <table>
            <thead><tr><th>When</th><th>Supplier</th><th>Channel</th><th>Note</th></tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.at}-${i}`}><td className="m">{row.at.slice(0, 16).replace("T", " ")}</td><td>{row.vendor}</td><td>{row.channel}</td><td>{row.note}</td></tr>
              ))}
              {!rows.length ? <tr><td colSpan={4}>No follow-ups yet. They are stored on the enquiry and saved with the job.</td></tr> : null}
            </tbody>
          </table>
        </section>
        <aside className="ins">
          <h2>Log a follow-up</h2>
          <label className="l">Enquiry<select className="i" value={id} onChange={(e) => setId(e.target.value)}>{packs.map((p) => <option key={p.id} value={p.id}>{p.vendorName} · {p.category}</option>)}</select></label>
          <label className="l">Channel<select className="i" value={channel} onChange={(e) => setChannel(e.target.value)}><option>Email</option><option>Phone</option><option>WhatsApp</option></select></label>
          <label className="l">Note<textarea className="i" rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button className="b p" type="button" disabled={api.locked || !current || !note.trim()} onClick={() => {
            if (!current) return;
            api.onCommit(upsertEnquiry(api.project, { ...current, notes: appendFollowUp(current.notes, channel, note.trim()) }));
            setNote("");
          }}>Save follow-up</button>
        </aside>
      </div>
    </div>
  );
}

export function RegisterScreen({ api }: { api: Api }) {
  const [q, setQ] = useState("");
  const items = api.project.items.filter((i) => i.kind === "item" && `${i.boqCode} ${i.description}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="main">
      <PageHead crumb="Price › Rate analysis" title="Rate analysis register">
        <button className="b" type="button" onClick={() => api.onPane("analysis")}>Open build-up</button>
        <button className="b" type="button" onClick={() => api.onPane("clone")}>Link or clone</button>
      </PageHead>
      <label className="l" htmlFor="reg">Filter analyses<input id="reg" className="i" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <section className="card scroll">
        <table>
          <thead><tr><th>Item</th><th>Source</th><th className="r">Direct cost</th><th className="r">Rate</th><th className="r">Amount</th><th /></tr></thead>
          <tbody>
            {items.slice(0, 80).map((item) => {
              const key = itemKeyOf(item);
              const direct = item.lines.reduce((s, line) => s + lineCost(Number(line.factors?.[0] ?? 0), line.resourceRate, line.wastagePct), 0) || item.result?.unitCost || 0;
              return (
                <tr key={key}>
                  <td><strong className="m">{item.boqCode}</strong> {item.description}</td>
                  <td>{rateSource(api.project, item)}</td>
                  <td className="m r">{num(direct)}</td>
                  <td className="m r">{num(item.result?.rate ?? 0)}</td>
                  <td className="m r">{num(item.result?.amount ?? 0)}</td>
                  <td><button className="b s" type="button" onClick={() => { api.onSelect(key); api.onPane("analysis"); }}>Open</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function CloneScreen({ api }: { api: Api }) {
  const items = api.project.items.filter((i) => i.kind === "item");
  const host = (api.selected && findItemByKey(items, api.selected)) || items[0];
  const [source, setSource] = useState(items.find((i) => host && itemKeyOf(i) !== itemKeyOf(host))?.boqCode ? "" : "");
  const [mode, setMode] = useState<"link" | "clone">("link");
  const [q, setQ] = useState("");
  const choices = items.filter((i) => host && itemKeyOf(i) !== itemKeyOf(host) && `${i.boqCode} ${i.description}`.toLowerCase().includes(q.toLowerCase()));
  const picked = choices.find((i) => itemKeyOf(i) === source) ?? choices[0];
  return (
    <div className="main">
      <div className="k">Rate Analysis › Link or clone</div>
      <PageHead crumb="" title="Link or clone a rate">
        <button className="b" type="button" onClick={() => api.onPane("analysis")}>Cancel</button>
        <button className="b p" type="button" disabled={api.locked || !host || !picked} onClick={() => {
          if (!host || !picked) return;
          const fn = mode === "link" ? linkWholeAnalysis : cloneWholeAnalysis;
          api.onCommit(fn(api.project, itemKeyOf(host), itemKeyOf(picked)));
          api.onPane("analysis");
        }}>{mode === "link" ? "Apply live link" : "Apply clone"}</button>
      </PageHead>
      <p>Target: <strong>{host ? `${host.boqCode} ${host.description}` : "Choose an item on the working bill"}</strong></p>
      <div className="split">
        <section className="card grow" style={{ padding: 8, overflow: "auto" }}>
          <label className="l">Search items<input className="i" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {choices.slice(0, 30).map((item) => {
            const key = itemKeyOf(item);
            return (
              <button key={key} className={`ex${picked && itemKeyOf(picked) === key ? " on" : ""}`} type="button" onClick={() => setSource(key)}>
                <span><strong className="m">{item.boqCode}</strong> {item.description}</span>
                <Chip kind="g">{rateSource(api.project, item)}</Chip>
              </button>
            );
          })}
        </section>
        <aside className="ins">
          <label className={`opt${mode === "link" ? " on" : ""}`}><input type="radio" name="mode" checked={mode === "link"} onChange={() => setMode("link")} /><span><strong>Live link</strong><div>This rate follows the source. When the source changes, this one changes. Margin is applied once.</div></span></label>
          <label className={`opt${mode === "clone" ? " on" : ""}`}><input type="radio" name="mode" checked={mode === "clone"} onChange={() => setMode("clone")} /><span><strong>Clone (copy once)</strong><div>Copies the build-up. Later changes to the source stay there.</div></span></label>
          {picked ? <p>Source direct cost {num(picked.result?.unitCost ?? picked.directCost ?? 0)} per {picked.unit || "unit"}.</p> : null}
        </aside>
      </div>
    </div>
  );
}

export function ComponentScreen({ api }: { api: Api }) {
  const items = api.project.items.filter((i) => i.kind === "item");
  const host = (api.selected && findItemByKey(items, api.selected)) || items[0];
  const index = api.lineIndex ?? 0;
  const line = host?.lines[index];
  const [desc, setDesc] = useState(line?.description ?? "");
  const [code, setCode] = useState(line?.projectResourceCode ?? "");
  const [qty, setQty] = useState(String(line?.factors?.[0] ?? 1));
  const [unit, setUnit] = useState(line?.unit ?? "");
  const [price, setPrice] = useState(String(line?.resourceRate ?? 0));
  const [waste, setWaste] = useState(String((line?.wastagePct ?? 0) * 100));
  const cost = lineCost(Number(qty) || 0, Number(price) || 0, (Number(waste) || 0) / 100);
  const resource = useMemo(() => api.project.resources.find((r) => r.project_code === code), [api.project.resources, code]);
  if (!host) return <div className="main"><p>Select an item first.</p></div>;
  return (
    <div className="main">
      <div className="k">Rate Analysis › Component</div>
      <PageHead crumb="" title={line ? "Edit component" : "Add a component"}>
        <button className="b" type="button" onClick={() => api.onPane("analysis")}>Cancel</button>
        <button className="b p" type="button" disabled={api.locked} onClick={() => {
          const next = { factors: [Number(qty) || 0], wastagePct: (Number(waste) || 0) / 100, resourceRate: Number(price) || 0, description: desc || resource?.description || "Component", unit: unit || resource?.unit || null, projectResourceCode: code || null };
          const lines = host.lines.slice();
          if (line) lines[index] = { ...lines[index], ...next };
          else lines.push(next);
          api.onPatch(itemKeyOf(host), { lines, priceMode: "analysis", analysisOrigin: "own" });
          api.onPane("analysis");
        }}>Save component</button>
      </PageHead>
      <p>On <strong>{host.boqCode} {host.description}</strong></p>
      <section className="card" style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 760 }}>
        <label className="l" style={{ gridColumn: "1 / -1" }}>Description<input className="i" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
        <label className="l">Resource code<input className="i" list="res-codes" value={code} onChange={(e) => { setCode(e.target.value); const found = api.project.resources.find((r) => r.project_code === e.target.value); if (found) { setDesc(found.description ?? desc); setUnit(found.unit ?? ""); setPrice(String(found.project_rate ?? 0)); } }} /></label>
        <datalist id="res-codes">{api.project.resources.slice(0, 200).map((r) => <option key={r.project_code} value={r.project_code}>{r.description}</option>)}</datalist>
        <label className="l">Unit<input className="i" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
        <label className="l">Quantity<input className="i m" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label className="l">Price<input className="i m" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="l">Waste %<input className="i m" value={waste} onChange={(e) => setWaste(e.target.value)} /></label>
        <div><div className="k">Cost</div><strong className="m" style={{ fontSize: 22 }}>{num(cost)}</strong></div>
        {resource ? <p style={{ gridColumn: "1 / -1", color: "#2c4558" }}>Category {categoryOf(api.project, resource.project_code)}. Bid price {num(resource.project_rate ?? 0)}.</p> : null}
      </section>
    </div>
  );
}
