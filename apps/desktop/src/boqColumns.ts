import type { BoqColumnDef, ClientNode, LoadedProject, WorkingItem } from "./model";
import { newId } from "./model";

export function defaultClientColumns(): BoqColumnDef[] {
  return [
    { id: "sl", label: "No.", role: "sl", valueType: "text" },
    { id: "description", label: "Description", role: "description", valueType: "text" },
    { id: "qty", label: "Qty", role: "qty", valueType: "number" },
    { id: "unit", label: "Unit", role: "unit", valueType: "text" },
  ];
}

export function extraClientColumns(project: LoadedProject | null | undefined): BoqColumnDef[] {
  return (project?.clientColumns ?? defaultClientColumns()).filter((c) => c.role === "extra");
}

export function workingColumnsOf(project: LoadedProject | null | undefined): BoqColumnDef[] {
  return project?.workingColumns ?? [];
}

export function filterableColumns(project: LoadedProject | null | undefined): BoqColumnDef[] {
  return [...extraClientColumns(project), ...workingColumnsOf(project)];
}

export function extraValue(record: { extra?: Record<string, string> } | null | undefined, colId: string): string {
  return record?.extra?.[colId] ?? "";
}

export function slugColumnId(label: string, prefix: string, used: Iterable<string>): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const root = `${prefix}-${base || "col"}`;
  const have = new Set(used);
  if (!have.has(root)) return root;
  let n = 2;
  while (have.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export function newWorkingColumn(label: string, existing: BoqColumnDef[]): BoqColumnDef {
  const name = label.trim() || "Column";
  return {
    id: slugColumnId(name, "w", existing.map((c) => c.id)) || newId("w"),
    label: name,
    role: "extra",
    valueType: "text",
  };
}

export function parseColumnDefs(raw: unknown): BoqColumnDef[] | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const out: BoqColumnDef[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? "").trim();
      const label = String(r.label ?? "").trim();
      if (!id || !label) continue;
      const role =
        r.role === "sl" || r.role === "description" || r.role === "qty" || r.role === "unit" || r.role === "extra"
          ? r.role
          : "extra";
      out.push({
        id,
        label,
        role,
        valueType: r.valueType === "number" ? "number" : "text",
      });
    }
    return out;
  } catch {
    return undefined;
  }
}

export function withDefaultColumns<T extends { clientColumns?: BoqColumnDef[]; workingColumns?: BoqColumnDef[] }>(
  project: T,
): T {
  return {
    ...project,
    clientColumns: project.clientColumns?.length ? project.clientColumns : defaultClientColumns(),
    workingColumns: project.workingColumns ?? [],
  };
}

export function itemSearchHaystack(item: WorkingItem): string {
  const extra = Object.values(item.extra ?? {}).join(" ");
  return `${item.boqCode} ${item.slNo} ${item.description} ${item.unit ?? ""} ${item.workCategory ?? ""} ${extra}`.toLowerCase();
}

export function itemMatchesQuery(item: WorkingItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return itemSearchHaystack(item).includes(q);
}

export function itemMatchesColumnFilters(item: WorkingItem, filters: Record<string, string>): boolean {
  for (const [id, raw] of Object.entries(filters)) {
    const needle = raw.trim().toLowerCase();
    if (!needle) continue;
    if (!extraValue(item, id).toLowerCase().includes(needle)) return false;
  }
  return true;
}

export function filterWorkingItems(
  items: WorkingItem[],
  query: string,
  filters: Record<string, string>,
): WorkingItem[] {
  return items.filter((i) => {
    if (i.kind === "section") return true;
    return itemMatchesQuery(i, query) && itemMatchesColumnFilters(i, filters);
  });
}

export function extraFromClientNode(node: ClientNode | undefined, cols: BoqColumnDef[]): Record<string, string> {
  if (!node) return {};
  const extra = { ...(node.extra ?? {}) };
  for (const col of cols.filter((c) => c.role === "extra")) {
    if (extra[col.id] == null) extra[col.id] = "";
  }
  return extra;
}
