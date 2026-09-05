import { describe, expect, it } from "vitest";
import { moneyClose } from "@aerolith/shared";
import {
  DEFAULT_BILL_ID,
  billTotal,
  billIdsFromFocus,
  ensureProjectBills,
  itemKeyOf,
  makeItemKey,
  pivotWorkingByBoq,
  projectGrand,
  sortedBills,
} from "./bills";
import { emptyProject, loadCampusSampleProject } from "./loadReference";
import { stampItem } from "./model";
import { linkWholeAnalysis, withResults } from "./projectCompute";

describe("multi-BOQ identity", () => {
  it("migrates a job without bills onto BOQ 1", () => {
    const raw = emptyProject("Job");
    const { bills, ...rest } = raw;
    const migrated = ensureProjectBills({ ...rest, bills: [] } as typeof raw);
    expect(migrated.bills).toHaveLength(1);
    expect(migrated.bills[0]?.id).toBe(DEFAULT_BILL_ID);
    expect(migrated.items.every((i) => i.billId === DEFAULT_BILL_ID)).toBe(true);
    expect(migrated.qtoLines[0]?.workingBoqCode).toBe(makeItemKey(DEFAULT_BILL_ID, "1a"));
  });

  it("keeps colliding issued codes distinct and sums bills into the grand total", () => {
    const billA = DEFAULT_BILL_ID;
    const billB = "bill-2";
    const a = stampItem({
      billId: billA,
      boqCode: "1.1",
      slNo: "1.1",
      kind: "item",
      parentCode: null,
      description: "Civil item",
      boqCategory: null,
      workCategory: null,
      subWorkCategory: null,
      group1: null,
      group2: null,
      group3: null,
      clientQty: 1,
      ourQty: 1,
      unit: "Nr",
      priceMode: "direct",
      directCost: 100,
      lines: [],
    });
    const b = stampItem({
      billId: billB,
      boqCode: "1.1",
      slNo: "1.1",
      kind: "item",
      parentCode: null,
      description: "MEP item",
      boqCategory: null,
      workCategory: null,
      subWorkCategory: null,
      group1: null,
      group2: null,
      group3: null,
      clientQty: 1,
      ourQty: 2,
      unit: "Nr",
      priceMode: "direct",
      directCost: 50,
      lines: [],
    });
    const project = withResults({
      ...emptyProject("Two bills"),
      bills: [
        { id: billA, number: 1, code: "1", name: "Civil", issuedRef: "", sourceLockedAt: new Date().toISOString() },
        { id: billB, number: 2, code: "2", name: "MEP", issuedRef: "", sourceLockedAt: new Date().toISOString() },
      ],
      items: [a, b],
      qtoLines: [
        { id: "q1", billId: billA, workCategory: null, drawing: null, locationDesc: null, itemLabel: a.description, subItem: null, formulaKey: "qty", dims: { l: 1 }, workingBoqCode: itemKeyOf(a) },
        { id: "q2", billId: billB, workCategory: null, drawing: null, locationDesc: null, itemLabel: b.description, subItem: null, formulaKey: "qty", dims: { l: 2 }, workingBoqCode: itemKeyOf(b) },
      ],
    });
    expect(itemKeyOf(project.items[0]!)).not.toBe(itemKeyOf(project.items[1]!));
    expect(project.items[0]?.result?.amount).toBeGreaterThan(0);
    expect(billTotal(project.items, billA) + billTotal(project.items, billB)).toBeCloseTo(projectGrand(project.items));
    expect(projectGrand(project.items)).toBeCloseTo(
      (project.items[0]?.result?.amount ?? 0) + (project.items[1]?.result?.amount ?? 0),
    );
  });

  it("live-links a rate from another BOQ", () => {
    const billA = DEFAULT_BILL_ID;
    const billB = "bill-2";
    const parent = stampItem({
      billId: billA,
      boqCode: "1a",
      slNo: "a",
      kind: "item",
      parentCode: null,
      description: "Parent",
      boqCategory: null,
      workCategory: null,
      subWorkCategory: null,
      group1: null,
      group2: null,
      group3: null,
      clientQty: 1,
      ourQty: 1,
      unit: "Nr",
      priceMode: "analysis",
      analysisOrigin: "own",
      lines: [{ factors: [1], wastagePct: 0, resourceRate: 20, description: "Labour", projectResourceCode: null, unit: "hr" }],
    });
    const child = stampItem({
      billId: billB,
      boqCode: "1a",
      slNo: "a",
      kind: "item",
      parentCode: null,
      description: "Child",
      boqCategory: null,
      workCategory: null,
      subWorkCategory: null,
      group1: null,
      group2: null,
      group3: null,
      clientQty: 1,
      ourQty: 1,
      unit: "Nr",
      priceMode: "analysis",
      lines: [],
    });
    let project = withResults({
      ...emptyProject("Link across"),
      bills: [
        { id: billA, number: 1, code: "1", name: "A", issuedRef: "", sourceLockedAt: new Date().toISOString() },
        { id: billB, number: 2, code: "2", name: "B", issuedRef: "", sourceLockedAt: new Date().toISOString() },
      ],
      items: [parent, child],
      qtoLines: [
        { id: "q1", billId: billA, workCategory: null, drawing: null, locationDesc: null, itemLabel: parent.description, subItem: null, formulaKey: "qty", dims: { l: 1 }, workingBoqCode: itemKeyOf(parent) },
        { id: "q2", billId: billB, workCategory: null, drawing: null, locationDesc: null, itemLabel: child.description, subItem: null, formulaKey: "qty", dims: { l: 1 }, workingBoqCode: itemKeyOf(child) },
      ],
    });
    project = withResults(linkWholeAnalysis(project, itemKeyOf(child), itemKeyOf(parent)));
    const linked = project.items.find((i) => i.billId === billB);
    expect(linked?.analysisOrigin).toBe("link");
    expect(linked?.linkedBoqCode).toBe(itemKeyOf(parent));
    expect(linked?.result?.unitCost).toBe(20);
  });
});

describe("BOQ rail focus", () => {
  it("All BOQs is a null focus, not a fallback to the first bill", () => {
    expect(billIdsFromFocus(null)).toBe("all");
    expect(billIdsFromFocus(DEFAULT_BILL_ID)).toEqual([DEFAULT_BILL_ID]);
  });

  it("folds All-BOQs working items onto qty columns per building", () => {
    const project = withResults(loadCampusSampleProject());
    const bills = sortedBills(project);
    const rows = pivotWorkingByBoq(project.items, bills);
    expect(bills).toHaveLength(3);
    const columns = rows.find((r) => r.kind === "item" && r.code === "3a");
    expect(columns).toBeTruthy();
    expect(columns!.qtyByBill).toHaveLength(3);
    expect(columns!.qtyByBill.every((q) => q != null && q > 0)).toBe(true);
    expect(columns!.totalQty).toBe(columns!.qtyByBill.reduce<number>((s, q) => s + (q ?? 0), 0));
    expect(rows.filter((r) => r.kind === "item").length).toBeLessThan(project.items.filter((i) => i.kind === "item").length);
    const amount = rows
      .filter((r) => r.kind === "item")
      .reduce(
        (s, r) => s + r.twins.reduce((t, item) => t + (item?.result?.amount ?? 0), 0),
        0,
      );
    expect(moneyClose(amount, projectGrand(project.items))).toBe(true);
  });
});
