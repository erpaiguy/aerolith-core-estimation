import { totalMarginPct, type MarginStack } from "@aerolith/shared";
import { itemKeyOf, sortedBills } from "./bills";
import {
  newId,
  type LoadedProject,
  type MarginFactorKey,
  type MarginPreset,
  type MarginRule,
  type MarginTargetKind,
  type WorkingItem,
} from "./model";

export const MARGIN_FACTORS: Array<{ key: MarginFactorKey; label: string }> = [
  { key: "overheadPct", label: "Overhead" },
  { key: "profitPct", label: "Profit" },
  { key: "logisticsPct", label: "Logistics" },
  { key: "contingencyPct", label: "Contingency" },
];

export const ALL_MARGIN_FACTORS: MarginFactorKey[] = MARGIN_FACTORS.map((f) => f.key);

const TARGET_RANK: Record<MarginTargetKind, number> = {
  job: 0,
  bill: 1,
  category: 2,
  section: 3,
  item: 4,
};

export function emptyMarginStack(): MarginStack {
  return { overheadPct: 0, profitPct: 0, logisticsPct: 0, contingencyPct: 0 };
}

export function cloneMarginStack(stack: MarginStack): MarginStack {
  return {
    overheadPct: stack.overheadPct,
    profitPct: stack.profitPct,
    logisticsPct: stack.logisticsPct,
    contingencyPct: stack.contingencyPct,
  };
}

export function marginStackKey(stack: MarginStack): string {
  return ALL_MARGIN_FACTORS.map((k) => stack[k].toFixed(10)).join("|");
}

export function normalizeFactors(factors: MarginFactorKey[] | undefined): MarginFactorKey[] {
  const allowed = new Set<MarginFactorKey>(ALL_MARGIN_FACTORS);
  const out: MarginFactorKey[] = [];
  for (const k of factors ?? []) {
    if (!allowed.has(k) || out.includes(k)) continue;
    out.push(k);
  }
  return out.length ? out : [...ALL_MARGIN_FACTORS];
}

function normLabel(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function itemCategoryLabels(item: WorkingItem): string[] {
  return [item.workCategory, item.boqCategory, item.subWorkCategory].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
}

export function sectionKeysForItem(items: WorkingItem[], item: WorkingItem): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  let parent = item.parentCode;
  while (parent) {
    const sec = items.find(
      (i) => i.kind === "section" && i.billId === item.billId && i.boqCode === parent,
    );
    if (!sec) break;
    const key = itemKeyOf(sec);
    if (seen.has(key)) break;
    seen.add(key);
    keys.push(key);
    parent = sec.parentCode;
  }
  return keys;
}

export function presetsOf(project: LoadedProject): MarginPreset[] {
  return project.marginPresets ?? [];
}

export function rulesOf(project: LoadedProject): MarginRule[] {
  return project.marginRules ?? [];
}

export function ruleMatchesItem(project: LoadedProject, item: WorkingItem, rule: MarginRule): boolean {
  if (!rule.enabled) return false;
  if (item.kind !== "item") return false;
  switch (rule.targetKind) {
    case "job":
      return true;
    case "bill":
      return rule.targetIds.includes(item.billId);
    case "item":
      return rule.targetIds.some((id) => id.toLowerCase() === itemKeyOf(item).toLowerCase());
    case "section": {
      const keys = sectionKeysForItem(project.items, item);
      return rule.targetIds.some((id) => keys.some((k) => k.toLowerCase() === id.toLowerCase()));
    }
    case "category": {
      const labels = itemCategoryLabels(item).map(normLabel);
      return rule.targetIds.some((id) => labels.includes(normLabel(id)));
    }
    default:
      return false;
  }
}

export type AppliedMargin = {
  stack: MarginStack;
  hits: Array<{ rule: MarginRule; factors: MarginFactorKey[] }>;
};

