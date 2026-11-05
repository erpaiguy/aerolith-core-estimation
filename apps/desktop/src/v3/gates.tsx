import { useState } from "react";
import { APP_VERSION } from "../auth/releaseConfig";
import { licenseStatus } from "../platform/crypto";
import { createTenant, issueLicense, logAudit, recents, savePlatform, sessionScope, type PlatformState, type Session } from "../platform/store";
import { isSoloTenant } from "../platform/tenant";
import { Mark } from "./chrome";
import { Chip } from "./chrome";

export function SignedOutView({
  jobs,
  edits,
  onSignIn,
}: {
  jobs: number;
  edits: number;
  onSignIn: () => void;
}) {
  return (
    <div className="v3" style={{ alignItems: "center", justifyContent: "center" }}>
      <section className="card" style={{ width: 520, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ width: 44, height: 44, borderRadius: 22, background: "#d7f0e6", display: "flex", alignItems: "center", justifyContent: "center", color: "#0a4f40", fontWeight: 700, fontSize: 20 }} aria-hidden="true">✓</span>
        <h2>You are signed out</h2>
        <div style={{ color: "#2c4558" }}>All jobs are saved on this computer. Nothing is waiting to upload.</div>
        <div className="row"><span>Jobs opened</span><span className="m">{jobs}</span></div>
        <div className="row"><span>Edits logged</span><span className="m">{edits}</span></div>
        <div className="row"><span>Version</span><span className="m">{APP_VERSION}</span></div>
        <button className="b p" type="button" onClick={onSignIn}>Sign in again</button>
      </section>
    </div>
  );
}

export function CloseJobDialog({
  name,
  note,
  onCancel,
  onDiscard,
  onSave,
}: {
  name: string;
  note: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div className="v3" style={{ alignItems: "center", justifyContent: "center", background: "rgba(16,36,51,0.35)" }}>
      <section className="card" style={{ width: 520, padding: 28, display: "flex", flexDirection: "column", gap: 14 }} aria-label="Close job dialog">
        <div className="k">Close job</div>
        <h1 style={{ fontSize: 22 }}>Save changes to {name}?</h1>
        <div className="card" style={{ padding: "8px 12px" }}>{note || "Unsaved edits stay on this computer until you save the .aero file."}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="b d" type="button" onClick={onDiscard}>Close without saving</button>
          <button className="b" type="button" onClick={onCancel}>Cancel</button>
          <button className="b p" type="button" onClick={onSave}>Save and close</button>
        </div>
      </section>
    </div>
  );
}

