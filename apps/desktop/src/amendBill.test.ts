import { moneyClose } from "@aerolith/shared";
import { describe, expect, it } from "vitest";
import { amendBillFromClientRows, loadReferenceProject } from "./loadReference";
import { GOLDEN_TOTAL } from "./model";
import { DEFAULT_BILL_ID, projectGrand, sortedBills } from "./bills";
import { withResults } from "./projectCompute";

describe("client BOQ amendments", () => {
  it("updates issued qty without touching our qty or GREEN until remeasure", () => {
    const sample = withResults(loadReferenceProject());
    const target = sample.items.find((i) => i.kind === "item" && i.boqCode === "1a")!;
    const { project, report } = amendBillFromClientRows(sample, DEFAULT_BILL_ID, [
      { sl: "1", description: "Preliminaries", qty: null, unit: "" },
      { sl: "a", description: target.description, qty: target.clientQty + 4, unit: target.unit ?? "L/s" },
    ]);
    const next = project.items.find((i) => i.id === target.id)!;
    expect(report.qtyChanged).toBe(1);
    expect(next.clientQty).toBe(target.clientQty + 4);
    expect(next.ourQty).toBe(target.ourQty);
    expect(next.lines.length).toBe(target.lines.length);
    expect(moneyClose(projectGrand(withResults(project).items), GOLDEN_TOTAL)).toBe(true);
  });

  it("adds extra pages, new items, and a new section on the same bill", () => {
    const sample = withResults(loadReferenceProject());
    const before = sample.items.length;
    const { project, report } = amendBillFromClientRows(sample, DEFAULT_BILL_ID, [
      { sl: "8", description: "Additional pages issued 12 Mar", qty: null, unit: "" },
      { sl: "a", description: "Add for extra pages issued 12 Mar", qty: 1, unit: "L/s" },
      { sl: "b", description: "Omit superseded provisional sum", qty: -1, unit: "L/s" },
    ]);
    expect(report.sectionsAdded).toBe(1);
    expect(report.itemsAdded).toBe(2);
    expect(project.items.length).toBe(before + 3);
    expect(sortedBills(project)).toHaveLength(1);
    const added = project.items.find((i) => i.description === "Add for extra pages issued 12 Mar")!;
    expect(added.kind).toBe("item");
    expect(added.billId).toBe(DEFAULT_BILL_ID);
    expect(added.clientQty).toBe(1);
    expect(added.ourQty).toBe(1);
  });
});

