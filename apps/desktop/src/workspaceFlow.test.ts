import { moneyClose } from "@aerolith/shared";
import { describe, expect, it } from "vitest";
import { GOLDEN_TOTAL } from "./model";
import { appendBillFromClientRows, loadReferenceProject } from "./loadReference";
import {
  DEFAULT_BILL_ID,
  billTotal,
  itemKeyOf,
  projectGrand,
  sortedBills,
} from "./bills";
import { BOQ_LANE_ID, laneTargets } from "./buyProcurement";
import { linkWholeAnalysis, withResults } from "./projectCompute";
import {
  APP_DEFAULT_REPORT_FORMAT,
  buildDocument,
  matchWorkingItem,
  packetAmount,
  paginateDocument,
} from "./reportFormat";

describe("multi-BOQ workspace flow", () => {
  it("keeps the sample GREEN, then adds a second BOQ with a colliding issued code", () => {
    const sample = withResults(loadReferenceProject());
    expect(sortedBills(sample)).toHaveLength(1);
    expect(sortedBills(sample)[0]?.id).toBe(DEFAULT_BILL_ID);
    const sampleTotal = projectGrand(sample.items);
    expect(moneyClose(sampleTotal, GOLDEN_TOTAL)).toBe(true);

    const first = sample.items.find((i) => i.kind === "item" && i.boqCode === "1a") ?? sample.items.find((i) => i.kind === "item")!;
    const appended = withResults(
      appendBillFromClientRows(sample, "Volume 2", [
        { sl: "1", description: "MEP", qty: null, unit: "" },
        { sl: "a", description: "Colliding code on volume 2", qty: 2, unit: "Nr" },
      ]),
    );
    expect(sortedBills(appended)).toHaveLength(2);
    const billB = sortedBills(appended)[1]!;
    const twins = appended.items.filter((i) => i.kind === "item" && i.boqCode === first.boqCode);
    expect(twins.length).toBeGreaterThanOrEqual(2);
    expect(new Set(twins.map((i) => itemKeyOf(i))).size).toBe(twins.length);
    expect(moneyClose(projectGrand(appended.items), sampleTotal)).toBe(true);
    expect(billTotal(appended.items, DEFAULT_BILL_ID) + billTotal(appended.items, billB.id)).toBeCloseTo(
      projectGrand(appended.items),
    );

    const nodeB = appended.clientNodes.find((n) => n.billId === billB.id && n.description === "Colliding code on volume 2")!;
    expect(matchWorkingItem(appended, nodeB)?.billId).toBe(billB.id);
    expect(matchWorkingItem(appended, nodeB)?.description).toBe("Colliding code on volume 2");

    const civilPacket = packetAmount(appended, APP_DEFAULT_REPORT_FORMAT, {
      billIds: [DEFAULT_BILL_ID],
      categoryKeys: "all",
      content: "items",
    });
    expect(civilPacket).toBeGreaterThan(0);
    expect(
      buildDocument(appended, { billIds: [DEFAULT_BILL_ID], categoryKeys: "all", content: "items" }).lines.some(
        (l) => l.description === "Colliding code on volume 2",
      ),
    ).toBe(false);

    const itemPages = paginateDocument(appended, APP_DEFAULT_REPORT_FORMAT, projectGrand(appended.items), {
      billIds: "all",
      categoryKeys: "all",
      content: "items",
    });
    expect(itemPages.every((p) => p.kind === "items")).toBe(true);
    expect(
      itemPages.some(
        (p) =>
          /volume 2/i.test(p.title) ||
          p.rows.some((r) => r.key.startsWith("bill-head-") || /volume 2|colliding code/i.test(r.description)),
      ),
    ).toBe(true);

    const childItem = twins.find((i) => i.billId === billB.id)!;
    const linked = withResults(linkWholeAnalysis(appended, itemKeyOf(childItem), itemKeyOf(first)));
    const parent = linked.items.find((i) => itemKeyOf(i) === itemKeyOf(first));
    const child = linked.items.find((i) => itemKeyOf(i) === itemKeyOf(childItem));
    expect(child?.linkedBoqCode).toBe(itemKeyOf(first));
    expect(child?.result?.unitCost).toBe(parent?.result?.unitCost);
    expect(projectGrand(linked.items)).toBeGreaterThan(sampleTotal);

    const boqTargets = laneTargets(linked, BOQ_LANE_ID);
    expect(boqTargets.some((t) => t.code === itemKeyOf(first))).toBe(true);
    expect(boqTargets.some((t) => t.code === itemKeyOf(childItem))).toBe(true);
    const filtered = laneTargets(linked, BOQ_LANE_ID, billB.id);
    expect(filtered.every((t) => t.code.startsWith(`${billB.id}::`))).toBe(true);
  });
});
