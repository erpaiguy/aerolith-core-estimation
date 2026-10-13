import { DEFAULT_DISPLAY_FORMAT } from "@aerolith/shared";
import projectMeta from "@fixtures/project.json";
import workingJson from "@fixtures/working_boq.json";
import analysesJson from "@fixtures/rate_analyses.json";
import resourcesJson from "@fixtures/project_resources.json";
import clientJson from "@fixtures/client_boq.json";
import type {
  AnalysisLine,
  LoadedProject,
  ProjectResource,
  QtoLine,
  ResourceQuote,
  WorkingItem,
} from "./model";
import { BUILTIN_QUOTE_FIELDS, inferParents, stampItem } from "./model";
import { billById, defaultBill, DEFAULT_BILL_ID, itemKeyOf, nextBill } from "./bills";
import { cloneResourceMaster, masterToProjectResource, type ResourceMasterRow } from "./resourceMaster";
import { defaultClientColumns } from "./boqColumns";
import { SAMPLE_LOCKED_AT, seedReferenceWorkflow } from "./sampleSeed";
import { appGlobalCatalog, snapshotFromCatalog, type TenantCatalog } from "./tenantCatalog";
export { loadCampusSampleProject } from "./loadCampusSample";

function norm(code: string): string {
  return code.toLowerCase();
}

function appMasters() {
  return snapshotFromCatalog(appGlobalCatalog());
}

export function loadReferenceProject(): LoadedProject {
  const analyses = analysesJson as Array<{
    boq_code: string;
    lines: Array<{
      factors: number[];
      wastage_pct: number;
      resource_rate: number;
      description?: string;
      project_resource_code?: string;
      unit?: string;
    }>;
  }>;
  const amap = new Map(analyses.map((a) => [norm(a.boq_code), a]));

  const items: WorkingItem[] = inferParents(
    (workingJson as Array<Record<string, unknown>>).map((w) => {
      const kind = w.kind as "section" | "item";
      const code = String(w.boq_code);
      const a = amap.get(norm(code));
      const lines: AnalysisLine[] =
        kind === "item" && a
          ? a.lines.map((l) => ({
              factors: l.factors,
              wastagePct: l.wastage_pct ?? 0,
              resourceRate: l.resource_rate ?? 0,
              description: l.description ?? null,
              projectResourceCode: l.project_resource_code ?? null,
              unit: l.unit ?? null,
            }))
          : [];
      return stampItem({
        billId: DEFAULT_BILL_ID,
        boqCode: code,
        slNo: String(w.sl_no ?? ""),
        kind,
        parentCode: null,
        description: String(w.description ?? ""),
        boqCategory: (w.boq_category as string) ?? null,
        workCategory: (w.work_category as string) ?? null,
        subWorkCategory: (w.sub_work_category as string) ?? null,
        group1: (w.group1 as string) ?? null,
        group2: (w.group2 as string) ?? null,
        group3: (w.group3 as string) ?? null,
        clientQty: Number(w.client_qty ?? 0),
        ourQty: Number(w.our_qty ?? 0),
        unit: (w.unit as string) ?? null,
        lines,
      });
    }),
  );

  const resources: ProjectResource[] = (resourcesJson as LoadedProject["resources"]).map((r) => ({
    ...r,
    rate_source: "quote",
  }));

  const qtoLines: QtoLine[] = items
    .filter((i) => i.kind === "item")
    .map((i, idx) => ({
      id: `qto-ref-${idx}`,
      workCategory: i.workCategory,
      drawing: null,
      locationDesc: null,
      itemLabel: i.description,
      subItem: null,
      formulaKey: "qty",
      dims: { l: i.ourQty },
      workingBoqCode: itemKeyOf(i),
      billId: DEFAULT_BILL_ID,
    }));

  const resourceQuotes: ResourceQuote[] = resources.map((r, idx) => ({
    id: `rq-ref-${idx}`,
    projectResourceCode: r.project_code,
    vendorName: "Vendor 1",
    rate: r.project_rate ?? 0,
    selected: true,
  }));

  const meta = projectMeta as {
    name: string;
    overhead_pct: number;
    profit_pct: number;
    logistics_pct: number;
    contingency_pct: number;
    currency?: string;
  };

  return seedReferenceWorkflow({
    name: meta.name.replace(/^Project -\s*/, ""),
    locationNote: "Reference project loaded from the Estimation Master workbook (numbers only).",
    margin: {
      overheadPct: meta.overhead_pct,
      profitPct: meta.profit_pct,
      logisticsPct: meta.logistics_pct,
      contingencyPct: meta.contingency_pct,
    },
    marginPresets: [],
    marginRules: [],
    currency: meta.currency ?? "QAR",
    qtySource: "client_plus_adjustments",
    bills: [defaultBill(meta.name.replace(/^Project -\s*/, "") || "BOQ 1", SAMPLE_LOCKED_AT)],
    items,
    clientNodes: (clientJson as LoadedProject["clientNodes"]).map((n) => ({ ...n, billId: DEFAULT_BILL_ID })),
    clientColumns: defaultClientColumns(),
    workingColumns: [],
    resources,
    ...appMasters(),
    qtoLines,
    resourceQuotes,
    itemQuotes: [],
    enquiries: [],
    quoteReplies: [],
    quoteFieldDefs: BUILTIN_QUOTE_FIELDS.map((d) => ({ ...d })),
    queryItems: [],
    queryLists: [],
    sourceLockedAt: SAMPLE_LOCKED_AT,
    sealedAt: null,
    revision: 1,
    isDemo: true,
  });
}

