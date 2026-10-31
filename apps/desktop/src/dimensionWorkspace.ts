import {
  evaluateLink,
  groupQuantity,
  groupQuantityMap,
  readQuantityLink,
  referencedGroupIds,
  type GroupInput,
  type LinkCellState,
  type MarkInput,
} from "@aerolith/calc";
import { itemKeyOf, sameItemKey } from "./bills";
import {
  newId,
  type AnalysisLine,
  type DimensionGroup,
  type DimensionMark,
  type DrawingSheet,
  type LoadedProject,
  type RateBuildUp,
  type WorkingItem,
} from "./model";

export const GROUP_COLORS = ["#c65a28", "#1d4ed8", "#0f766e", "#6d28d9", "#9a4318", "#1F7A4D", "#b45309", "#334155"];

const DRAG_PREFIX = "bidcraft-group:";

export function groupDragPayload(groupId: string): string {
  return `${DRAG_PREFIX}${groupId}`;
}

export function groupIdFromDrop(raw: string): string | null {
  const text = raw.trim();
  if (!text.startsWith(DRAG_PREFIX)) return null;
  const id = text.slice(DRAG_PREFIX.length).trim();
  return id || null;
}

export function freshWorkspace(): Pick<LoadedProject, "drawings" | "dimensionGroups" | "dimensionMarks" | "rateLibrary"> {
  const drawing: DrawingSheet = { id: "dwg-a101", name: "A-101 Plan", code: "A-101" };
  const slab: DimensionGroup = {
    id: "grp-slab",
    drawingId: drawing.id,
    name: "Slab",
    kind: "area",
    color: GROUP_COLORS[0]!,
    zone: "Ground",
    unit: "m2",
    factor: 1,
    cutout: false,
    parentId: null,
  };
  const opening: DimensionGroup = {
    id: "grp-opening",
    drawingId: drawing.id,
    name: "Opening",
    kind: "area",
    color: GROUP_COLORS[1]!,
    zone: "Ground",
    unit: "m2",
    factor: 1,
    cutout: true,
    parentId: slab.id,
  };
  return {
    drawings: [drawing],
    dimensionGroups: [slab, opening],
    dimensionMarks: [
      {
        id: "mk-slab",
        groupId: slab.id,
        label: "Slab",
        length: 10,
        width: 4,
        count: 1,
        deduct: false,
        overrideQty: null,
        x: 12,
        y: 18,
        w: 46,
        h: 28,
        note: "",
      },
      {
        id: "mk-opening",
        groupId: opening.id,
        label: "Opening",
        length: 2,
        width: 1,
        count: 1,
        deduct: false,
        overrideQty: null,
        x: 40,
        y: 28,
        w: 12,
        h: 8,
        note: "",
      },
    ],
    rateLibrary: [
      {
        id: "rate-conc",
        code: "CONC-30",
        phrase: "Concrete grade 30, placed and finished",
        unit: "m3",
        basedOnId: null,
        lines: [
          {
            factors: [1],
            wastagePct: 0.05,
            resourceRate: 280,
            description: "Concrete 30",
            unit: "m3",
            projectResourceCode: null,
          },
        ],
      },
    ],
  };
}

export function drawingsOf(project: LoadedProject): DrawingSheet[] {
  return project.drawings ?? [];
}

export function groupsOf(project: LoadedProject): DimensionGroup[] {
  return project.dimensionGroups ?? [];
}

export function marksOf(project: LoadedProject): DimensionMark[] {
  return project.dimensionMarks ?? [];
}

export function libraryOf(project: LoadedProject): RateBuildUp[] {
  return project.rateLibrary ?? [];
}

function toGroup(group: DimensionGroup): GroupInput {
  return {
    id: group.id,
    kind: group.kind,
    factor: group.factor,
    cutout: group.cutout,
    parentId: group.parentId,
  };
}

function toMark(mark: DimensionMark): MarkInput {
  return {
    groupId: mark.groupId,
    length: mark.length,
    width: mark.width,
    count: mark.count,
    deduct: mark.deduct,
    overrideQty: mark.overrideQty,
  };
}

