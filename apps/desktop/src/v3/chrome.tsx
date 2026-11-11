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
    <div className="headrow">
      <div style={{ minWidth: 0 }}>
        {crumb ? <div style={{ fontSize: 13, color: "#2c4558" }}>{crumb}</div> : null}
        <h1>{title}</h1>
      </div>
      {children ? <div className="acts">{children}</div> : null}
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

function MenuButton({
  label,
  open,
  onOpen,
  children,
}: {
  label: string;
  open: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div className="menu-anchor">
      <button className="b t" type="button" aria-expanded={open} aria-haspopup="menu" onClick={onOpen}>
        {label}
      </button>
      {open ? (
        <div className="menu" role="menu">
          {children}
        </div>
      ) : null}
    </div>
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
  qtyDiffs,
  openQueries,
  sealed,
  showOwner,
  notice,
  onPane,
  onJobs,
  onOpen,
  onSave,
  onClose,
  onSignOut,
  onOwner,
  onAddItem,
  onAddSection,
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
  qtyDiffs: number;
  openQueries: number;
  sealed: boolean;
  showOwner: boolean;
  notice?: ReactNode;
  onPane: (pane: Pane) => void;
  onJobs: () => void;
  onOpen: () => void;
  onSave: () => void;
  onClose: () => void;
  onSignOut: () => void;
  onOwner?: () => void;
  onAddItem: () => void;
  onAddSection: () => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState<"file" | "edit" | "view" | "help" | null>(null);
  const [query, setQuery] = useState("");
  const [cmd, setCmd] = useState(false);
  const focused = pane === "clone" || pane === "component" || pane === "design";
  const workspace = !jobPane(pane) && !focused;

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = [
      ...JOB_NAV.flatMap((g) => g.items.map((i) => ({ pane: i.pane, label: i.label }))),
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
        document.getElementById("cm")?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave();
      }
      if (e.key === "Escape") {
        setCmd(false);
        setMenu(null);
      }
    }
    function onPointer(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (!(target instanceof Element)) return;
      if (!target.closest(".menu-anchor") && !target.closest(".cmd-anchor")) {
        setMenu(null);
        setCmd(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [onSave]);

  function go(next: Pane) {
    setCmd(false);
    setMenu(null);
    setQuery("");
    onPane(next);
  }

  function toggle(name: "file" | "edit" | "view" | "help") {
    setCmd(false);
    setMenu((current) => (current === name ? null : name));
  }

  function item(label: string, action: () => void) {
    return (
      <button key={label} className="b" type="button" role="menuitem" onClick={() => { setMenu(null); action(); }}>
        {label}
      </button>
    );
  }

  return (
    <div className="v3">
      <header className="hd">
        <Mark />
        <strong style={{ fontSize: 15 }}>Bid Craft</strong>
        <button className="b t" type="button" onClick={onJobs}>Jobs</button>
        <MenuButton label="File" open={menu === "file"} onOpen={() => toggle("file")}>
          {item("Open .aero", onOpen)}
          {item("Save", onSave)}
          {item("Close job", onClose)}
          {item("Sign out", onSignOut)}
        </MenuButton>
        <MenuButton label="Edit" open={menu === "edit"} onOpen={() => toggle("edit")}>
          {item("Add item", () => { onAddItem(); go("estimate"); })}
          {item("Add section", () => { onAddSection(); go("estimate"); })}
          {item("Working BOQ", () => go("estimate"))}
          {item("Take-off", () => go("takeoff"))}
          {item("Rate analysis", () => go("register"))}
          {item("Margins", () => go("margins"))}
        </MenuButton>
        <MenuButton label="View" open={menu === "view"} onOpen={() => toggle("view")}>
          {item("Dashboard", () => go("dashboard"))}
          {item("Client BOQ", () => go("source"))}
          {item("Submission BOQ", () => go("submit"))}
          {item("Reports", () => go("reports"))}
          {item("Finalise", () => go("finalise"))}
        </MenuButton>
        <MenuButton label="Help" open={menu === "help"} onOpen={() => toggle("help")}>
          {item("Design system", () => go("design"))}
          <span className="m" style={{ padding: "6px 10px" }}>Bid Craft {APP_VERSION}</span>
        </MenuButton>
        <span className="hd-job" title={`${projectName} ${location}`}>
          {projectName}
          <em>{location} · {revision}</em>
        </span>
        <span style={{ flex: 1 }} />
        <div className="cmd-anchor">
          <label htmlFor="cm" style={{ position: "absolute", left: -9999 }}>Command bar</label>
          <input
            id="cm"
            className="i"
            placeholder="Jump to a screen   Ctrl K"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCmd(true); setMenu(null); }}
            onFocus={() => { if (query.trim()) setCmd(true); }}
          />
          {cmd && hits.length ? (
            <div className="cmd" role="listbox">
              {hits.map((h) => (
                <button key={h.pane + h.label} type="button" className={h.pane === pane ? "on" : ""} onClick={() => go(h.pane)}>
                  {h.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <span className="c" style={{ background: "#1d4e73", color: "#fff" }}>{saved || "Not saved yet"}</span>
        <button className="b t" type="button" aria-label="Notifications" onClick={() => go("finalise")}>
          Alerts {unpriced + openQueries}
        </button>
        <button className="b t" type="button" onClick={() => go("settings")}>{who}</button>
      </header>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {focused ? null : workspace ? (
          <nav className="gn" aria-label="Workspace">
            {WORK_NAV.filter((item) => !item.owner || showOwner).map((item) => (
              <button
                key={item.label}
                className={`nb${item.pane && pane === item.pane ? " on" : ""}`}
                type="button"
                onClick={item.label === "Jobs" ? onJobs : item.owner ? onOwner : item.pane ? () => go(item.pane!) : undefined}
              >
                <span>{item.label}</span>
                {item.owner ? <Chip kind="g">Admin</Chip> : null}
              </button>
            ))}
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
                  {group.hint === "measure" && qtyDiffs ? <Chip kind="w">{qtyDiffs} differ</Chip> : null}
                  {group.hint === "price" && unpriced ? <Chip kind="w">{unpriced} unpriced</Chip> : null}
                  {group.hint === "submit" ? <Chip kind="g">{sealed ? "Sealed" : "Not sealed"}</Chip> : null}
                </div>
                {group.items.map((item) => {
                  const on =
                    item.pane === pane ||
                    (item.pane === "register" && analysisPane(pane)) ||
                    (item.pane === "buy" && pricePane(pane));
                  return (
                    <button key={item.label} className={`nb${on ? " on" : ""}`} type="button" aria-current={on ? "page" : undefined} onClick={() => go(item.pane)}>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        )}
        <div className="stage">
          {notice ? <div className="notice">{notice}</div> : null}
          {children}
        </div>
      </div>
      <Footer left={saved ? `${fileName} · ${saved}` : fileName} right={licence || `Bid Craft ${APP_VERSION}`} />
    </div>
  );
}