export function resolveItemMargin(project: LoadedProject, item: WorkingItem): AppliedMargin {
  let stack = cloneMarginStack(project.margin);
  const hits: AppliedMargin["hits"] = [];
  const ranked = rulesOf(project)
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => TARGET_RANK[a.rule.targetKind] - TARGET_RANK[b.rule.targetKind] || a.index - b.index);
  for (const { rule } of ranked) {
    if (!ruleMatchesItem(project, item, rule)) continue;
    const factors = normalizeFactors(rule.factors);
    for (const f of factors) stack[f] = rule.stack[f];
    hits.push({ rule, factors });
  }
  return { stack, hits };
}

export function effectiveMargin(project: LoadedProject, item: WorkingItem): MarginStack {
  return resolveItemMargin(project, item).stack;
}

export function effectiveMarginPct(project: LoadedProject, item: WorkingItem | null | undefined): number {
  if (!item || item.kind !== "item") return totalMarginPct(project.margin);
  return totalMarginPct(effectiveMargin(project, item));
}

export function itemsMatchingRule(project: LoadedProject, rule: MarginRule): WorkingItem[] {
  return project.items.filter((i) => i.kind === "item" && ruleMatchesItem(project, i, rule));
}

export type MarginTargetOption = { id: string; label: string; hint?: string };

