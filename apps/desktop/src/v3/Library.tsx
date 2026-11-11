import { useState } from "react";
import { LegalBrowser } from "../views/LegalDocs";
import { APP_VERSION } from "../auth/releaseConfig";
import type { LicenseSession } from "../auth/licenseState";
import { mergeReportFormat, type ReportFormat } from "../reportFormat";
import { downloadSuite, printSuite, reportSuites } from "./reports";
import { newId, type CategoryRow, type LoadedProject } from "../model";
import type { Session } from "../platform/store";
import { jobFigures, num } from "./figures";
import { Chip, PageHead } from "./chrome";
import { LicensePanel } from "../views/LicensePanel";
import type { Pane } from "./routes";

export function ReportsScreen({ project, billId, onPane, onSaveFormat }: { project: LoadedProject; billId: string | null; onPane: (pane: Pane) => void; onSaveFormat: (format: ReportFormat) => void }) {
  const suites = reportSuites(project, billId);
  const [pick, setPick] = useState(suites[0]?.id ?? "submission");
  const [logo, setLogo] = useState(true);
  const [status, setStatus] = useState("");
  const suite = suites.find((row) => row.id === pick) ?? suites[0]!;
  const fig = jobFigures(project, billId);
  function format() {
    return mergeReportFormat({ showLogo: logo, showKpis: true, qtyColumn: suite.id === "working" ? "our" : "issued" });
  }
  return (
    <div className="main">
      <PageHead crumb="Reports" title="Report centre">
        <button className="b" type="button" onClick={() => { downloadSuite(project.name, suite); setStatus(`Saved ${suite.title}.csv`); }}>Export CSV</button>
        <button className="b p" type="button" onClick={() => {
          setStatus("");
          void printSuite(project, suite, format()).then(() => setStatus(`Opened ${suite.title} for printing.`)).catch((err: unknown) => {
            setStatus(err instanceof Error ? err.message : "Could not print that report.");
          });
        }}>Print</button>
        <button className="b" type="button" onClick={() => { onSaveFormat(format()); setStatus("Saved these options on the company."); }}>Save options</button>
      </PageHead>
      {status ? <div className="banner" role="status">{status}</div> : null}
      <div className="grid4">
        <div className="card" style={{ padding: "8px 14px" }}><div className="k">Working total</div><div className="m" style={{ fontSize: 20, fontWeight: 700 }}>{num(fig.total)}</div></div>
        <div className="card" style={{ padding: "8px 14px" }}><div className="k">Direct cost</div><div className="m" style={{ fontSize: 20, fontWeight: 700 }}>{num(fig.cost)}</div></div>
        <div className="card" style={{ padding: "8px 14px" }}><div className="k">Priced lines</div><div className="m" style={{ fontSize: 20, fontWeight: 700 }}>{fig.items.length - fig.unpriced.length}</div></div>
        <div className="card" style={{ padding: "8px 14px" }}><div className="k">Open queries</div><div className="m" style={{ fontSize: 20, fontWeight: 700 }}>{fig.openQueries.length}</div></div>
      </div>
      <div className="split">
        <section className="card" style={{ width: 280, overflow: "auto" }}>
          {suites.map((row) => (
            <button key={row.id} className="ex" type="button" onClick={() => setPick(row.id)}>
              <span><strong>{row.title}</strong><div style={{ color: "#2c4558", whiteSpace: "normal" }}>{row.blurb}</div></span>
              {suite.id === row.id ? <Chip>{row.rows.length}</Chip> : null}
            </button>
          ))}
        </section>
        <section className="card grow scroll">
          <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <h2>{suite.title}</h2>
            <Chip kind={project.sealedAt ? "g" : "w"}>{project.sealedAt ? "Sealed" : "Draft"}</Chip>
            <span style={{ flex: 1 }} />
            <button className="b s" type="button" onClick={() => onPane(suite.id === "queries" ? "queries" : suite.id === "analysis" ? "register" : "submit")}>Open source</button>
          </div>
          <table>
            <thead><tr>{suite.heads.map((head) => <th key={head} className={/qty|rate|amount|cost|direct|share|difference|lines/i.test(head) ? "r" : ""}>{head}</th>)}</tr></thead>
            <tbody>
              {suite.rows.length ? suite.rows.slice(0, 80).map((row, index) => (
                <tr key={`${suite.id}-${index}`}>
                  {row.map((cell, cellIndex) => <td key={cellIndex} className={cellIndex > 1 ? "m r" : cellIndex === 0 ? "m" : ""}>{cell}</td>)}
                </tr>
              )) : (
                <tr><td colSpan={suite.heads.length}>This job has no rows for {suite.title} yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>
        <aside className="ins">
          <h2>Options</h2>
          <label className="check"><input type="checkbox" checked={logo} onChange={(e) => setLogo(e.target.checked)} /> Company logo and footer</label>
          <p style={{ color: "#2c4558" }}>{suite.rows.length} rows from {project.name}. Print uses the same rows as this preview.</p>
        </aside>
      </div>
    </div>
  );
}

export function MastersScreen({
  project,
  locked,
  onCommit,
  onPane,
  onSaveCatalog,
  onPromote,
}: {
  project: LoadedProject;
  locked: boolean;
  onCommit: (next: LoadedProject) => void;
  onPane: (pane: Pane) => void;
  onSaveCatalog: () => void;
  onPromote: (kind: "unit" | "category" | "vendor", code: string, label: string) => void;
}) {
  const [tab, setTab] = useState<"resources" | "vendors" | "units" | "categories">("resources");
  const [q, setQ] = useState("");
  const resources = (project.resourceMaster ?? []).filter((r) => `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="main">
      <PageHead crumb="Masters" title="Company masters">
        <button className="b" type="button" onClick={onSaveCatalog}>Save catalogue</button>
        <button className="b p" type="button" disabled={locked} onClick={() => onPane("resource")}>Add resource</button>
      </PageHead>
      <div className="tabs">
        <button type="button" className={tab === "resources" ? "on" : ""} onClick={() => setTab("resources")}>Resources {project.resources.length}</button>
        <button type="button" className={tab === "vendors" ? "on" : ""} onClick={() => setTab("vendors")}>Vendors {project.vendors.length}</button>
        <button type="button" className={tab === "units" ? "on" : ""} onClick={() => setTab("units")}>Units {project.units.length}</button>
        <button type="button" className={tab === "categories" ? "on" : ""} onClick={() => setTab("categories")}>Categories {project.categories.length}</button>
      </div>
      {tab === "resources" ? (
        <section className="card scroll">
          <div style={{ padding: 8 }}><label className="l" htmlFor="mf">Filter resources<input id="mf" className="i" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Unit</th><th className="r">Price</th></tr></thead>
            <tbody>
              {(resources.length ? resources : []).slice(0, 40).map((row) => (
                <tr key={row.code}><td className="m">{row.code}</td><td>{row.name}</td><td>{row.category}</td><td>{row.unit}</td><td className="m r">{num(row.rate)}</td></tr>
              ))}
              {!resources.length ? project.resources.slice(0, 40).map((row) => (
                <tr key={row.project_code}><td className="m">{row.project_code}</td><td>{row.description}</td><td>{row.category}</td><td>{row.unit}</td><td className="m r">{num(row.project_rate ?? 0)}</td></tr>
              )) : null}
            </tbody>
          </table>
          <p style={{ padding: 8 }}>Company prices apply to every new job. A price changed inside this job stays here until you promote it from the resource detail.</p>
        </section>
      ) : null}
      {tab === "vendors" ? (
        <>
          <SimpleRows rows={project.vendors.map((v) => ({ id: v.id, a: v.name, b: "" }))} addLabel="Add vendor" locked={locked} onAdd={(name) => onCommit({ ...project, vendors: [...project.vendors, { id: newId("ven"), name }] })} />
          {project.vendors[0] ? <button className="b" type="button" onClick={() => onPromote("vendor", project.vendors[0]!.id, project.vendors[0]!.name)}>Promote {project.vendors[0].name}</button> : null}
        </>
      ) : null}
      {tab === "units" ? <SimpleRows rows={project.units.map((u) => ({ id: u.code, a: u.code, b: u.symbol || u.description }))} addLabel="Add unit" locked={locked} onAdd={(name) => onCommit({ ...project, units: [...project.units, { code: name.slice(0, 8).toUpperCase(), description: name, symbol: name }] })} /> : null}
      {tab === "categories" ? <SimpleRows rows={project.categories.map((c) => ({ id: c.code, a: c.code, b: c.description }))} addLabel="Add category" locked={locked} onAdd={(name) => onCommit({ ...project, categories: [...project.categories, { code: name.slice(0, 8).toUpperCase(), description: name }] })} /> : null}
    </div>
  );
}

function SimpleRows({ rows, addLabel, locked, onAdd }: { rows: Array<{ id: string; a: string; b: string }>; addLabel: string; locked: boolean; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <section className="card" style={{ padding: 12 }}>
      <table><thead><tr><th>Code</th><th>Name</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td className="m">{r.a}</td><td>{r.b || r.a}</td></tr>)}</tbody></table>
      <form style={{ display: "flex", gap: 8, marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (!name.trim() || locked) return; onAdd(name.trim()); setName(""); }}>
        <input className="i" aria-label={addLabel} value={name} onChange={(e) => setName(e.target.value)} placeholder={addLabel} />
        <button className="b p" type="submit" disabled={locked}>{addLabel}</button>
      </form>
    </section>
  );
}

export function CategoriesScreen({ project, locked, onCommit }: { project: LoadedProject; locked: boolean; onCommit: (next: LoadedProject) => void }) {
  function update(code: string, patch: Partial<CategoryRow>) {
    onCommit({ ...project, categories: project.categories.map((c) => c.code === code ? { ...c, ...patch } : c) });
  }
  function move(index: number, dir: -1 | 1) {
    const next = project.categories.slice();
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const [row] = next.splice(index, 1);
    next.splice(j, 0, row!);
    onCommit({ ...project, categories: next });
  }
  return (
    <div className="main">
      <PageHead crumb="Settings › Cost categories" title="Cost categories">
        <button className="b p" type="button" disabled={locked} onClick={() => onCommit({ ...project, categories: [...project.categories, { code: `C${project.categories.length + 1}`, description: "New category" }] })}>Add category</button>
      </PageHead>
      <p style={{ margin: 0, color: "#2c4558" }}>Rate analysis groups components by these names. Order is the order on the build-up.</p>
      <section className="card scroll">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th /></tr></thead>
          <tbody>
            {project.categories.map((row, index) => (
              <tr key={row.code}>
                <td><input className="i m" aria-label="Code" disabled={locked} value={row.code} onChange={(e) => update(row.code, { code: e.target.value })} /></td>
                <td><input className="i" aria-label="Name" disabled={locked} value={row.description} onChange={(e) => update(row.code, { description: e.target.value })} /></td>
                <td style={{ display: "flex", gap: 4 }}>
                  <button className="b s" type="button" disabled={locked || index === 0} onClick={() => move(index, -1)}>Up</button>
                  <button className="b s" type="button" disabled={locked || index === project.categories.length - 1} onClick={() => move(index, 1)}>Down</button>
                  <button className="b s d" type="button" disabled={locked} onClick={() => onCommit({ ...project, categories: project.categories.filter((c) => c.code !== row.code) })}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function SettingsScreen({
  project,
  session,
  license,
  licenseBusy,
  locked,
  onCommit,
  onPane,
  onRefresh,
  onAccount,
  onPricing,
  onSignOut,
  onCheckUpdate,
  onCompare,
  initialTab = "calc",
}: {
  project: LoadedProject;
  session: Session;
  license: LicenseSession;
  licenseBusy: boolean;
  locked: boolean;
  onCommit: (next: LoadedProject) => void;
  onPane: (pane: Pane) => void;
  onRefresh: () => void;
  onAccount: () => void;
  onPricing: () => void;
  onSignOut: () => void;
  onCheckUpdate: () => void;
  onCompare: () => void;
  initialTab?: string;
}) {
  const [tab, setTab] = useState(initialTab);
  const tabs = [
    ["calc", "Calculation"],
    ["categories", "Cost categories"],
    ["users", "Users and roles"],
    ["licence", "Licence and devices"],
    ["legal", "Legal"],
    ["updates", "Updates"],
    ["backup", "Backup"],
  ];
  const tenant = session.kind === "tenant" ? session.tenant : null;
  return (
    <div className="main">
      <div className="split">
        <nav className="card" style={{ width: 220, padding: 8 }} aria-label="Settings sections">
          {tabs.map(([id, label]) => (
            <button key={id} className={`nb${tab === id ? " on" : ""}`} type="button" onClick={() => (id === "categories" ? onPane("categories") : setTab(id))}>{label}</button>
          ))}
        </nav>
        <section className="grow" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PageHead crumb={`Settings › ${tabs.find((t) => t[0] === tab)?.[1]}`} title={tabs.find((t) => t[0] === tab)?.[1] ?? "Settings"} />
          {tab === "calc" ? (
            <section className="card" style={{ padding: 12, display: "grid", gap: 10, maxWidth: 520 }}>
              <label className="l">Currency<input className="i" disabled={locked} value={project.currency} onChange={(e) => onCommit({ ...project, currency: e.target.value.toUpperCase() })} /></label>
              <label className="l">Quantity policy
                <select className="i" disabled={locked} value={project.qtySource} onChange={(e) => onCommit({ ...project, qtySource: e.target.value as LoadedProject["qtySource"] })}>
                  <option value="client_qty">Client quantity</option>
                  <option value="qto_qty">Take-off quantity</option>
                  <option value="client_plus_adjustments">Client bill plus tender adjustments</option>
                </select>
              </label>
              <p>Bid Craft {APP_VERSION}. Money stays on this computer.</p>
            </section>
          ) : null}
          {tab === "users" && tenant ? (
            <section className="card scroll">
              <table>
                <thead><tr><th>User</th><th>Login</th><th>Role</th></tr></thead>
                <tbody>
                  {tenant.users.map((user) => (
                    <tr key={user.id}><td>{user.name}</td><td>{user.login}</td><td>{tenant.roles.find((r) => r.id === user.roleId)?.name}</td></tr>
                  ))}
                </tbody>
              </table>
              <p style={{ padding: 8 }}>{tenant.users.length} of {tenant.seatLimit} seats used.</p>
            </section>
          ) : null}
          {tab === "users" && !tenant ? <p>Owner session. Open a tenant to manage its users.</p> : null}
          {tab === "licence" ? (
            <LicensePanel session={license} busy={licenseBusy} onRefresh={onRefresh} onAccount={onAccount} onPricing={onPricing} onSignOut={onSignOut} />
          ) : null}
          {tab === "legal" ? (
            <section className="card" style={{ padding: 16 }}>
              <LegalBrowser />
            </section>
          ) : null}
          {tab === "updates" ? (
            <section className="card" style={{ padding: 12 }}>
              <p>Installed version {APP_VERSION}. The updater checks the Estimation release when this window is the desktop app.</p>
              <button className="b p" type="button" onClick={onCheckUpdate}>Check for updates</button>
            </section>
          ) : null}
          {tab === "backup" ? (
            <section className="card" style={{ padding: 12 }}>
              <p>Compare this job with another .aero file. Money conflicts stay in a queue until you pick a side.</p>
              <button className="b" type="button" onClick={onCompare}>Compare a replica</button>
            </section>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export function DesignScreen({ onToast }: { onToast: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [bad, setBad] = useState("");
  return (
    <div className="main">
      <div className="k">Foundation</div>
      <h1>Design system and states</h1>
      <p>One set of parts for the estimation screens. Status is never colour alone: every chip carries a word.</p>
      <div className="grid4">
        {[["Navy", "#102433"], ["Accent", "#0e6b56"], ["Blue", "#1d4e73"], ["Warn", "#9a4318"], ["Rail", "#d7e5ef"], ["Paper", "#e4eef3"], ["Paper 2", "#f5f9fb"], ["Danger", "#9b1c13"]].map(([name, hex]) => (
          <div key={name} className="card" style={{ padding: 10 }}><div style={{ height: 28, borderRadius: 4, background: hex, marginBottom: 6 }} /><strong>{name}</strong><div className="m">{hex}</div></div>
        ))}
      </div>
      <section className="card" style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="b p" type="button" onClick={() => onToast("Primary action")}>Primary</button>
        <button className="b" type="button">Secondary</button>
        <button className="b d" type="button">Danger</button>
        <button className="b" type="button" disabled>Disabled</button>
        <Chip>Done</Chip><Chip kind="w">Open</Chip><Chip kind="d">Blocked</Chip><Chip kind="g">Locked</Chip>
      </section>
      <section className="card" style={{ padding: 12, maxWidth: 420 }}>
        <label className="l">Quantity<input className={`i${bad ? " e" : ""}`} value={bad} onChange={(e) => setBad(e.target.value)} placeholder="0.00" /></label>
        {bad.startsWith("-") ? <p style={{ color: "#9b1c13" }}>Quantity cannot be negative.</p> : null}
      </section>
      <section className="card" style={{ padding: 12 }}>
        <strong>No overrides on this job</strong>
        <p>Every line uses the stack. Add an override from Margins.</p>
        <button className="b" type="button" onClick={() => setOpen(true)}>Show confirm</button>
      </section>
      {open ? (
        <section className="card" style={{ padding: 12, maxWidth: 480 }} role="dialog" aria-label="Confirm">
          <strong>Confirm this example?</strong>
          <p>This specimen only shows the confirm pattern. It does not change the job.</p>
          <div style={{ display: "flex", gap: 8 }}><button className="b" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="b p" type="button" onClick={() => { setOpen(false); onToast("Example confirmed."); }}>Confirm</button></div>
        </section>
      ) : null}
      <p className="m">1,234,567.89</p>
    </div>
  );
}
