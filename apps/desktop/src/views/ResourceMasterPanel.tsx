import { useMemo, useRef, useState } from "react";
import { currencyMarker } from "@aerolith/shared";
import { DataTable } from "../ui/tableLayout";
import { ResetLayoutButton } from "../ui/ResetLayout";
import {
  importResourceRows,
  parseResourceWorkbook,
  resourceMasterToXlsx,
  searchResourceMaster,
  type ResourceMasterRow,
} from "../resourceMaster";

function blankRow(n: number): ResourceMasterRow {
  return {
    code: `NEW-${n}`,
    name: "",
    category: "Material",
    subCategory: "",
    unit: "Nr",
    rate: 0,
    notes: "",
    userEdited: true,
  };
}

export function ResourceMasterPanel({
  rows,
  scope,
  currency,
  locked,
  onChange,
  onPushRate,
  onCopyGlobal,
}: {
  rows: ResourceMasterRow[];
  scope: "global" | "project";
  currency: string;
  locked?: boolean;
  onChange: (rows: ResourceMasterRow[]) => void;
  onPushRate?: (row: ResourceMasterRow) => void;
  onCopyGlobal?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => searchResourceMaster(rows, query), [rows, query]);
  const marker = currencyMarker(currency);

  function patch(code: string, next: Partial<ResourceMasterRow>) {
    onChange(rows.map((row) => (row.code === code ? { ...row, ...next, userEdited: true } : row)));
  }

  function remove(code: string) {
    if (!window.confirm(`Delete ${code} from this resource master?`)) return;
    onChange(rows.filter((row) => row.code !== code));
  }

  async function onImport(file: File) {
    try {
      const incoming = parseResourceWorkbook(new Uint8Array(await file.arrayBuffer()));
      if (!incoming.length) {
        setMessage("That workbook has no resource rows.");
        return;
      }
      onChange(importResourceRows(rows, incoming));
      setMessage(`Imported ${incoming.length} rows. Existing codes were updated and marked as edited.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not read that workbook.");
    }
  }

  function onExport() {
    const bytes = resourceMasterToXlsx(rows);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = scope === "global" ? "BidCraft-Resource-Master.xlsx" : "BidCraft-Project-Resources.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="resource-master">
      <div className="master-toolbar">
        <label className="field master-search">
          Search
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Code, name, category, unit" />
        </label>
        <span className="source-badge">{rows.length} resources · {marker}</span>
        <button type="button" disabled={locked} onClick={() => onChange([...rows, blankRow(rows.length + 1)])}>
          Add resource
        </button>
        <button type="button" disabled={locked} onClick={() => fileRef.current?.click()}>
          Import Excel
        </button>
        <button type="button" onClick={onExport}>
          Export Excel
        </button>
        <ResetLayoutButton ids={[`resource-master-${scope}`]} />
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onImport(file);
          }}
        />
      </div>
      <p className="hint">
        {scope === "global"
          ? "Global resource master. The bundled QAR workbook fills missing codes on first run and on a seed upgrade, and never replaces a row you have edited."
          : "This job’s copy of the resource master. Edits stay in the job until you choose Update master rate."}
      </p>
      {message ? <p className="hint">{message}</p> : null}
      {rows.length === 0 && onCopyGlobal ? (
        <p className="hint">
          This job has no project resource master yet.
          <button type="button" className="primary" disabled={locked} onClick={onCopyGlobal}>
            Copy global master
          </button>
        </p>
      ) : null}
      <div className="doc-scroll">
        <DataTable layoutKey={`resource-master-${scope}`} className="data master-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Category</th>
              <th>Sub-category</th>
              <th>Unit</th>
              <th className="num">Rate ({marker})</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.code}>
                <td>
                  <input aria-label={`Code ${row.code}`} value={row.code} disabled={locked} onChange={(e) => patch(row.code, { code: e.target.value.trim() })} />
                </td>
                <td>
                  <input aria-label={`Name ${row.code}`} value={row.name} disabled={locked} onChange={(e) => patch(row.code, { name: e.target.value })} />
                </td>
                <td>
                  <input aria-label={`Category ${row.code}`} value={row.category} disabled={locked} onChange={(e) => patch(row.code, { category: e.target.value })} />
                </td>
                <td>
                  <input aria-label={`Sub-category ${row.code}`} value={row.subCategory} disabled={locked} onChange={(e) => patch(row.code, { subCategory: e.target.value })} />
                </td>
                <td>
                  <input aria-label={`Unit ${row.code}`} value={row.unit} disabled={locked} onChange={(e) => patch(row.code, { unit: e.target.value })} />
                </td>
                <td className="num">
                  <input
                    aria-label={`Rate ${row.code}`}
                    inputMode="decimal"
                    value={String(row.rate)}
                    disabled={locked}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/,/g, ""));
                      if (Number.isFinite(n)) patch(row.code, { rate: n });
                    }}
                  />
                </td>
                <td>
                  <input aria-label={`Notes ${row.code}`} value={row.notes} disabled={locked} onChange={(e) => patch(row.code, { notes: e.target.value })} />
                </td>
                <td className="master-actions">
                  {scope === "project" && onPushRate ? (
                    <button type="button" disabled={locked} onClick={() => onPushRate(row)}>
                      Update master rate
                    </button>
                  ) : null}
                  <button type="button" disabled={locked} onClick={() => remove(row.code)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {shown.length === 0 ? <p className="hint">No resources match that search.</p> : null}
      </div>
    </div>
  );
}
