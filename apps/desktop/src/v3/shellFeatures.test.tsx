import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptySession } from "../auth/licenseState";
import { loadReferenceProject } from "../loadReference";
import type { Session } from "../platform/store";
import { Shell } from "./chrome";
import { SettingsScreen } from "./Library";

function readText(relative: string): string {
  return new TextDecoder().decode(readFileSync(new URL(relative, import.meta.url)));
}

describe("content security policy", () => {
  it("allows the account service and the Google fonts used by the light theme", () => {
    const conf = JSON.parse(readText("../../src-tauri/tauri.conf.json")) as {
      app: { security: { csp: string } };
    };
    const csp = conf.app.security.csp;
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(csp).toContain("https://fonts.gstatic.com");
    expect(csp).toContain("https://mmuwdnzbapnbqnqfrwox.supabase.co");
    expect(csp).toContain("style-src");
    expect(csp).toContain("font-src");
    const html = readText("../../index.html");
    expect(html).toContain("fonts.googleapis.com");
    expect(html).toContain("fonts.gstatic.com");
    expect(html).toContain("Atkinson+Hyperlegible");
    expect(html).toContain("Fragment+Mono");
  });
});

function shell(menu: "file" | "edit", canUndo: boolean, canRedo: boolean) {
  return renderToStaticMarkup(
    createElement(Shell, {
      pane: "dashboard",
      projectName: "Campus",
      location: "Doha",
      revision: "Draft r1",
      total: 10,
      currency: "QAR",
      who: "Ada",
      saved: "Saved",
      licence: "Trial",
      fileName: "campus.aero",
      unpriced: 0,
      qtyDiffs: 0,
      openQueries: 0,
      sealed: false,
      showOwner: false,
      onPane: () => undefined,
      onJobs: () => undefined,
      onOpen: () => undefined,
      onSave: () => undefined,
      onClose: () => undefined,
      onSignOut: () => undefined,
      onAddItem: () => undefined,
      onAddSection: () => undefined,
      canUndo,
      canRedo,
      onUndo: () => undefined,
      onRedo: () => undefined,
      initialMenu: menu,
      children: null,
    }),
  );
}

describe("edit menu", () => {
  it("offers undo and redo, and disables them when the job cannot step", () => {
    const locked = shell("edit", false, false);
    const undo = locked.match(/<button[^>]*>Undo/)?.[0] ?? "";
    const redo = locked.match(/<button[^>]*>Redo/)?.[0] ?? "";
    expect(undo).toContain("disabled");
    expect(redo).toContain("disabled");
    expect(locked).toContain("Ctrl+Z");
    expect(locked).toContain("Ctrl+Y");
    expect(locked).not.toMatch(/coming soon|unfinished/i);
    const open = shell("edit", true, true);
    expect(open.match(/<button[^>]*>Undo/)?.[0] ?? "").not.toContain("disabled");
    expect(open.match(/<button[^>]*>Redo/)?.[0] ?? "").not.toContain("disabled");
  });

  it("keeps the file commands that already ship", () => {
    const html = shell("file", false, false);
    expect(html).toContain("Open .aero");
    expect(html).toContain("Save");
    expect(html).toContain("Close job");
  });
});

describe("settings legal", () => {
  it("shows the four legal documents from Settings", () => {
    const html = renderToStaticMarkup(
      createElement(SettingsScreen, {
        project: loadReferenceProject(),
        session: { kind: "owner" } as Session,
        license: emptySession(),
        licenseBusy: false,
        locked: false,
        initialTab: "legal",
        onCommit: () => undefined,
        onPane: () => undefined,
        onRefresh: () => undefined,
        onAccount: () => undefined,
        onPricing: () => undefined,
        onSignOut: () => undefined,
        onCheckUpdate: () => undefined,
        onCompare: () => undefined,
      }),
    );
    expect(html).toContain("Legal");
    expect(html).toContain("Privacy policy");
    expect(html).toContain("Terms of service");
    expect(html).toContain("Terms and conditions");
    expect(html).toContain("License terms");
    expect(html).toContain("Documents/Aerolith");
    expect(html).not.toMatch(/coming soon/i);
  });
});
