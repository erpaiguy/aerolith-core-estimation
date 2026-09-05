import { describe, expect, it } from "vitest";
import { stampItem } from "./model";
import { billIdsFromFocus, DEFAULT_BILL_ID, itemKeyOf, projectGrand } from "./bills";
import { emptyProject } from "./loadReference";
import { withResults } from "./projectCompute";
import {
  APP_DEFAULT_REPORT_FORMAT,
  buildDocument,
  matchWorkingItem,
  paginateDocument,
  packetAmount,
  submissionCsv,
} from "./reportFormat";

function twoBillJob() {
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
    ourQty: 1,
    unit: "Nr",
    priceMode: "direct",
    directCost: 50,
    lines: [],
  });
  const base = emptyProject("Two bills");
  const lockedAt = new Date().toISOString();
  return withResults({
    ...base,
    sourceLockedAt: lockedAt,
    qtoLines: [a, b].map((item, idx) => ({
      id: `qto-${idx}`,
      billId: item.billId,
      workCategory: null,
      drawing: null,
      locationDesc: null,
      itemLabel: item.description,
      subItem: null,
      formulaKey: "qty" as const,
      dims: { l: 1 },
      workingBoqCode: itemKeyOf(item),
    })),
    bills: [
      { id: billA, number: 1, code: "1", name: "Civil Works", issuedRef: "", sourceLockedAt: lockedAt },
      { id: billB, number: 2, code: "2", name: "MEP", issuedRef: "", sourceLockedAt: lockedAt },
    ],
    items: [a, b],
    clientNodes: [
      { row: 1, kind: "title", description: "Two bills" },
      { row: 2, kind: "section", sl_no: "1", description: "Civil", billId: billA },
      { row: 3, kind: "item", sl_no: "1.1", description: "Civil item", qty: 1, unit: "Nr", billId: billA, boqCode: itemKeyOf(a) },
      { row: 4, kind: "section", sl_no: "1", description: "MEP", billId: billB },
      { row: 5, kind: "item", sl_no: "1.1", description: "MEP item", qty: 1, unit: "Nr", billId: billB, boqCode: itemKeyOf(b) },
    ],
  });
}

describe("submit scope", () => {
  it("matches issued codes only inside the node bill", () => {
    const project = twoBillJob();
    const civil = project.clientNodes.find((n) => n.description === "Civil item")!;
    const mep = project.clientNodes.find((n) => n.description === "MEP item")!;
    expect(matchWorkingItem(project, civil)?.description).toBe("Civil item");
    expect(matchWorkingItem(project, mep)?.description).toBe("MEP item");
  });

  it("packet amount is the selected bills; full job still prints project grand", () => {
    const project = twoBillJob();
    const grand = projectGrand(project.items);
    const civil = packetAmount(project, APP_DEFAULT_REPORT_FORMAT, {
      billIds: [DEFAULT_BILL_ID],
      categoryKeys: "all",
      content: "items",
    });
    expect(civil).toBeGreaterThan(0);
    expect(civil).toBeLessThan(grand);
    const csv = submissionCsv(project, APP_DEFAULT_REPORT_FORMAT, civil, {
      billIds: [DEFAULT_BILL_ID],
      categoryKeys: "all",
      content: "both",
    });
    expect(csv).toContain("This packet");
    expect(csv).toContain("Project grand (all BOQs)");
    expect(buildDocument(project, { billIds: [DEFAULT_BILL_ID], categoryKeys: "all", content: "items" }).lines.some((l) => l.description === "MEP item")).toBe(false);
  });

  it("complete items output omits summary pages", () => {
    const project = twoBillJob();
    const pages = paginateDocument(project, APP_DEFAULT_REPORT_FORMAT, projectGrand(project.items), {
      billIds: "all",
      categoryKeys: "all",
      content: "items",
    });
    expect(pages.some((p) => p.kind === "items")).toBe(true);
    expect(pages.some((p) => p.kind === "category-summary")).toBe(false);
    expect(pages.some((p) => p.kind === "grand-summary")).toBe(false);
  });

  it("null rail focus (All BOQs) packets every bill, not only the first", () => {
    const project = twoBillJob();
    const grand = projectGrand(project.items);
    const all = packetAmount(project, APP_DEFAULT_REPORT_FORMAT, {
      billIds: billIdsFromFocus(null),
      categoryKeys: "all",
      content: "items",
    });
    const first = packetAmount(project, APP_DEFAULT_REPORT_FORMAT, {
      billIds: billIdsFromFocus(DEFAULT_BILL_ID),
      categoryKeys: "all",
      content: "items",
    });
    expect(all).toBe(grand);
    expect(first).toBeLessThan(grand);
    expect(buildDocument(project, { billIds: billIdsFromFocus(null), categoryKeys: "all", content: "items" }).lines.some((l) => l.description === "MEP item")).toBe(true);
  });
});
