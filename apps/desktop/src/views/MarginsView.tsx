import { formatMoney, formatPct, totalMarginPct, type MarginStack } from "@aerolith/shared";
import { useMemo, useState } from "react";
import { itemKeyOf } from "../bills";
import {
  ALL_MARGIN_FACTORS,
  MARGIN_FACTORS,
  applyMarginAssignment,
  cloneMarginStack,
  describeRuleTarget,
  factorSummary,
  isFullStack,
  itemsMatchingRule,
  listMarginTargets,
  presetsOf,
  resolveItemMargin,
  rulesOf,
  upsertMarginPreset,
} from "../marginRules";
import { newId, type LoadedProject, type MarginFactorKey, type MarginTargetKind } from "../model";
import { QtyInput } from "../ui/QtyInput";
import { PrintActions } from "../ui/PrintActions";
import { usePrintHeader } from "../print/context";
import { jobDocument } from "../print/types";
import { MenuSelect } from "../ui/MenuSelect";
import { Split } from "../ui/Split";
import { DataTable } from "../ui/tableLayout";

const TARGETS: Array<[MarginTargetKind, string]> = [
  ["job", "Entire job"],
  ["bill", "BOQs"],
  ["section", "Sections"],
  ["category", "Categories"],
  ["item", "Items"],
];

