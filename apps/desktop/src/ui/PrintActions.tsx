import { useState } from "react";
import { printDocument, saveDocumentPdf } from "../print/actions";
import type { PrintDocument } from "../print/types";

export function PrintActions({ build }: { build: () => PrintDocument }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(kind: "print" | "pdf") {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const doc = build();
      if (kind === "print") {
        await printDocument(doc);
        setStatus("Print dialog opened");
      } else {
        const saved = await saveDocumentPdf(doc);
        setStatus(saved ? "PDF saved" : "Save cancelled");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not prepare that document.";
      if (!/aborted|cancel/i.test(message)) setStatus(message);
      else setStatus("Save cancelled");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="print-actions">
      <button type="button" disabled={busy} onClick={() => void run("print")}>
        Print
      </button>
      <button type="button" disabled={busy} onClick={() => void run("pdf")}>
        Save PDF
      </button>
      {status ? <span className="hint print-status">{status}</span> : null}
    </div>
  );
}
