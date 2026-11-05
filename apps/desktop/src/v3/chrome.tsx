import { useEffect, useMemo, useState, type ReactNode } from "react";
import { APP_VERSION } from "../auth/releaseConfig";
import { num } from "./figures";
import { JOB_NAV, WORK_NAV, analysisPane, jobPane, pricePane, type Pane } from "./routes";

export function Mark() {
  return <span className="lg">BC</span>;
}

export function Chip({ kind, children }: { kind?: "w" | "g" | "d" | "n"; children: ReactNode }) {
  return <span className={`c${kind ? ` ${kind}` : ""}`}>{children}</span>;
}

export function PageHead({
  crumb,
  title,
  children,
}: {
  crumb: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 13, color: "#2c4558" }}>{crumb}</div>
        <h1>{title}</h1>
      </div>
      <span style={{ flex: 1 }} />
      {children}
    </div>
  );
}

export function Footer({ left, right }: { left: string; right: string }) {
  return (
    <footer className="foot">
      <span>{left}</span>
      <span style={{ flex: 1 }} />
      <span>{right}</span>
    </footer>
  );
}

export function Shell({
  pane,
  projectName,
  location,
  revision,
  total,
  who,
  saved,
  licence,
  fileName,
  unpriced,
  openQueries,
  sealed,
  showOwner,
  onPane,
  onJobs,
  onOpen,
  onSave,
  onClose,
  onSignOut,
  onOwner,
  children,
}: {
  pane: Pane;
  projectName: string;
  location: string;
  revision: string;
  total: number;
  currency: string;
  who: string;
  saved: string;
  licence: string;
  fileName: string;
  unpriced: number;
  openQueries: number;
  sealed: boolean;
  showOwner: boolean;
  onPane: (pane: Pane) => void;
  onJobs: () => void;
  onOpen: () => void;
  onSave: () => void;
  onClose: () => void;
  onSignOut: () => void;
  onOwner?: () => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState<"file" | "help" | null>(null);
  const [query, setQuery] = useState("");
  const [cmd, setCmd] = useState(false);
  const focused = pane === "clone" || pane === "component" || pane === "design";
  const workspace = !jobPane(pane) && !focused;

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = [
      ...JOB_NAV.flatMap((g) => g.items.filter((i) => i.pane).map((i) => ({ pane: i.pane as Pane, label: i.label }))),
      { pane: "enquiries" as Pane, label: "Supplier enquiries" },
      { pane: "compare" as Pane, label: "Compare and choose for bid" },
      { pane: "followup" as Pane, label: "Follow-up log" },
      { pane: "analysis" as Pane, label: "Rate build-up" },
      { pane: "categories" as Pane, label: "Cost categories" },
      { pane: "design" as Pane, label: "Design system" },
      { pane: "reports" as Pane, label: "Reports" },
      { pane: "masters" as Pane, label: "Masters" },
      { pane: "settings" as Pane, label: "Settings" },
    ];
    return pages.filter((p) => !q || p.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave();
      }
      if (e.key === "Escape") setCmd(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave]);

  function go(next: Pane) {
    setCmd(false);
    setMenu(null);
    onPane(next);
  }

  return (
    <div className="v3">
      <header className="hd">
        <Mark />
        <strong style={{ fontSize: 15 }}>Bid Craft</strong>
        <button className="b t" type="button" onClick={onJobs}>Jobs</button>
        <button className="b t" type="button" onClick={() => setMenu(menu === "file" ? null : "file")}>File</button>
        <button className="b t" type="button" onClick={() => go("estimate")}>Edit</button>
        <button className="b t" type="button" onClick={() => go("reports")}>View</button>
        <button className="b t" type="button" onClick={() => setMenu(menu === "help" ? null : "help")}>Help</button>
        <span style={{ marginLeft: 8 }}>
          {projectName} <span style={{ color: "#c5d4e0", marginLeft: 6 }}>{location} · {revision}</span>
        </span>
        <span style={{ flex: 1 }} />
        <label htmlFor="cm" style={{ position: "absolute", left: -9999 }}>Command bar</label>
        <input
          id="cm"
          className="i"
          style={{ width: 320, height: 30, background: "#1d4e73", borderColor: "#2c5f86", color: "#fff" }}
          placeholder="Jump to item, screen, resource   Ctrl K"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCmd(true); }}
          onFocus={() => setCmd(true)}
        />
        <span className="c" style={{ background: "#1d4e73", color: "#fff" }}>{saved || "Not saved yet"}</span>
        <button className="b t" type="button" aria-label="Notifications" onClick={() => go("finalise")}>
          Alerts {unpriced + openQueries}
        </button>
        <button className="b t" type="button" onClick={() => go("settings")}>{who}</button>
        {menu === "file" ? (
          <div className="menu" style={{ left: 168 }}>
            <button className="b" type="button" onClick={() => { setMenu(null); onOpen(); }}>Open .aero</button>
            <button className="b" type="button" onClick={() => { setMenu(null); onSave(); }}>Save</button>
            <button className="b" type="button" onClick={() => { setMenu(null); onClose(); }}>Close job</button>
            <button className="b" type="button" onClick={() => { setMenu(null); onSignOut(); }}>Sign out</button>
          </div>
        ) : null}
        {menu === "help" ? (
          <div className="menu" style={{ left: 360 }}>
            <button className="b" type="button" onClick={() => go("design")}>Design system</button>
            <span className="m" style={{ padding: "6px 10px" }}>Bid Craft {APP_VERSION}</span>
          </div>
        ) : null}
        {cmd && hits.length ? (
          <div className="cmd" role="listbox">
            {hits.map((h) => (
              <button key={h.pane + h.label} type="button" className={h.pane === pane ? "on" : ""} onClick={() => go(h.pane)}>
                {h.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {focused ? null : workspace ? (
          <nav className="gn" aria-label="Workspace">
            {WORK_NAV.filter((item) => !item.owner || showOwner).map((item) =>
              item.future || !item.pane ? (
                <button key={item.label} className="nb" type="button" disabled={item.future} onClick={item.label === "Jobs" ? onJobs : item.owner ? onOwner : undefined}>
                  <span>{item.label}</span>
                  {item.future ? <span className="nw">New</span> : item.owner ? <Chip kind="g">Admin</Chip> : null}
                </button>
              ) : (
                <button key={item.label} className={`nb${pane === item.pane ? " on" : ""}`} type="button" onClick={() => go(item.pane!)}>
                  <span>{item.label}</span>
                </button>
              ),
            )}
            <span style={{ flex: 1 }} />
            <button className="nb" type="button" onClick={onSignOut}>Sign out</button>
          </nav>
        ) : (
          <nav className="rl" aria-label="Job navigation">
            <div className="tc">
              <span className="k">Working total</span>
              <b className="m">QAR {num(total)}</b>
            </div>
            {JOB_NAV.map((group) => (
              <div key={group.label}>
                <div className="sg">
                  <span>{group.label}</span>
                  {group.hint === "tender" && openQueries ? <Chip kind="w">{openQueries} open</Chip> : null}
                  {group.hint === "measure" ? <Chip kind="w">Measure</Chip> : null}
                  {group.hint === "price" && unpriced ? <Chip kind="w">{unpriced} unpriced</Chip> : null}
                  {group.hint === "submit" ? <Chip kind="g">{sealed ? "Sealed" : "Not sealed"}</Chip> : null}
                </div>
                {group.items.map((item) => {
                  const on =
                    item.pane === pane ||
                    (item.pane === "register" && analysisPane(pane)) ||
                    (item.pane === "buy" && pricePane(pane));
                  if (item.future || !item.pane) {
                    return (
                      <button key={item.label} className="nb" type="button" disabled title="Not in this release">
                        <span>{item.label}</span>
                        <span className="nw">New</span>
                      </button>
                    );
                  }
                  return (
                    <button key={item.label} className={`nb${on ? " on" : ""}`} type="button" aria-current={on ? "page" : undefined} onClick={() => go(item.pane!)}>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>{children}</div>
      </div>
      <Footer left={`${fileName} · autosave on`} right={licence || `Bid Craft ${APP_VERSION}`} />
    </div>
  );
}