export function emptyProject(
  name = "New project",
  currency = DEFAULT_DISPLAY_FORMAT.currency,
  catalog?: TenantCatalog,
  resourceMaster?: ResourceMasterRow[],
): LoadedProject {
  const masters = snapshotFromCatalog(catalog ?? appGlobalCatalog());
  const master = cloneResourceMaster(resourceMaster ?? []);
  return {
    name,
    locationNote: "",
    margin: {
      overheadPct: 0.1,
      profitPct: 0.3,
      logisticsPct: 0.025,
      contingencyPct: 0.05,
    },
    marginPresets: [],
    marginRules: [],
    currency,
    qtySource: "client_plus_adjustments",
    isDemo: false,
    bills: [defaultBill(name, null)],
    items: inferParents([
      stampItem({
        boqCode: "1",
        slNo: "1",
        kind: "section",
        parentCode: null,
        description: "Main bill",
        boqCategory: null,
        workCategory: null,
        subWorkCategory: null,
        group1: null,
        group2: null,
        group3: null,
        clientQty: 0,
        ourQty: 0,
        unit: null,
        lines: [],
      }),
      stampItem({
        boqCode: "1a",
        slNo: "a",
        kind: "item",
        parentCode: "1",
        description: "Type the first item here",
        boqCategory: "Main bill",
        workCategory: null,
        subWorkCategory: null,
        group1: null,
        group2: null,
        group3: null,
        clientQty: 1,
        ourQty: 1,
        unit: "L/s",
        directCost: 0,
        lines: [],
      }),
    ]),
    clientNodes: [
      { row: 1, kind: "title", description: name, billId: DEFAULT_BILL_ID },
      { row: 2, kind: "section", sl_no: "1", description: "Main bill", billId: DEFAULT_BILL_ID, boqCode: `${DEFAULT_BILL_ID}::1` },
      { row: 3, kind: "item", sl_no: "a", description: "Type the first item here", qty: 1, unit: "L/s", billId: DEFAULT_BILL_ID, boqCode: `${DEFAULT_BILL_ID}::1a` },
    ],
    clientColumns: defaultClientColumns(),
    workingColumns: [],
    resources: master.map(masterToProjectResource),
    resourceMaster: master,
    units: masters.units,
    categories: masters.categories,
    vendors: masters.vendors,
    qtoLines: [
      {
        id: "qto-1a",
        billId: DEFAULT_BILL_ID,
        workCategory: null,
        drawing: null,
        locationDesc: null,
        itemLabel: "Type the first item here",
        subItem: null,
        formulaKey: "qty",
        dims: { l: 1 },
        workingBoqCode: `${DEFAULT_BILL_ID}::1a`,
      },
    ],
    resourceQuotes: [],
    itemQuotes: [],
    enquiries: [],
    quoteReplies: [],
    quoteFieldDefs: BUILTIN_QUOTE_FIELDS.map((d) => ({ ...d })),
    queryItems: [],
    queryLists: [],
    sourceLockedAt: null,
    sealedAt: null,
    revision: 1,
    catalogVersion: masters.catalogVersion,
  };
}

