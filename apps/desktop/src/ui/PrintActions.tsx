import { useState } from "react";
import { printDocument, saveDocumentPdf } from "../print/actions";
import { documentHtml } from "../print/html";
import type { PrintDocument } from "../print/types";

export function PrintActions({ build }: { build: () => PrintDocument }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState<PrintDocument | null>(null);

  function open() {
    if (busy) return;
    setStatus("");
    try {
      setDoc(build());
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not prepare that document.");
    }
  }

  async function run(kind: "print" | "pdf") {
    if (!doc || busy) return;
    setBusy(true);
    setStatus("");
    try {
      if (kind === "print") {
        await printDocument(doc);
        setStatus("Print dialog opened");
      } else {
        const saved = await saveDocumentPdf(doc);
        setStatus(saved ? "PDF saved" : "Save cancelled");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not prepare that document.";
      setStatus(/aborted|cancel/i.test(message) ? "Save cancelled" : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="print-actions">
      <button type="button" disabled={busy} onClick={open}>
        Print
      </button>
      <button type="button" disabled={busy} onClick={open}>
        Save PDF
      </button>
      {status ? <span className="hint print-status">{status}</span> : null}
      {doc ? (
        <div className="print-window" role="dialog" aria-modal="true" aria-label="Print and PDF">
          <div className="print-window-card">
            <header>
              <strong>{doc.documentTitle}</strong>
              <span>{doc.projectName}</span>
              <button type="button" onClick={() => setDoc(null)}>
                Close
              </button>
            </header>
            <iframe title="Print preview" srcDoc={documentHtml(doc)} />
            <footer>
              <button type="button" className="primary" disabled={busy} onClick={() => void run("print")}>
                Print
              </button>
              <button type="button" disabled={busy} onClick={() => void run("pdf")}>
                Save PDF
              </button>
              {status ? <span className="hint">{status}</span> : null}
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
