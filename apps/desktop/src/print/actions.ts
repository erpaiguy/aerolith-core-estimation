import { ask, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import logoUrl from "../brand/kit/bidcraft/logo-on-light-600w.png";
import { askConfirm } from "../ui/askConfirm";
import { isTauri } from "../nativeAero";
import { buildPdf } from "./pdf";
import { documentHtml } from "./html";
import { safePdfName, type PrintDocument } from "./types";

async function logoBytes(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function renderPdf(doc: PrintDocument): Promise<Uint8Array> {
  const logo = doc.format.showLogo ? await logoBytes() : null;
  return buildPdf(doc, logo);
}

function pdfBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "application/pdf" });
}

function frameSize(doc: PrintDocument): string {
  const landscape = doc.orientation === "landscape";
  const width = doc.paper === "a3" ? (landscape ? "420mm" : "297mm") : doc.paper === "letter" ? (landscape ? "11in" : "8.5in") : landscape ? "297mm" : "210mm";
  const height = doc.paper === "a3" ? (landscape ? "297mm" : "420mm") : doc.paper === "letter" ? (landscape ? "8.5in" : "11in") : landscape ? "210mm" : "297mm";
  return `position:fixed;left:0;top:0;width:${width};height:${height};border:0;background:#fff;z-index:1000`;
}

function printFrame(doc: PrintDocument): HTMLIFrameElement {
  let frame = document.getElementById("bidcraft-print-frame") as HTMLIFrameElement | null;
  if (!frame) {
    frame = document.createElement("iframe");
    frame.id = "bidcraft-print-frame";
    frame.title = "Print";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);
  }
  frame.style.cssText = frameSize(doc);
  return frame;
}

/** Opens the system print dialog. A same-origin iframe keeps the call inside WebView2 instead of a blocked popup. */
export async function printDocument(doc: PrintDocument): Promise<void> {
  const html = documentHtml(doc);
  const frame = printFrame(doc);
  const idoc = frame.contentDocument;
  if (idoc) {
    idoc.open();
    idoc.write(html);
    idoc.close();
    const win = frame.contentWindow;
    if (win) {
      win.focus();
      win.addEventListener(
        "afterprint",
        () => {
          frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
        },
        { once: true },
      );
      win.print();
      return;
    }
  }
  await printViaPdf(doc);
}

async function printViaPdf(doc: PrintDocument): Promise<void> {
  const bytes = await renderPdf(doc);
  if (!isTauri()) {
    const url = URL.createObjectURL(pdfBlob(bytes));
    const win = window.open(url, "_blank");
    win?.addEventListener("load", () => win.print());
    return;
  }
  const path = await invoke<string>("write_temp_pdf", { name: safePdfName(doc.filename), data: Array.from(bytes) });
  await invoke("print_user_file", { path });
}

async function openSaved(path: string, bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    const yes = await ask("Open the PDF now?", { title: "BidCraft", kind: "info" });
    if (yes) await invoke("open_user_file", { path });
    return;
  }
  if (await askConfirm("Open the PDF now?", "BidCraft")) {
    const url = URL.createObjectURL(pdfBlob(bytes));
    window.open(url, "_blank", "noopener");
  }
}

async function saveInBrowser(name: string, bytes: Uint8Array): Promise<boolean> {
  const blob = pdfBlob(bytes);
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: name,
      types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    await openSaved(name, bytes);
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  await openSaved(name, bytes);
  return true;
}

/** Writes a real PDF, then asks where to save it. In the desktop app that is the native Save dialog. */
export async function saveDocumentPdf(doc: PrintDocument): Promise<string | null> {
  const name = safePdfName(doc.filename);
  const bytes = await renderPdf(doc);
  if (!isTauri()) {
    await saveInBrowser(name, bytes);
    return name;
  }
  const picked = await save({
    title: "Save PDF",
    defaultPath: name,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    canCreateDirectories: true,
  });
  const path = typeof picked === "string" ? picked : null;
  if (!path) return null;
  const saved = await invoke<string>("write_user_file", { path, data: Array.from(bytes) });
  await openSaved(saved, bytes);
  return saved;
}
