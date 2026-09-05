import { moneyClose } from "@aerolith/shared";
import { describe, expect, it } from "vitest";
import { loadCampusSampleProject, loadReferenceProject } from "./loadReference";
import { GOLDEN_TOTAL } from "./model";
import { billTotal, DEFAULT_BILL_ID, itemKeyOf, makeItemKey, projectGrand, sortedBills } from "./bills";
import { costCategoryTree, withResults } from "./projectCompute";
import { paginateDocument, APP_DEFAULT_REPORT_FORMAT } from "./reportFormat";

describe("sample jobs", () => {
  it("keeps the single-BOQ reference GREEN while seeding Buy, Queries, and Takeoff", () => {
    const project = withResults(loadReferenceProject());
    expect(sortedBills(project)).toHaveLength(1);
    expect(sortedBills(project)[0]?.id).toBe(DEFAULT_BILL_ID);
    const total = projectGrand(project.items);
    expect(moneyClose(total, GOLDEN_TOTAL)).toBe(true);
    expect(project.items.filter((i) => i.kind === "item" && i.ourQty !== i.clientQty)).toHaveLength(7);
    expect(project.qtoLines.every((l) => Boolean(l.drawing) && Boolean(l.locationDesc))).toBe(true);
    expect(project.workingColumns.some((c) => c.id === "w-wing")).toBe(true);
    expect(project.enquiries.length).toBeGreaterThan(0);
    expect(project.quoteReplies.length).toBeGreaterThan(0);
    expect(project.itemQuotes.length).toBeGreaterThan(0);
    expect(project.itemQuotes.every((q) => !q.selected)).toBe(true);
    expect(project.resourceQuotes.some((q) => q.vendorName === "Vendor 2" && !q.selected)).toBe(true);
    expect(project.queryItems.length).toBeGreaterThan(0);
    expect(project.queryLists.some((l) => l.status === "sent")).toBe(true);
    expect(project.queryLists.some((l) => l.status === "draft")).toBe(true);
  });

  it("loads a three-building campus with colliding issued codes and every module seeded", () => {
    const project = withResults(loadCampusSampleProject());
    const bills = sortedBills(project);
    expect(bills).toHaveLength(3);
    expect(bills.map((b) => b.id)).toEqual([DEFAULT_BILL_ID, "bill-2", "bill-3"]);
    expect(bills[0]?.name).toMatch(/10,000/);
    expect(bills[1]?.name).toMatch(/15,000/);
    expect(bills[2]?.name).toMatch(/2,500/);
    expect(bills.every((b) => b.sourceLockedAt)).toBe(true);

    const twins = project.items.filter((i) => i.kind === "item" && i.boqCode === "3a");
    expect(twins).toHaveLength(3);
    expect(new Set(twins.map((i) => itemKeyOf(i))).size).toBe(3);

    const grand = projectGrand(project.items);
    const sumBills = bills.reduce((s, b) => s + billTotal(project.items, b.id), 0);
    expect(moneyClose(grand, sumBills)).toBe(true);
    expect(grand).toBeGreaterThan(0);
    expect(billTotal(project.items, DEFAULT_BILL_ID)).toBeGreaterThan(0);
    expect(billTotal(project.items, "bill-2")).toBeGreaterThan(0);
    expect(billTotal(project.items, "bill-3")).toBeGreaterThan(0);
    expect(moneyClose(grand, GOLDEN_TOTAL)).toBe(false);

    const linked = project.items.find((i) => i.billId === "bill-2" && i.boqCode === "3a");
    expect(linked?.analysisOrigin).toBe("link");
    expect(linked?.linkedBoqCode).toBe(makeItemKey(DEFAULT_BILL_ID, "3a"));
    const parent = project.items.find((i) => i.billId === DEFAULT_BILL_ID && i.boqCode === "3a");
    expect(linked?.result?.unitCost).toBe(parent?.result?.unitCost);

    const cloned = project.items.find((i) => i.billId === "bill-3" && i.boqCode === "2a");
    expect(cloned?.analysisOrigin).toBe("clone");
    expect(cloned?.lines.length).toBeGreaterThan(0);

    const included = project.items.find((i) => i.billId === "bill-3" && i.boqCode === "8d");
    expect(included?.includes?.some((inc) => inc.sourceBoqCode === makeItemKey(DEFAULT_BILL_ID, "4b"))).toBe(true);

    expect(project.qtoLines.some((l) => l.formulaKey === "volume")).toBe(true);
    expect(project.qtoLines.some((l) => l.formulaKey === "area")).toBe(true);
    expect(project.items.some((i) => i.kind === "item" && i.ourQty !== i.clientQty)).toBe(true);

    expect(project.enquiries.some((e) => e.laneKind === "resource" && e.status === "issued")).toBe(true);
    expect(project.enquiries.some((e) => e.laneKind === "boq" && e.status === "issued")).toBe(true);
    expect(project.itemQuotes.some((q) => q.selected && q.boqCode.includes("::8a"))).toBe(true);
    expect(project.quoteReplies.length).toBeGreaterThan(0);
    expect(project.queryItems.length).toBeGreaterThan(0);
    expect(project.vendors.length).toBeGreaterThanOrEqual(4);
    expect(project.workingColumns.some((c) => c.id === "w-level")).toBe(true);

    const pages = paginateDocument(project, APP_DEFAULT_REPORT_FORMAT, grand);
    expect(pages.some((p) => p.kind === "bill-summary")).toBe(false);
    expect(pages.some((p) => p.kind === "items")).toBe(true);
    const grandPage = pages.find((p) => p.kind === "grand-summary");
    expect(grandPage).toBeTruthy();
    expect(grandPage!.summaryRows.length).toBeGreaterThan(0);
    expect(moneyClose(grandPage!.pageAmount, grand)).toBe(true);
    expect(moneyClose(grandPage!.summaryRows.reduce((s, r) => s + r.amount, 0), grand)).toBe(true);
    expect(project.items.every((i) => i.kind !== "item" || i.result)).toBe(true);
    expect(project.items.filter((i) => i.kind === "item" && (i.result?.rate ?? 0) === 0).length).toBe(0);

    const jobTree = costCategoryTree(project);
    expect(jobTree.length).toBeGreaterThan(0);
    const material = jobTree.find((n) => n.label === "Material");
    expect(material?.children.length).toBeGreaterThan(0);
    expect(material?.children.some((main) => main.children.some((sub) => sub.leaves.length > 0))).toBe(true);
    for (const bill of bills) {
      const tree = costCategoryTree(project, bill.id);
      expect(tree.length).toBeGreaterThan(0);
      expect(
        tree.some((cat) => cat.children.some((main) => main.children.some((sub) => sub.leaves.length > 0))),
      ).toBe(true);
    }
  });
});
