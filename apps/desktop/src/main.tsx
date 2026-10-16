import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { bootTheme, bootThemeStyle } from "./theme";
import "./styles.css";
import "./theme-direction.css";

bootTheme();
bootThemeStyle();
document.title = "Bid Craft";

function isBenignResizeObserver(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /ResizeObserver loop/i.test(text);
}

function showCrash(err: unknown): void {
  if (isBenignResizeObserver(err)) return;
  const root = document.getElementById("root");
  if (!root) return;
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  root.innerHTML = `<div style="font-family:Outfit,'Segoe UI',system-ui,sans-serif;padding:48px;max-width:40em;color:var(--danger,#B42318);background:var(--paper,#f6f4f0)">
    <h1 style="font-size:20px;font-weight:600;letter-spacing:-0.03em">Bid Craft could not start</h1>
    <p style="color:var(--ink,#23262d)">Leave this window open and tell me the text below.</p>
    <pre style="white-space:pre-wrap;background:var(--paper-2,#ffffff);color:var(--ink,#23262d);border:1px solid var(--line,#e4e0d8);padding:12px">${message.replace(/</g, "&lt;")}</pre>
  </div>`;
}

window.addEventListener("error", (event) => {
  if (isBenignResizeObserver(event.error ?? event.message)) {
    event.preventDefault();
    return;
  }
  showCrash(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  if (isBenignResizeObserver(event.reason)) {
    event.preventDefault();
    return;
  }
  showCrash(event.reason);
});

try {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (err) {
  showCrash(err);
}
