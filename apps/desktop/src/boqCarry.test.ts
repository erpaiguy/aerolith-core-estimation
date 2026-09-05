import { describe, expect, it } from "vitest";
import { formatRate, moneyClose } from "@aerolith/shared";
import { GOLDEN_TOTAL } from "./model";
import { loadReferenceProject } from "./loadReference";
import { itemKeyOf, projectGrand } from "./bills";
import { formatWorkingAmount, formatWorkingCost, formatWorkingRate } from "./boqCarry";
import { costCategoryTree, withResults } from "./projectCompute";
import { amountOf, buildDocument, documentLines, APP_DEFAULT_REPORT_FORMAT, reportCell } from "./reportFormat";

describe("rate analysis carry onto Working and Submission BOQ", () => {
  it("formats Working BOQ cost with the same currency grouping as rate", () => {
    expect(formatWorkingCost({ priceMode: "direct", directCost: 220000 }, "QAR")).toBe("QAR 220,000.00");
    expect(formatWorkingCost({ priceMode: "direct", directCost: 850.0174999999999 }, "QAR")).toBe("QAR 850.02");
    const project = withResults(loadReferenceProject());
    const item = project.items.find((i) => i.kind === "item" && (i.result?.unitCost ?? 0) > 0);
    expect(item).toBeTruthy();
    expect(formatWorkingCost(item!, project.currency)).toBe(
      formatRate(item!.result?.unitCost ?? item!.directCost ?? 0, project.currency),
    );
  });

  it("leaves the GREEN sample on Normal carry", () => {
    const project = withResults(loadReferenceProject());
    expect(project.items.every((i) => i.kind !== "item" || !i.carryMode || i.carryMode === "normal")).toBe(true);
    expect(moneyClose(projectGrand(project.items), GOLDEN_TOTAL)).toBe(true);
    expect(moneyClose(amountOf(documentLines(buildDocument(project), APP_DEFAULT_REPORT_FORMAT)), GOLDEN_TOTAL)).toBe(
      true,
    );
  });

  it("Rate only keeps the unit rate, zeros billed amount, and drops the item from resource summary", () => {
    const base = withResults(loadReferenceProject());
    const target = base.items.find((i) => i.kind === "item" && (i.result?.amount ?? 0) > 0 && i.lines.length > 0);
    expect(target).toBeTruthy();
    const billed = target!.result!.amount;
    const beforeTree = costCategoryTree(base).reduce((s, n) => s + n.amount, 0);

    const priced = withResults({
      ...base,
      items: base.items.map((i) => (itemKeyOf(i) === itemKeyOf(target!) ? { ...i, carryMode: "rateOnly" as const } : i)),
    });
    const item = priced.items.find((i) => itemKeyOf(i) === itemKeyOf(target!))!;
    expect(item.result?.rate).toBe(target!.result!.rate);
    expect(item.result?.amount).toBe(0);
    expect(formatWorkingAmount(item, priced.currency)).toBe("Rate Only");
    expect(formatWorkingRate(item, priced.currency)).toBe(formatWorkingRate({ ...item, carryMode: "normal" }, priced.currency));
    expect(moneyClose(projectGrand(priced.items), GOLDEN_TOTAL - billed)).toBe(true);

    const line = buildDocument(priced).lines.find((l) => l.kind === "item" && l.sl === item.slNo);
    expect(line?.amountLabel).toBe("Rate Only");
    expect(line?.amount).toBe(0);
    expect(line?.rate).toBe(item.result?.rate);
    expect(reportCell(line!, "amount", APP_DEFAULT_REPORT_FORMAT, priced.currency)).toBe("Rate Only");

    const afterTree = costCategoryTree(priced).reduce((s, n) => s + n.amount, 0);
    expect(afterTree).toBeLessThan(beforeTree);
  });

  it("Amount only bills the analysis total, labels the rate, and still contributes resources", () => {
    const base = withResults(loadReferenceProject());
    const target = base.items.find((i) => i.kind === "item" && (i.result?.amount ?? 0) > 0 && i.lines.length > 0);
    expect(target).toBeTruthy();
    const beforeTree = costCategoryTree(base).reduce((s, n) => s + n.amount, 0);

    const priced = withResults({
      ...base,
      items: base.items.map((i) => (itemKeyOf(i) === itemKeyOf(target!) ? { ...i, carryMode: "amountOnly" as const } : i)),
    });
    const item = priced.items.find((i) => itemKeyOf(i) === itemKeyOf(target!))!;
    expect(item.result?.amount).toBe(target!.result!.amount);
    expect(formatWorkingRate(item, priced.currency)).toBe("Amount Only");
    expect(formatWorkingAmount(item, priced.currency)).not.toBe("Rate Only");
    expect(moneyClose(projectGrand(priced.items), GOLDEN_TOTAL)).toBe(true);

    const line = buildDocument(priced).lines.find((l) => l.kind === "item" && l.sl === item.slNo);
    expect(line?.rateLabel).toBe("Amount Only");
    expect(line?.amount).toBe(item.result?.amount);
    expect(line?.amountLabel ?? null).toBeFalsy();
    expect(reportCell(line!, "rate", APP_DEFAULT_REPORT_FORMAT, priced.currency)).toBe("Amount Only");

    const afterTree = costCategoryTree(priced).reduce((s, n) => s + n.amount, 0);
    expect(moneyClose(afterTree, beforeTree)).toBe(true);
  });
});
