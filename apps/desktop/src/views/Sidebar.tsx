import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Icon } from "@phosphor-icons/react";
import {
  BooksIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChartLineUpIcon,
  ChatCircleTextIcon,
  ChecksIcon,
  FileTextIcon,
  FolderIcon,
  GearIcon,
  ListBulletsIcon,
  PercentIcon,
  RowsIcon,
  RulerIcon,
  SealCheckIcon,
  ShoppingBagIcon,
  SquaresFourIcon,
  SunIcon,
} from "@phosphor-icons/react";
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
  onLegal,
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
  onLegal: () => void;
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
      <FileMenu
        collapsed={collapsed}
        showInspector={showInspector}
        inspectorOpen={inspectorOpen}
        onOpen={onOpen}
        onSave={onSave}
        onClose={onClose}
        onToggleInspector={onToggleInspector}
        onLegal={onLegal}
      />
      <div className="sidebar-job">
        <p className="job" title={projectName}>
          {projectName}
        </p>
        <p className="rev">{revision}</p>
        <p className="gold">{total}</p>
      </div>
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
          <SunIcon size={16} aria-hidden />
          {collapsed ? null : <span>{theme === "dark" ? "Light" : "Dark"}</span>}
        </button>
      </div>
    </aside>
  );
}

function FileMenu({
  collapsed,
  showInspector,
  inspectorOpen,
  onOpen,
  onSave,
  onClose,
  onToggleInspector,
  onLegal,
}: {
  collapsed: boolean;
  showInspector: boolean;
  inspectorOpen: boolean;
  onOpen: () => void;
  onSave: () => void;
  onClose: () => void;
  onToggleInspector?: () => void;
  onLegal: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 220;
      const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
      setPos({ top: rect.bottom + 4, left });
    };
    place();
    const items = () =>
      Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    const focusAt = (index: number) => {
      const list = items();
      if (!list.length) return;
      list[(index + list.length) % list.length]?.focus();
    };
    const focusTimer = window.setTimeout(() => focusAt(0), 0);
    const onDoc = (event: PointerEvent) => {
      const target = event.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      const list = items();
      const current = list.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusAt(current < 0 ? 0 : current + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusAt(current < 0 ? list.length - 1 : current - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusAt(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusAt(list.length - 1);
      }
    };
    const close = () => setOpen(false);
    window.addEventListener("pointerdown", onDoc, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("pointerdown", onDoc, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="sidebar-file">
      <button
        ref={btnRef}
        type="button"
        className="nav-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="File"
        title="File"
        onClick={() => setOpen((value) => !value)}
      >
        <FolderIcon size={16} aria-hidden />
        {collapsed ? null : <span>File</span>}
      </button>
      {open
        ? createPortal(
            <div ref={menuRef} className="file-menu" role="menu" aria-label="File" style={{ top: pos.top, left: pos.left }}>
              <button type="button" role="menuitem" onClick={() => run(onOpen)}>
                Open
              </button>
              <button type="button" role="menuitem" onClick={() => run(onSave)}>
                Save
              </button>
              <button type="button" role="menuitem" onClick={() => run(onClose)}>
                Close
              </button>
              {showInspector ? (
                <button type="button" role="menuitem" onClick={() => run(() => onToggleInspector?.())}>
                  {inspectorOpen ? "Hide inspector" : "Inspector"}
                </button>
              ) : null}
              <div className="file-menu-sep" role="separator" />
              <button type="button" role="menuitem" onClick={() => run(onLegal)}>
                Legal
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
