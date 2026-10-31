import { useMemo, useState } from "react";
import { dockedPane } from "../dualSync";
import { recents, sessionScope, type Session } from "../platform/store";
import { isSoloTenant, tenantProjectsHint } from "../platform/tenant";
import { DataCard, EmptyState, FilterBar, StatusPill, type PillTone } from "../ui/enterprise";

export function HomeView({
  session,
  canImport = true,
  accountName = null,
  licenseLine = null,
  current = null,
  onNew,
  onOpen,
  onSampleSingle,
  onSampleCampus,
  onImport,
  onOpenPath,
  onResume,
  onRestore,
}: {
  session: Session;
  canImport?: boolean;
  accountName?: string | null;
  licenseLine?: string | null;
  current?: {
    name: string;
    value: string;
    revision: string;
    status: "Draft" | "Sealed" | "Sample";
    unpriced: number;
    sealed: boolean;
  } | null;
  onNew: () => void;
  onOpen: () => void;
  onOpenPath?: (path: string) => void;
  onResume?: () => void;
  onSampleSingle: () => void;
  onSampleCampus: () => void;
  onImport: () => void;
  onRestore?: () => void;
  onSignOut?: () => void;
  onOwnerPortal?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState("All");
  const tenant = session.kind === "tenant" ? session.tenant : null;
  const scope = sessionScope(session);
  const recent = scope ? recents(scope) : [];
  const user =
    session.kind === "tenant" ? session.tenant.users.find((u) => u.id === session.userId) : null;
  const owner =
    session.kind === "owner" ? "Owner" : accountName || user?.name || "Workspace";
  const solo = tenant ? isSoloTenant(tenant) : false;
  const cards = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      status: string;
      tone: PillTone;
      lines: string[];
      action: string;
      group: "Current" | "Samples" | "All";
      run: () => void;
    }> = [];
    if (current && onResume) {
      list.push({
        id: "current",
        title: current.name,
        status: current.status,
        tone: current.status === "Sealed" ? "sealed" : current.status === "Sample" ? "sample" : "draft",
        lines: [current.value, current.sealed ? current.revision : "No deadline", owner],
        action: "Open in Take-off",
        group: "Current",
        run: onResume,
      });
    }
    for (const job of recent) {
      list.push({
        id: job.path,
        title: job.name,
        status: "Saved",
        tone: "saved",
        lines: ["Open to total", "No deadline", owner],
        action: "Open",
        group: "All",
        run: () => onOpenPath?.(job.path),
      });
    }
    list.push(
      {
        id: "sample-single",
        title: "Interior refurbishment",
        status: "Sample",
        tone: "sample",
        lines: ["QAR 100,826,297.13", "No deadline", owner],
        action: "Open in Take-off",
        group: "Samples",
        run: onSampleSingle,
      },
      {
        id: "sample-campus",
        title: "Campus, three buildings",
        status: "Sample",
        tone: "sample",
        lines: ["Open to total", "No deadline", owner],
        action: "Open in Take-off",
        group: "Samples",
        run: onSampleCampus,
      },
      {
        id: "new",
        title: "New project",
        status: "Draft",
        tone: "draft",
        lines: ["Empty workbook", "No deadline", owner],
        action: "Create",
        group: "All",
        run: onNew,
      },
      {
        id: "open",
        title: "Open .aero",
        status: "Saved",
        tone: "saved",
        lines: ["Documents / Aerolith / Projects", "No deadline", owner],
        action: "Browse",
        group: "All",
        run: onOpen,
      },
    );
    if (canImport) {
      list.push({
        id: "import",
        title: "Import a bill",
        status: "Draft",
        tone: "draft",
        lines: ["Excel, PDF, or a scan", "No deadline", owner],
        action: "Start import",
        group: "All",
        run: onImport,
      });
    }
    if (onRestore) {
      list.push({
        id: "restore",
        title: "Restore draft",
        status: "Draft",
        tone: "warn",
        lines: ["Unsaved browser copy", "No deadline", owner],
        action: "Restore",
        group: "Current",
        run: onRestore,
      });
    }
    return list;
  }, [canImport, current, onImport, onNew, onOpen, onOpenPath, onRestore, onResume, onSampleCampus, onSampleSingle, owner, recent]);
  const shown = cards.filter((card) => {
    if (chip === "Current" && card.group !== "Current") return false;
    if (chip === "Samples" && card.group !== "Samples") return false;
    return card.title.toLowerCase().includes(query.trim().toLowerCase());
  });
  const listed = recent.length + (current ? 1 : 0);

  return (
    <div className="enterprise-module home-portfolio">
      {dockedPane() ? (
        <p className="hint">This window follows the main Bid Craft workspace. Open a job there and this view stays in step.</p>
      ) : null}
      <header className="module-chrome">
        <div>
          <p className="kicker">{solo ? "Solo workspace" : tenant?.name || "Workspace"}</p>
          <h1 className="view">Home</h1>
          <p className="hint">{licenseLine || "Jobs stay in this workspace."} {tenant ? tenantProjectsHint(tenant.id) : ""}</p>
        </div>
      </header>
      <section className="kpi-strip" aria-label="Workspace summary">
        <article>
          <span>Jobs listed</span>
          <strong>{listed}</strong>
        </article>
        <article>
          <span>Open job value</span>
          <strong>{current?.value ?? "—"}</strong>
        </article>
        <article>
          <span>Unpriced rows</span>
          <strong>{current ? current.unpriced : "—"}</strong>
        </article>
        <article>
          <span>Open job</span>
          <strong>{current ? <StatusPill tone={current.sealed ? "sealed" : "draft"}>{current.status}</StatusPill> : "None"}</strong>
        </article>
      </section>
      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Search projects"
        chips={["All", "Current", "Samples"]}
        chip={chip}
        onChip={setChip}
      />
      {shown.length === 0 ? (
        <EmptyState title="No matching projects" detail="Clear the search or switch the filter to All." />
      ) : (
        <div className="card-grid">
          {shown.map((card) => (
            <DataCard
              key={card.id}
              title={card.title}
              status={card.status}
              tone={card.tone}
              lines={card.lines}
              action={card.action}
              onOpen={card.run}
            />
          ))}
        </div>
      )}
    </div>
  );
}