export function listMarginTargets(
  project: LoadedProject,
  kind: Exclude<MarginTargetKind, "job">,
  billId?: string | null,
): MarginTargetOption[] {
  const scoped = project.items.filter((i) => !billId || i.billId === billId);
  if (kind === "bill") {
    return sortedBills(project).map((b) => ({
      id: b.id,
      label: `${b.code} ${b.name}`.trim(),
      hint: b.issuedRef || undefined,
    }));
  }
  if (kind === "section") {
    return scoped
      .filter((i) => i.kind === "section")
      .map((s) => ({
        id: itemKeyOf(s),
        label: `${s.slNo} ${s.description}`.trim(),
        hint: sortedBills(project).find((b) => b.id === s.billId)?.code,
      }));
  }
  if (kind === "item") {
    return scoped
      .filter((i) => i.kind === "item")
      .map((i) => ({
        id: itemKeyOf(i),
        label: `${i.boqCode} ${i.description}`.trim(),
        hint: sortedBills(project).find((b) => b.id === i.billId)?.code,
      }));
  }
  const seen = new Map<string, MarginTargetOption>();
  for (const item of scoped.filter((i) => i.kind === "item")) {
    const bits: Array<[string | null, string]> = [
      [item.workCategory, "Work"],
      [item.boqCategory, "BOQ"],
      [item.subWorkCategory, "Sub"],
    ];
    for (const [raw, kindLabel] of bits) {
      const label = (raw ?? "").trim();
      if (!label) continue;
      const id = label;
      const prev = seen.get(normLabel(id));
      if (prev) {
        if (prev.hint && !prev.hint.includes(kindLabel)) prev.hint = `${prev.hint} · ${kindLabel}`;
        continue;
      }
      seen.set(normLabel(id), { id, label, hint: kindLabel });
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function describeRuleTarget(project: LoadedProject, rule: MarginRule): string {
  if (rule.targetKind === "job") return "Entire job";
  const opts = listMarginTargets(project, rule.targetKind);
  const labels = rule.targetIds.map((id) => opts.find((o) => o.id === id || normLabel(o.id) === normLabel(id))?.label ?? id);
  const kind =
    rule.targetKind === "bill"
      ? "BOQ"
      : rule.targetKind === "section"
        ? "Section"
        : rule.targetKind === "category"
          ? "Category"
          : "Item";
  if (labels.length <= 2) return `${kind}: ${labels.join(", ")}`;
  return `${kind}: ${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

export function factorSummary(stack: MarginStack, factors?: MarginFactorKey[]): string {
  const keys = normalizeFactors(factors);
  return keys.map((k) => `${MARGIN_FACTORS.find((f) => f.key === k)?.label ?? k} ${(stack[k] * 100).toFixed(2).replace(/\.00$/, "")}%`).join(" · ");
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(normLabel).sort();
  const right = b.map(normLabel).sort();
  return left.every((v, i) => v === right[i]);
}

function sameFactorSet(a: MarginFactorKey[], b: MarginFactorKey[]): boolean {
  const left = [...normalizeFactors(a)].sort();
  const right = [...normalizeFactors(b)].sort();
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

export function isFullStack(factors: MarginFactorKey[]): boolean {
  return normalizeFactors(factors).length === ALL_MARGIN_FACTORS.length;
}

export function applyMarginAssignment(
  project: LoadedProject,
  input: {
    name: string;
    factors: MarginFactorKey[];
    stack: MarginStack;
    presetId: string | null;
    targetKind: MarginTargetKind;
    targetIds: string[];
  },
): LoadedProject {
  const factors = normalizeFactors(input.factors);
  const stack = cloneMarginStack(input.stack);
  if (input.targetKind === "job" && isFullStack(factors)) {
    return { ...project, margin: stack };
  }
  const targetIds = input.targetKind === "job" ? [] : [...input.targetIds];
  if (input.targetKind !== "job" && targetIds.length === 0) return project;
  const next: MarginRule = {
    id: newId("mg"),
    name: input.name.trim() || "Margin assignment",
    enabled: true,
    factors,
    stack,
    presetId: input.presetId,
    targetKind: input.targetKind,
    targetIds,
    notes: "",
  };
  const existing = rulesOf(project);
  const idx = existing.findIndex(
    (r) =>
      r.targetKind === next.targetKind &&
      sameIdSet(r.targetIds, next.targetIds) &&
      sameFactorSet(r.factors, next.factors),
  );
  const marginRules =
    idx >= 0 ? existing.map((r, i) => (i === idx ? { ...next, id: r.id, notes: r.notes } : r)) : [...existing, next];
  return { ...project, marginRules };
}

export function upsertMarginPreset(project: LoadedProject, preset: MarginPreset): LoadedProject {
  const presets = presetsOf(project);
  const idx = presets.findIndex((p) => p.id === preset.id);
  const marginPresets = idx >= 0 ? presets.map((p) => (p.id === preset.id ? preset : p)) : [...presets, preset];
  const marginRules = rulesOf(project).map((r) =>
    r.presetId === preset.id ? { ...r, stack: cloneMarginStack(preset.stack) } : r,
  );
  return { ...project, marginPresets, marginRules };
}

export function parseMarginPresets(raw: unknown): MarginPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: MarginPreset[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const stack = parseStack(r.stack);
    if (!stack) continue;
    out.push({
      id: String(r.id || newId("mp")),
      name: String(r.name || "Group"),
      stack,
    });
  }
  return out;
}

export function parseMarginRules(raw: unknown): MarginRule[] {
  if (!Array.isArray(raw)) return [];
  const kinds = new Set<MarginTargetKind>(["job", "bill", "section", "category", "item"]);
  const out: MarginRule[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const stack = parseStack(r.stack);
    const targetKind = kinds.has(r.targetKind as MarginTargetKind) ? (r.targetKind as MarginTargetKind) : null;
    if (!stack || !targetKind) continue;
    out.push({
      id: String(r.id || newId("mg")),
      name: String(r.name || "Assignment"),
      enabled: r.enabled !== false,
      factors: normalizeFactors(Array.isArray(r.factors) ? (r.factors as MarginFactorKey[]) : undefined),
      stack,
      presetId: r.presetId == null || r.presetId === "" ? null : String(r.presetId),
      targetKind,
      targetIds: Array.isArray(r.targetIds) ? r.targetIds.map((x) => String(x)) : [],
      notes: String(r.notes || ""),
    });
  }
  return out;
}

function parseStack(raw: unknown): MarginStack | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  return {
    overheadPct: n(r.overheadPct),
    profitPct: n(r.profitPct),
    logisticsPct: n(r.logisticsPct),
    contingencyPct: n(r.contingencyPct),
  };
}
