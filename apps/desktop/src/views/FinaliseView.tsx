import { formatMoney, formatQty } from "@aerolith/shared";
import { useState } from "react";
import { itemKeyOf, sortedBills } from "../bills";
import {
  applyDraft,
  commercialOf,
  compareSnapshots,
  discardDraft,
  editDraft,
  freezeRevision,
  previewAdjustments,
  snapshotLines,
  submissionChecks,
  submissionPackDocument,
  submissionPackXlsx,
  tenderSummary,
  withCommercial,
  type AdjustmentKind,
  type AdjustmentLevel,
  type FinalAdjustment,
  type FinalisePane,
  type RevisionLineSnap,
  type SubmissionIssue,
  type TenderRevision,
} from "../finalise";
import { newId, type LoadedProject } from "../model";
import { usePrintHeader } from "../print/context";
import { saveDocumentPdf } from "../print/actions";
import { saveUserBytes } from "../saveBytes";
import { MenuSelect } from "../ui/MenuSelect";
import { Split } from "../ui/Split";
import { DataTable } from "../ui/tableLayout";

const PANES: Array<[FinalisePane, string]> = [
  ["summary", "Summary"],
  ["adjustments", "Adjustments"],
  ["revisions", "Revisions"],
  ["checks", "Checks"],
  ["pack", "Pack"],
];

const KINDS: Array<[AdjustmentKind, string]> = [
  ["overhead", "Overhead"],
  ["profit", "Profit"],
  ["contingency", "Contingency"],
  ["discount", "Discount"],
];

const LEVELS: Array<[AdjustmentLevel, string]> = [
  ["tender", "Tender"],
  ["bill", "BOQ"],
  ["section", "Section"],
];

function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").trim() || "BidCraft";
}

function sideOf(project: LoadedProject, id: string): { label: string; lines: RevisionLineSnap[] } {
  if (id === "working") return { label: `Working r${project.revision}`, lines: snapshotLines(project) };
  const rev = commercialOf(project).revisions.find((item) => item.id === id);
  return { label: rev ? `r${rev.number}` : "Missing", lines: rev?.lines ?? [] };
}

function revisionLabel(rev: TenderRevision): string {
  const when = rev.frozenAt ? new Date(rev.frozenAt).toLocaleString() : "";
  return [`r${rev.number}`, when].filter(Boolean).join(" · ");
}

