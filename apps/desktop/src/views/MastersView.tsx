import { useEffect, useState } from "react";
import type { CategoryRow, LoadedProject, UnitRow, VendorRow } from "../model";
import { uid } from "../projectCompute";
import type { ResourceMasterRow } from "../resourceMaster";
import type { CatalogSource } from "../tenantCatalog";
import { DataTable } from "../ui/tableLayout";
import { PrintActions } from "../ui/PrintActions";
import { usePrintHeader } from "../print/context";
import { jobDocument } from "../print/types";
import { ResourceMasterPanel } from "./ResourceMasterPanel";

type Tab = "units" | "categories" | "vendors" | "resources";
type Scope = "tenant" | "project";

export function MastersView({
  project,
  catalog,
  catalogSource,
  catalogVersion,
  canEditCatalog,
  onChangeProject,
  onChangeCatalog,
  onPromote,
  locked,
  masterTab,
  onMasterTab,
  globalResourceRows = [],
  projectResourceRows = [],
  onGlobalResourceRows,
  onProjectResourceRows,
  onPushRate,
  onCopyGlobal,
  currency = "QAR",
}: {
  project: LoadedProject;
  catalog: { units: UnitRow[]; categories: CategoryRow[]; vendors: VendorRow[] };
  catalogSource: CatalogSource;
  catalogVersion: number;
  canEditCatalog: boolean;
  onChangeProject: (patch: Partial<LoadedProject>) => void;
  onChangeCatalog: (next: { units: UnitRow[]; categories: CategoryRow[]; vendors: VendorRow[] }) => void;
  onPromote?: (kind: "unit" | "category" | "vendor", code: string, label: string) => void;
  locked?: boolean;
  masterTab?: Tab;
  onMasterTab?: (tab: Tab) => void;
  globalResourceRows?: ResourceMasterRow[];
  projectResourceRows?: ResourceMasterRow[];
  onGlobalResourceRows?: (rows: ResourceMasterRow[]) => void;
  onProjectResourceRows?: (rows: ResourceMasterRow[]) => void;
  onPushRate?: (row: ResourceMasterRow) => void;
  onCopyGlobal?: () => void;
  currency?: string;
}) {
  const header = usePrintHeader();
  const [tabState, setTabState] = useState<Tab>("units");
  const tab = masterTab ?? tabState;
  function setTab(next: Tab) {
    setTabState(next);
    onMasterTab?.(next);
  }
  const [scope, setScope] = useState<Scope>("tenant");
  const [draft, setDraft] = useState(catalog);
  useEffect(() => {
    setDraft(catalog);
  }, [catalogVersion, catalogSource]);
  const tenantScope = scope === "tenant";
  const rowsLocked = tenantScope ? locked || !canEditCatalog : locked;
  const showPromote = !tenantScope && Boolean(onPromote);
  const units = tenantScope ? draft.units : project.units;
  const categories = tenantScope ? draft.categories : project.categories;
  const vendors = tenantScope ? draft.vendors : project.vendors;
  const dirty =
    tenantScope &&
    (JSON.stringify(draft.units) !== JSON.stringify(catalog.units) ||
      JSON.stringify(draft.categories) !== JSON.stringify(catalog.categories) ||
      JSON.stringify(draft.vendors) !== JSON.stringify(catalog.vendors));

  return (
    <div className="module-workspace">
      <div className="module-toolbar">
        <div className="tb-group">
          {(
            [
              ["units", "Units"],
              ["categories", "Categories"],
              ["vendors", "Vendors"],
              ["resources", "Resource master"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={tab === id ? "primary" : ""} type="button" onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="tb-group seg" role="tablist" aria-label="Masters scope">
          <button
            type="button"
            className={tenantScope ? "primary" : ""}
            aria-selected={tenantScope}
            onClick={() => setScope("tenant")}
          >
            Tenant catalog
          </button>
          <button
            type="button"
            className={!tenantScope ? "primary" : ""}
            aria-selected={!tenantScope}
            onClick={() => setScope("project")}
          >
            This project
          </button>
        </div>
        <span className={`source-badge ${catalogSource === "tenant" ? "working" : ""}`}>
          {catalogSource === "tenant" ? `Tenant global v${catalogVersion}` : "App starter pack"}
        </span>
        <p className="hint">
          {tenantScope
            ? canEditCatalog
              ? "These masters load on every new job in this workspace. Save to make this the tenant global library."
              : "Read-only tenant library. Add a line on This project, then Promote to save it for every new job."
            : "Project snapshot. Promote a row to add it to the tenant catalog used by new jobs."}
        </p>
        {tenantScope && canEditCatalog && !locked ? (
          <button type="button" className="primary" disabled={!dirty} onClick={() => onChangeCatalog(draft)}>
            Save as tenant catalog
          </button>
        ) : null}
        {tab !== "resources" ? (
          <PrintActions
            build={() => {
              if (tab === "units") {
                return jobDocument(header.project.name, `r${header.project.revision}`, header.format, "Units", [
                  {
                    title: "Units",
                    columns: [
                      { label: "Code", width: 24 },
                      { label: "Description", width: 52 },
                      { label: "Symbol", width: 24 },
                    ],
                    rows: units.map((row) => ({ cells: [row.code, row.description, row.symbol] })),
                  },
                ]);
              }
              if (tab === "categories") {
                return jobDocument(header.project.name, `r${header.project.revision}`, header.format, "Categories", [
                  {
                    title: "Categories",
                    columns: [
                      { label: "Code", width: 30 },
                      { label: "Description", width: 70 },
                    ],
                    rows: categories.map((row) => ({ cells: [row.code, row.description] })),
                  },
                ]);
              }
              return jobDocument(header.project.name, `r${header.project.revision}`, header.format, "Vendors", [
                {
                  title: "Vendors",
                  columns: [{ label: "Name", width: 100 }],
                  rows: vendors.map((row) => ({ cells: [row.name] })),
                },
              ]);
            }}
          />
        ) : null}
      </div>
      <div className="doc-scroll">
        {tab === "units" ? (
          <UnitTable
            rows={units}
            locked={rowsLocked}
            onChange={(next) =>
              tenantScope ? setDraft({ units: next, categories, vendors }) : onChangeProject({ units: next })
            }
            onPromote={showPromote ? (code, label) => onPromote?.("unit", code, label) : undefined}
          />
        ) : null}
        {tab === "categories" ? (
          <CategoryTable
            rows={categories}
            locked={rowsLocked}
            onChange={(next) =>
              tenantScope ? setDraft({ units, categories: next, vendors }) : onChangeProject({ categories: next })
            }
            onPromote={showPromote ? (code, label) => onPromote?.("category", code, label) : undefined}
          />
        ) : null}
        {tab === "resources" ? (
          <ResourceMasterPanel
            rows={tenantScope ? globalResourceRows : projectResourceRows}
            scope={tenantScope ? "global" : "project"}
            currency={currency}
            locked={rowsLocked}
            onChange={(next) => (tenantScope ? onGlobalResourceRows?.(next) : onProjectResourceRows?.(next))}
            onPushRate={tenantScope ? undefined : onPushRate}
            onCopyGlobal={tenantScope ? undefined : onCopyGlobal}
          />
        ) : null}
        <fieldset className="plain" disabled={rowsLocked}>
          {tab === "vendors" ? (
            <VendorTable
              rows={vendors}
              onChange={(next) =>
                tenantScope ? setDraft({ units, categories, vendors: next }) : onChangeProject({ vendors: next })
              }
              onPromote={showPromote ? (code, label) => onPromote?.("vendor", code, label) : undefined}
            />
          ) : null}
        </fieldset>
      </div>
    </div>
  );
}

function UnitTable({
  rows,
  onChange,
  onPromote,
  locked,
}: {
  rows: UnitRow[];
  onChange: (rows: UnitRow[]) => void;
  onPromote?: (code: string, label: string) => void;
  locked?: boolean;
}) {
  return (
    <>
      <DataTable layoutKey="masters-units">
        <thead>
          <tr>
            <th>Code</th>
            <th>Description</th>
            <th>Symbol</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((u, idx) => (
            <tr key={`${u.code}-${idx}`}>
              <td>
                <input
                  className="cell"
                  disabled={locked}
                  value={u.code}
                  onChange={(e) => onChange(rows.map((x, i) => (i === idx ? { ...x, code: e.target.value } : x)))}
                />
              </td>
              <td>
                <input
                  className="cell"
                  disabled={locked}
                  value={u.description}
                  onChange={(e) =>
                    onChange(rows.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))
                  }
                />
              </td>
              <td>
                <input
                  className="cell"
                  disabled={locked}
                  value={u.symbol}
                  onChange={(e) => onChange(rows.map((x, i) => (i === idx ? { ...x, symbol: e.target.value } : x)))}
                />
              </td>
              <td>
                <div className="row-actions">
                  {onPromote ? (
                    <button
                      type="button"
                      className="allow-when-locked"
                      onClick={() => onPromote(u.code, u.description || u.code)}
                    >
                      Promote
                    </button>
                  ) : null}
                  {locked ? null : (
                    <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== idx))}>
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {locked ? null : (
        <div className="actions">
          <button
            type="button"
            onClick={() =>
              onChange([...rows, { code: `UN${String(rows.length + 1).padStart(3, "0")}`, description: "", symbol: "" }])
            }
          >
            Add unit
          </button>
        </div>
      )}
    </>
  );
}

function CategoryTable({
  rows,
  onChange,
  onPromote,
  locked,
}: {
  rows: CategoryRow[];
  onChange: (rows: CategoryRow[]) => void;
  onPromote?: (code: string, label: string) => void;
  locked?: boolean;
}) {
  return (
    <>
      <DataTable layoutKey="masters-categories">
        <thead>
          <tr>
            <th>Code</th>
            <th>Description</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((c, idx) => (
            <tr key={`${c.code}-${idx}`}>
              <td>
                <input
                  className="cell"
                  disabled={locked}
                  value={c.code}
                  onChange={(e) => onChange(rows.map((x, i) => (i === idx ? { ...x, code: e.target.value } : x)))}
                />
              </td>
              <td>
                <input
                  className="cell"
                  disabled={locked}
                  value={c.description}
                  onChange={(e) =>
                    onChange(rows.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))
                  }
                />
              </td>
              <td>
                <div className="row-actions">
                  {onPromote ? (
                    <button
                      type="button"
                      className="allow-when-locked"
                      onClick={() => onPromote(c.code, c.description || c.code)}
                    >
                      Promote
                    </button>
                  ) : null}
                  {locked ? null : (
                    <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== idx))}>
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {locked ? null : (
        <div className="actions">
          <button
            type="button"
            onClick={() => onChange([...rows, { code: `RM${String(rows.length + 1).padStart(3, "0")}`, description: "" }])}
          >
            Add category
          </button>
        </div>
      )}
    </>
  );
}

function VendorTable({
  rows,
  onChange,
  onPromote,
}: {
  rows: VendorRow[];
  onChange: (rows: VendorRow[]) => void;
  onPromote?: (code: string, label: string) => void;
}) {
  return (
    <>
      <DataTable layoutKey="masters-vendors">
        <thead>
          <tr>
            <th>Name</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id}>
              <td>
                <input
                  className="cell"
                  value={v.name}
                  onChange={(e) => onChange(rows.map((x) => (x.id === v.id ? { ...x, name: e.target.value } : x)))}
                />
              </td>
              <td>
                <div className="row-actions">
                  {onPromote ? (
                    <button type="button" onClick={() => onPromote(v.id, v.name)}>
                      Promote
                    </button>
                  ) : null}
                  <button type="button" onClick={() => onChange(rows.filter((x) => x.id !== v.id))}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <div className="actions">
        <button type="button" onClick={() => onChange([...rows, { id: uid("v"), name: "New vendor" }])}>
          Add vendor
        </button>
      </div>
    </>
  );
}
