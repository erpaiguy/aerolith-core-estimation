import { formatMoney, formatQty, formatRate } from "@aerolith/shared";
import { useEffect, useMemo, useState } from "react";
import {
  applyCustomRate,
  applyVendorPack,
  blankEnquiry,
  bookCoverage,
  bookSourceOf,
  blankReply,
  buyLanes,
  clearLineToAnalysis,
  compareFactors,
  downloadText,
  ensureQuoteFields,
  enquiryCsv,
  enquiryChipLabel,
  enquiryTargets,
  filterTargets,
  groupSummaryRows,
  groupTargets,
  headerFactorValue,
  importQuoteRows,
  issueEnquiry,
  laneTargets,
  lineFactorValue,
  needsManualConfirm,
  packsForLane,
  parseLaneId,
  parseQuoteCsv,
  printEnquiry,
  quotesForTarget,
  rateSpread,
  repliesForEnquiry,
  removeFieldDef,
  resourceSummaryAll,
  selectLowestInLane,
  selectQuoteLine,
  settleRows,
  syncEnquiryLines,
  trackEnquiry,
  trackLabel,
  upsertEnquiry,
  upsertFieldDef,
  upsertReply,
  vendorsInLane,
  writeQuoteLine,
  type BookSource,
  type BuyStage,
  type PackTarget,
  type ResourceSummaryRow,
} from "../buyProcurement";
import type { EnquiryPack, LoadedProject, QuoteFieldDef, QuoteReply, ResourceQuote } from "../model";
import { applyProjectResources, blankResource, nextResourceCode, uid } from "../projectCompute";
import { askConfirm } from "../ui/askConfirm";
import { QtyInput } from "../ui/QtyInput";
import { VirtualTable } from "../ui/VirtualTable";
import { DataTable } from "../ui/tableLayout";
import { MenuSelect } from "../ui/MenuSelect";

const ROOMS: Array<[BuyStage, string]> = [
  ["package", "Pack"],
  ["send", "Send"],
  ["receive", "Receive"],
  ["compare", "Award"],
];

type MatrixRow = { kind: "group"; key: string; label: string } | { kind: "line"; target: PackTarget };

function flattenGroups(targets: PackTarget[]): MatrixRow[] {
  const out: MatrixRow[] = [];
  for (const g of groupTargets(targets)) {
    out.push({ kind: "group", key: g.key, label: g.label });
    for (const target of g.rows) out.push({ kind: "line", target });
  }
  return out;
}