function rowsToBill(
  name: string,
  rows: Array<{ sl: string; description: string; qty: number | null; unit: string; extra?: Record<string, string> }>,
  billId: string,
): { items: WorkingItem[]; clientNodes: LoadedProject["clientNodes"] } {
  const items: WorkingItem[] = [];
  const clientNodes: LoadedProject["clientNodes"] = [{ row: 1, kind: "title", description: name, billId }];
  let section = 0;
  let sort = 0;
  for (const row of rows) {
    sort += 1;
    const extra = { ...(row.extra ?? {}) };
    if (row.qty == null || Number.isNaN(row.qty)) {
      section += 1;
      const fromSl = (row.sl || "").trim().match(/^(\d+)/);
      const code = fromSl?.[1] ?? String(section);
      section = Math.max(section, Number(code) || section);
      const item = stampItem({
        billId,
        boqCode: code,
        slNo: row.sl || code,
        kind: "section",
        parentCode: null,
        description: row.description,
        boqCategory: row.description,
        workCategory: null,
        subWorkCategory: null,
        group1: null,
        group2: null,
        group3: null,
        clientQty: 0,
        ourQty: 0,
        unit: null,
        extra,
        lines: [],
      });
      items.push(item);
      clientNodes.push({
        row: sort + 1,
        kind: "section",
        sl_no: row.sl,
        description: row.description,
        extra,
        billId,
        boqCode: itemKeyOf(item),
      });
    } else {
      const parent = items.filter((i) => i.kind === "section").at(-1)?.boqCode ?? "1";
      if (!items.some((i) => i.kind === "section")) {
        items.push(
          stampItem({
            billId,
            boqCode: "1",
            slNo: "1",
            kind: "section",
            parentCode: null,
            description: "Main bill",
            boqCategory: "Main bill",
            workCategory: null,
            subWorkCategory: null,
            group1: null,
            group2: null,
            group3: null,
            clientQty: 0,
            ourQty: 0,
            unit: null,
            lines: [],
          }),
        );
      }
      const letter = row.sl || String(items.filter((i) => i.kind === "item").length + 1);
      const code = `${parent}${letter}`;
      const item = stampItem({
        billId,
        boqCode: code,
        slNo: letter,
        kind: "item",
        parentCode: parent,
        description: row.description,
        boqCategory: items.find((i) => i.boqCode === parent)?.description ?? null,
        workCategory: null,
        subWorkCategory: null,
        group1: null,
        group2: null,
        group3: null,
        clientQty: row.qty,
        ourQty: row.qty,
        unit: row.unit || "Nr",
        directCost: 0,
        extra,
        lines: [],
      });
      items.push(item);
      clientNodes.push({
        row: sort + 1,
        kind: "item",
        sl_no: letter,
        description: row.description,
        qty: row.qty,
        unit: row.unit,
        extra,
        billId,
        boqCode: itemKeyOf(item),
      });
    }
  }
  return { items: inferParents(items), clientNodes };
}

export function projectFromClientRows(
  name: string,
  rows: Array<{ sl: string; description: string; qty: number | null; unit: string; extra?: Record<string, string> }>,
  clientColumns = defaultClientColumns(),
  currency = DEFAULT_DISPLAY_FORMAT.currency,
  catalog?: TenantCatalog,
): LoadedProject {
  const lockedAt = new Date().toISOString();
  const base = emptyProject(name, currency, catalog);
  const bill = defaultBill(name, lockedAt);
  const built = rowsToBill(name, rows, bill.id);
  const items = built.items.length ? built.items : base.items;
  return {
    ...base,
    bills: [bill],
    items,
    clientNodes: built.clientNodes,
    clientColumns,
    workingColumns: [],
    qtoLines: items
      .filter((i) => i.kind === "item")
      .map((i, idx) => ({
        id: `qto-imp-${idx}`,
        billId: i.billId,
        workCategory: null,
        drawing: null,
        locationDesc: null,
        itemLabel: i.description,
        subItem: null,
        formulaKey: "qty" as const,
        dims: { l: i.ourQty },
        workingBoqCode: itemKeyOf(i),
      })),
    sourceLockedAt: lockedAt,
    sealedAt: null,
    revision: 1,
  };
}

export function appendBillFromClientRows(
  project: LoadedProject,
  name: string,
  rows: Array<{ sl: string; description: string; qty: number | null; unit: string; extra?: Record<string, string> }>,
  issuedRef = "",
): LoadedProject {
  const bill = { ...nextBill(project, name, issuedRef), sourceLockedAt: new Date().toISOString() };
  const built = rowsToBill(name, rows, bill.id);
  const qto = built.items
    .filter((i) => i.kind === "item")
    .map((i, idx) => ({
      id: `qto-imp-${bill.id}-${idx}`,
      billId: i.billId,
      workCategory: null as string | null,
      drawing: null as string | null,
      locationDesc: null as string | null,
      itemLabel: i.description,
      subItem: null as string | null,
      formulaKey: "qty" as const,
      dims: { l: i.ourQty },
      workingBoqCode: itemKeyOf(i),
    }));
  const title = project.clientNodes.find((n) => n.kind === "title") ?? {
    row: 1,
    kind: "title",
    description: project.name,
  };
  const existing = project.clientNodes.filter((n) => n.kind !== "title");
  const added = built.clientNodes.filter((n) => n.kind !== "title");
  const clientNodes = [title, ...existing, ...added].map((n, i) => ({ ...n, row: i + 1 }));
  return {
    ...project,
    bills: [...(project.bills ?? []), bill],
    items: [...project.items, ...built.items],
    clientNodes,
    qtoLines: [...project.qtoLines, ...qto],
  };
}

export type ClientImportRow = {
  sl: string;
  description: string;
  qty: number | null;
  unit: string;
  extra?: Record<string, string>;
};

