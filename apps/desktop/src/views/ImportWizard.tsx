import { useState } from "react";
import { extractBill, canCommitImport, type ExtractKind } from "../import/extract";
import { appendBillFromClientRows, amendBillFromClientRows, projectFromClientRows } from "../loadReference";
import type { BoqColumnDef, LoadedProject } from "../model";
import type { TenantCatalog } from "../tenantCatalog";
import { AppBar, ThemeButton } from "./AppBar";
import type { ThemeName } from "../theme";
import { defaultClientColumns, slugColumnId } from "../boqColumns";
import { parseSignedNumber } from "@aerolith/shared";
import { sortedBills } from "../bills";
import { DataTable } from "../ui/tableLayout";

const COLS = ["skip", "sl", "description", "qty", "unit", "extra"] as const;
type Col = (typeof COLS)[number];

function splitRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .map((line) => (line.includes("\t") ? line.split("\t") : line.split(",").map((c) => c.trim())));
}

export function ImportWizard({
  currency = "QAR",
  theme = "light",
  onTheme,
  catalog,
  appendTo = null,
  amendBillId = null,
  onCancel,
  onCreate,
  onAppend,
}: {
  currency?: string;
  theme?: ThemeName;
  onTheme?: (theme: ThemeName) => void;
  catalog?: TenantCatalog;
  appendTo?: LoadedProject | null;
  amendBillId?: string | null;
  onCancel: () => void;
  onCreate: (project: LoadedProject) => void;
  onAppend?: (project: LoadedProject) => void;
}) {
  const bills = appendTo ? sortedBills(appendTo) : [];
  const [intent, setIntent] = useState<"new-bill" | "amend">(amendBillId ? "amend" : "new-bill");
  const [targetBillId, setTargetBillId] = useState(amendBillId || bills[0]?.id || "");
  const [name, setName] = useState(() => {
    if (intent !== "amend") return "Imported bill";
    const target = bills.find((b) => b.id === (amendBillId || bills[0]?.id));
    return target?.name ?? "Imported bill";
  });
  const [raw, setRaw] = useState("Sl. No.\tDescription\tQty\tUnit\n1\tPreliminaries\t\t\na\tSite set-up\t1\tL/s");
  const [map, setMap] = useState<Col[]>(["sl", "description", "qty", "unit"]);
  const [kind, setKind] = useState<ExtractKind>("text");
  const [note, setNote] = useState("Paste from Excel or choose a file. PDF / Word / scans use the same mapping step.");
  const [needsReview, setNeedsReview] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = splitRows(raw);
  const header = preview[0] ?? [];
  const body = preview.slice(1);

  function col(i: number): Col {
    return map[i] ?? "skip";
  }

  function setCol(i: number, value: Col) {
    const next = map.slice();
    while (next.length <= i) next.push("skip");
    next[i] = value;
    setMap(next);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const extracted = await extractBill(file);
      setKind(extracted.kind);
      setNote(extracted.note);
      setNeedsReview(extracted.needsReview);
      setReviewed(false);
      if (extracted.text) setRaw(extracted.text);
      if (!name || name === "Imported bill") setName(file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    if (!canCommitImport(needsReview, reviewed)) {
      window.alert("This import is a draft. Confirm you reviewed quantities before creating the project.");
      return;
    }
    const extraCols: BoqColumnDef[] = [];
    header.forEach((h, i) => {
      if (col(i) !== "extra") return;
      const label = (h || `Col ${i + 1}`).trim();
      extraCols.push({
        id: slugColumnId(label, "c", extraCols.map((c) => c.id)),
        label,
        role: "extra",
        valueType: "text",
      });
    });
    const extraAt: Record<number, string> = {};
    let extraN = 0;
    header.forEach((_, i) => {
      if (col(i) === "extra") {
        extraAt[i] = extraCols[extraN]?.id ?? `c-col-${i}`;
        extraN += 1;
      }
    });
    const rows = body
      .map((cells) => {
        let sl = "";
        let description = "";
        let qty: number | null = null;
        let unit = "";
        const extra: Record<string, string> = {};
        cells.forEach((cell, i) => {
          const m = col(i);
          if (m === "sl") sl = cell;
          if (m === "description") description = cell;
          if (m === "unit") unit = cell;
          if (m === "qty") {
            qty = parseSignedNumber(cell);
          }
          if (m === "extra" && extraAt[i]) extra[extraAt[i]] = cell;
        });
        return { sl, description, qty, unit, extra };
      })
      .filter((r) => r.description);
    if (!rows.length) {
      window.alert("No data rows after the header. Check the mapping.");
      return;
    }
    const clientColumns = [...defaultClientColumns(), ...extraCols];
    if (appendTo && onAppend) {
      if (intent === "amend" && targetBillId) {
        const { project: next, report } = amendBillFromClientRows(appendTo, targetBillId, rows);
        onAppend(next);
        const bits = [
          report.qtyChanged ? `${report.qtyChanged} qty change${report.qtyChanged === 1 ? "" : "s"}` : null,
          report.itemsAdded ? `${report.itemsAdded} new item${report.itemsAdded === 1 ? "" : "s"}` : null,
          report.sectionsAdded ? `${report.sectionsAdded} new section${report.sectionsAdded === 1 ? "" : "s"}` : null,
        ].filter(Boolean);
        window.alert(bits.length ? `Amendment applied: ${bits.join(", ")}.` : "Amendment applied. No matching changes.");
        return;
      }
      onAppend(appendBillFromClientRows(appendTo, name, rows, name));
      return;
    }
    const project = projectFromClientRows(name, rows, clientColumns, currency, catalog);
    onCreate({ ...project, importNeedsReview: false });
  }

  const blockCreate = needsReview && !reviewed;

  return (
    <div className="app shell">
      <AppBar
        projectName={appendTo?.name ?? "Import"}
        revision={appendTo ? "Existing job" : "New job"}
        menu={{ label: "File", items: [{ label: "Close", onSelect: onCancel }] }}
      />
      <aside className="sidebar" aria-label="Import">
        <div className="sidebar-scroll">
          <div className="sidebar-group">
            <p className="sidebar-label">Setup</p>
            <button type="button" className="nav-btn on" aria-current="page">
              Import bill
            </button>
          </div>
        </div>
      </aside>
      <main className="stage">
      <div className="home">
      <p className="kicker">{appendTo ? "Existing job" : "New job"}</p>
      <h1>{appendTo ? (intent === "amend" ? "Amend BOQ" : "Add BOQ") : "Import client bill"}</h1>
      <p className="lede">
        {appendTo && intent === "amend"
          ? "Paste the amendment, extra pages, or a reissued bill. Matching items update client qty. New rows are added. Tender adjustments can come in as a new section. Our qty and rates stay until you remeasure or reprice."
          : note}
      </p>
      {appendTo ? (
        <div className="seg login-mode" role="group" aria-label="Import kind">
          <button type="button" className={intent === "new-bill" ? "primary" : ""} onClick={() => setIntent("new-bill")}>
            New BOQ
          </button>
          <button
            type="button"
            className={intent === "amend" ? "primary" : ""}
            onClick={() => {
              setIntent("amend");
              const b = bills.find((x) => x.id === targetBillId) ?? bills[0];
              if (b) {
                setTargetBillId(b.id);
                setName(b.name);
              }
            }}
          >
            Amend issued BOQ
          </button>
        </div>
      ) : null}
      <label className="field">
        File (xlsx, csv, docx, pdf, or a scan)
        <input
          type="file"
          accept=".csv,.txt,.tsv,.xlsx,.xlsm,.docx,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp,.bmp"
          disabled={busy}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
      {appendTo && intent === "amend" && bills.length ? (
        <label className="field">
          BOQ to amend
          <select
            value={targetBillId}
            onChange={(e) => {
              setTargetBillId(e.target.value);
              const b = bills.find((x) => x.id === e.target.value);
              if (b) setName(b.name);
            }}
          >
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="field">
          {appendTo ? "BOQ name" : "Project name"}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <label className="field">
        Extracted / pasted rows
        <textarea rows={10} value={raw} onChange={(e) => setRaw(e.target.value)} />
      </label>
      {needsReview ? (
        <label className="review">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          I reviewed this draft. Layout and quantities are correct. OCR cannot create a project without this.
        </label>
      ) : (
        <p className="hint">Source kind: {kind}. Rates stay empty until you build them.</p>
      )}
      <div className="scroll">
        <DataTable layoutKey="import-preview">
          <thead>
            <tr>
              {header.map((h, i) => (
                <th key={i}>
                  <div>{h || `Col ${i + 1}`}</div>
                  <select value={col(i)} onChange={(e) => setCol(i, e.target.value as Col)}>
                    {COLS.map((c) => (
                      <option key={c} value={c}>
                        {c === "extra" ? "keep (client column)" : c}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.slice(0, 12).map((row, ri) => (
              <tr key={ri}>
                {header.map((_, i) => (
                  <td key={i}>{row[i] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      <div className="actions">
        <button className="primary" type="button" disabled={blockCreate || busy} onClick={finish}>
          {appendTo ? (intent === "amend" ? "Apply amendment" : "Add BOQ") : "Create project"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      </div>
      </main>
      <footer className="status" role="status">
        <span>{currency}</span>
        <span>Import does not price the bill</span>
        {onTheme ? <ThemeButton theme={theme} onTheme={onTheme} /> : null}
      </footer>
    </div>
  );
}
