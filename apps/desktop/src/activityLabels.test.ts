import { describe, expect, it } from "vitest";
import { ACTIVITY_LABELS, RIBBON_ORDER, activityLabel } from "./activityLabels";
import { MODULES } from "./platform/types";

describe("module tab names", () => {
  it("uses the workspace names on every ribbon activity", () => {
    expect(ACTIVITY_LABELS.source).toBe("Client BOQ");
    expect(ACTIVITY_LABELS.estimate).toBe("Working BOQ");
    expect(ACTIVITY_LABELS.analysis).toBe("Rate Analysis");
    expect(ACTIVITY_LABELS.buy).toBe("Resource Prices");
    expect(ACTIVITY_LABELS.queries).toBe("Client Queries");
    expect(ACTIVITY_LABELS.submit).toBe("Submission BOQ");
    expect(ACTIVITY_LABELS.masters).toBe("Masters");
    expect(ACTIVITY_LABELS.settings).toBe("Settings");
    expect(RIBBON_ORDER).toHaveLength(Object.keys(ACTIVITY_LABELS).length);
    expect(RIBBON_ORDER.every((id) => activityLabel(id).length > 0)).toBe(true);
  });

  it("keeps permission module labels aligned with the ribbon", () => {
    const byId = new Map(MODULES.map((m) => [m.id, m.label]));
    expect(byId.get("source")).toBe(ACTIVITY_LABELS.source);
    expect(byId.get("estimate")).toBe(ACTIVITY_LABELS.estimate);
    expect(byId.get("buy")).toBe(ACTIVITY_LABELS.buy);
    expect(byId.get("submit")).toBe(ACTIVITY_LABELS.submit);
    expect(byId.get("masters")).toBe(ACTIVITY_LABELS.masters);
    expect(byId.get("settings")).toBe(ACTIVITY_LABELS.settings);
  });
});
