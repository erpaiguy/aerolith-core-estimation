import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadReferenceProject } from "./loadReference";
import { closeJobIfSaved, openAmend, SAVE_CANCELLED } from "./jobSession";
import { SourceScreen, type MeasureApi } from "./v3/Measure";

describe("close job save", () => {
  it("leaves the job only after a confirmed save", async () => {
    const leave = vi.fn();
    await expect(closeJobIfSaved(async () => true, leave)).resolves.toBe(true);
    expect(leave).toHaveBeenCalledOnce();
  });

  it("keeps the job open when save is cancelled", async () => {
    const leave = vi.fn();
    await expect(closeJobIfSaved(async () => false, leave)).resolves.toBe(false);
    expect(leave).not.toHaveBeenCalled();
    expect(SAVE_CANCELLED).toMatch(/still open/);
  });

  it("keeps the job open when save throws", async () => {
    const leave = vi.fn();
    await expect(
      closeJobIfSaved(async () => {
        throw new Error("disk full");
      }, leave),
    ).resolves.toBe(false);
    expect(leave).not.toHaveBeenCalled();
  });
});

describe("amend while locked", () => {
  it("does not open the wizard when editing is locked", () => {
    const open = vi.fn();
    expect(openAmend(true, open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("opens the wizard when editing is allowed", () => {
    const open = vi.fn();
    expect(openAmend(false, open)).toBe(true);
    expect(open).toHaveBeenCalledOnce();
  });

  it("disables both amend buttons on a sealed or otherwise locked job", () => {
    const html = renderToStaticMarkup(
      createElement(SourceScreen, {
        api: { project: loadReferenceProject(), billId: null, locked: true, onAmend: () => undefined } as MeasureApi,
        onBill: () => undefined,
      }),
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Import re-issued BOQ<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Amend with reason<\/button>/);
  });

  it("leaves amend available when the job can still be edited", () => {
    const html = renderToStaticMarkup(
      createElement(SourceScreen, {
        api: { project: loadReferenceProject(), billId: null, locked: false, onAmend: () => undefined } as MeasureApi,
        onBill: () => undefined,
      }),
    );
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Amend with reason<\/button>/);
    expect(html).toContain("Amend with reason");
  });
});
