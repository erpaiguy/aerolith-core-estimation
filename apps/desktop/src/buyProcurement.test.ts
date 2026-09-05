import { describe, expect, it } from "vitest";
import { emptyProject } from "./loadReference";
import { withResults } from "./projectCompute";
import {
  applyCustomRate,
  blankEnquiry,
  bookCoverage,
  bookSourceOf,
  groupSummaryRows,
  issueEnquiry,
  resourceSummaryAll,
  resourceSummaryRows,
  settleRows,
  upsertEnquiry,
} from "./buyProcurement";

function pricedBuyJob() {
  const base = withResults(emptyProject("Resource summary"));
  const item = base.items.find((i) => i.kind === "item")!;
  const next = withResults({
    ...base,
    items: base.items.map((i) =>
      i.boqCode === item.boqCode
        ? {
            ...i,
            lines: [
              {
                factors: [1, null, null, null, null, null],
                wastagePct: 0,
                resourceRate: 10,
                description: "Cement",
                projectResourceCode: null,
                unit: "Bag",
              },
            ],
          }
        : i,
    ),
  });
  const code = next.items.find((i) => i.boqCode === item.boqCode)!.lines[0]!.projectResourceCode!;
  const laneId = `res:${next.resources.find((r) => r.project_code === code)!.category}`;
  return { ...next, code, laneId, item };
}

describe("resource price summary", () => {
  it("lists qty, price, amount and linked pack / quote rates", () => {
    const job = pricedBuyJob();
    const packed = upsertEnquiry(job, blankEnquiry(job, job.laneId, "Vendor 1"));
    const sent = issueEnquiry(packed, packed.enquiries![0]!.id);
    const quoted = {
      ...sent,
      resourceQuotes: [
        { id: "rq-1", projectResourceCode: job.code, vendorName: "Vendor 1", rate: 18, selected: true },
        { id: "rq-2", projectResourceCode: job.code, vendorName: "Vendor 2", rate: 22, selected: false },
      ],
    };
    const live = withResults(quoted);
    const row = resourceSummaryRows(live, job.laneId).find((r) => r.code === job.code)!;
    expect(row.qty).toBeGreaterThan(0);
    expect(row.packCount).toBe(1);
    expect(row.send).toBe("sent");
    expect(row.receiveMin).toBe(18);
    expect(row.receiveMax).toBe(22);
    expect(row.compareRate).toBe(18);
    expect(row.compareVendor).toBe("Vendor 1");
    expect(row.price).toBe(10);
    expect(row.amount).toBeCloseTo(row.qty * 10);
  });

  it("custom rate overwrites quotes and recals linked analysis lines", () => {
    const job = pricedBuyJob();
    const quoted = {
      ...job,
      resourceQuotes: [
        { id: "rq-1", projectResourceCode: job.code, vendorName: "Vendor 1", rate: 18, selected: true },
      ],
    };
    const custom = withResults(applyCustomRate(quoted, "resource", job.code, 40));
    const res = custom.resources.find((r) => r.project_code === job.code)!;
    expect(res.project_rate).toBe(40);
    expect(res.rate_source).toBe("manual");
    expect(custom.resourceQuotes.every((q) => !q.selected)).toBe(true);
    expect(custom.items.find((i) => i.boqCode === job.item.boqCode)?.lines[0]?.resourceRate).toBe(40);
    const row = resourceSummaryRows(custom, job.laneId).find((r) => r.code === job.code)!;
    expect(row.price).toBe(40);
    expect(row.source).toBe("manual");
    expect(row.amount).toBeCloseTo(row.qty * 40);
  });

  it("house summary lists every category, fully populated", () => {
    const job = pricedBuyJob();
    const all = resourceSummaryAll(job);
    const groups = groupSummaryRows(all);
    expect(all.length).toBeGreaterThan(0);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.map((g) => g.laneId).sort()).toEqual([...new Set(all.map((r) => r.laneId))].sort());
    expect(all.every((r) => r.laneId && r.laneLabel && r.qty != null && r.price != null)).toBe(true);
    expect(groups.every((g) => g.types.length >= 1 && g.types.every((t) => t.rows.length >= 1))).toBe(true);
    expect(all.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(groups.reduce((s, g) => s + g.amount, 0));
  });

  it("book source and settle pass treat typed vs analysis vs awarded", () => {
    const job = pricedBuyJob();
    const analysis = resourceSummaryRows(job, job.laneId).find((r) => r.code === job.code)!;
    expect(bookSourceOf(analysis)).toBe("Analysis");
    const typed = withResults(applyCustomRate(job, "resource", job.code, 40));
    const typedRow = resourceSummaryRows(typed, job.laneId).find((r) => r.code === job.code)!;
    expect(bookSourceOf(typedRow)).toBe("Typed");
    const awarded = {
      ...job,
      resourceQuotes: [
        { id: "rq-1", projectResourceCode: job.code, vendorName: "Vendor 1", rate: 18, selected: true },
      ],
    };
    const awardedRow = resourceSummaryRows(withResults(awarded), job.laneId).find((r) => r.code === job.code)!;
    expect(bookSourceOf(awardedRow)).toBe("Awarded");
    const cov = bookCoverage(job);
    expect(cov.total).toBeGreaterThan(0);
    expect(cov.analysis).toBeGreaterThan(0);
    expect(settleRows(job).some((r) => r.code === job.code)).toBe(true);
    expect(settleRows(typed).some((r) => r.code === job.code)).toBe(false);
  });

  it("enquiry chip follows pack track status", () => {
    const job = pricedBuyJob();
    const packed = upsertEnquiry(job, blankEnquiry(job, job.laneId, "Vendor 1"));
    const draftRow = resourceSummaryRows(packed, job.laneId).find((r) => r.code === job.code)!;
    expect(draftRow.enquiry).toBe("draft");
    expect(draftRow.packId).toBeTruthy();
    const sent = issueEnquiry(packed, packed.enquiries![0]!.id);
    const sentRow = resourceSummaryRows(sent, job.laneId).find((r) => r.code === job.code)!;
    expect(sentRow.enquiry).toBe("sent");
  });
});