export function BuyView({
  project,
  onProject,
  locked,
  billId = null,
}: {
  project: LoadedProject;
  onProject: (next: LoadedProject) => void;
  locked?: boolean;
  billId?: string | null;
}) {
  const live = ensureQuoteFields(project);
  useEffect(() => {
    if (live !== project) onProject(live);
  }, [live, project, onProject]);
  const lanes = useMemo(() => buyLanes(live), [live]);
  const [laneId, setLaneId] = useState(lanes[0]?.id ?? "res:Material");
  const [room, setRoom] = useState<BuyStage | null>(null);
  const [type, setType] = useState("");
  const [sub, setSub] = useState("");
  const [focusPackId, setFocusPackId] = useState("");
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [keptAnalysis, setKeptAnalysis] = useState<Set<string>>(() => new Set());
  const billFilter = billId;
  const activeLane = lanes.find((l) => l.id === laneId) ?? lanes[0];
  const safeLaneId = activeLane?.id ?? lanes[0]?.id ?? "res:Material";
  const cov = bookCoverage(live, billFilter);
  const packs = packsForLane(live, safeLaneId);
  const targets = laneTargets(live, safeLaneId, billFilter);
  const quotedPct = cov.total ? (100 * cov.quoted) / cov.total : 0;
  const awardedPct = cov.total ? (100 * cov.awarded) / cov.total : 0;
  const analysisPct = cov.total ? (100 * cov.analysis) / cov.total : 0;
  const unsettled = settleRows(live, billFilter).filter((r) => !keptAnalysis.has(`${r.kind}:${r.code}`));
  const roomLabel = room ? ROOMS.find(([id]) => id === room)?.[1] : null;

  function openRoom(next: BuyStage, opts?: { laneId?: string; packId?: string; code?: string }) {
    if (opts?.laneId) {
      setLaneId(opts.laneId);
      setType("");
      setSub("");
    }
    if (opts?.packId) setFocusPackId(opts.packId);
    if (opts?.code) setFocusCode(opts.code);
    setRoom(next);
  }

  function goSummary() {
    setRoom(null);
    queueMicrotask(() => {
      if (!focusCode) return;
      const el = document.querySelector<HTMLElement>(`[data-book-code="${CSS.escape(focusCode)}"]`);
      el?.focus();
    });
  }

  function newPack(nextLane?: string, code?: string) {
    const id = nextLane ?? safeLaneId;
    const pack = blankEnquiry(live, id, live.vendors[0]?.name ?? "Vendor 1", billFilter);
    const scoped = code
      ? { ...pack, lines: pack.lines.map((l) => ({ ...l, included: l.targetCode === code })) }
      : pack;
    onProject(upsertEnquiry(live, scoped));
    openRoom("package", { laneId: id, packId: scoped.id, code });
  }

  return (
    <div className="buy-workspace">
      {locked ? (
        <p className="buy-lock-banner" role="status">
          This job is sealed / your role is view-only.
        </p>
      ) : null}
      <div className="buy-toolbar">
        <div className="buy-toolbar-main">
        {room ? (
          <>
            <button type="button" className="buy-home" onClick={goSummary}>
              Summary
            </button>
            <span className="buy-crumb" aria-hidden>
              /
            </span>
            <strong className="buy-title">{roomLabel}</strong>
            <div className="seg buy-stages" role="tablist" aria-label="Resource Prices room">
              {ROOMS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className={room === id ? "primary" : ""}
                  aria-selected={room === id}
                  onClick={() => setRoom(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <MenuSelect
              className="buy-compact"
              label="Category"
              value={safeLaneId}
              options={lanes.map((lane) => ({
                value: lane.id,
                label: `${lane.label} ${lane.count}`,
              }))}
              onChange={(id) => {
                setLaneId(id);
                setType("");
                setSub("");
              }}
            />
            <TypeFilters targets={targets} type={type} sub={sub} onType={setType} onSub={setSub} />
          </>
        ) : (
          <>
            <strong className="buy-title">Resource Prices</strong>
            <div className="buy-rooms" role="group" aria-label="Open a room">
              {ROOMS.map(([id, label]) => (
                <button key={id} type="button" onClick={() => openRoom(id)}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" disabled={locked} onClick={() => newPack()}>
              New pack
            </button>
            <button
              type="button"
              className={unsettled.length ? "buy-settle" : ""}
              disabled={locked}
              onClick={() => setSettleOpen(true)}
            >
              Settle rates
            </button>
          </>
        )}
        </div>
        <div
          className="buy-cov"
          title={`${cov.quoted} quoted · ${cov.awarded} awarded · ${cov.analysis} still on analysis of ${cov.total}`}
        >
          <span>
            quoted {cov.quoted} · awarded {cov.awarded} · still on analysis {cov.analysis}
          </span>
          <span className="buy-bars">
            <span className="bar">
              <i style={{ width: `${quotedPct}%` }} />
            </span>
            <span className="bar">
              <i className="total" style={{ width: `${awardedPct}%` }} />
            </span>
            <span className="bar">
              <i className="analysis" style={{ width: `${analysisPct}%` }} />
            </span>
          </span>
        </div>
      </div>
      <fieldset className="plain buy-body" disabled={locked}>
        {room == null ? (
          <SummaryStage
            project={live}
            billId={billFilter}
            focusCode={focusCode}
            onProject={onProject}
            onOpenPack={(lane, packId, code) =>
              openRoom("package", { laneId: lane, packId: packId ?? undefined, code })
            }
            onOpenEnquiry={(lane, packId, code, chip) =>
              openRoom(enquiryPhase(chip), { laneId: lane, packId: packId ?? undefined, code })
            }
            onOpenQuotes={(lane, packId, code) =>
              openRoom("receive", { laneId: lane, packId: packId ?? undefined, code })
            }
            onNewPack={newPack}
          />
        ) : null}
        {room === "package" ? (
          <PackageStage
            project={live}
            laneId={safeLaneId}
            packs={packs}
            type={type}
            sub={sub}
            billId={billFilter}
            focusPackId={focusPackId}
            onProject={onProject}
            onFocusPack={setFocusPackId}
            onIssue={() => setRoom("send")}
          />
        ) : null}
        {room === "send" ? (
          <SendStage
            project={live}
            laneId={safeLaneId}
            packs={packs}
            billId={billFilter}
            focusPackId={focusPackId}
            onProject={onProject}
            onFocusPack={setFocusPackId}
            onOpenQuotes={(id) => {
              setFocusPackId(id);
              setRoom("receive");
            }}
          />
        ) : null}
        {room === "receive" ? (
          <ReceiveStage
            project={live}
            laneId={safeLaneId}
            packs={packs}
            focusPackId={focusPackId}
            billId={billFilter}
            onProject={onProject}
            onFocusPack={setFocusPackId}
          />
        ) : null}
        {room === "compare" ? (
          <CompareStage
            project={live}
            laneId={safeLaneId}
            packs={packs}
            focusPackId={focusPackId}
            type={type}
            sub={sub}
            billId={billFilter}
            onProject={onProject}
          />
        ) : null}
      </fieldset>
      {settleOpen ? (
        <SettleSheet
          project={live}
          rows={unsettled}
          keptCount={keptAnalysis.size}
          onProject={onProject}
          onKeep={(row) =>
            setKeptAnalysis((prev) => new Set(prev).add(`${row.kind}:${row.code}`))
          }
          onOpenPack={(row) => {
            setSettleOpen(false);
            openRoom(row.enquiry === "quoted" ? "receive" : "package", {
              laneId: row.laneId,
              packId: row.packId ?? undefined,
              code: row.code,
            });
          }}
          onClose={() => setSettleOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TypeFilters({
  targets,
  type,
  sub,
  onType,
  onSub,
}: {
  targets: PackTarget[];
  type: string;
  sub: string;
  onType: (value: string) => void;
  onSub: (value: string) => void;
}) {
  const types = [...new Set(targets.map((t) => t.type?.trim() || "Ungrouped"))].sort((a, b) => a.localeCompare(b));
  const subs = [
    ...new Set(
      targets
        .filter((t) => !type || (t.type?.trim() || "Ungrouped") === type)
        .map((t) => t.subType?.trim())
        .filter((s): s is string => Boolean(s)),
    ),
  ].sort((a, b) => a.localeCompare(b));
  if (types.length <= 1 && subs.length === 0) return null;
  return (
    <>
      <MenuSelect
        className="buy-compact"
        label="Type"
        value={type}
        options={[
          { value: "", label: "All types" },
          ...types.map((name) => ({ value: name, label: name })),
        ]}
        onChange={(next) => {
          onType(next);
          onSub("");
        }}
      />
      {subs.length ? (
        <MenuSelect
          className="buy-compact"
          label="Sub-type"
          value={sub}
          options={[
            { value: "", label: "All sub-types" },
            ...subs.map((name) => ({ value: name, label: name })),
          ]}
          onChange={onSub}
        />
      ) : null}
    </>
  );
}

function sourceLabel(source: BookSource): string {
  return source;
}

function enquiryPhase(chip: ResourceSummaryRow["enquiry"]): BuyStage {
  if (chip === "quoted") return "receive";
  if (chip === "sent" || chip === "overdue") return "send";
  return "package";
}

function SummaryStage({
  project,
  billId = null,
  focusCode,
  onProject,
  onOpenPack,
  onOpenEnquiry,
  onOpenQuotes,
  onNewPack,
}: {
  project: LoadedProject;
  billId?: string | null;
  focusCode: string | null;
  onProject: (next: LoadedProject) => void;
  onOpenPack: (laneId: string, packId: string | null, code?: string) => void;
  onOpenEnquiry: (laneId: string, packId: string | null, code: string, chip: ResourceSummaryRow["enquiry"]) => void;
  onOpenQuotes: (laneId: string, packId: string | null, code?: string) => void;
  onNewPack: (laneId?: string, code?: string) => void;
}) {
  const currency = project.currency;
  const rows = useMemo(() => resourceSummaryAll(project, billId), [project, billId]);
  const groups = useMemo(() => groupSummaryRows(rows), [rows]);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const qtyTotal = rows.reduce((s, r) => s + r.qty, 0);
  const amountTotal = rows.reduce((s, r) => s + r.amount, 0);

  function isOpen(key: string) {
    return !closed.has(key);
  }
  function onToggleKey(key: string, nextOpen: boolean) {
    if (nextOpen === isOpen(key)) return;
    setClosed((prev) => {
      const next = new Set(prev);
      if (nextOpen) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="buy-book">
      <div className="buy-tools">
        <p className="hint">
          Applied rate is the only money you type here — it writes through to Rate Analysis and Working BOQ.
          Enquiry and Quotes open Pack, Send, Receive or Award; they do not apply a rate.
        </p>
        <button type="button" onClick={() => setClosed(new Set())}>
          Expand all
        </button>
        <button
          type="button"
          onClick={() => setClosed(new Set(groups.map((g) => g.laneId)))}
        >
          Collapse all
        </button>
        <span className="buy-sum-foot">
          {rows.length} lines · {groups.length} categories · qty {formatQty(qtyTotal)} · {formatMoney(amountTotal, currency)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="buy-empty">No resources on this BOQ yet. Link analysis lines or add a resource.</p>
      ) : (
        <div className="buy-grid buy-summary">
          <div className="buy-summary-list">
            {groups.map((group) => {
              const nestTypes = group.types.length > 1;
              return (
                <details
                  key={group.laneId}
                  className="buy-cat"
                  open={isOpen(group.laneId)}
                  onToggle={(e) => onToggleKey(group.laneId, e.currentTarget.open)}
                >
                  <summary>
                    <span className="buy-cat-name">{group.label}</span>
                    <span className="buy-cat-meta">
                      {group.types.reduce((n, t) => n + t.rows.length, 0)} lines · qty {formatQty(group.qty)} ·{" "}
                      {formatMoney(group.amount, currency)}
                    </span>
                    <button
                      type="button"
                      className="buy-group-pack"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onNewPack(group.laneId);
                      }}
                    >
                      New pack for {group.label}
                    </button>
                  </summary>
                  {nestTypes
                    ? group.types.map((typeGroup) => {
                        const typeKey = `${group.laneId}::${typeGroup.key}`;
                        return (
                          <details
                            key={typeKey}
                            className="buy-type"
                            open={isOpen(typeKey)}
                            onToggle={(e) => onToggleKey(typeKey, e.currentTarget.open)}
                          >
                            <summary>
                              <span className="buy-cat-name">{typeGroup.label}</span>
                              <span className="buy-cat-meta">{typeGroup.rows.length} lines</span>
                            </summary>
                            <SummaryTable
                              layoutKey={`buy-summary-${typeKey}`}
                              rows={typeGroup.rows}
                              currency={currency}
                              project={project}
                              focusCode={focusCode}
                              onProject={onProject}
                              onOpenPack={onOpenPack}
                              onOpenEnquiry={onOpenEnquiry}
                              onOpenQuotes={onOpenQuotes}
                              onNewPack={onNewPack}
                            />
                          </details>
                        );
                      })
                    : (
                      <SummaryTable
                        layoutKey={`buy-summary-${group.laneId}`}
                        rows={group.types[0]?.rows ?? []}
                        currency={currency}
                        project={project}
                        focusCode={focusCode}
                        onProject={onProject}
                        onOpenPack={onOpenPack}
                        onOpenEnquiry={onOpenEnquiry}
                        onOpenQuotes={onOpenQuotes}
                        onNewPack={onNewPack}
                      />
                    )}
                </details>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTable({
  layoutKey,
  rows,
  currency,
  project,
  focusCode,
  onProject,
  onOpenPack,
  onOpenEnquiry,
  onOpenQuotes,
  onNewPack,
}: {
  layoutKey: string;
  rows: ResourceSummaryRow[];
  currency: string;
  project: LoadedProject;
  focusCode: string | null;
  onProject: (next: LoadedProject) => void;
  onOpenPack: (laneId: string, packId: string | null, code?: string) => void;
  onOpenEnquiry: (laneId: string, packId: string | null, code: string, chip: ResourceSummaryRow["enquiry"]) => void;
  onOpenQuotes: (laneId: string, packId: string | null, code?: string) => void;
  onNewPack: (laneId?: string, code?: string) => void;
}) {
  return (
    <DataTable layoutKey={layoutKey}>
      <thead>
        <tr>
          <th>Code</th>
          <th>Description</th>
          <th>Unit</th>
          <th className="num">Qty</th>
          <th className="num">Applied rate</th>
          <th className="num">Amount</th>
          <th>Source</th>
          <th>Enquiry</th>
          <th className="num">Quotes</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const src = bookSourceOf(r);
          const receiveSame = r.receiveMin != null && r.receiveMin === r.receiveMax;
          const quotesText =
            r.receiveMin == null
              ? "—"
              : receiveSame
                ? formatRate(r.receiveMin, currency)
                : `${formatRate(r.receiveMin, currency)} – ${formatRate(r.receiveMax ?? r.receiveMin, currency)}`;
          const chip = enquiryChipLabel(r.enquiry);
          const enquiryText = r.packCount > 1 ? `${chip} · ${r.packCount}` : chip;
          return (
            <tr
              key={`${r.kind}:${r.code}`}
              className={focusCode === r.code ? "buy-row-focus" : ""}
            >
              <td>{r.code}</td>
              <td>{r.description}</td>
              <td>{r.unit ?? ""}</td>
              <td className="num">{formatQty(r.qty)}</td>
              <td className="num">
                <QtyInput
                  value={r.price}
                  moneyCurrency={currency}
                  aria-label={`Applied rate ${r.code}`}
                  onValue={(n) => onProject(applyCustomRate(project, r.kind, r.code, n ?? 0))}
                />
              </td>
              <td className="num">{formatMoney(r.amount, currency)}</td>
              <td>
                <span className={`source-badge ${src === "Typed" ? "working" : ""}`}>{sourceLabel(src)}</span>
              </td>
              <td>
                {r.enquiry === "none" ? (
                  "—"
                ) : (
                  <button
                    type="button"
                    className="buy-link-rate"
                    data-book-code={r.code}
                    onClick={() => onOpenEnquiry(r.laneId, r.packId, r.code, r.enquiry)}
                  >
                    {enquiryText}
                  </button>
                )}
              </td>
              <td className="num">
                {r.receiveCount ? (
                  <button
                    type="button"
                    className="buy-quotes-text"
                    data-book-code={r.code}
                    onClick={() => onOpenQuotes(r.laneId, r.packId, r.code)}
                  >
                    {quotesText}
                    {r.receiveCount > 1 ? <span className="hint"> · {r.receiveCount}</span> : null}
                  </button>
                ) : (
                  "—"
                )}
              </td>
              <td className="buy-row-actions">
                {r.packId ? (
                  <button type="button" data-book-code={r.code} onClick={() => onOpenPack(r.laneId, r.packId, r.code)}>
                    Open pack
                  </button>
                ) : (
                  <button type="button" data-book-code={r.code} onClick={() => onNewPack(r.laneId, r.code)}>
                    New pack from this line
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

function PackageStage({
  project,
  laneId,
  packs,
  type,
  sub,
  billId = null,
  focusPackId,
  onProject,
  onFocusPack,
  onIssue,
}: {
  project: LoadedProject;
  laneId: string;
  packs: EnquiryPack[];
  type: string;
  sub: string;
  billId?: string | null;
  focusPackId: string;
  onProject: (next: LoadedProject) => void;
  onFocusPack: (id: string) => void;
  onIssue: () => void;
}) {
  const { kind, category } = parseLaneId(laneId);
  const targets = filterTargets(laneTargets(project, laneId, billId), type, sub);
  const rows = flattenGroups(targets);
  const vendors = project.vendors.map((v) => v.name);
  const [packId, setPackId] = useState(focusPackId || packs[0]?.id || "");
  const pack = packs.find((p) => p.id === packId) ?? packs.find((p) => p.id === focusPackId) ?? packs[0] ?? null;
  const live = pack ? syncEnquiryLines(pack, laneTargets(project, laneId, billId)) : null;
  const vendorKnown = Boolean(live && vendors.includes(live.vendorName));

  useEffect(() => {
    if (focusPackId) setPackId(focusPackId);
  }, [focusPackId]);

  function save(next: EnquiryPack) {
    onProject(upsertEnquiry(project, next));
    setPackId(next.id);
    onFocusPack(next.id);
  }

  function addPack() {
    save(blankEnquiry(project, laneId, vendors[0] ?? "Vendor 1", billId));
  }

  function addResource() {
    const code = nextResourceCode(project.resources.map((r) => r.project_code));
    onProject(
      applyProjectResources(project, [...project.resources, blankResource(code, { description: `New ${category}`, category })]),
    );
  }

  function addVendor() {
    const name = live?.vendorName.trim();
    if (!name || vendors.includes(name)) return;
    onProject({ ...project, vendors: [...project.vendors, { id: uid("v"), name }] });
  }

  return (
    <>
      <div className="buy-tools">
        <button type="button" onClick={addPack}>
          New pack
        </button>
        {kind !== "boq" ? (
          <button type="button" onClick={addResource}>
            Add resource
          </button>
        ) : null}
        {live ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={() => save({ ...live, status: live.status === "issued" ? live.status : "draft" })}
            >
              Save pack
            </button>
            <button type="button" onClick={onIssue}>
              Send…
            </button>
            <button
              type="button"
              onClick={() =>
                save({
                  ...live,
                  lines: live.lines.map((l) => ({ ...l, included: true })),
                })
              }
            >
              Include all
            </button>
            <button
              type="button"
              onClick={() =>
                save({
                  ...live,
                  lines: live.lines.map((l) => ({ ...l, included: false })),
                })
              }
            >
              Include none
            </button>
            <MenuSelect
              className="buy-compact"
              label="Pack"
              value={live.id}
              options={packs.map((p) => ({
                value: p.id,
                label: `${p.vendorName} · ${p.status}`,
              }))}
              onChange={(id) => {
                setPackId(id);
                onFocusPack(id);
              }}
            />
            <label className="field buy-compact">
              Vendor
              <input list="buy-vendors" value={live.vendorName} onChange={(e) => save({ ...live, vendorName: e.target.value })} />
            </label>
            {live.vendorName.trim() && !vendorKnown ? (
              <button type="button" onClick={addVendor}>
                Add vendor
              </button>
            ) : null}
            <label className="field buy-compact buy-notes">
              Notes
              <input value={live.notes} onChange={(e) => save({ ...live, notes: e.target.value })} />
            </label>
          </>
        ) : (
          <span className="hint">Tick the lines this vendor should see.</span>
        )}
      </div>
      <datalist id="buy-vendors">
        {vendors.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="buy-grid">
        <VirtualTable
          fill
          layoutKey="buy-package"
          rowCount={rows.length}
          header={
            <thead>
              <tr>
                <th />
                <th>Code</th>
                <th>Description</th>
                <th>Specification</th>
                <th>Unit</th>
                <th className="num">Qty</th>
              </tr>
            </thead>
          }
          renderRow={(i) => {
            const row = rows[i]!;
            if (row.kind === "group") {
              return (
                <tr key={row.key} className="section">
                  <td colSpan={6}>{row.label}</td>
                </tr>
              );
            }
            const t = row.target;
            const line = live?.lines.find((l) => l.targetCode === t.code);
            const included = line?.included ?? true;
            return (
              <tr key={t.code}>
                <td>
                  <input
                    type="checkbox"
                    checked={included}
                    disabled={!live}
                    aria-label={`Include ${t.code}`}
                    onChange={(e) =>
                      live &&
                      save({
                        ...live,
                        lines: live.lines.map((l) => (l.targetCode === t.code ? { ...l, included: e.target.checked } : l)),
                      })
                    }
                  />
                </td>
                <td>{t.code}</td>
                <td>{t.description}</td>
                <td>
                  <input
                    className="cell"
                    value={line?.spec ?? t.spec}
                    disabled={!live}
                    aria-label={`Specification ${t.code}`}
                    onChange={(e) =>
                      live &&
                      save({
                        ...live,
                        lines: live.lines.map((l) => (l.targetCode === t.code ? { ...l, spec: e.target.value } : l)),
                      })
                    }
                  />
                </td>
                <td>{t.unit ?? ""}</td>
                <td className="num">
                  <QtyInput
                    value={line?.qty ?? t.qty}
                    disabled={!live}
                    aria-label={`Qty ${t.code}`}
                    onValue={(n) =>
                      live &&
                      save({
                        ...live,
                        lines: live.lines.map((l) => (l.targetCode === t.code ? { ...l, qty: n ?? 0 } : l)),
                      })
                    }
                  />
                </td>
              </tr>
            );
          }}
        />
      </div>
    </>
  );
}

function SendStage({
  project,
  laneId,
  packs,
  billId = null,
  focusPackId,
  onProject,
  onFocusPack,
  onOpenQuotes,
}: {
  project: LoadedProject;
  laneId: string;
  packs: EnquiryPack[];
  billId?: string | null;
  focusPackId: string;
  onProject: (next: LoadedProject) => void;
  onFocusPack: (id: string) => void;
  onOpenQuotes: (packId: string) => void;
}) {
  const ready = packs.filter((p) => p.lines.some((l) => l.included));
  const [packId, setPackId] = useState(focusPackId || ready[0]?.id || "");
  const pack = ready.find((p) => p.id === packId) ?? ready.find((p) => p.id === focusPackId) ?? ready[0] ?? null;
  const targets = laneTargets(project, laneId, billId);
  const live = pack ? syncEnquiryLines(pack, targets) : null;
  const lines = live?.lines.filter((l) => l.included) ?? [];

  useEffect(() => {
    if (focusPackId) setPackId(focusPackId);
  }, [focusPackId]);

  function save(next: EnquiryPack) {
    onProject(upsertEnquiry(project, next));
    setPackId(next.id);
    onFocusPack(next.id);
  }

  function issue(kind: "csv" | "print") {
    if (!pack || !live) return;
    const withLines = upsertEnquiry(project, live);
    const next = issueEnquiry(withLines, pack.id);
    const issuedPack = (next.enquiries ?? []).find((p) => p.id === pack.id) ?? live;
    if (kind === "csv") {
      downloadText(`enquiry-${issuedPack.vendorName.replace(/\s+/g, "-")}.csv`, enquiryCsv(next, issuedPack));
    } else {
      printEnquiry(next, issuedPack);
    }
    onProject(next);
  }

  return (
    <>
      <div className="buy-tools">
        {!live ? (
          <span className="hint">Build a pack on Pack, include the resources, then send from this tracker.</span>
        ) : (
          <>
            <MenuSelect
              className="buy-compact"
              label="Pack"
              value={live.id}
              options={ready.map((p) => ({
                value: p.id,
                label: `${p.vendorName} · ${trackLabel(trackEnquiry(project, p))} · ${p.lines.filter((l) => l.included).length} lines`,
              }))}
              onChange={(id) => {
                setPackId(id);
                onFocusPack(id);
              }}
            />
            <label className="field buy-compact">
              Quote due
              <input
                type="date"
                value={(live.dueAt ?? "").slice(0, 10)}
                onChange={(e) => save({ ...live, dueAt: e.target.value || null })}
              />
            </label>
            <button type="button" className="primary" onClick={() => issue("csv")}>
              Download CSV
            </button>
            <button type="button" onClick={() => issue("print")}>
              Print
            </button>
          </>
        )}
      </div>
      <div className="buy-track">
        <DataTable layoutKey="buy-track">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Status</th>
              <th className="num">Lines</th>
              <th>Issued</th>
              <th>Due</th>
              <th className="num">Quotes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {packs.length === 0 ? (
              <tr>
                <td colSpan={7}>No packs yet. Create a pack on Pack for the resources this vendor should see.</td>
              </tr>
            ) : (
              packs.map((p) => {
                const status = trackEnquiry(project, p);
                const n = repliesForEnquiry(project, p.id).length;
                return (
                  <tr key={p.id} className={p.id === packId ? "selected" : ""}>
                    <td>{p.vendorName}</td>
                    <td>
                      <span className={`badge ${status}`}>{trackLabel(status)}</span>
                    </td>
                    <td className="num">{p.lines.filter((l) => l.included).length}</td>
                    <td>{p.issuedAt ? p.issuedAt.slice(0, 10) : "—"}</td>
                    <td>{p.dueAt ? p.dueAt.slice(0, 10) : "—"}</td>
                    <td className="num">{n}</td>
                    <td>
                      {status === "quoted" || status === "sent" || status === "overdue" ? (
                        <button type="button" onClick={() => onOpenQuotes(p.id)}>
                          Receive
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </DataTable>
      </div>
      <div className="buy-grid">
        <VirtualTable
          fill
          layoutKey="buy-send"
          rowCount={lines.length}
          header={
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Specification</th>
                <th>Unit</th>
                <th className="num">Qty</th>
              </tr>
            </thead>
          }
          renderRow={(i) => {
            const l = lines[i]!;
            const desc = project.resources.find((r) => r.project_code === l.targetCode)?.description ?? l.spec;
            return (
              <tr key={l.id}>
                <td>{l.targetCode}</td>
                <td>{desc}</td>
                <td>{l.spec}</td>
                <td>{l.unit ?? ""}</td>
                <td className="num">{formatQty(l.qty)}</td>
              </tr>
            );
          }}
        />
      </div>
    </>
  );
}

function ReceiveStage({
  project,
  laneId,
  packs,
  focusPackId,
  billId = null,
  onProject,
  onFocusPack,
}: {
  project: LoadedProject;
  laneId: string;
  packs: EnquiryPack[];
  focusPackId: string;
  billId?: string | null;
  onProject: (next: LoadedProject) => void;
  onFocusPack: (id: string) => void;
}) {
  const vendors = vendorsInLane(project, laneId);
  const issued = packs.filter((p) => p.status === "issued");
  const pack = packs.find((p) => p.id === focusPackId) ?? issued[0] ?? packs[0] ?? null;
  const packId = pack?.id ?? "";
  const replies = packId ? repliesForEnquiry(project, packId) : [];
  const [replyId, setReplyId] = useState(replies[0]?.id ?? "");
  const reply = replies.find((r) => r.id === replyId) ?? replies[0] ?? null;
  const targets = enquiryTargets(project, pack, laneId, billId);
  const defs = project.quoteFieldDefs ?? [];
  const lineDefs = defs.filter((d) => d.scope !== "header" && d.id !== "spec");
  const [factorLabel, setFactorLabel] = useState("");
  const [factorScope, setFactorScope] = useState<"header" | "line" | "both">("both");

  useEffect(() => {
    if (!focusPackId) return;
    const match = repliesForEnquiry(project, focusPackId)[0];
    if (match) setReplyId(match.id);
  }, [focusPackId, project.quoteReplies]);

  function saveReply(next: QuoteReply) {
    const withReply = upsertReply(project, next);
    onProject({
      ...withReply,
      resourceQuotes: withReply.resourceQuotes.map((q) =>
        q.replyId === next.id
          ? { ...q, paymentTerms: next.paymentTerms, validUntil: next.validUntil, enquiryId: next.enquiryId }
          : q,
      ),
    });
    setReplyId(next.id);
    if (next.enquiryId) onFocusPack(next.enquiryId);
  }

  function addReply() {
    saveReply(blankReply(project, pack?.vendorName ?? vendors[0] ?? "Vendor 1", pack?.id ?? null));
  }

  function addField() {
    const label = factorLabel.trim();
    if (!label) return;
    onProject(
      upsertFieldDef(project, {
        id: uid("qf"),
        label,
        valueType: "text",
        scope: factorScope,
        compare: true,
      }),
    );
    setFactorLabel("");
  }

  function importFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseQuoteCsv(String(reader.result ?? ""), project.quoteFieldDefs).filter((r) => r.kind === "resource");
      const vendor = rows[0]?.vendor || reply?.vendorName || pack?.vendorName || vendors[0] || "Vendor 1";
      const enquiryId = reply?.enquiryId || pack?.id || null;
      const header = reply ?? blankReply(project, vendor, enquiryId);
      onProject(importQuoteRows(project, rows, { ...header, vendorName: vendor, enquiryId }));
      setReplyId(header.id);
    };
    reader.readAsText(file);
  }

  return (
    <>
      <div className="buy-tools">
        <button type="button" onClick={addReply}>
          New quote
        </button>
        <label className="field buy-compact">
          Factor
          <input
            value={factorLabel}
            placeholder="e.g. Warranty"
            onChange={(e) => setFactorLabel(e.target.value)}
          />
        </label>
        <MenuSelect
          className="buy-compact"
          label="Scope"
          value={factorScope}
          options={[
            { value: "both", label: "Header and line" },
            { value: "header", label: "Header" },
            { value: "line", label: "Line" },
          ]}
          onChange={(v) => setFactorScope(v as "header" | "line" | "both")}
        />
        <button type="button" onClick={addField} disabled={!factorLabel.trim()}>
          Add factor
        </button>
        <label className="field buy-compact">
          Import CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importFile(file);
              e.target.value = "";
            }}
          />
        </label>
        {reply ? (
          <>
            <MenuSelect
              className="buy-compact"
              label="Quote"
              value={reply.id}
              options={replies.map((r) => ({
                value: r.id,
                label: `${r.vendorName} · ${r.receivedAt.slice(0, 10)}`,
              }))}
              onChange={setReplyId}
            />
            <label className="field buy-compact">
              Vendor
              <input list="buy-vendors" value={reply.vendorName} onChange={(e) => saveReply({ ...reply, vendorName: e.target.value })} />
            </label>
            <MenuSelect
              className="buy-compact"
              label="Pack"
              value={reply.enquiryId ?? packId}
              options={packs.map((p) => ({
                value: p.id,
                label: `${p.vendorName} · ${trackLabel(trackEnquiry(project, p))}`,
              }))}
              onChange={(id) => {
                onFocusPack(id);
                saveReply({ ...reply, enquiryId: id || null });
              }}
            />
            <label className="field buy-compact">
              Valid until
              <input
                type="date"
                value={(reply.validUntil ?? "").slice(0, 10)}
                onChange={(e) => saveReply({ ...reply, validUntil: e.target.value || null })}
              />
            </label>
            <label className="field buy-compact">
              Payment terms
              <input value={reply.paymentTerms} onChange={(e) => saveReply({ ...reply, paymentTerms: e.target.value })} />
            </label>
            <label className="field buy-compact">
              Duration
              <input
                value={reply.duration}
                placeholder="e.g. 6 weeks"
                onChange={(e) => saveReply({ ...reply, duration: e.target.value })}
              />
            </label>
            {defs
              .filter((d) => d.scope !== "line" && !d.builtin)
              .map((d) => (
                <label className="field buy-compact" key={d.id}>
                  {d.label}
                  <input
                    type={d.valueType === "date" ? "date" : d.valueType === "number" || d.valueType === "money" ? "number" : "text"}
                    value={reply.headerFields[d.id] ?? ""}
                    onChange={(e) =>
                      saveReply({ ...reply, headerFields: { ...reply.headerFields, [d.id]: e.target.value } })
                    }
                  />
                </label>
              ))}
            <FactorToggles project={project} onProject={onProject} />
          </>
        ) : (
          <span className="hint">New quote, type rates, or import the CSV from Send. Quotes are scoped to this pack.</span>
        )}
      </div>
      <datalist id="buy-vendors">
        {vendors.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="buy-grid">
        <VirtualTable
          fill
          layoutKey="buy-receive"
          rowCount={targets.length}
          header={
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Asked spec</th>
                <th>Quoted spec</th>
                <th className="num">Rate</th>
                <th className="num">Quoted qty</th>
                <th>Remarks</th>
                {lineDefs.map((d) => (
                  <th key={d.id}>{d.label}</th>
                ))}
              </tr>
            </thead>
          }
          renderRow={(i) => {
            const t = targets[i]!;
            const q = quotesForTarget(project, t.kind, t.code).find((x) => x.vendorName === reply?.vendorName);
            if (!reply) {
              return (
                <tr key={t.code}>
                  <td>{t.code}</td>
                  <td>{t.description}</td>
                  <td>{pack?.lines.find((l) => l.targetCode === t.code)?.spec ?? t.spec}</td>
                  <td colSpan={4 + lineDefs.length} />
                </tr>
              );
            }
            return (
              <ReceiveRow
                key={t.code}
                target={t}
                askedSpec={pack?.lines.find((l) => l.targetCode === t.code)?.spec ?? t.spec}
                quote={q && "projectResourceCode" in q ? q : undefined}
                defs={lineDefs}
                onRate={(rate, extra) =>
                  onProject(
                    writeQuoteLine(project, t.kind, t.code, reply.vendorName, rate, {
                      ...extra,
                      replyId: reply.id,
                      enquiryId: reply.enquiryId,
                      validUntil: reply.validUntil,
                      paymentTerms: reply.paymentTerms,
                    }),
                  )
                }
              />
            );
          }}
        />
      </div>
    </>
  );
}

function ReceiveRow({
  target,
  askedSpec,
  quote,
  defs,
  onRate,
}: {
  target: PackTarget;
  askedSpec: string;
  quote: ResourceQuote | undefined;
  defs: QuoteFieldDef[];
  onRate: (rate: number, extra: Partial<ResourceQuote>) => void;
}) {
  return (
    <tr>
      <td>{target.code}</td>
      <td>{target.description}</td>
      <td>{askedSpec}</td>
      <td>
        <input
          value={quote?.lineFields?.spec ?? ""}
          onChange={(e) =>
            onRate(quote?.rate ?? 0, {
              quotedQty: quote?.quotedQty,
              remarks: quote?.remarks,
              lineFields: { ...(quote?.lineFields ?? {}), spec: e.target.value },
            })
          }
        />
      </td>
      <td className="num">
        <input
          className="cell num"
          type="number"
          step="any"
          value={quote?.rate ?? ""}
          onChange={(e) =>
            onRate(Number(e.target.value) || 0, {
              quotedQty: quote?.quotedQty,
              remarks: quote?.remarks,
              lineFields: quote?.lineFields,
            })
          }
        />
      </td>
      <td className="num">
        <QtyInput
          value={quote?.quotedQty}
          empty={null}
          aria-label="Quoted qty"
          onValue={(n) =>
            onRate(quote?.rate ?? 0, {
              quotedQty: n,
              remarks: quote?.remarks,
              lineFields: quote?.lineFields,
            })
          }
        />
      </td>
      <td>
        <input
          className="cell"
          value={quote?.remarks ?? ""}
          onChange={(e) =>
            onRate(quote?.rate ?? 0, { quotedQty: quote?.quotedQty, remarks: e.target.value, lineFields: quote?.lineFields })
          }
        />
      </td>
      {defs.map((d) => (
        <td key={d.id}>
          <input
            className="cell"
            value={quote?.lineFields?.[d.id] ?? ""}
            onChange={(e) =>
              onRate(quote?.rate ?? 0, {
                quotedQty: quote?.quotedQty,
                remarks: quote?.remarks,
                lineFields: { ...(quote?.lineFields ?? {}), [d.id]: e.target.value },
              })
            }
          />
        </td>
      ))}
    </tr>
  );
}

function CompareStage({
  project,
  laneId,
  packs,
  focusPackId,
  type,
  sub,
  billId = null,
  onProject,
}: {
  project: LoadedProject;
  laneId: string;
  packs: EnquiryPack[];
  focusPackId: string;
  type: string;
  sub: string;
  billId?: string | null;
  onProject: (next: LoadedProject) => void;
}) {
  const pack = packs.find((p) => p.id === focusPackId) ?? packs[0] ?? null;
  const included = new Set((pack?.lines ?? []).filter((l) => l.included).map((l) => l.targetCode));
  const allTargets = laneTargets(project, laneId, billId).filter((t) => !pack || included.has(t.code));
  const targets = filterTargets(allTargets, type, sub);
  const rows = flattenGroups(targets);
  const lineRows = rows.filter((r): r is { kind: "line"; target: PackTarget } => r.kind === "line");
  const vendors = vendorsInLane(project, laneId).filter((v) =>
    targets.some((t) => quotesForTarget(project, t.kind, t.code).some((q) => q.vendorName === v)),
  );
  const factors = compareFactors(project);
  const headerFactors = factors.filter((f) => f.id !== "rate" && f.scope !== "line");
  const lineFactors = factors.filter((f) => f.id !== "rate" && f.scope !== "header");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState({ row: 0, col: 0 });
  const currency = project.currency;
  const viewCodes = targets.map((t) => t.code);
  const partialCodes = picked.size > 0 ? [...picked] : viewCodes;
  const colCount = 5 + vendors.length;
  const rowHeight = lineFactors.length ? Math.min(92, 36 + lineFactors.length * 16) : 30;

  async function confirmTyped(codes?: string[]): Promise<boolean> {
    if (!needsManualConfirm(project, laneId, codes)) return true;
    return askConfirm("This overwrites a typed rate. Award the quote?");
  }

  async function awardVendor(vendor: string, codes?: string[]) {
    if (!(await confirmTyped(codes))) return;
    onProject(applyVendorPack(project, laneId, vendor, codes, true));
  }

  function toggle(code: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function keepAnalysis(codes: string[]) {
    let next = project;
    for (const code of codes) {
      const t = targets.find((x) => x.code === code);
      if (t) next = clearLineToAnalysis(next, t.kind, t.code);
    }
    onProject(next);
  }

  return (
    <>
      <div className="buy-tools">
        <button
          type="button"
          onClick={() => {
            void confirmTyped(viewCodes).then((ok) => {
              if (ok) onProject(selectLowestInLane(project, laneId, true, viewCodes));
            });
          }}
        >
          Award lowest
        </button>
        {vendors.map((v) => (
          <button key={v} type="button" onClick={() => awardVendor(v, partialCodes)}>
            {picked.size > 0 ? `Award ${v} to ${picked.size}` : `Award ${v}`}
          </button>
        ))}
        <button type="button" onClick={() => keepAnalysis(partialCodes)}>
          Keep analysis
        </button>
        <button
          type="button"
          onClick={() => {
            let next = project;
            for (const code of partialCodes) {
              const t = targets.find((x) => x.code === code);
              if (!t || t.kind !== "resource") continue;
              const res = project.resources.find((r) => r.project_code === code);
              if (res?.rate_source === "manual") next = clearLineToAnalysis(next, t.kind, t.code);
            }
            onProject(next);
          }}
        >
          Keep typed
        </button>
        <FactorToggles project={project} onProject={onProject} />
      </div>
      <div
        className="buy-grid buy-matrix"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setFocus((f) => ({ ...f, row: Math.min(lineRows.length - 1, f.row + 1) }));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setFocus((f) => ({ ...f, row: Math.max(0, f.row - 1) }));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setFocus((f) => ({ ...f, col: Math.min(vendors.length - 1, f.col + 1) }));
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            setFocus((f) => ({ ...f, col: Math.max(0, f.col - 1) }));
          } else if (e.key === "Enter") {
            const t = lineRows[focus.row]?.target;
            const vendor = vendors[focus.col];
            if (!t || !vendor) return;
            const q = quotesForTarget(project, t.kind, t.code).find((x) => x.vendorName === vendor);
            if (!q) return;
            void confirmTyped([t.code]).then((ok) => {
              if (ok) onProject(selectQuoteLine(project, t.kind, t.code, q.id, true));
            });
          }
        }}
      >
        <VirtualTable
          fill
          layoutKey="buy-compare"
          rowHeight={rowHeight}
          rowCount={rows.length}
          header={
            <thead>
              <tr>
                <th />
                <th>Code</th>
                <th>Description</th>
                {vendors.map((v) => (
                  <th key={v} className="buy-vendor">
                    {v}
                  </th>
                ))}
                <th>Awarded</th>
                <th />
              </tr>
              {headerFactors.length ? (
                <tr className="buy-vendor-meta">
                  <th colSpan={3}>Quote terms</th>
                  {vendors.map((v) => (
                    <th key={v} className="buy-vendor">
                      <FactorStack
                        items={headerFactors.map((f) => ({
                          label: f.label,
                          value: headerFactorValue(project, v, f.id),
                        }))}
                      />
                    </th>
                  ))}
                  <th colSpan={2} />
                </tr>
              ) : null}
            </thead>
          }
          renderRow={(i) => {
            const row = rows[i]!;
            if (row.kind === "group") {
              return (
                <tr key={row.key} className="section">
                  <td colSpan={colCount}>{row.label}</td>
                </tr>
              );
            }
            const t = row.target;
            const qs = quotesForTarget(project, t.kind, t.code);
            const selected = qs.find((q) => q.selected);
            const spread = rateSpread(project, t.kind, t.code);
            const rowIndex = lineRows.findIndex((x) => x.target.code === t.code);
            const best = spread.min;
            const asked =
              (project.enquiries ?? [])
                .flatMap((p) => p.lines)
                .find((l) => l.targetCode === t.code && l.included)?.spec ?? t.spec;
            return (
              <tr key={t.code} className={selected ? "selected" : ""}>
                <td>
                  <input type="checkbox" checked={picked.has(t.code)} onChange={() => toggle(t.code)} />
                </td>
                <td>{t.code}</td>
                <td>
                  {t.description}
                  {asked ? <span className="buy-asked">{asked}</span> : null}
                  {spread.min != null ? (
                    <span className="hint">
                      {" "}
                      {formatRate(spread.min, currency)}
                      {spread.max != null && spread.max !== spread.min ? `–${formatRate(spread.max, currency)}` : ""}
                    </span>
                  ) : null}
                </td>
                {vendors.map((v, col) => {
                  const q = qs.find((x) => x.vendorName === v);
                  const focused = focus.row === rowIndex && focus.col === col;
                  const pack = (project.enquiries ?? []).find((p) => p.id === q?.enquiryId) ?? null;
                  const isBest = q != null && best != null && q.rate === best;
                  return (
                    <td
                      key={v}
                      className={`buy-vendor ${focused ? "cell-focus" : ""} ${isBest ? "buy-best" : ""}`}
                    >
                      {q ? (
                        <>
                          <button
                            type="button"
                            className={q.selected ? "buy-award is-awarded" : "buy-award"}
                            title="Award this rate"
                            onClick={() => {
                              void confirmTyped([t.code]).then((ok) => {
                                if (ok) onProject(selectQuoteLine(project, t.kind, t.code, q.id, true));
                              });
                            }}
                          >
                            {formatRate(q.rate, currency)}
                          </button>
                          <FactorStack
                            items={lineFactors.map((f) => ({
                              label: f.label,
                              value: lineFactorValue(project, q, pack, t.code, f.id),
                            }))}
                          />
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
                <td>{selected ? selected.vendorName : "Analysis"}</td>
                <td>
                  <button type="button" onClick={() => onProject(clearLineToAnalysis(project, t.kind, t.code))}>
                    Keep analysis
                  </button>
                </td>
              </tr>
            );
          }}
        />
      </div>
    </>
  );
}

function FactorStack({ items }: { items: Array<{ label: string; value: string }> }) {
  const shown = items.filter((i) => i.value.trim());
  if (!shown.length) return null;
  return (
    <div className="buy-cell-meta">
      {shown.map((i) => (
        <span key={i.label}>
          <b>{i.label}</b> {i.value}
        </span>
      ))}
    </div>
  );
}

function FactorToggles({
  project,
  onProject,
}: {
  project: LoadedProject;
  onProject: (next: LoadedProject) => void;
}) {
  const defs = project.quoteFieldDefs ?? [];
  if (!defs.length) return null;
  return (
    <div className="buy-factors" role="group" aria-label="Compare factors">
      <span className="buy-factors-label">Factors</span>
      <span className="buy-factor on">Rate</span>
      {defs.map((d) => (
        <label key={d.id} className={`buy-factor${d.compare ? " on" : ""}`}>
          <input
            type="checkbox"
            checked={d.compare}
            onChange={() => onProject(upsertFieldDef(project, { ...d, compare: !d.compare }))}
          />
          {d.label}
          {d.builtin ? null : (
            <button
              type="button"
              className="buy-factor-remove"
              aria-label={`Remove ${d.label}`}
              onClick={() => onProject(removeFieldDef(project, d.id))}
            >
              ×
            </button>
          )}
        </label>
      ))}
    </div>
  );
}

function SettleSheet({
  project,
  rows,
  keptCount,
  onProject,
  onKeep,
  onOpenPack,
  onClose,
}: {
  project: LoadedProject;
  rows: ResourceSummaryRow[];
  keptCount: number;
  onProject: (next: LoadedProject) => void;
  onKeep: (row: ResourceSummaryRow) => void;
  onOpenPack: (row: ResourceSummaryRow) => void;
  onClose: () => void;
}) {
  const currency = project.currency;
  const amount = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="buy-settle-sheet" role="dialog" aria-modal="true" aria-labelledby="buy-settle-title">
      <button type="button" className="buy-settle-backdrop" aria-label="Close settle rates" onClick={onClose} />
      <div className="buy-settle-panel">
        <header className="buy-settle-head">
          <h2 id="buy-settle-title">Settle rates</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="buy-settle-sum">
          {rows.length} lines still on analysis · {formatMoney(amount, currency)}
          {keptCount ? ` · ${keptCount} kept as analysis` : ""}
        </p>
        <div className="buy-settle-grid">
          <DataTable layoutKey="buy-settle">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Category</th>
                <th className="num">Qty</th>
                <th className="num">Applied rate</th>
                <th className="num">Amount</th>
                <th>Enquiry</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>All listed lines are settled or kept on analysis.</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={`${r.kind}:${r.code}`}>
                    <td>{r.code}</td>
                    <td>{r.description}</td>
                    <td>{r.laneLabel}</td>
                    <td className="num">{formatQty(r.qty)}</td>
                    <td className="num">
                      <QtyInput
                        value={r.price}
                        moneyCurrency={currency}
                        aria-label={`Applied rate ${r.code}`}
                        onValue={(n) => onProject(applyCustomRate(project, r.kind, r.code, n ?? 0))}
                      />
                    </td>
                    <td className="num">{formatMoney(r.amount, currency)}</td>
                    <td>{enquiryChipLabel(r.enquiry)}</td>
                    <td>
                      <button type="button" onClick={() => onOpenPack(r)}>
                        Open pack
                      </button>
                      <button type="button" onClick={() => onKeep(r)}>
                        Keep analysis
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </div>
      </div>
    </div>
  );
}
