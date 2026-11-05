import { describe, expect, it } from "vitest";
import { appendFollowUp, readFollowUps, SCREENS } from "./routes";

describe("Bid Craft 3.0 screens", () => {
  it("lists screens 1 through 28 and no later product", () => {
    expect(SCREENS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]);
    expect(SCREENS.some((s) => /pipeline|handover|escalation/i.test(s.title))).toBe(false);
  });

  it("keeps follow-ups on the enquiry notes for the job file", () => {
    const notes = appendFollowUp("Prices requested.", "Email", "Asked Vendor A for the veneer quote", "2026-11-05T09:00:00.000Z");
    const rows = readFollowUps(notes, "enq-1", "Vendor A");
    expect(rows).toEqual([
      { enquiryId: "enq-1", vendor: "Vendor A", at: "2026-11-05T09:00:00.000Z", channel: "Email", note: "Asked Vendor A for the veneer quote" },
    ]);
  });
});