export function quantityMap(project: LoadedProject): Map<string, number> {
  return groupQuantityMap(groupsOf(project).map(toGroup), marksOf(project).map(toMark));
}

export function netOf(project: LoadedProject, groupId: string): number {
  return groupQuantity(groupId, groupsOf(project).map(toGroup), marksOf(project).map(toMark));
}

export function groupById(project: LoadedProject, id: string): DimensionGroup | null {
  return groupsOf(project).find((g) => g.id === id) ?? null;
}

export function readItemQuantityLink(project: LoadedProject, item: WorkingItem) {
  const groups = groupsOf(project).map(toGroup);
  const marks = marksOf(project).map(toMark);
  return readQuantityLink({
    expression: item.qtyLink,
    locked: Boolean(item.qtyLinkLocked),
    quantities: quantityMap(project),
    groups,
    marks,
    groupName: (id) => groupById(project, id)?.name ?? id,
  });
}

export function readItemRateLink(
  project: LoadedProject,
  item: WorkingItem,
  linkedLabel: string | null,
): { state: LinkCellState; title: string } {
  if ((item.analysisOrigin ?? "own") === "link") {
    if (!item.linkedBoqCode) return { state: "broken", title: "Rate link is missing its source item." };
    return { state: "linked", title: `Linked rate from ${linkedLabel ?? item.linkedBoqCode}.` };
  }
  if (item.basedOnId) {
    const phrase = libraryOf(project).find((row) => row.id === item.basedOnId);
    if (!phrase) return { state: "broken", title: "Based-on rate build-up was removed from the library." };
    return { state: "drill", title: `Rate build-up based on ${phrase.code}. ${phrase.phrase}.` };
  }
  return { state: "typed", title: "Rate comes from this item's own analysis." };
}

export function postQuantities(project: LoadedProject, qtoSums: Map<string, number>): LoadedProject {
  const quantities = quantityMap(project);
  return {
    ...project,
    items: project.items.map((item) => {
      if (item.kind !== "item") return item;
      const expr = item.qtyLink?.trim();
      if (expr) {
        if (item.qtyLinkLocked) return item;
        const evaluated = evaluateLink(expr, quantities);
        if (evaluated.ok && evaluated.value != null) return { ...item, ourQty: evaluated.value };
        return item;
      }
      const qty = qtoSums.get(itemKeyOf(item)) ?? qtoSums.get(item.boqCode) ?? 0;
      return { ...item, ourQty: qty };
    }),
  };
}

function cloneLines(lines: AnalysisLine[]): AnalysisLine[] {
  return lines.map((line) => ({ ...line, factors: [...line.factors] }));
}

export function resolveBuildUpLines(library: RateBuildUp[], id: string, seen = new Set<string>()): AnalysisLine[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const entry = library.find((row) => row.id === id);
  if (!entry) return [];
  if (entry.lines.length) return cloneLines(entry.lines);
  if (entry.basedOnId) return resolveBuildUpLines(library, entry.basedOnId, seen);
  return [];
}

export function refreshBasedOn(project: LoadedProject): LoadedProject {
  const library = libraryOf(project);
  if (!project.items.some((item) => item.basedOnId)) return project;
  return {
    ...project,
    items: project.items.map((item) => {
      if (item.kind !== "item" || !item.basedOnId || item.analysisOrigin === "link") return item;
      const lines = resolveBuildUpLines(library, item.basedOnId);
      if (!lines.length) return item;
      return { ...item, lines, priceMode: "analysis", analysisOrigin: "own" };
    }),
  };
}

export interface AuditIssue {
  id: string;
  kind: "unused-group" | "broken-link" | "unpriced";
  label: string;
  detail: string;
  groupId?: string;
  itemKey?: string;
}