export function MarginsView({
  project,
  billId = null,
  locked,
  onProject,
}: {
  project: LoadedProject;
  billId?: string | null;
  locked?: boolean;
  onProject: (next: LoadedProject) => void;
}) {
  const [source, setSource] = useState<"group" | "unique">("group");
  const [targetKind, setTargetKind] = useState<MarginTargetKind>("item");
  const [presetId, setPresetId] = useState(presetsOf(project)[0]?.id ?? "");
  const [draft, setDraft] = useState<MarginStack>(() => cloneMarginStack(project.margin));
  const [pickedFactors, setPickedFactors] = useState<Record<MarginFactorKey, boolean>>({
    overheadPct: false,
    profitPct: true,
    logisticsPct: false,
    contingencyPct: false,
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");

  const presets = presetsOf(project);
  const rules = rulesOf(project);
  const header = usePrintHeader();
  const scopedItems = useMemo(
    () => project.items.filter((i) => i.kind === "item" && (!billId || i.billId === billId)),
    [project.items, billId],
  );
  const options = useMemo(() => {
    if (targetKind === "job") return [];
    const q = search.trim().toLowerCase();
    return listMarginTargets(project, targetKind, targetKind === "bill" ? null : billId).filter(
      (o) => !q || o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q),
    );
  }, [project, targetKind, billId, search]);

  const selectedPreset = presets.find((p) => p.id === presetId) ?? null;
  const applyStack = source === "group" ? (selectedPreset?.stack ?? draft) : draft;
  const applyFactors: MarginFactorKey[] =
    source === "group" ? [...ALL_MARGIN_FACTORS] : ALL_MARGIN_FACTORS.filter((k) => pickedFactors[k]);

  const jobPct = totalMarginPct(project.margin);
  const mixed = rules.some((r) => r.enabled);

  function setJobFactor(key: MarginFactorKey, pct: number) {
    onProject({ ...project, margin: { ...project.margin, [key]: (pct || 0) / 100 } });
  }

  function addGroup() {
    const preset = {
      id: newId("mp"),
      name: `Group ${presets.length + 1}`,
      stack: cloneMarginStack(project.margin),
    };
    onProject(upsertMarginPreset(project, preset));
    setPresetId(preset.id);
    setSource("group");
  }

  function apply() {
    if (!applyFactors.length) return;
    if (targetKind !== "job" && picked.size === 0) return;
    const label =
      name.trim() ||
      (source === "group"
        ? `${selectedPreset?.name ?? "Group"} → ${TARGETS.find((t) => t[0] === targetKind)?.[1]}`
        : `${factorSummary(applyStack, applyFactors)} → ${TARGETS.find((t) => t[0] === targetKind)?.[1]}`);
    onProject(
      applyMarginAssignment(project, {
        name: label,
        factors: applyFactors,
        stack: applyStack,
        presetId: source === "group" ? selectedPreset?.id ?? null : null,
        targetKind,
        targetIds: [...picked],
      }),
    );
    setName("");
  }

  return (
    <div className="module-workspace margins-layout">
      <div className="module-toolbar">
        <h1 className="view">Margins</h1>
        <p className="hint">
          Applied once on cost. Job stack {formatPct(jobPct)}
          {mixed ? " · scoped assignments overlay it" : ""}.
        </p>
        <button
          className="primary"
          type="button"
          disabled={
            locked ||
            (source === "group" && !selectedPreset) ||
            (source === "unique" && applyFactors.length === 0) ||
            (targetKind !== "job" && picked.size === 0)
          }
          onClick={apply}
        >
          Apply
        </button>
        <PrintActions
          build={() =>
            jobDocument(header.project.name, `r${header.project.revision}`, header.format, "Margins", [
              {
                title: "Assignments",
                columns: [
                  { label: "Name", width: 28 },
                  { label: "Applies to", width: 42 },
                  { label: "Factors", width: 20 },
                  { label: "Items", width: 10, align: "right" },
                ],
                rows: rules.map((rule) => ({
                  cells: [
                    rule.name,
                    describeRuleTarget(project, rule),
                    factorSummary(rule.stack, rule.factors),
                    String(itemsMatchingRule(project, rule).length),
                  ],
                })),
              },
            ])
          }
        />
      </div>
      <div className="margins-body">
        <Split id="margins" axis="x" defaultSize={440} min={280} max={720}>
        <div className="margins-pane">
          <fieldset className="plain" disabled={locked}>
            <section className="note">
              <h2>Job default</h2>
              <p className="hint">Used for every item unless a more specific assignment writes a factor.</p>
              <div className="margins-factors">
                {MARGIN_FACTORS.map((f) => (
                  <label className="field" key={f.key}>
                    {f.label} %
                    <QtyInput
                      className="cell num"
                      aria-label={`${f.label} percent`}
                      value={project.margin[f.key] * 100}
                      decimals={2}
                      onValue={(n) => setJobFactor(f.key, n ?? 0)}
                    />
                  </label>
                ))}
              </div>
              <p>
                Stack <strong>{formatPct(jobPct)}</strong>
              </p>
            </section>

            <section className="note">
              <h2>Factor groups</h2>
              <p className="hint">Reusable stacks you can apply to a BOQ, section, category, item, or the whole job.</p>
              {presets.length === 0 ? <p className="hint">No groups yet.</p> : null}
              {presets.map((p) => (
                <div className={`margins-preset ${presetId === p.id ? "on" : ""}`} key={p.id}>
                  <button type="button" className="linkish" onClick={() => { setPresetId(p.id); setSource("group"); }}>
                    {p.name}
                  </button>
                  <span>{formatPct(totalMarginPct(p.stack))}</span>
                  <input
                    value={p.name}
                    aria-label="Group name"
                    onChange={(e) => onProject(upsertMarginPreset(project, { ...p, name: e.target.value }))}
                  />
                  <div className="margins-factors compact">
                    {MARGIN_FACTORS.map((f) => (
                      <label className="field" key={f.key}>
                        {f.label}
                        <QtyInput
                          className="cell num"
                          aria-label={`${p.name} ${f.label}`}
                          value={p.stack[f.key] * 100}
                          decimals={2}
                          onValue={(n) =>
                            onProject(
                              upsertMarginPreset(project, {
                                ...p,
                                stack: { ...p.stack, [f.key]: (n ?? 0) / 100 },
                              }),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onProject({
                        ...project,
                        marginPresets: presets.filter((x) => x.id !== p.id),
                        marginRules: rules.map((r) => (r.presetId === p.id ? { ...r, presetId: null } : r)),
                      })
                    }
                  >
                    Delete group
                  </button>
                </div>
              ))}
              <div className="actions">
                <button type="button" onClick={addGroup}>
                  New factor group
                </button>
              </div>
            </section>

            <section className="note">
              <h2>Apply</h2>
              <div className="seg">
                <button type="button" className={source === "group" ? "primary" : ""} onClick={() => setSource("group")}>
                  Factor group
                </button>
                <button type="button" className={source === "unique" ? "primary" : ""} onClick={() => setSource("unique")}>
                  Unique factors
                </button>
              </div>
              {source === "group" ? (
                <MenuSelect
                  label="Group"
                  value={presetId}
                  options={[
                    { value: "", label: "Select a group" },
                    ...presets.map((p) => ({
                      value: p.id,
                      label: `${p.name} (${formatPct(totalMarginPct(p.stack))})`,
                    })),
                  ]}
                  onChange={setPresetId}
                />
              ) : (
                <div className="margins-unique">
                  {MARGIN_FACTORS.map((f) => (
                    <label key={f.key}>
                      <input
                        type="checkbox"
                        checked={pickedFactors[f.key]}
                        onChange={(e) => setPickedFactors((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                      />
                      {f.label}
                      <QtyInput
                        className="cell num"
                        aria-label={`Unique ${f.label}`}
                        disabled={!pickedFactors[f.key]}
                        value={draft[f.key] * 100}
                        decimals={2}
                        onValue={(n) => setDraft((prev) => ({ ...prev, [f.key]: (n ?? 0) / 100 }))}
                      />
                    </label>
                  ))}
                </div>
              )}
              <label className="field">
                Assignment name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
              </label>
              <p className="hint">Apply to</p>
              <div className="seg wrap">
                {TARGETS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={targetKind === id ? "primary" : ""}
                    onClick={() => {
                      setTargetKind(id);
                      setPicked(new Set());
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {targetKind === "job" ? (
                <p className="hint">
                  {isFullStack(applyFactors)
                    ? "A full group replaces the job default."
                    : "Only the ticked factors overlay the job default."}
                </p>
              ) : (
                <>
                  <input
                    className="filter"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search targets"
                    aria-label="Search targets"
                  />
                  <div className="margins-target-bar">
                    <button
                      type="button"
                      onClick={() => setPicked(new Set(options.map((o) => o.id)))}
                    >
                      Select all
                    </button>
                    <button type="button" onClick={() => setPicked(new Set())}>
                      Clear
                    </button>
                    <span>{picked.size} selected</span>
                  </div>
                  <div className="margins-targets" role="listbox" aria-multiselectable>
                    {options.length === 0 ? <p className="hint">Nothing in this BOQ matches.</p> : null}
                    {options.map((o) => (
                      <label key={o.id}>
                        <input
                          type="checkbox"
                          checked={picked.has(o.id)}
                          onChange={(e) => {
                            setPicked((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(o.id);
                              else next.delete(o.id);
                              return next;
                            });
                          }}
                        />
                        <span>
                          {o.label}
                          {o.hint ? <i>{o.hint}</i> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
              <div className="actions">
                <button
                  className="primary"
                  type="button"
                  disabled={
                    (source === "group" && !selectedPreset) ||
                    (source === "unique" && applyFactors.length === 0) ||
                    (targetKind !== "job" && picked.size === 0)
                  }
                  onClick={apply}
                >
                  Apply
                </button>
              </div>
            </section>
          </fieldset>
        </div>
        <div className="margins-pane">
          <section className="note">
            <h2>Assignments</h2>
            {rules.length === 0 ? (
              <p className="hint">No scoped assignments. Every item uses the job default.</p>
            ) : (
              <DataTable layoutKey="margins-rules">
                <thead>
                  <tr>
                    <th>On</th>
                    <th>Name</th>
                    <th>Applies to</th>
                    <th>Factors</th>
                    <th className="num">Items</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => {
                    const n = itemsMatchingRule(project, rule).length;
                    return (
                      <tr key={rule.id} className={rule.enabled ? "" : "dim"}>
                        <td>
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            disabled={locked}
                            onChange={(e) =>
                              onProject({
                                ...project,
                                marginRules: rules.map((r) =>
                                  r.id === rule.id ? { ...r, enabled: e.target.checked } : r,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>{rule.name}</td>
                        <td>{describeRuleTarget(project, rule)}</td>
                        <td>{factorSummary(rule.stack, rule.factors)}</td>
                        <td className="num">{n}</td>
                        <td>
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() =>
                              onProject({ ...project, marginRules: rules.filter((r) => r.id !== rule.id) })
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            )}
          </section>
          <section className="note">
            <h2>{billId ? "This BOQ" : "Working items"}</h2>
            <DataTable layoutKey="margins-items">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Item</th>
                  <th>Margin</th>
                  <th>Source</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {scopedItems.slice(0, 80).map((item) => {
                  const resolved = resolveItemMargin(project, item);
                  const last = resolved.hits[resolved.hits.length - 1];
                  return (
                    <tr key={itemKeyOf(item)}>
                      <td>{item.boqCode}</td>
                      <td>{item.description}</td>
                      <td>{formatPct(totalMarginPct(resolved.stack))}</td>
                      <td>{last?.rule.name ?? "Job default"}</td>
                      <td className="num">{formatMoney(item.result?.amount ?? 0, project.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
            {scopedItems.length > 80 ? <p className="hint">Showing first 80 items in this view.</p> : null}
          </section>
        </div>
        </Split>
      </div>
    </div>
  );
}
