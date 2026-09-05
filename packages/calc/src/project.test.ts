import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { moneyClose, roundMoney, totalMarginPct } from "../../shared/src/index.ts";
import {
  buildProjectGraph,
  composeAnalysis,
  computeProject,
  priceLine,
  rollupResourceTotals,
  type ItemInput,
} from "../src/index.ts";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/reference");

function read<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIX, name), "utf8")) as T;
}

interface Golden {
  total_margin_pct: number;
  working_cost_amount: number;
  working_margin_amount: number;
  working_grand_total: number;
  submission_grand_total: number;
  tender_adjustments_total: number;
  priced_item_count: number;
  analysis_block_count: number;
}

interface WorkingRow {
  kind: string;
  boq_code: string;
  client_qty?: number;
  our_qty?: number;
  quote_qty?: number;
  cost_rate?: number;
  rate?: number;
  amount?: number;
}

interface AnalysisRow {
  boq_code: string;
  analysis_qty: number;
  lines: Array<{
    factors: number[];
    wastage_pct: number;
    resource_rate: number;
    amount: number;
  }>;
}

const goldens = read<Golden>("goldens.json");
const working = read<WorkingRow[]>("working_boq.json").filter((w) => w.kind === "item");
const analyses = read<AnalysisRow[]>("rate_analyses.json");

function norm(code: string): string {
  return code.toLowerCase();
}

function items(): ItemInput[] {
  const amap = new Map(analyses.map((a) => [norm(a.boq_code), a]));
  return working.map((w) => {
    const a = amap.get(norm(w.boq_code));
    if (!a) throw new Error(`No analysis for ${w.boq_code}`);
    return {
      boqCode: w.boq_code,
      clientQty: w.client_qty ?? 0,
      ourQty: w.our_qty ?? 0,
      lines: a.lines.map((l) => ({
        factors: l.factors,
        wastagePct: l.wastage_pct ?? 0,
        resourceRate: l.resource_rate ?? 0,
      })),
    };
  });
}

const margin = {
  overheadPct: 0.1,
  profitPct: 0.3,
  logisticsPct: 0.025,
  contingencyPct: 0.05,
};

describe("reference workbook goldens", () => {
  it("margin stack is 47.5%", () => {
    expect(totalMarginPct(margin)).toBeCloseTo(goldens.total_margin_pct, 10);
  });

  it("recomputes each working unit cost from rate-analysis lines", () => {
    const amap = new Map(analyses.map((a) => [norm(a.boq_code), a]));
    let checked = 0;
    for (const w of working) {
      const a = amap.get(norm(w.boq_code));
      expect(a, w.boq_code).toBeTruthy();
      const composed = composeAnalysis(
        a!.lines.map((l) => ({
          factors: l.factors,
          wastagePct: l.wastage_pct ?? 0,
          resourceRate: l.resource_rate ?? 0,
        })),
        w.quote_qty ?? 0,
      );
      expect(
        moneyClose(composed.unitCost, w.cost_rate ?? 0),
        `${w.boq_code} unit cost`,
      ).toBe(true);
      checked += 1;
    }
    expect(checked).toBe(goldens.priced_item_count);
  });

  it("matches working and submission grand totals to 2 dp", () => {
    const result = computeProject({ margin, items: items() });
    expect(result.items.length).toBe(70);
    expect(moneyClose(result.costAmount, goldens.working_cost_amount)).toBe(true);
    expect(moneyClose(result.marginAmount, goldens.working_margin_amount)).toBe(true);
    expect(moneyClose(result.grandTotal, goldens.working_grand_total)).toBe(true);
    expect(moneyClose(result.submissionTotal, goldens.submission_grand_total)).toBe(true);
    expect(moneyClose(result.tenderAdjustmentsTotal, goldens.tender_adjustments_total)).toBe(
      true,
    );
    expect(roundMoney(result.grandTotal)).toBe(100826297.13);
  });

  it("client qty x rate + adjustments equals working amount per item", () => {
    const result = computeProject({ margin, items: items() });
    for (const it of result.items) {
      expect(moneyClose(it.clientAmount + it.adjustmentAmount, it.amount)).toBe(true);
    }
  });

  it("priceLine applies the stack once (no double wrap)", () => {
    const priced = priceLine(100000, 1, margin);
    expect(priced.rate).toBe(147500);
    expect(priced.amount).toBe(147500);
  });

  it("rolls project-resource qty from analysis lines (SUMIF replacement)", () => {
    interface ResourceRow {
      project_code: string;
      total_qty: number;
      total_amount: number;
    }
    interface AnalysisWithCode {
      boq_code: string;
      lines: Array<{
        project_resource_code?: string;
        factors: number[];
        wastage_pct: number;
        resource_rate: number;
      }>;
    }
    const resources = read<ResourceRow[]>("project_resources.json");
    const full = read<AnalysisWithCode[]>("rate_analyses.json");
    const amap = new Map(full.map((a) => [norm(a.boq_code), a]));
    const roll = rollupResourceTotals(
      working.map((w) => {
        const a = amap.get(norm(w.boq_code));
        return {
          ourQty: w.our_qty ?? 0,
          lines: (a?.lines ?? []).map((l) => ({
            factors: l.factors,
            wastagePct: l.wastage_pct ?? 0,
            resourceRate: l.resource_rate ?? 0,
            projectResourceCode: l.project_resource_code ?? null,
          })),
        };
      }),
    );
    let checked = 0;
    for (const r of resources) {
      const got = roll.get(r.project_code);
      if (!got) continue;
      expect(moneyClose(got.totalAmount, r.total_amount), r.project_code).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe("dirty graph", () => {
  it("an edit on one analysis line does not dirty other analyses", () => {
    const codes = working.map((w) => w.boq_code);
    const amap = new Map(analyses.map((a) => [norm(a.boq_code), a]));
    const counts = codes.map((c) => amap.get(norm(c))?.lines.length ?? 0);
    const g = buildProjectGraph(codes, counts);
    const dirty = g.dirtyFrom(`line:${codes[0]}:0`);
    expect(dirty.has(`analysis:${codes[0]}`)).toBe(true);
    expect(dirty.has(`item:${codes[0]}`)).toBe(true);
    expect(dirty.has("totals")).toBe(true);
    expect(dirty.has(`analysis:${codes[1]}`)).toBe(false);
    expect(dirty.has(`item:${codes[1]}`)).toBe(false);
    expect(dirty.size).toBeLessThan(20);
  });
});

describe("item quotes", () => {
  it("selected subcontract quote replaces analysis as unit cost", () => {
    const priced = computeProject({
      margin: { overheadPct: 0, profitPct: 0, logisticsPct: 0, contingencyPct: 0 },
      items: [
        {
          boqCode: "1a",
          clientQty: 2,
          ourQty: 2,
          lines: [{ factors: [1], wastagePct: 0, resourceRate: 10 }],
          quotedUnitCost: 40,
        },
      ],
    });
    expect(priced.items[0]?.unitCost).toBe(40);
    expect(priced.items[0]?.costAmount).toBe(80);
  });
});
