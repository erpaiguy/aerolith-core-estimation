import { describe, expect, it } from "vitest";
import { withResults } from "../projectCompute";
import { loadReferenceProject } from "../loadReference";
import { reportSuites } from "./reports";
import { appendFollowUp, JOB_NAV, readFollowUps, SCREENS, WORK_NAV } from "./routes";

describe("Bid Craft 3.0 screens", () => {
  it("lists screens 1 through 28 and no later product", () => {
    expect(SCREENS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]);
    expect(SCREENS.some((s) => /pipeline|handover|escalation/i.test(s.title))).toBe(false);
  });

  it("keeps only wired navigation", () => {
    const labels = [...JOB_NAV.flatMap((group) => group.items.map((item) => item.label)), ...WORK_NAV.map((item) => item.label)];
    expect(labels.join(" ")).not.toMatch(/pipeline|handover|addenda|benchmarks|calendar/i);
    expect(JOB_NAV.every((group) => group.items.every((item) => item.pane))).toBe(true);
  });

  it("builds every report suite from the reference job", () => {
    const project = withResults(loadReferenceProject());
    const suites = reportSuites(project, null);
    expect(suites.map((suite) => suite.id)).toEqual(["submission", "working", "analysis", "resources", "adjustments", "queries"]);
    expect(suites.find((suite) => suite.id === "submission")?.rows.length).toBeGreaterThan(0);
    expect(suites.find((suite) => suite.id === "working")?.rows.length).toBeGreaterThan(0);
    expect(suites.every((suite) => suite.heads.length > 0)).toBe(true);
  });

  it("keeps follow-ups on the enquiry notes for the job file", () => {
    const notes = appendFollowUp("Prices requested.", "Email", "Asked Vendor A for the veneer quote", "2026-11-05T09:00:00.000Z");
    const rows = readFollowUps(notes, "enq-1", "Vendor A");
    expect(rows).toEqual([
      { enquiryId: "enq-1", vendor: "Vendor A", at: "2026-11-05T09:00:00.000Z", channel: "Email", note: "Asked Vendor A for the veneer quote" },
    ]);
  });
});