export function auditWorkspace(project: LoadedProject): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const used = new Set<string>();
  for (const item of project.items) {
    if (item.kind !== "item") continue;
    const expr = item.qtyLink?.trim() ?? "";
    if (expr) {
      const ids = referencedGroupIds(expr);
      for (const id of ids) used.add(id);
      const read = readItemQuantityLink(project, item);
      if (read.state === "broken") {
        issues.push({
          id: `broken-${itemKeyOf(item)}`,
          kind: "broken-link",
          label: item.boqCode,
          detail: read.title,
          itemKey: itemKeyOf(item),
        });
      }
    }
    if (!item.result || item.result.rate === 0) {
      issues.push({
        id: `unpriced-${itemKeyOf(item)}`,
        kind: "unpriced",
        label: item.boqCode,
        detail: `${item.description || "Item"} has no rate yet.`,
        itemKey: itemKeyOf(item),
      });
    }
    if (item.basedOnId && !libraryOf(project).some((row) => row.id === item.basedOnId)) {
      issues.push({
        id: `rate-${itemKeyOf(item)}`,
        kind: "broken-link",
        label: item.boqCode,
        detail: "Based-on rate build-up is missing from the library.",
        itemKey: itemKeyOf(item),
      });
    }
  }
  for (const group of groupsOf(project)) {
    const usedByParent = Boolean(group.cutout && group.parentId && used.has(group.parentId));
    if (used.has(group.id) || usedByParent) continue;
    issues.push({
      id: `unused-${group.id}`,
      kind: "unused-group",
      label: group.name,
      detail: `${group.name} is not linked to a quantity cell.`,
      groupId: group.id,
    });
  }
  return issues;
}

export function hotItemKeys(project: LoadedProject, groupId: string | null): Set<string> {
  const hot = new Set<string>();
  if (!groupId) return hot;
  for (const item of project.items) {
    if (item.kind !== "item") continue;
    if (referencedGroupIds(item.qtyLink ?? "").includes(groupId)) hot.add(itemKeyOf(item));
  }
  return hot;
}

function unitFor(kind: DimensionGroup["kind"]): string {
  if (kind === "area") return "m2";
  if (kind === "length") return "m";
  return "Nr";
}

export function addDrawing(project: LoadedProject, name = "New drawing"): LoadedProject {
  const n = drawingsOf(project).length + 1;
  const drawing: DrawingSheet = { id: newId("dwg"), name, code: `A-${100 + n}` };
  return { ...project, drawings: [...drawingsOf(project), drawing] };
}

export function addGroup(
  project: LoadedProject,
  kind: DimensionGroup["kind"],
  drawingId?: string | null,
  parentId?: string | null,
): LoadedProject {
  let drawings = drawingsOf(project);
  let drawing = drawingId ? drawings.find((d) => d.id === drawingId) : drawings[0];
  if (!drawing) {
    const withDrawing = addDrawing(project);
    drawings = drawingsOf(withDrawing);
    drawing = drawings[0];
    project = withDrawing;
  }
  if (!drawing) return project;
  const groups = groupsOf(project);
  const parent = parentId ? groups.find((g) => g.id === parentId) : null;
  const group: DimensionGroup = {
    id: newId("grp"),
    drawingId: parent?.drawingId ?? drawing.id,
    name: kind === "area" ? "New area" : kind === "length" ? "New length" : "New count",
    kind,
    color: GROUP_COLORS[groups.length % GROUP_COLORS.length]!,
    zone: parent?.zone ?? "Zone 1",
    unit: unitFor(kind),
    factor: 1,
    cutout: Boolean(parent),
    parentId: parent?.id ?? null,
  };
  return { ...project, drawings, dimensionGroups: [...groups, group] };
}

export function addMark(project: LoadedProject, groupId: string, deduct = false): LoadedProject {
  const group = groupById(project, groupId);
  if (!group) return project;
  const existing = marksOf(project).filter((m) => m.groupId === groupId).length;
  const mark: DimensionMark = {
    id: newId("mk"),
    groupId,
    label: deduct ? "Cutout" : group.name,
    length: group.kind === "count" ? null : 5,
    width: group.kind === "area" ? 2 : null,
    count: 1,
    deduct,
    overrideQty: null,
    x: 8 + (existing % 4) * 18,
    y: 12 + (existing % 3) * 16,
    w: group.kind === "count" ? 8 : group.kind === "length" ? 28 : 18,
    h: group.kind === "length" ? 4 : group.kind === "count" ? 8 : 12,
    note: "",
  };
  return { ...project, dimensionMarks: [...marksOf(project), mark] };
}

