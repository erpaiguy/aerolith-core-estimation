import { recents, sessionScope, type Session } from "../platform/store";
import { BrandLockup, PublisherMark, useSurfaceTone } from "./Brand";
import { isSoloTenant, tenantProjectsHint } from "../platform/tenant";

export function HomeView({
  session,
  canImport = true,
  accountName = null,
  licenseLine = null,
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
  const tone = useSurfaceTone();
  const trialLine = licenseLine
    ? `${licenseLine} Jobs stay in this workspace.`
    : "Jobs stay in this workspace.";

  return (
    <div className="app backstage">
      <aside className="back-nav">
        <BrandLockup size="sm" tone={tone} />
        <div className="who">
          {who}
          <small>{roleLine}</small>
        </div>
        <button type="button" className="on">
          Open
        </button>
        <button type="button" onClick={onNew}>
          New
        </button>
        <button type="button" onClick={onOpen}>
          Open .aero
        </button>
        {canImport ? (
          <button type="button" onClick={onImport}>
            Import bill
          </button>
        ) : null}
        <div className="sp" />
        {onOwnerPortal ? (
          <button type="button" onClick={onOwnerPortal}>
            Owner portal
          </button>
        ) : null}
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
        <PublisherMark tone={tone} compact />
      </aside>
      <div className="home">
        <h1>Open</h1>
        <p className="home-sub">{trialLine}</p>
        {recent.length === 0 ? (
          <p className="hint">
            No saved jobs yet. Save a .aero under{" "}
            {tenant ? tenantProjectsHint(tenant.id) : "Documents\\Aerolith\\Projects"}.
          </p>
        ) : (
          recent.map((r) => (
            <div className="file-row" key={r.path}>
              <div>
                <b>{r.name}</b>
                <div className="meta">{r.path}</div>
              </div>
              <button type="button" onClick={() => onOpenPath?.(r.path)}>
                Open
              </button>
            </div>
          ))
        )}
        <section className="sample-jobs" aria-label="Sample jobs">
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
          <article className="sample-job">
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
    </div>
  );
}
