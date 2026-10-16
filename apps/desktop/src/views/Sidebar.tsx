import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import {
  BooksIcon,
  ChartLineUpIcon,
  ChatCircleTextIcon,
  ChecksIcon,
  FileTextIcon,
  GearIcon,
  ListBulletsIcon,
  PercentIcon,
  RowsIcon,
  RulerIcon,
  SealCheckIcon,
  ShoppingBagIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import type { Activity } from "../model";
import { ACTIVITY_LABELS } from "../activityLabels";

export type SidebarTarget = Activity | "resources";

const GROUPS: Array<{ label: string; items: SidebarTarget[] }> = [
  { label: "Estimate", items: ["dashboard", "source", "takeoff", "estimate", "analysis", "margins"] },
  { label: "Commercial", items: ["queries", "buy", "submit", "finalise"] },
  { label: "Library", items: ["masters", "resources", "settings"] },
];

function labelOf(id: SidebarTarget): string {
  return id === "resources" ? "Resource master" : ACTIVITY_LABELS[id];
}

const ICONS: Record<SidebarTarget, Icon> = {
  dashboard: SquaresFourIcon,
  source: FileTextIcon,
  takeoff: RulerIcon,
  estimate: ListBulletsIcon,
  analysis: ChartLineUpIcon,
  margins: PercentIcon,
  queries: ChatCircleTextIcon,
  buy: ShoppingBagIcon,
  submit: ChecksIcon,
  finalise: SealCheckIcon,
  masters: BooksIcon,
  resources: RowsIcon,
  settings: GearIcon,
};

function NavIcon({ id }: { id: SidebarTarget }) {
  const Glyph = ICONS[id];
  return <Glyph size={16} aria-hidden />;
}

export function Sidebar({
  activity,
  masterOpen,
  collapsed,
  canView,
  onNavigate,
  onToggle,
}: {
  activity: Activity;
  masterOpen: boolean;
  collapsed: boolean;
  canView: (id: Activity) => boolean;
  onNavigate: (id: SidebarTarget) => void;
  onToggle: () => void;
}) {
  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="Modules">
      <button
        type="button"
        className="sidebar-collapse"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        onClick={onToggle}
      >
        {collapsed ? <CaretRightIcon size={16} aria-hidden /> : <CaretLeftIcon size={16} aria-hidden />}
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
                    <NavIcon id={id} />
                    {collapsed ? null : <span>{labelOf(id)}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