export function patchGroup(project: LoadedProject, groupId: string, patch: Partial<DimensionGroup>): LoadedProject {
  return {
    ...project,
    dimensionGroups: groupsOf(project).map((group) => (group.id === groupId ? { ...group, ...patch, id: group.id } : group)),
  };
}

export function patchMark(project: LoadedProject, markId: string, patch: Partial<DimensionMark>): LoadedProject {
  return {
    ...project,
    dimensionMarks: marksOf(project).map((mark) => (mark.id === markId ? { ...mark, ...patch, id: mark.id } : mark)),
  };
}

export function cycleGroupColor(project: LoadedProject, groupId: string): LoadedProject {
  const group = groupById(project, groupId);
  if (!group) return project;
  const index = GROUP_COLORS.indexOf(group.color);
  const next = GROUP_COLORS[(index + 1) % GROUP_COLORS.length]!;
  return patchGroup(project, groupId, { color: next });
}

export function linkGroupToItem(
  project: LoadedProject,
  itemKey: string,
  groupId: string,
  field: "quantity" | "description",
  zone: string | null,
): LoadedProject {
  const group = groupById(project, groupId);
  if (!group) return project;
  const nextZone = zone ?? group.zone;
  const withZone = patchGroup(project, groupId, { zone: nextZone });
  return {
    ...withZone,
    items: withZone.items.map((item) => {
      if (!sameItemKey(item, itemKey) || item.kind !== "item") return item;
      if (field === "description") {
        const note = nextZone ? `${group.name} (${nextZone})` : group.name;
        if (item.description.includes(group.name)) return item;
        const description = item.description.trim() ? `${item.description.trim()} — ${note}` : note;
        return { ...item, description };
      }
      const current = referencedGroupIds(item.qtyLink ?? "");
      const expression = current.includes(groupId)
        ? (item.qtyLink ?? `G:${groupId}`)
        : current.length
          ? `${item.qtyLink}+G:${groupId}`
          : `G:${groupId}`;
      return { ...item, qtyLink: expression, qtyLinkLocked: false };
    }),
  };
}

export function applyBuildUp(project: LoadedProject, itemKey: string, rateId: string): LoadedProject {
  const lines = resolveBuildUpLines(libraryOf(project), rateId);
  return {
    ...project,
    items: project.items.map((item) => {
      if (!sameItemKey(item, itemKey) || item.kind !== "item") return item;
      return {
        ...item,
        basedOnId: rateId,
        lines: lines.length ? lines : item.lines,
        priceMode: "analysis",
        analysisOrigin: "own",
      };
    }),
  };
}

export function saveBuildUpFromItem(project: LoadedProject, itemKey: string): LoadedProject {
  const item = project.items.find((row) => sameItemKey(row, itemKey) && row.kind === "item");
  if (!item) return project;
  const entry: RateBuildUp = {
    id: newId("rate"),
    code: item.boqCode.replace(/[^\w.-]+/g, "").slice(0, 16) || "RATE",
    phrase: item.description || "Build-up",
    unit: item.unit || "Nr",
    basedOnId: null,
    lines: cloneLines(item.lines),
  };
  return {
    ...project,
    rateLibrary: [...libraryOf(project), entry],
    items: project.items.map((row) => (sameItemKey(row, itemKey) ? { ...row, basedOnId: entry.id } : row)),
  };
}

export function zonesOf(project: LoadedProject): string[] {
  const zones = new Set<string>();
  for (const group of groupsOf(project)) {
    if (group.zone.trim()) zones.add(group.zone.trim());
  }
  return [...zones];
}