export function LandingView({
  session,
  who,
  licenseLine,
  canImport,
  onNew,
  onOpen,
  onImport,
  onSample,
  onCampus,
  onSignOut,
  onOwner,
  attention,
}: {
  session: Session;
  who: string;
  licenseLine: string;
  canImport: boolean;
  onNew: () => void;
  onOpen: () => void;
  onImport: () => void;
  onSample: () => void;
  onCampus: () => void;
  onSignOut: () => void;
  onOwner?: () => void;
  attention: string[];
}) {
  const tenant = session.kind === "tenant" ? session.tenant : null;
  const scope = sessionScope(session);
  const recent = scope ? recents(scope) : [];
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="v3">
      <header className="hd">
        <Mark />
        <strong>Bid Craft</strong>
        <span style={{ flex: 1 }} />
        <button className="b t" type="button">{who}</button>
      </header>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <nav className="gn" aria-label="Workspace">
          <button className="nb" type="button" disabled><span>Tender pipeline</span><span className="nw">New</span></button>
          <button className="nb" type="button" disabled><span>Tender calendar</span><span className="nw">New</span></button>
          <button className="nb on" type="button">Jobs</button>
          <button className="nb" type="button" disabled><span>Clients</span><span className="nw">New</span></button>
          <button className="nb" type="button" disabled><span>Company library</span><span className="nw">New</span></button>
          <button className="nb" type="button" disabled><span>Benchmarks</span><span className="nw">New</span></button>
          {onOwner ? <button className="nb" type="button" onClick={onOwner}><span>Owner console</span><Chip kind="g">Admin</Chip></button> : null}
          <span style={{ flex: 1 }} />
          <div className="card" style={{ padding: "10px 12px" }}>
            <div className="k">Workspace</div>
            <div style={{ fontWeight: 700 }}>{tenant?.name ?? "Owner"}</div>
            <div style={{ color: "#2c4558", fontSize: 13 }}>{tenant ? `${isSoloTenant(tenant) ? "Solo" : "Studio"} · ${tenant.users.length} of ${tenant.seatLimit} seats` : "Owner session"}</div>
            {licenseLine ? <Chip>{licenseLine}</Chip> : null}
          </div>
          <button className="nb" type="button" onClick={onSignOut}>Sign out</button>
        </nav>
        <main className="main">
          <div className="k">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 style={{ fontSize: 26 }}>{hello}, {who}</h1>
          <div className="grid4">
            <button className="act" type="button" onClick={onNew}><b>New job</b><span>Start from a blank bill</span></button>
            <button className="act" type="button" onClick={onOpen}><b>Open .aero file</b><span>Open a job from this computer</span></button>
            <button className="act" type="button" disabled={!canImport} onClick={onImport}><b>Import client BOQ</b><span>Excel, CSV, or PDF</span></button>
            <button className="act" type="button" onClick={onSample}><b>Open sample job</b><span>Reference bill, single BOQ</span></button>
          </div>
          <section className="card" style={{ padding: 14, display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div className="k">Continue</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Sample and recent jobs</div>
              <div className="sp" style={{ marginTop: 8 }} aria-hidden="true"><i className="d" /><i className="d" /><i className="n" /><i /><i /><i /></div>
            </div>
            <button className="b" type="button" onClick={onCampus}>Campus sample</button>
            <button className="b p" type="button" onClick={onSample}>Open sample</button>
          </section>
          <div className="split">
            <section className="card grow scroll">
              <table>
                <thead><tr><th>Job</th><th>Last opened</th></tr></thead>
                <tbody>
                  {recent.map((job) => (
                    <tr key={job.path}><td><strong>{job.name}</strong><div className="m">{job.path}</div></td><td>{job.at.slice(0, 16)}</td></tr>
                  ))}
                  {!recent.length ? <tr><td colSpan={2}>No files opened on this computer yet. Open a sample to see the full job.</td></tr> : null}
                </tbody>
              </table>
            </section>
            <aside className="card" style={{ width: 300, padding: 12 }}>
              <div className="k">Needs attention</div>
              {attention.map((line) => <div key={line} style={{ padding: "6px 0" }}><Chip kind="w">Open</Chip> {line}</div>)}
              {!attention.length ? <p>Open a job to see unpriced lines and queries.</p> : null}
            </aside>
          </div>
        </main>
      </div>
      <footer className="foot"><span>Documents\Aerolith\Projects</span><span style={{ flex: 1 }} /><span>{licenseLine || `Bid Craft ${APP_VERSION}`}</span></footer>
    </div>
  );
}

export function OwnerScreen({
  platform,
  onPlatform,
  onImpersonate,
  onSignOut,
  onJobs,
}: {
  platform: PlatformState;
  onPlatform: (next: PlatformState) => void;
  onImpersonate: (session: Session) => void;
  onSignOut: () => void;
  onJobs: () => void;
}) {
  const [selected, setSelected] = useState(platform.tenants[0]?.id ?? "");
  const [filter, setFilter] = useState("");
  const tenant = platform.tenants.find((t) => t.id === selected) ?? platform.tenants[0];
  const rows = platform.tenants.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()));
  const expiring = platform.tenants.filter((t) => {
    const status = licenseStatus(t.trialStartedAt, t.licenseExpiresAt);
    return status.daysLeft >= 0 && status.daysLeft <= 30;
  }).length;
  return (
    <div className="v3">
      <header className="hd">
        <Mark />
        <strong>Bid Craft</strong>
        <Chip>Owner session</Chip>
        <span style={{ flex: 1 }} />
        <button className="b t" type="button" onClick={onSignOut}>Owner · Aerolith Core</button>
      </header>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <nav className="gn">
          <button className="nb" type="button" onClick={onJobs}>Jobs</button>
          <button className="nb on" type="button"><span>Owner console</span><Chip kind="g">Admin</Chip></button>
          <span style={{ flex: 1 }} />
          <button className="nb" type="button" onClick={onSignOut}>Sign out</button>
        </nav>
        <main className="main">
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <div><div className="k">Owner console</div><h1>Tenants and licences</h1></div>
            <span style={{ flex: 1 }} />
            <button className="b p" type="button" onClick={() => void (async () => {
              const name = window.prompt("Workspace name");
              if (!name) return;
              const created = await createTenant(name.trim(), "team", 5);
              const next = { ...platform, tenants: [...platform.tenants, created] };
              savePlatform(next);
              onPlatform(next);
            })()}>Add tenant</button>
          </div>
          <div className="grid4">
            <div className="card" style={{ padding: 10 }}><div className="k">Tenants</div><div className="m" style={{ fontSize: 24, fontWeight: 700 }}>{platform.tenants.length}</div></div>
            <div className="card" style={{ padding: 10 }}><div className="k">Seats in use</div><div className="m" style={{ fontSize: 24, fontWeight: 700 }}>{platform.tenants.reduce((s, t) => s + t.users.length, 0)} / {platform.tenants.reduce((s, t) => s + t.seatLimit, 0)}</div></div>
            <div className="card" style={{ padding: 10, borderColor: "#f0b88a", background: "#fff0e0" }}><div className="k">Expiring in 30 days</div><div className="m" style={{ fontSize: 24, fontWeight: 700 }}>{expiring}</div></div>
            <div className="card" style={{ padding: 10 }}><div className="k">Keys issued</div><div className="m" style={{ fontSize: 24, fontWeight: 700 }}>{platform.keys?.length ?? 0}</div></div>
          </div>
          <div className="split">
            <section className="card grow scroll">
              <div style={{ padding: 8 }}><label className="l" htmlFor="tf">Filter tenants<input id="tf" className="i" value={filter} onChange={(e) => setFilter(e.target.value)} /></label></div>
              <table>
                <thead><tr><th>Tenant</th><th>Plan</th><th className="r">Seats</th><th>Licence</th></tr></thead>
                <tbody>
                  {rows.map((row) => {
                    const status = licenseStatus(row.trialStartedAt, row.licenseExpiresAt);
                    return (
                      <tr key={row.id} className={tenant?.id === row.id ? "on" : ""} onClick={() => setSelected(row.id)}>
                        <td><strong>{row.name}</strong></td>
                        <td>{isSoloTenant(row) ? "Solo" : "Studio"}</td>
                        <td className="m r">{row.users.length} / {row.seatLimit}</td>
                        <td>{status.readOnly ? <Chip kind="d">Suspended</Chip> : status.daysLeft <= 30 ? <Chip kind="w">Expiring</Chip> : <Chip>Active</Chip>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
            {tenant ? (
              <aside className="card" style={{ width: 340, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="k">Selected tenant</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{tenant.name}</div>
                {tenant.users.map((user) => (
                  <div className="row" key={user.id}><span>{user.name}</span><Chip kind="g">{tenant.roles.find((r) => r.id === user.roleId)?.name}</Chip></div>
                ))}
                <button className="b" type="button" onClick={() => {
                  const issued = issueLicense(platform, tenant.id, tenant.seatLimit, { amount: 1, unit: "year" });
                  if (!issued) return;
                  onPlatform(logAudit(issued.state, tenant.id, { actor: "owner", action: "license_issued", detail: issued.key.key }));
                }}>Extend licence</button>
                <div className="banner"><strong>View as tenant is audited.</strong> The tenant sees who viewed, when and why.</div>
                <button className="b p" type="button" onClick={() => {
                  const admin = tenant.users.find((u) => u.roleId === "admin") ?? tenant.users[0];
                  const role = tenant.roles.find((r) => r.id === admin?.roleId);
                  if (!admin || !role) return;
                  const next = logAudit(platform, tenant.id, { actor: "owner", action: "impersonation", detail: `Owner signed in as ${admin.login}. Visible to this tenant.` });
                  onPlatform(next);
                  onImpersonate({ kind: "tenant", tenant: next.tenants.find((t) => t.id === tenant.id) ?? tenant, userId: admin.id, role, impersonatedBy: "owner" });
                }}>View as tenant</button>
              </aside>
            ) : null}
          </div>
        </main>
      </div>
      <footer className="foot">Owner actions are written to the audit log</footer>
    </div>
  );
}