export type BillAmendmentReport = {
  qtyChanged: number;
  itemsAdded: number;
  sectionsAdded: number;
};

function normDesc(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueBoqCode(used: Set<string>, wanted: string): string {
  const key = wanted.toLowerCase();
  if (!used.has(key)) return wanted;
  let n = 2;
  while (used.has(`${wanted}-${n}`.toLowerCase())) n += 1;
  return `${wanted}-${n}`;
}

/** Apply a client amendment onto one issued bill: qty changes, new items, extra pages, tender-adjustment sections. */
export function amendBillFromClientRows(
  project: LoadedProject,
  billId: string,
  rows: ClientImportRow[],
): { project: LoadedProject; report: BillAmendmentReport } {
  const bill = billById(project, billId);
  if (!bill) return { project, report: { qtyChanged: 0, itemsAdded: 0, sectionsAdded: 0 } };
  const built = rowsToBill(bill.name, rows, billId);
  const existing = project.items.filter((i) => i.billId === billId);
  const others = project.items.filter((i) => i.billId !== billId);
  const unmatched = [...existing];
  const nextItems = [...existing];
  const usedCodes = new Set(existing.map((i) => i.boqCode.toLowerCase()));
  const report: BillAmendmentReport = { qtyChanged: 0, itemsAdded: 0, sectionsAdded: 0 };
  const take = (pred: (i: (typeof existing)[number]) => boolean) => {
    const i = unmatched.findIndex(pred);
    if (i < 0) return undefined;
    return unmatched.splice(i, 1)[0];
  };

  for (const proposed of built.items) {
    const byDesc = take((i) => i.kind === proposed.kind && normDesc(i.description) === normDesc(proposed.description));
    const byCode =
      byDesc ??
      take((i) => i.kind === proposed.kind && i.boqCode.toLowerCase() === proposed.boqCode.toLowerCase());
    if (byCode) {
      const idx = nextItems.findIndex((i) => i.id === byCode.id);
      if (idx < 0) continue;
      const prev = nextItems[idx]!;
      const qtyChanged = prev.kind === "item" && prev.clientQty !== proposed.clientQty;
      if (qtyChanged) report.qtyChanged += 1;
      nextItems[idx] = {
        ...prev,
        description: proposed.description,
        slNo: proposed.slNo || prev.slNo,
        unit: proposed.unit ?? prev.unit,
        extra: { ...(prev.extra ?? {}), ...(proposed.extra ?? {}) },
        clientQty: prev.kind === "item" ? proposed.clientQty : prev.clientQty,
      };
      continue;
    }
    const code = uniqueBoqCode(usedCodes, proposed.boqCode);
    usedCodes.add(code.toLowerCase());
    const added = stampItem({
      ...proposed,
      id: undefined,
      billId,
      boqCode: code,
      clientLinkCode: code,
      ourQty: proposed.kind === "item" ? proposed.clientQty : 0,
    });
    nextItems.push(added);
    if (added.kind === "section") report.sectionsAdded += 1;
    else report.itemsAdded += 1;
  }

  const qtoNew = nextItems
    .filter((i) => i.kind === "item" && !existing.some((e) => e.id === i.id))
    .map((i, idx) => ({
      id: `qto-amd-${billId}-${idx}`,
      billId: i.billId,
      workCategory: null as string | null,
      drawing: null as string | null,
      locationDesc: null as string | null,
      itemLabel: i.description,
      subItem: null as string | null,
      formulaKey: "qty" as const,
      dims: { l: i.ourQty },
      workingBoqCode: itemKeyOf(i),
    }));

  const existingKeys = new Set(
    project.clientNodes.filter((n) => n.billId === billId).map((n) => `${n.kind}:${normDesc(n.description ?? "")}`),
  );
  const addedNodes = built.clientNodes.filter((n) => {
    if (n.kind === "title") return false;
    const key = `${n.kind}:${normDesc(n.description ?? "")}`;
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
  const title = project.clientNodes.find((n) => n.kind === "title") ?? {
    row: 1,
    kind: "title",
    description: project.name,
  };
  const rest = project.clientNodes.filter((n) => n.kind !== "title");
  const clientNodes = [title, ...rest, ...addedNodes].map((n, i) => ({ ...n, row: i + 1 }));

  const bills = (project.bills ?? []).map((b) =>
    b.id === billId
      ? {
          ...b,
          issuedRef: b.issuedRef?.trim() ? `${b.issuedRef} · amended` : "amended",
          sourceLockedAt: b.sourceLockedAt ?? new Date().toISOString(),
        }
      : b,
  );

  return {
    project: {
      ...project,
      bills,
      items: [...others, ...nextItems],
      clientNodes,
      qtoLines: [...project.qtoLines, ...qtoNew],
    },
    report,
  };
}
