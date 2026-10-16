import { recents, sessionScope, type Session } from "../platform/store";
import { PublisherMark } from "./Brand";
import { isSoloTenant, tenantProjectsHint } from "../platform/tenant";
import { AppBar, ThemeButton, type BarMenuItem } from "./AppBar";
import type { ThemeName } from "../theme";

export function HomeView({
  session,
  canImport = true,
  accountName = null,
  licenseLine = null,
  theme,
  onTheme,
  onNew,
  onOpen,
  onSampleSingle,
  onSampleCampus,
  onImport,
  onOpenPath,
  onSignOut,
  onOwnerPortal,
}: {
  session: Session;
  canImport?: boolean;
  accountName?: string | null;
  licenseLine?: string | null;
  theme: ThemeName;
  onTheme: (theme: ThemeName) => void;
  onNew: () => void;
  onOpen: () => void;
  onOpenPath?: (path: string) => void;
  onSampleSingle: () => void;
  onSampleCampus: () => void;
  onImport: () => void;
  onSignOut: () => void;
  onOwnerPortal?: () => void;
}) {
  const tenant = session.kind === "tenant" ? session.tenant : null;
  const scope = sessionScope(session);
  const recent = scope ? recents(scope) : [];
  const user =
    session.kind === "tenant" ? session.tenant.users.find((u) => u.id === session.userId) : null;
  const who =
    session.kind === "owner"
      ? "Owner session"
      : (accountName || user?.name || "Workspace");
  const solo = tenant ? isSoloTenant(tenant) : false;
  const roleLine =
    session.kind === "owner"
      ? "Open a tenant job, or return to the owner portal."
      : [
          solo ? "Solo workspace" : session.role.name,
          tenant?.name,
          tenant && !solo ? `${tenant.users.length}/${tenant.seatLimit} seats` : null,
          session.impersonatedBy ? "vendor impersonation" : null,
        ]
          .filter(Boolean)
          .join(" · ");
  const trialLine = licenseLine
    ? `${licenseLine} Jobs stay in this workspace.`
    : "Jobs stay in this workspace.";
  const fileItems: BarMenuItem[] = [
    { label: "New tender", onSelect: onNew },
    { label: "Open .aero", onSelect: onOpen },
    ...(canImport ? [{ label: "Import bill", onSelect: onImport }] : []),
    ...(onOwnerPortal ? [{ label: "Owner portal", separatorBefore: true, onSelect: onOwnerPortal }] : []),
    { label: "Sign out", separatorBefore: !onOwnerPortal, onSelect: onSignOut },
  ];

  return (
    <div className="app shell">
      <AppBar showIdle user={who} menu={{ label: "File", items: fileItems }} />
      <aside className="sidebar" aria-label="Workspace">
        <div className="sidebar-scroll">
          <div className="sidebar-group">
            <p className="sidebar-label">Workspace</p>
            <button type="button" className="nav-btn on" aria-current="page">
              <span>Jobs</span>
            </button>
          </div>
        </div>
      </aside>
      <main className="stage">
      <div className="home">
        <h1>Open</h1>
        <p className="home-sub">{trialLine}</p>
        {recent.length === 0 ? (
          <p className="hint">
            No saved jobs yet. Save a .aero under{" "}
            {tenant ? tenantProjectsHint(tenant.id) : "Documents\\Aerolith\\Projects"}.
          </p>
        ) : (
          <>
          <h2 className="view">Recent</h2>
          {recent.map((r) => (
            <div className="file-row" key={r.path}>
              <div>
                <b>{r.name}</b>
                <div className="meta">{r.path}</div>
              </div>
              <button type="button" onClick={() => onOpenPath?.(r.path)}>
                Open
              </button>
            </div>
          ))}
          </>
        )}
        <h2 className="view" id="sample-jobs-title">Sample jobs</h2>
        <section className="sample-jobs" aria-labelledby="sample-jobs-title">
          <article className="sample-job">
            <p className="kicker">Single BOQ</p>
            <h2>Interior refurbishment</h2>
            <p>
              Medical Institute. Working total stays GREEN at QAR 100,826,297.13. Resource Prices, Client
              Queries and Take-off are seeded.
            </p>
            <button type="button" onClick={onSampleSingle}>
              Open sample
            </button>
          </article>
          <article className="sample-job is-featured">
            <p className="kicker">Multiple BOQs</p>
            <h2>Al Maha Campus, Lusail</h2>
            <p>
              Three issued bills — 10,000 / 15,000 / 2,500 m². Same item numbers on each bill. Rate
              links stay on one catalogue.
            </p>
            <button className="primary" type="button" onClick={onSampleCampus}>
              Open sample
            </button>
          </article>
        </section>
      </div>
      </main>
      <footer className="status" role="status">
        <span>{roleLine}</span>
        <span>{trialLine}</span>
        <PublisherMark tone={theme === "dark" ? "dark" : "light"} compact />
        <ThemeButton theme={theme} onTheme={onTheme} />
      </footer>
    </div>
  );
}
