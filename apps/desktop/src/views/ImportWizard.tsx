import { useState } from "react";
import { extractBill, canCommitImport, type ExtractKind } from "../import/extract";
import { appendBillFromClientRows, amendBillFromClientRows, projectFromClientRows } from "../loadReference";
import type { BoqColumnDef, LoadedProject } from "../model";
import type { TenantCatalog } from "../tenantCatalog";
import { defaultClientColumns, slugColumnId } from "../boqColumns";
import "../v3/theme.css";
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
  catalog,
  appendTo = null,
  amendBillId = null,
  onCancel,
  onCreate,
  onAppend,
}: {
  currency?: string;
  catalog?: TenantCatalog;
  appendTo?: LoadedProject | null;
  amendBillId?: string | null;
  onCancel: () => void;
  onCreate: (project: LoadedProject) => void;
  onAppend?: (project: LoadedProject) => void;
}) {
  const bills = appendTo ? sortedBills(appendTo) : [];
  const [step, setStep] = useState(appendTo ? 3 : 1);
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

  const steps = [
    ["Bid basis", "Client BOQ"],
    ["Job details", name || "Name, client, currency"],
    ["Client BOQ", "Import the issued bill"],
    ["Commercial defaults", "Margin stack and quantity policy"],
    ["Review and create", "Save the .aero file"],
  ];
  return (
    <div className="v3" style={{ background: "#f5f9fb" }}>
      <header style={{ height: 56, display: "flex", alignItems: "center", padding: "0 24px", borderBottom: "1px solid #c5d4e0", background: "#fff" }}>
        <h1 style={{ fontSize: 20 }}>{appendTo ? (intent === "amend" ? "Amend BOQ" : "Add BOQ") : "New job"}</h1>
        <span style={{ flex: 1 }} />
        <span style={{ color: "#2c4558" }}>Step {step} of 5</span>
      </header>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <nav aria-label="Steps" style={{ width: 290, background: "#d7e5ef", borderRight: "1px solid #c5d4e0", padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
          {steps.map((row, index) => (
            <div key={row[0]} className={`stp${index + 1 === step ? " on" : index + 1 < step ? " done" : ""}`}>
              <i>{index + 1 < step ? "✓" : index + 1}</i>
              <div><strong>{row[0]}</strong><div style={{ color: "#2c4558", fontSize: 13 }}>{row[1]}</div></div>
            </div>
          ))}
        </nav>
        <main className="main">
      <div className="k">Step {step}</div>
      <h2>{steps[step - 1]?.[0]}</h2>
      <p style={{ color: "#2c4558" }}>
        {appendTo && intent === "amend"
          ? "Paste the amendment. Matching items update client qty. New rows are added. Our qty and rates stay until you remeasure or reprice."
          : step === 3
            ? "Bid Craft reads sections, items, units and quantities. You confirm the mapping before anything is created."
            : note}
      </p>
      {step !== 3 && !appendTo ? (
        <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
          {step === 1 ? <p>This job is priced from a client bill of quantities. Currency {currency}.</p> : null}
          {step === 2 ? (
            <label className="l">Job name<input className="i" value={name} onChange={(e) => setName(e.target.value)} /></label>
          ) : null}
          {step === 4 ? <p>Commercial defaults use the company margin stack: overhead, profit, logistics and contingency, each as a percentage of direct cost. You can change them on Margins after the job is created.</p> : null}
          {step === 5 ? <p>Create {name || "the job"} in {currency}. The file is saved from the job with File → Save.</p> : null}
        </section>
      ) : null}
      {step === 3 || appendTo ? (
      <>
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
      </>
      ) : null}
        </main>
      </div>
      <footer style={{ height: 60, display: "flex", alignItems: "center", gap: 10, padding: "0 24px", borderTop: "1px solid #c5d4e0", background: "#fff" }}>
        <button className="b" type="button" onClick={onCancel}>Cancel</button>
        <span style={{ flex: 1 }} />
        <button className="b" type="button" disabled={step <= 1} onClick={() => setStep((n) => Math.max(1, n - 1))}>Back</button>
        {step < 5 && !appendTo ? (
          <button className="b p" type="button" onClick={() => setStep((n) => Math.min(5, n + 1))}>Next</button>
        ) : (
          <button className="b p" type="button" disabled={blockCreate || busy} onClick={finish}>
            {appendTo ? (intent === "amend" ? "Apply amendment" : "Add BOQ") : "Create project"}
          </button>
        )}
      </footer>
    </div>
  );
}
