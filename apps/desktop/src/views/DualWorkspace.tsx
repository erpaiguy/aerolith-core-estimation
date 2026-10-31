import { formatQty } from "@aerolith/shared";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { displayItemRef, findItemByKey, itemKeyOf } from "../bills";
import {
  addDrawing,
  addGroup,
  addMark,
  auditWorkspace,
  applyBuildUp,
  cycleGroupColor,
  drawingsOf,
  groupDragPayload,
  groupIdFromDrop,
  groupsOf,
  hotItemKeys,
  libraryOf,
  linkGroupToItem,
  marksOf,
  netOf,
  patchGroup,
  patchMark,
  readItemQuantityLink,
  readItemRateLink,
  saveBuildUpFromItem,
  zonesOf,
  type AuditIssue,
} from "../dimensionWorkspace";
import type { BoqColumnDef, LoadedProject, WorkingItem } from "../model";
import { EstimateView } from "./WorkspaceViews";
import { TakeoffView } from "./TakeoffView";
import { openDockedPane } from "../dualSync";

type Field = "quantity" | "description";

export function DualWorkspace({
  project,
  items,
  activity,
  layoutMode,
  selected,
  groupId,
  billFocus,
  locked,
  sourceLocked,
  auditOpen,
  phraseOpen,
  onAudit,
  onPhrase,
  onLayout,
  onActivity,
  onSelect,
  onSelectGroup,
  onSelectLine,
  selectedLineId,
  onProject,
  onPatch,
  onAdd,
  onAddSection,
  onRemove,
  onOpenRate,
  quotedCodes,
  clientColumns,
  workingColumns,
  onAddColumn,
  onRemoveColumn,
  tools,
  filterColumns = [],
}: {
  project: LoadedProject;
  items: WorkingItem[];
  activity: "takeoff" | "estimate";
  layoutMode: "split" | "focus";
  selected: string | null;
  groupId: string | null;
  billFocus: string | null;
  locked?: boolean;
  sourceLocked?: boolean;
  auditOpen: boolean;
  phraseOpen: boolean;
  onAudit: (open: boolean) => void;
  onPhrase: (open: boolean) => void;
  onLayout: (mode: "split" | "focus") => void;
  onActivity: (activity: "takeoff" | "estimate") => void;
  onSelect: (key: string) => void;
  onSelectGroup: (id: string | null) => void;
  onSelectLine: (id: string | null) => void;
  selectedLineId: string | null;
  onProject: (next: LoadedProject) => void;
  onPatch: (code: string, patch: Partial<WorkingItem>) => void;
  onAdd: () => void;
  onAddSection: () => void;
  onRemove: (code: string) => void;
  onOpenRate: (code: string) => void;
  quotedCodes?: Set<string>;
  clientColumns: LoadedProject["clientColumns"];
  workingColumns: LoadedProject["workingColumns"];
  onAddColumn: (col: LoadedProject["workingColumns"][number]) => void;
  onRemoveColumn: (id: string) => void;
  tools?: ReactNode;
  filterColumns?: BoqColumnDef[];
}) {
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState("");
  const [tab, setTab] = useState<"drawing" | "lines">(() => (groupsOf(project).length ? "drawing" : "lines"));
  const [phraseQuery, setPhraseQuery] = useState("");
  const [pending, setPending] = useState<null | { key: string; field: Field; groupId: string; x: number; y: number; zone: string }>(
    null,
  );
  const [focusTick, setFocusTick] = useState(0);
  const drawings = drawingsOf(project);
  const groups = groupsOf(project);
  const marks = marksOf(project);
  const active = groups.find((group) => group.id === groupId) ?? null;
  const drawing = drawings.find((sheet) => sheet.id === active?.drawingId) ?? drawings[0] ?? null;
  const zones = zonesOf(project);
  const q = query.trim().toLowerCase();
  const visibleGroups = groups.filter((group) => {
    if (zone && group.zone !== zone) return false;
    if (!q) return true;
    const sheet = drawings.find((row) => row.id === group.drawingId);
    return `${group.name} ${group.zone} ${sheet?.name ?? ""} ${sheet?.code ?? ""}`.toLowerCase().includes(q);
  });
  const hot = useMemo(() => hotItemKeys(project, groupId), [project, groupId]);
  const issues = useMemo(() => (auditOpen ? auditWorkspace(project) : []), [auditOpen, project]);
  const phrases = libraryOf(project).filter((row) => {
    const needle = phraseQuery.trim().toLowerCase();
    if (!needle) return true;
    return `${row.code} ${row.phrase} ${row.unit}`.toLowerCase().includes(needle);
  });

  useEffect(() => {
    if (!focusTick) return;
    setTab("drawing");
  }, [focusTick]);

  function selectGroup(id: string) {
    onSelectGroup(id);
    const hit = project.items.find(
      (item) => item.kind === "item" && (item.qtyLink ?? "").split("+").some((part) => part.trim() === `G:${id}` || part.includes(`G:${id}`)),
    );
    if (hit) onSelect(itemKeyOf(hit));
  }

  function selectItem(key: string) {
    onSelect(key);
    const item = findItemByKey(project.items, key);
    const read = item ? readItemQuantityLink(project, item) : null;
    const next = read?.groupIds[0];
    if (next) onSelectGroup(next);
  }

  const showDrawing = layoutMode === "split" || activity === "takeoff";
  const showEstimate = layoutMode === "split" || activity === "estimate";
  const emphasis = activity === "takeoff" ? "emphasis-takeoff" : "emphasis-estimate";

  return (
    <div className={`dual-shell ${emphasis}`}>
      <div className="dual-toolbar">
        <div className="tb-group" role="group" aria-label="Workspace layout">
          <button type="button" className={layoutMode === "split" ? "primary" : ""} onClick={() => onLayout("split")}>
            Split
          </button>
          <button type="button" className={layoutMode === "focus" && activity === "takeoff" ? "primary" : ""} onClick={() => onLayout("focus")}>
            Focus this view
          </button>
        </div>
        <button type="button" onClick={() => onPhrase(!phraseOpen)}>
          Rate phrases
        </button>
        <button type="button" onClick={() => onAudit(!auditOpen)}>
          Problems
        </button>
        <button
          type="button"
          onClick={() => void openDockedPane(activity === "takeoff" ? "estimate" : "takeoff")}
        >
          Undock {activity === "takeoff" ? "estimate" : "take-off"}
        </button>
        <span className="hint dual-hint">Commands Ctrl+K</span>
        <span className="sp" />
        {tools}
      </div>
      <div className={`dual-body ${layoutMode} ${emphasis}`}>
        <aside className="dual-rail" aria-label="Drawings and groups">
          <div className="zone-chips" role="toolbar" aria-label="Zones">
            <button type="button" className={zone === "" ? "on" : ""} onClick={() => setZone("")}>
              All zones
            </button>
            {zones.map((name) => (
              <button type="button" key={name} className={zone === name ? "on" : ""} onClick={() => setZone(name)}>
                {name}
              </button>
            ))}
          </div>
          <input
            className="takeoff-search"
            value={query}
            placeholder="Search drawings and groups"
            aria-label="Search drawings and groups"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="rail-block">
            <div className="rail-label">Drawings</div>
            {drawings.length === 0 ? <p className="hint">No drawings yet.</p> : null}
            {drawings.map((sheet) => (
              <button
                type="button"
                key={sheet.id}
                className={`rail-row ${drawing?.id === sheet.id ? "on" : ""}`}
                onClick={() => {
                  const first = groups.find((group) => group.drawingId === sheet.id);
                  if (first) selectGroup(first.id);
                }}
              >
                <span>{sheet.code}</span>
                <small>{sheet.name}</small>
              </button>
            ))}
            <button type="button" disabled={locked} onClick={() => onProject(addDrawing(project))}>
              Add drawing
            </button>
          </div>
          <div className="rail-block">
            <div className="rail-label">Groups</div>
            {visibleGroups.length === 0 ? <p className="hint">No groups in this zone.</p> : null}
            {visibleGroups.map((group) => {
              const net = netOf(project, group.id);
              return (
                <div key={group.id} className={`group-row ${group.parentId ? "child" : ""} ${group.id === groupId ? "on" : ""}`}>
                  <button
                    type="button"
                    className="swatch"
                    style={{ background: group.color }}
                    aria-label={`Change colour for ${group.name}`}
                    disabled={locked}
                    onClick={() => onProject(cycleGroupColor(project, group.id))}
                  />
                  <button
                    type="button"
                    className="group-drag"
                    draggable={!locked}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", groupDragPayload(group.id));
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => selectGroup(group.id)}
                  >
                    <span>
                      {group.cutout ? "Cutout · " : ""}
                      {group.name}
                    </span>
                    <small>
                      {Number.isFinite(net) ? formatQty(net) : "—"} {group.unit}
                      {group.zone ? ` · ${group.zone}` : ""}
                    </small>
                  </button>
                </div>
              );
            })}
          </div>
          {active ? (
            <div className="rail-block mark-editor">
              <div className="rail-label">{active.name}</div>
              <label>
                Name
                <input
                  value={active.name}
                  disabled={locked}
                  onChange={(event) => onProject(patchGroup(project, active.id, { name: event.target.value }))}
                />
              </label>
              <label>
                Zone
                <input
                  value={active.zone}
                  disabled={locked}
                  onChange={(event) => onProject(patchGroup(project, active.id, { zone: event.target.value }))}
                />
              </label>
              {marks
                .filter((mark) => mark.groupId === active.id)
                .map((mark) => (
                  <div key={mark.id} className="mark-fields">
                    <span>{mark.deduct ? "Cutout" : "Dimension"}</span>
                    {active.kind !== "count" ? (
                      <input
                        aria-label="Length"
                        type="number"
                        value={mark.length ?? ""}
                        disabled={locked}
                        onChange={(event) =>
                          onProject(patchMark(project, mark.id, { length: event.target.value === "" ? null : Number(event.target.value) }))
                        }
                      />
                    ) : null}
                    {active.kind === "area" ? (
                      <input
                        aria-label="Width"
                        type="number"
                        value={mark.width ?? ""}
                        disabled={locked}
                        onChange={(event) =>
                          onProject(patchMark(project, mark.id, { width: event.target.value === "" ? null : Number(event.target.value) }))
                        }
                      />
                    ) : null}
                    <input
                      aria-label="Count"
                      type="number"
                      value={mark.count ?? ""}
                      disabled={locked}
                      onChange={(event) =>
                        onProject(patchMark(project, mark.id, { count: event.target.value === "" ? null : Number(event.target.value) }))
                      }
                    />
                  </div>
                ))}
              <button type="button" disabled={locked} onClick={() => onProject(addMark(project, active.id, false))}>
                Add dimension
              </button>
            </div>
          ) : null}
        </aside>
        {showDrawing ? (
          <section className="dual-viewer" aria-label="Drawing">
            <div className="viewer-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "drawing"} className={tab === "drawing" ? "on" : ""} onClick={() => setTab("drawing")}>
                Drawing
              </button>
              <button type="button" role="tab" aria-selected={tab === "lines"} className={tab === "lines" ? "on" : ""} onClick={() => setTab("lines")}>
                Bill lines
              </button>
            </div>
            {tab === "lines" ? (
              <TakeoffView
                items={items}
                lines={project.qtoLines}
                onSelect={selectItem}
                selected={selected}
                selectedLineId={selectedLineId}
                onSelectLine={onSelectLine}
                onChangeLines={(lines) => onProject({ ...project, qtoLines: lines })}
                locked={locked}
                filterColumns={filterColumns}
              />
            ) : drawing ? (
              <div className="sheet-wrap">
                <div className="sheet-meta">
                  <strong>{drawing.code}</strong> {drawing.name}
                  {active ? <span> · {active.name}</span> : null}
                </div>
                <div className="sheet">
                  <svg viewBox="0 0 100 100" className="sheet-svg" role="img" aria-label={`${drawing.code} ${drawing.name}`}>
                    {marks
                      .filter((mark) => groups.find((group) => group.id === mark.groupId)?.drawingId === drawing.id)
                      .map((mark) => {
                        const group = groups.find((row) => row.id === mark.groupId);
                        if (!group) return null;
                        const hotMark = group.id === groupId;
                        return (
                          <rect
                            key={mark.id}
                            id={`mark-${mark.id}`}
                            x={mark.x}
                            y={mark.y}
                            width={Math.max(mark.w, 1)}
                            height={Math.max(mark.h, 1)}
                            fill={group.color}
                            fillOpacity={group.cutout || mark.deduct ? 0.18 : 0.38}
                            stroke={group.color}
                            strokeWidth={hotMark ? 1.6 : 0.6}
                            className={hotMark ? "hot" : ""}
                            onClick={() => selectGroup(group.id)}
                          >
                            <title>{`${group.name}: ${mark.label}`}</title>
                          </rect>
                        );
                      })}
                  </svg>
                </div>
                <div className="measure-strip" role="toolbar" aria-label="Measure">
                  <strong>{active ? active.name : "No group"}</strong>
                  <span>{active && Number.isFinite(netOf(project, active.id)) ? `${formatQty(netOf(project, active.id))} ${active.unit}` : "—"}</span>
                  <button type="button" disabled={locked} onClick={() => onProject(addGroup(project, "area", drawing.id))}>
                    Area
                  </button>
                  <button type="button" disabled={locked} onClick={() => onProject(addGroup(project, "length", drawing.id))}>
                    Length
                  </button>
                  <button type="button" disabled={locked} onClick={() => onProject(addGroup(project, "count", drawing.id))}>
                    Count
                  </button>
                  <button type="button" disabled={locked || !active} onClick={() => active && onProject(addMark(project, active.id, true))}>
                    Cutout
                  </button>
                </div>
              </div>
            ) : (
              <div className="takeoff-empty">
                <p>Add a drawing to start a dimension group.</p>
                <button type="button" disabled={locked} onClick={() => onProject(addDrawing(project))}>
                  Add drawing
                </button>
              </div>
            )}
          </section>
        ) : null}
        {showEstimate ? (
          <section className="dual-estimate" aria-label="Estimate">
            <EstimateView
              items={items}
              selected={selected}
              onSelect={selectItem}
              onOpenRate={onOpenRate}
              currency={project.currency}
              onPatch={onPatch}
              onAdd={onAdd}
              onAddSection={onAddSection}
              onRemove={onRemove}
              locked={locked}
              sourceLocked={sourceLocked}
              quotedCodes={quotedCodes}
              clientColumns={clientColumns}
              workingColumns={workingColumns}
              showBillColumn={!billFocus}
              billLabel={(id) => project.bills.find((bill) => bill.id === id)?.name ?? id}
              addDisabled={!billFocus}
              onAddColumn={onAddColumn}
              onRemoveColumn={onRemoveColumn}
              hotKeys={hot}
              linkFor={(item) => {
                const qty = readItemQuantityLink(project, item);
                const rate = readItemRateLink(project, item, item.linkedBoqCode ? displayItemRef(project, item.linkedBoqCode) : null);
                return { qtyState: qty.state, qtyTitle: qty.title, rateState: rate.state, rateTitle: rate.title };
              }}
              onShowSource={(key) => {
                const item = findItemByKey(project.items, key);
                const read = item ? readItemQuantityLink(project, item) : null;
                const next = read?.groupIds[0];
                if (next) onSelectGroup(next);
                onSelect(key);
                setTab("drawing");
                setFocusTick((n) => n + 1);
                onLayout("split");
                onActivity("takeoff");
              }}
              onToggleLock={(key) => {
                const item = findItemByKey(project.items, key);
                if (!item) return;
                onPatch(key, { qtyLinkLocked: !item.qtyLinkLocked });
              }}
              onDropGroup={(key, field, event) => {
                const id = groupIdFromDrop(event.dataTransfer.getData("text/plain"));
                const group = id ? groups.find((row) => row.id === id) : null;
                if (!group) return;
                setPending({ key, field, groupId: group.id, x: event.clientX, y: event.clientY, zone: group.zone });
              }}
            />
            {phraseOpen ? (
              <aside className="side-panel" aria-label="Rate phrases">
                <header>
                  <strong>Rate phrases</strong>
                  <button type="button" onClick={() => onPhrase(false)}>
                    Close
                  </button>
                </header>
                <input
                  value={phraseQuery}
                  placeholder="Search build-ups"
                  aria-label="Search rate phrases"
                  onChange={(event) => setPhraseQuery(event.target.value)}
                />
                <ul>
                  {phrases.map((phrase) => (
                    <li key={phrase.id}>
                      <button
                        type="button"
                        disabled={locked || !selected}
                        onClick={() => selected && onProject(applyBuildUp(project, selected, phrase.id))}
                      >
                        <b>{phrase.code}</b>
                        <span>{phrase.phrase}</span>
                        <small>{phrase.unit}</small>
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" disabled={locked || !selected} onClick={() => selected && onProject(saveBuildUpFromItem(project, selected))}>
                  Save selected analysis
                </button>
              </aside>
            ) : null}
            {auditOpen ? (
              <aside className="side-panel" aria-label="Problems">
                <header>
                  <strong>Problems</strong>
                  <button type="button" onClick={() => onAudit(false)}>
                    Close
                  </button>
                </header>
                {issues.length === 0 ? <p className="hint">No unused groups, broken links, or unpriced rows.</p> : null}
                <ul>
                  {issues.map((issue) => (
                    <li key={issue.id}>
                      <button type="button" onClick={() => jumpIssue(issue)}>
                        <b>{issueLabel(issue.kind)}</b>
                        <span>{issue.label}</span>
                        <small>{issue.detail}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
            ) : null}
          </section>
        ) : null}
      </div>
      {pending ? (
        <div className="drop-pop" style={{ left: Math.min(pending.x, window.innerWidth - 260), top: Math.min(pending.y, window.innerHeight - 220) }}>
          <strong>Link {groups.find((group) => group.id === pending.groupId)?.name}</strong>
          <label>
            Field
            <select
              value={pending.field}
              onChange={(event) => setPending({ ...pending, field: event.target.value as Field })}
            >
              <option value="quantity">Quantity</option>
              <option value="description">Description</option>
            </select>
          </label>
          <label>
            Zone
            <select value={pending.zone} onChange={(event) => setPending({ ...pending, zone: event.target.value })}>
              {[...new Set([pending.zone, ...zones, "Zone 1"])].filter(Boolean).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="tb-group">
            <button
              type="button"
              className="primary"
              onClick={() => {
                onProject(linkGroupToItem(project, pending.key, pending.groupId, pending.field, pending.zone));
                onSelect(pending.key);
                onSelectGroup(pending.groupId);
                setPending(null);
              }}
            >
              Link
            </button>
            <button type="button" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  function jumpIssue(issue: AuditIssue) {
    if (issue.itemKey) selectItem(issue.itemKey);
    if (issue.groupId) {
      onSelectGroup(issue.groupId);
      setTab("drawing");
    }
  }
}

function issueLabel(kind: AuditIssue["kind"]): string {
  if (kind === "unused-group") return "Unused group";
  if (kind === "broken-link") return "Broken link";
  return "Unpriced";
}
