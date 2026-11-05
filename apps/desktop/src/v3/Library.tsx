import { useState } from "react";
import { APP_VERSION } from "../auth/releaseConfig";
import type { LicenseSession } from "../auth/licenseState";
import { downloadSubmissionCsv, printSubmission } from "../reportExport";
import { mergeReportFormat, type ReportFormat } from "../reportFormat";
import { newId, type CategoryRow, type LoadedProject } from "../model";
import type { Session } from "../platform/store";
import { jobFigures, num } from "./figures";
import { Chip, PageHead } from "./chrome";
import { LicensePanel } from "../views/LicensePanel";
import type { Pane } from "./routes";

export function ReportsScreen({ project, billId, onPane, onSaveFormat }: { project: LoadedProject; billId: string | null; onPane: (pane: Pane) => void; onSaveFormat: (format: ReportFormat) => void }) {
  const fig = jobFigures(project, billId);
  const packets = [
    ["Submission BOQ", "Client bill with rates and Section 7"],
    ["Working BOQ", "Internal bill with our quantities"],
    ["Rate analysis sheets", "One page per item, resources and margin"],
    ["Resource schedule", "Totals by material, labour and plant"],
    ["Tender adjustments", "Quantity differences versus the client"],
    ["Client query log", "Questions and answers with dates"],
  ];
  const [pick, setPick] = useState(0);
  const [logo, setLogo] = useState(true);
  const [draft, setDraft] = useState(!project.sealedAt);
  function format() {
    return { ...mergeReportFormat(null), showLogo: logo };
  }
  return (
    <div className="main">
      <PageHead crumb="Reports" title="Report centre">
        <button className="b" type="button" onClick={() => downloadSubmissionCsv(project, format(), fig.total)}>Export Excel</button>
        <button className="b p" type="button" onClick={() => printSubmission(project, format(), fig.total, 0)}>Export PDF</button>
        <button className="b" type="button" onClick={() => onSaveFormat(format())}>Save options to the company</button>
      </PageHead>
      <div className="split">
        <section className="card" style={{ width: 320, padding: 8 }}>
          {packets.map((row, i) => (
            <button key={row[0]} className="ex" type="button" onClick={() => setPick(i)}>
              <span><strong>{row[0]}</strong><div style={{ color: "#2c4558" }}>{row[1]}</div></span>
              {pick === i ? <Chip>Preview</Chip> : null}
            </button>
          ))}
        </section>
        <section className="card grow" style={{ padding: 16 }}>
          <h2>{packets[pick]?.[0]} · {project.sealedAt ? "Sealed" : "Draft"}</h2>
          <p>{project.name}</p>
          <table>
            <thead><tr><th>No.</th><th>Description</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {fig.items.slice(0, 8).map((item) => (
                <tr key={item.id}><td className="m">{item.boqCode}</td><td>{item.description}</td><td className="m r">{num(item.result?.amount ?? 0)}</td></tr>
              ))}
              <tr className="sec"><td /><td>Grand total, QAR</td><td className="m r">{num(fig.total)}</td></tr>
            </tbody>
          </table>
          <p style={{ color: "#2c4558" }}>Full packet is generated on this computer. {fig.green ? "Working total is GREEN." : ""}</p>
          <button className="b s" type="button" onClick={() => onPane("submit")}>Open submission BOQ</button>
        </section>
        <aside className="ins">
          <h2>Options</h2>
          <label className="check"><input type="checkbox" checked={logo} onChange={(e) => setLogo(e.target.checked)} /> Company logo and footer</label>
          <label className="check"><input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Watermark draft pages</label>
          <p>This {draft ? "is a draft" : "prints without the draft marker"}. Sealed revisions can print without it.</p>
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
}) {
  const [tab, setTab] = useState("calc");
  const tabs = [
    ["calc", "Calculation"],
    ["categories", "Cost categories"],
    ["users", "Users and roles"],
    ["licence", "Licence and devices"],
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
        <button className="b" type="button" onClick={() => setOpen(true)}>Add override</button>
      </section>
      {open ? (
        <section className="card" style={{ padding: 12, maxWidth: 480 }} role="dialog" aria-label="Confirm">
          <strong>Seal revision R0?</strong>
          <p>Quantities, rates and margins are frozen.</p>
          <div style={{ display: "flex", gap: 8 }}><button className="b" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="b p" type="button" onClick={() => { setOpen(false); onToast("Rate posted."); }}>Seal revision</button></div>
        </section>
      ) : null}
      <p className="m">1,234,567.89</p>
    </div>
  );
}