export function FinaliseView({
  project,
  locked,
  pane,
  onPane,
  onProject,
  onJump,
}: {
  project: LoadedProject;
  locked: boolean;
  pane: FinalisePane;
  onPane: (pane: FinalisePane) => void;
  onProject: (next: LoadedProject) => void;
  onJump: (issue: SubmissionIssue) => void;
}) {
  const { format } = usePrintHeader();
  const commercial = commercialOf(project);
  const checks = submissionChecks(project);
  const [note, setNote] = useState("");
  const [leftId, setLeftId] = useState("working");
  const [rightId, setRightId] = useState(commercial.revisions.at(-1)?.id ?? "working");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const tender = tenderSummary(project).find((row) => row.level === "tender");
  const blocks = checks.filter((issue) => issue.severity === "block").length;

  async function buildPdf() {
    setBusy(true);
    setStatus("");
    try {
      const saved = await saveDocumentPdf(submissionPackDocument(project, format));
      setStatus(saved ? "Submission pack PDF saved." : "PDF save cancelled.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not build the PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function buildExcel() {
    setBusy(true);
    setStatus("");
    try {
      const name = `${safeName(project.name)} submission pack.xlsx`;
      const saved = await saveUserBytes(name, submissionPackXlsx(project), {
        name: "Excel workbook",
        extensions: ["xlsx"],
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      setStatus(saved ? "Submission pack Excel saved." : "Excel save cancelled.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not build the workbook.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="module-workspace finalise">
      <div className="module-toolbar">
        <h1 className="view">Finalise</h1>
        <p className="hint">
          Offer {formatMoney(tender?.offer ?? 0, project.currency)}
          {commercial.draft ? ` · preview ${formatMoney(tender?.preview ?? 0, project.currency)}` : ""}
          {blocks ? ` · ${blocks} to clear` : ""}
        </p>
        <div className="print-actions">
          <button type="button" disabled={busy} onClick={() => void buildPdf()}>
            Pack PDF
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => void buildExcel()}>
            Pack Excel
          </button>
        </div>
      </div>
      {status ? <p className="hint finalise-status">{status}</p> : null}
      <Split id="finalise-nav" axis="x" defaultSize={180} min={140} max={280}>
        <nav className="settings-nav" aria-label="Finalise">
          {PANES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={pane === id ? "on" : ""}
              aria-current={pane === id ? "page" : undefined}
              onClick={() => onPane(id)}
            >
              {label}
              {id === "checks" && checks.length ? ` (${checks.length})` : ""}
            </button>
          ))}
        </nav>
        <div className="settings-pane">
          {pane === "summary" ? <SummaryPane project={project} /> : null}
          {pane === "adjustments" ? (
            <AdjustmentsPane project={project} locked={locked} onProject={onProject} />
          ) : null}
          {pane === "revisions" ? (
            <RevisionsPane
              project={project}
              locked={locked}
              note={note}
              onNote={setNote}
              leftId={leftId}
              rightId={rightId}
              onLeft={setLeftId}
              onRight={setRightId}
              onProject={onProject}
            />
          ) : null}
          {pane === "checks" ? <ChecksPane onJump={onJump} issues={checks} /> : null}
          {pane === "pack" ? <PackPane project={project} locked={locked} onProject={onProject} /> : null}
        </div>
      </Split>
    </div>
  );
}

function SummaryPane({ project }: { project: LoadedProject }) {
  const rows = tenderSummary(project);
  return (
    <div className="settings-section">
      <h2 className="view">Tender summary</h2>
      <p className="hint">
        Cost, margin, and sell come from the priced BOQ. Labour, material, subcontract, and plant are the cost split.
        Offer applies the stored final adjustments. Preview includes the what-if draft.
      </p>
      <div className="scroll">
        <DataTable layoutKey="finalise-summary">
          <thead>
            <tr>
              <th>BOQ / section</th>
              <th className="num">Cost</th>
              <th className="num">Margin</th>
              <th className="num">Sell</th>
              <th className="num">Offer</th>
              <th className="num">Preview</th>
              <th className="num">Labour</th>
              <th className="num">Material</th>
              <th className="num">Subcontract</th>
              <th className="num">Plant</th>
              <th className="num">Other</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.level === "tender" ? "tender" : row.level === "bill" ? "bill" : undefined}>
                <td style={row.level === "section" ? { paddingLeft: 12 + row.depth * 14 } : undefined}>{row.label}</td>
                {([row.cost, row.margin, row.sell, row.offer, row.preview, row.labour, row.material, row.subcontract, row.plant, row.other] as const).map(
                  (amount, index) => (
                    <td className="num" key={index}>
                      {formatMoney(amount, project.currency)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}

function AdjustmentsPane({
  project,
  locked,
  onProject,
}: {
  project: LoadedProject;
  locked: boolean;
  onProject: (next: LoadedProject) => void;
}) {
  const commercial = commercialOf(project);
  const rows = previewAdjustments(commercial);
  const previewing = commercial.draft != null;
  const bills = sortedBills(project);
  const sections = project.items.filter((item) => item.kind === "section");

  function update(next: FinalAdjustment[]) {
    onProject(editDraft(project, next));
  }

  function patch(id: string, next: Partial<FinalAdjustment>) {
    update(rows.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  return (
    <div className="settings-section">
      <h2 className="view">Final adjustments</h2>
      <p className="hint">
        Overhead, profit, and contingency add to the selling amount. Discount subtracts. A tender row covers every line.
        A BOQ or section row covers only that scope. Editing here is a what-if until you apply it. Working BOQ rates stay unchanged.
      </p>
      {previewing ? (
        <p className="finalise-banner" role="status">
          Preview only. The submission pack still uses the applied adjustments.
        </p>
      ) : (
        <p className="hint">Preview matches the applied offer.</p>
      )}
      <div className="master-toolbar">
        <button
          type="button"
          disabled={locked}
          onClick={() => update([...rows, { id: newId("adj"), kind: "overhead", level: "tender", targetId: "", pct: 0 }])}
        >
          Add adjustment
        </button>
        <button type="button" className="primary" disabled={locked || !previewing} onClick={() => onProject(applyDraft(project))}>
          Apply to tender
        </button>
        <button type="button" disabled={locked || !previewing} onClick={() => onProject(discardDraft(project))}>
          Discard preview
        </button>
      </div>
      <div className="scroll">
        <DataTable layoutKey="finalise-adjustments">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Level</th>
              <th>Applies to</th>
              <th className="num">Percent</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>No final adjustments. The offer matches the priced sell.</td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <select
                    aria-label="Adjustment kind"
                    value={row.kind}
                    disabled={locked}
                    onChange={(e) => patch(row.id, { kind: e.target.value as AdjustmentKind })}
                  >
                    {KINDS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label="Adjustment level"
                    value={row.level}
                    disabled={locked}
                    onChange={(e) => {
                      const level = e.target.value as AdjustmentLevel;
                      patch(row.id, { level, targetId: level === "tender" ? "" : row.targetId });
                    }}
                  >
                    {LEVELS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {row.level === "tender" ? (
                    "Whole tender"
                  ) : (
                    <select
                      aria-label="Adjustment target"
                      value={row.targetId}
                      disabled={locked}
                      onChange={(e) => patch(row.id, { targetId: e.target.value })}
                    >
                      <option value="">Choose</option>
                      {row.level === "bill"
                        ? bills.map((bill) => (
                            <option key={bill.id} value={bill.id}>
                              {bill.code} {bill.name}
                            </option>
                          ))
                        : sections.map((section) => (
                            <option key={itemKeyOf(section)} value={itemKeyOf(section)}>
                              {section.slNo} {section.description}
                            </option>
                          ))}
                    </select>
                  )}
                </td>
                <td className="num">
                  <input
                    className="cell num"
                    aria-label="Adjustment percent"
                    inputMode="decimal"
                    disabled={locked}
                    value={String(Math.round(row.pct * 10000) / 100)}
                    onChange={(e) => {
                      const pct = Number(e.target.value.replace(/,/g, ""));
                      patch(row.id, { pct: Number.isFinite(pct) ? pct / 100 : 0 });
                    }}
                  />
                </td>
                <td>
                  <button type="button" disabled={locked} onClick={() => update(rows.filter((item) => item.id !== row.id))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}

function RevisionsPane({
  project,
  locked,
  note,
  onNote,
  leftId,
  rightId,
  onLeft,
  onRight,
  onProject,
}: {
  project: LoadedProject;
  locked: boolean;
  note: string;
  onNote: (note: string) => void;
  leftId: string;
  rightId: string;
  onLeft: (id: string) => void;
  onRight: (id: string) => void;
  onProject: (next: LoadedProject) => void;
}) {
  const revisions = commercialOf(project).revisions;
  const nextNumber = (() => {
    const used = new Set(revisions.map((rev) => rev.number));
    let number = Math.max(1, Math.floor(project.revision) || 1);
    while (used.has(number)) number += 1;
    return number;
  })();
  const options = [
    { value: "working", label: `Working r${project.revision}` },
    ...revisions.map((rev) => ({ value: rev.id, label: revisionLabel(rev) })),
  ];
  const left = sideOf(project, leftId);
  const right = sideOf(project, rightId);
  const diffs = compareSnapshots(left.lines, right.lines);
  return (
    <div className="settings-section">
      <h2 className="view">Revisions</h2>
      <p className="hint">
        Freeze stores this offer inside the file as r{nextNumber} and continues on the next revision. Compare any two
        snapshots, including the working copy. Quantity, rate, and amount are the offer.
      </p>
      <div className="master-toolbar">
        <label className="field">
          Note
          <input value={note} disabled={locked} onChange={(e) => onNote(e.target.value)} placeholder="Issued to client" />
        </label>
        <button
          type="button"
          className="primary"
          disabled={locked}
          onClick={() => {
            onProject(freezeRevision(project, note));
            onNote("");
          }}
        >
          Freeze snapshot
        </button>
      </div>
      {revisions.length ? (
        <ul className="recent">
          {revisions.map((rev) => (
            <li key={rev.id}>
              <b>{revisionLabel(rev)}</b>
              <span>
                {formatMoney(rev.sell, project.currency)}
                {rev.note ? ` · ${rev.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">No frozen revisions yet.</p>
      )}
      <div className="master-toolbar">
        <MenuSelect label="Compare from" value={options.some((o) => o.value === leftId) ? leftId : "working"} options={options} onChange={onLeft} />
        <MenuSelect label="Compare with" value={options.some((o) => o.value === rightId) ? rightId : "working"} options={options} onChange={onRight} />
      </div>
      <div className="scroll">
        <DataTable layoutKey="finalise-revisions">
          <thead>
            <tr>
              <th>BOQ</th>
              <th>No.</th>
              <th>Description</th>
              <th className="num">Qty A</th>
              <th className="num">Qty B</th>
              <th className="num">Rate A</th>
              <th className="num">Rate B</th>
              <th className="num">Amount A</th>
              <th className="num">Amount B</th>
            </tr>
          </thead>
          <tbody>
            {diffs.length === 0 ? (
              <tr>
                <td colSpan={9}>No quantity, rate, or amount differences.</td>
              </tr>
            ) : (
              diffs.map((row) => (
                <tr key={row.key} className="diff">
                  <td>{row.billCode}</td>
                  <td>{row.slNo}</td>
                  <td>
                    {row.description}
                    {row.status !== "changed" ? ` · ${row.status}` : ""}
                  </td>
                  <td className="num">{row.qtyA == null ? "" : formatQty(row.qtyA)}</td>
                  <td className="num">{row.qtyB == null ? "" : formatQty(row.qtyB)}</td>
                  <td className="num">{row.rateA == null ? "" : formatMoney(row.rateA, project.currency)}</td>
                  <td className="num">{row.rateB == null ? "" : formatMoney(row.rateB, project.currency)}</td>
                  <td className="num">{row.amountA == null ? "" : formatMoney(row.amountA, project.currency)}</td>
                  <td className="num">{row.amountB == null ? "" : formatMoney(row.amountB, project.currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}

function ChecksPane({ issues, onJump }: { issues: SubmissionIssue[]; onJump: (issue: SubmissionIssue) => void }) {
  return (
    <div className="settings-section">
      <h2 className="view">Pre-submission check</h2>
      <p className="hint">
        Unpriced and zero-rate lines, rates more than three times away from the median of the same unit, open client
        queries, and a missing qualifications list. Select a row to open it. The pack can still be built.
      </p>
      {issues.length === 0 ? <p className="hint">Nothing outstanding. The pack can go out.</p> : null}
      {issues.map((issue) => (
        <button key={issue.id} type="button" className={`check-jump ${issue.severity}`} onClick={() => onJump(issue)}>
          <strong>{issue.title}</strong>
          <span>{issue.detail}</span>
        </button>
      ))}
    </div>
  );
}

function PackPane({
  project,
  locked,
  onProject,
}: {
  project: LoadedProject;
  locked: boolean;
  onProject: (next: LoadedProject) => void;
}) {
  const commercial = commercialOf(project);
  return (
    <div className="settings-section">
      <h2 className="view">Submission pack</h2>
      <p className="hint">
        One pack: cover letter, summary, priced BOQs at the applied offer, qualifications, and exclusions. PDF uses the
        same letterhead as the other documents. Excel is one workbook with a sheet for each part.
      </p>
      <label className="field">
        Cover letter
        <textarea
          rows={5}
          disabled={locked}
          value={commercial.coverLetter}
          placeholder="Leave blank for a short standard opening."
          onChange={(e) => onProject(withCommercial(project, { coverLetter: e.target.value }))}
        />
      </label>
      <ClauseList
        title="Qualifications"
        kind="qualification"
        locked={locked}
        clauses={commercial.clauses}
        onAdd={() =>
          onProject(
            withCommercial(project, {
              clauses: [...commercial.clauses, { id: newId("cl"), kind: "qualification", text: "" }],
            }),
          )
        }
        onChange={(id, text) =>
          onProject(
            withCommercial(project, {
              clauses: commercial.clauses.map((clause) => (clause.id === id ? { ...clause, text } : clause)),
            }),
          )
        }
        onRemove={(id) =>
          onProject(withCommercial(project, { clauses: commercial.clauses.filter((clause) => clause.id !== id) }))
        }
      />
      <ClauseList
        title="Exclusions"
        kind="exclusion"
        locked={locked}
        clauses={commercial.clauses}
        onAdd={() =>
          onProject(
            withCommercial(project, {
              clauses: [...commercial.clauses, { id: newId("cl"), kind: "exclusion", text: "" }],
            }),
          )
        }
        onChange={(id, text) =>
          onProject(
            withCommercial(project, {
              clauses: commercial.clauses.map((clause) => (clause.id === id ? { ...clause, text } : clause)),
            }),
          )
        }
        onRemove={(id) =>
          onProject(withCommercial(project, { clauses: commercial.clauses.filter((clause) => clause.id !== id) }))
        }
      />
    </div>
  );
}

function ClauseList({
  title,
  kind,
  locked,
  clauses,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  kind: "qualification" | "exclusion";
  locked: boolean;
  clauses: { id: string; kind: "qualification" | "exclusion"; text: string }[];
  onAdd: () => void;
  onChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const rows = clauses.filter((clause) => clause.kind === kind);
  return (
    <section>
      <div className="master-toolbar">
        <h2 className="view">{title}</h2>
        <button type="button" disabled={locked} onClick={onAdd}>
          Add
        </button>
      </div>
      {rows.length === 0 ? <p className="hint">None yet.</p> : null}
      {rows.map((clause, index) => (
        <label className="field" key={clause.id}>
          {title} {index + 1}
          <textarea rows={2} disabled={locked} value={clause.text} onChange={(e) => onChange(clause.id, e.target.value)} />
          <button type="button" disabled={locked} onClick={() => onRemove(clause.id)}>
            Remove
          </button>
        </label>
      ))}
    </section>
  );
}
