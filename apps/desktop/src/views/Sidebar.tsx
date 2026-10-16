import type { ReactNode } from "react";
import type { Activity } from "../model";
import { ACTIVITY_LABELS } from "../activityLabels";
import { BrandLockup, BrandMark, useSurfaceTone } from "./Brand";
import type { ThemeName } from "../theme";

export type SidebarTarget = Activity | "resources";

const GROUPS: Array<{ label: string; items: SidebarTarget[] }> = [
  { label: "Estimate", items: ["dashboard", "source", "takeoff", "estimate", "analysis", "margins"] },
  { label: "Commercial", items: ["queries", "buy", "submit", "finalise"] },
  { label: "Library", items: ["masters", "resources", "settings"] },
];

function labelOf(id: SidebarTarget): string {
  return id === "resources" ? "Resource master" : ACTIVITY_LABELS[id];
}

function Icon({ id }: { id: SidebarTarget }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true as const };
  const stroke = { stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<SidebarTarget, ReactNode> = {
    dashboard: <path d="M2 8h5V2H2v6zm7-4h5V2H9v2zm0 10h5V6H9v8zM2 14h5v-4H2v4z" {...stroke} />,
    source: <path d="M3 2.5h7l3 3V13.5H3v-11zM10 2.5V6h3.5" {...stroke} />,
    takeoff: <path d="M2.5 13.5h11M3.5 13.5V8M8 13.5V4.5M12.5 13.5V6.5" {...stroke} />,
    estimate: <path d="M3 3.5h10M3 8h10M3 12.5h6" {...stroke} />,
    analysis: <path d="M3 12.5l3.2-4 2.3 2.2L13 4.5" {...stroke} />,
    margins: <path d="M2.5 11.5c2-4 3.5-6 5.5-6s3.5 2 5.5 6" {...stroke} />,
    queries: <path d="M3 3.5h10v7H6.2L3 13V3.5z" {...stroke} />,
    buy: <path d="M3 4.5h10l-1 7H4l-1-7zM6 4.5V3.2A1.2 1.2 0 0 1 7.2 2h1.6A1.2 1.2 0 0 1 10 3.2v1.3" {...stroke} />,
    submit: <path d="M4 8.2l2.4 2.3L12 5M3 13.5h10" {...stroke} />,
    finalise: <path d="M3 2.5h10v11H3v-11zM5.5 6h5M5.5 8.5h5M5.5 11h3" {...stroke} />,
    masters: <path d="M3 6.5h10v7H3v-7zM5.5 6.5V4.2A1.2 1.2 0 0 1 6.7 3h2.6a1.2 1.2 0 0 1 1.2 1.2v2.3" {...stroke} />,
    resources: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" {...stroke} />,
    settings: <path d="M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM8 2.2v1.4M8 12.4v1.4M2.2 8h1.4M12.4 8h1.4M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1" {...stroke} />,
  };
  return <svg {...common}>{paths[id]}</svg>;
}

export function Sidebar({
  activity,
  masterOpen,
  collapsed,
  theme,
  projectName,
  revision,
  total,
  user,
  trial,
  showInspector = false,
  inspectorOpen = false,
  canView,
  onNavigate,
  onToggle,
  onTheme,
  onClose,
  onOpen,
  onSave,
  onToggleInspector,
}: {
  activity: Activity;
  masterOpen: boolean;
  collapsed: boolean;
  theme: ThemeName;
  projectName: string;
  revision: string;
  total: string;
  user: string;
  trial: string;
  showInspector?: boolean;
  inspectorOpen?: boolean;
  canView: (id: Activity) => boolean;
  onNavigate: (id: SidebarTarget) => void;
  onToggle: () => void;
  onTheme: (theme: ThemeName) => void;
  onClose: () => void;
  onOpen: () => void;
  onSave: () => void;
  onToggleInspector?: () => void;
}) {
  const tone = useSurfaceTone();
  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="Modules">
      <div className="sidebar-brand">
        {collapsed ? (
          <BrandMark size={22} tone={tone} />
        ) : (
          <BrandLockup size="sm" tone={tone} />
        )}
      </div>
      <div className="sidebar-job">
        <p className="job" title={projectName}>
          {projectName}
        </p>
        <p className="rev">{revision}</p>
        <p className="gold">{total}</p>
        <div className="sidebar-actions">
          <button type="button" title="Close" aria-label="Close" onClick={onClose}>
            {collapsed ? "×" : "Close"}
          </button>
          <button type="button" title="Open" aria-label="Open" onClick={onOpen}>
            {collapsed ? "↗" : "Open"}
          </button>
          <button className="primary" type="button" title="Save" aria-label="Save" onClick={onSave}>
            {collapsed ? "↓" : "Save"}
          </button>
          {showInspector ? (
            <button
              type="button"
              title={inspectorOpen ? "Hide inspector" : "Inspector"}
              aria-label={inspectorOpen ? "Hide inspector" : "Inspector"}
              onClick={onToggleInspector}
            >
              {collapsed ? "i" : inspectorOpen ? "Hide" : "Inspector"}
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="sidebar-collapse"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        onClick={onToggle}
      >
        <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
        {collapsed ? null : <span>Collapse</span>}
      </button>
      <div className="sidebar-scroll">
        {GROUPS.map((group) => {
          const items = group.items.filter((id) => id === "resources" || canView(id));
          if (!items.length) return null;
          return (
            <div className="sidebar-group" key={group.label}>
              {collapsed ? null : <p className="sidebar-label">{group.label}</p>}
              {items.map((id) => {
                const on = id === "resources" ? activity === "masters" && masterOpen : activity === id && !(id === "masters" && masterOpen);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`nav-btn ${on ? "on" : ""}`}
                    aria-current={on ? "page" : undefined}
                    title={labelOf(id)}
                    onClick={() => onNavigate(id)}
                  >
                    <Icon id={id} />
                    {collapsed ? null : <span>{labelOf(id)}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="sidebar-foot">
        <div className="sidebar-account">
          <p className="who" title={trial ? `${user}. ${trial}` : user}>
            {collapsed ? user.split(" · ")[0] : user}
          </p>
          {trial ? <p className="trial">{trial}</p> : null}
        </div>
        <button
          type="button"
          className="nav-btn"
          onClick={() => onTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2.2v1.3M8 12.5v1.3M2.2 8h1.3M12.5 8h1.3M4 4l.9.9M11.1 11.1 12 12M12 4l-.9.9M4.9 11.1 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="8" r="2.3" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {collapsed ? null : <span>{theme === "dark" ? "Light" : "Dark"}</span>}
        </button>
      </div>
    </aside>
  );
}
