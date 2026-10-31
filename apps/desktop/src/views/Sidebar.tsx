import type { ReactNode } from "react";
import type { Activity } from "../model";
import { ACTIVITY_LABELS } from "../activityLabels";
import { BrandLockup, BrandMark, useSurfaceTone } from "./Brand";
import type { ThemeName } from "../theme";

export type SidebarTarget = Activity | "resources" | "home";

const PRIMARY: SidebarTarget[] = ["home", "source", "takeoff", "estimate", "buy", "submit", "masters", "reports", "settings"];
const MORE: SidebarTarget[] = ["analysis", "margins", "queries", "dashboard", "resources"];

function labelOf(id: SidebarTarget): string {
  if (id === "home") return "Home";
  if (id === "resources") return "Resource master";
  return ACTIVITY_LABELS[id];
}

function Icon({ id }: { id: SidebarTarget }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true as const };
  const stroke = { stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<SidebarTarget, ReactNode> = {
    home: <path d="M3 7.2 8 3.2l5 4V13H9.5V9.5h-3V13H3V7.2z" {...stroke} />,
    dashboard: <path d="M2 8h5V2H2v6zm7-4h5V2H9v2zm0 10h5V6H9v8zM2 14h5v-4H2v4z" {...stroke} />,
    source: <path d="M3 2.5h7l3 3V13.5H3v-11zM10 2.5V6h3.5" {...stroke} />,
    takeoff: <path d="M2.5 13.5h11M3.5 13.5V8M8 13.5V4.5M12.5 13.5V6.5" {...stroke} />,
    estimate: <path d="M3 3.5h10M3 8h10M3 12.5h6" {...stroke} />,
    analysis: <path d="M3 12.5l3.2-4 2.3 2.2L13 4.5" {...stroke} />,
    margins: <path d="M2.5 11.5c2-4 3.5-6 5.5-6s3.5 2 5.5 6" {...stroke} />,
    queries: <path d="M3 3.5h10v7H6.2L3 13V3.5z" {...stroke} />,
    buy: <path d="M3 4.5h10l-1 7H4l-1-7zM6 4.5V3.2A1.2 1.2 0 0 1 7.2 2h1.6A1.2 1.2 0 0 1 10 3.2v1.3" {...stroke} />,
    submit: <path d="M4 8.2l2.4 2.3L12 5M3 13.5h10" {...stroke} />,
    masters: <path d="M3 6.5h10v7H3v-7zM5.5 6.5V4.2A1.2 1.2 0 0 1 6.7 3h2.6a1.2 1.2 0 0 1 1.2 1.2v2.3" {...stroke} />,
    reports: <path d="M3 12.5V8M6.5 12.5V4.5M10 12.5V6.5M13.5 12.5V3" {...stroke} />,
    resources: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" {...stroke} />,
    settings: <path d="M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM8 2.2v1.4M8 12.4v1.4M2.2 8h1.4M12.4 8h1.4M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1" {...stroke} />,
  };
  return <svg {...common}>{paths[id]}</svg>;
}

export function Sidebar({
  activity,
  homeActive = false,
  masterOpen,
  collapsed,
  theme,
  canView,
  onNavigate,
  onHome,
  onToggle,
  onTheme,
}: {
  activity: Activity;
  homeActive?: boolean;
  masterOpen: boolean;
  collapsed: boolean;
  theme: ThemeName;
  projectName?: string;
  revision?: string;
  total?: string;
  user?: string;
  trial?: string;
  showInspector?: boolean;
  inspectorOpen?: boolean;
  canView: (id: Activity) => boolean;
  onNavigate: (id: SidebarTarget) => void;
  onHome?: () => void;
  onToggle: () => void;
  onTheme: (theme: ThemeName) => void;
  onClose?: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onToggleInspector?: () => void;
}) {
  const tone = useSurfaceTone();
  function isOn(id: SidebarTarget): boolean {
    if (id === "home") return homeActive;
    if (homeActive) return false;
    if (id === "resources") return activity === "masters" && masterOpen;
    return activity === id && !(id === "masters" && masterOpen);
  }
  function renderItem(id: SidebarTarget) {
    if (id !== "home" && id !== "resources" && !canView(id)) return null;
    const on = isOn(id);
    return (
      <button
        key={id}
        type="button"
        className={`nav-btn ${on ? "on" : ""}`}
        aria-current={on ? "page" : undefined}
        title={labelOf(id)}
        onClick={() => {
          if (id === "home") onHome?.();
          else onNavigate(id);
        }}
      >
        <Icon id={id} />
        {collapsed ? null : <span>{labelOf(id)}</span>}
      </button>
    );
  }
  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="Modules">
      <div className="sidebar-brand">
        {collapsed ? <BrandMark size={22} tone={tone} /> : <BrandLockup size="sm" tone={tone} />}
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
        <div className="sidebar-group">
          {collapsed ? null : <p className="sidebar-label">Workspace</p>}
          {PRIMARY.map(renderItem)}
        </div>
        <div className="sidebar-group">
          {collapsed ? null : <p className="sidebar-label">More</p>}
          {MORE.map(renderItem)}
        </div>
      </div>
      <div className="sidebar-foot">
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
