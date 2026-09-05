import { describe, expect, it } from "vitest";
import { moneyClose } from "@aerolith/shared";
import { loadCampusSampleProject, loadReferenceProject } from "./loadReference";
import { GOLDEN_TOTAL } from "./model";
import { projectGrand } from "./bills";
import { withResults } from "./projectCompute";
import { amountOf, APP_DEFAULT_REPORT_FORMAT, packetAmount } from "./reportFormat";
import { pivotSubmissionByBoq, shouldPivotQtyByBoq, submissionCompareCsv } from "./submissionCompare";

describe("qty by BOQ on Submission", () => {
  it("does not pivot a single-BOQ job", () => {
    const project = withResults(loadReferenceProject());
    expect(shouldPivotQtyByBoq(project, { billIds: "all", categoryKeys: "all", content: "items" })).toBe(false);
    expect(moneyClose(projectGrand(project.items), GOLDEN_TOTAL)).toBe(true);
  });

  it("folds colliding issued codes into one row with a qty per building and a total", () => {
    const project = withResults(loadCampusSampleProject());
    const scope = { billIds: "all" as const, categoryKeys: "all" as const, content: "items" as const };
    expect(shouldPivotQtyByBoq(project, scope)).toBe(true);
    const { bills, rows } = pivotSubmissionByBoq(project, APP_DEFAULT_REPORT_FORMAT, scope);
    expect(bills).toHaveLength(3);
    const columns = rows.find((r) => r.kind === "item" && r.sl === "a" && r.description.toLowerCase().includes("column"));
    expect(columns).toBeTruthy();
    expect(columns!.qtyByBill).toHaveLength(3);
    expect(columns!.qtyByBill.every((q) => q != null && q > 0)).toBe(true);
    expect(columns!.totalQty).toBe(columns!.qtyByBill.reduce<number>((s, q) => s + (q ?? 0), 0));
    const items = rows.filter((r) => r.kind === "item");
    expect(items.length).toBeLessThan(project.items.filter((i) => i.kind === "item").length);
    const moneyRows = rows.filter((r) => r.kind === "item" || r.kind === "adjustment");
    const pivoted = amountOf(
      moneyRows.map((r) => ({
        kind: r.kind === "adjustment" ? ("adjustment" as const) : ("item" as const),
        key: r.key,
        sl: r.sl,
        description: r.description,
        qty: r.totalQty,
        ourQty: null,
        unit: r.unit,
        rate: r.rate,
        amount: r.amount,
      })),
    );
    expect(moneyClose(pivoted, packetAmount(project, APP_DEFAULT_REPORT_FORMAT, scope))).toBe(true);
    expect(moneyClose(pivoted, projectGrand(project.items))).toBe(true);
  });

  it("marks a dash when an issued item is missing from a building", () => {
    const base = withResults(loadCampusSampleProject());
    const drop = base.clientNodes.find((n) => n.billId === "bill-3" && n.kind === "item" && n.sl_no === "a" && n.description?.includes("Site establishment"));
    expect(drop).toBeTruthy();
    const project = {
      ...base,
      clientNodes: base.clientNodes.filter((n) => n !== drop),
      items: base.items.filter((i) => !(i.billId === "bill-3" && i.boqCode === "1a")),
    };
    const { rows } = pivotSubmissionByBoq(project, APP_DEFAULT_REPORT_FORMAT, {
      billIds: "all",
      categoryKeys: "all",
      content: "items",
    });
    const row = rows.find((r) => r.kind === "item" && r.description.includes("Site establishment"));
    expect(row?.qtyByBill[0]).toBeGreaterThan(0);
    expect(row?.qtyByBill[1]).toBeGreaterThan(0);
    expect(row?.qtyByBill[2]).toBeNull();
  });

  it("compare CSV has a qty column per BOQ and leaves packet money unchanged", () => {
    const project = withResults(loadCampusSampleProject());
    const csv = submissionCompareCsv(project, APP_DEFAULT_REPORT_FORMAT, projectGrand(project.items), {
      billIds: "all",
      categoryKeys: "all",
      content: "items",
    });
    expect(csv).toContain("Qty 1");
    expect(csv).toContain("Qty 2");
    expect(csv).toContain("Qty 3");
    expect(csv).toContain("Qty total");
  });
});
