import { describe, expect, it } from "vitest";
import { itemKeyOf } from "./bills";
import {
  applyBuildUp,
  auditWorkspace,
  freshWorkspace,
  linkGroupToItem,
  netOf,
  postQuantities,
} from "./dimensionWorkspace";
import { emptyProject } from "./loadReference";
import { withResults } from "./projectCompute";

describe("dimension group links", () => {
  it("nets the seeded slab after its opening cutout", () => {
    const project = emptyProject("Links");
    expect(netOf(project, "grp-slab")).toBe(38);
    expect(netOf(project, "grp-opening")).toBe(2);
  });

  it("posts a link expression instead of the bill-line quantity", () => {
    const base = emptyProject("Links");
    const key = itemKeyOf(base.items.find((item) => item.boqCode === "1a")!);
    const linked = postQuantities(
      {
        ...base,
        items: base.items.map((item) => (item.boqCode === "1a" ? { ...item, qtyLink: "G:grp-slab" } : item)),
      },
      new Map([[key, 1]]),
    );
    expect(linked.items.find((item) => item.boqCode === "1a")?.ourQty).toBe(38);
  });

  it("keeps the stored quantity when the link is broken or locked", () => {
    const base = emptyProject("Links");
    const key = itemKeyOf(base.items.find((item) => item.boqCode === "1a")!);
    const broken = postQuantities(
      {
        ...base,
        items: base.items.map((item) =>
          item.boqCode === "1a" ? { ...item, ourQty: 7, qtyLink: "G:missing" } : item,
        ),
      },
      new Map([[key, 1]]),
    );
    expect(broken.items.find((item) => item.boqCode === "1a")?.ourQty).toBe(7);

    const locked = postQuantities(
      {
        ...base,
        items: base.items.map((item) =>
          item.boqCode === "1a" ? { ...item, ourQty: 5, qtyLink: "G:grp-slab", qtyLinkLocked: true } : item,
        ),
      },
      new Map([[key, 1]]),
    );
    expect(locked.items.find((item) => item.boqCode === "1a")?.ourQty).toBe(5);
  });

  it("feeds a based-on build-up through the margin kernel and follows library edits", () => {
    const base = withResults(applyBuildUp(emptyProject("Rates"), `${emptyProject("Rates").bills[0]!.id}::1a`, "rate-conc"));
    const item = base.items.find((row) => row.boqCode === "1a");
    expect(item?.basedOnId).toBe("rate-conc");
    expect(item?.lines[0]?.resourceRate).toBe(280);
    expect(item?.result?.rate).toBeGreaterThan(280);

    const edited = withResults({
      ...base,
      rateLibrary: (base.rateLibrary ?? []).map((row) =>
        row.id === "rate-conc"
          ? { ...row, lines: row.lines.map((line) => ({ ...line, resourceRate: 300 })) }
          : row,
      ),
    });
    expect(edited.items.find((row) => row.boqCode === "1a")?.lines[0]?.resourceRate).toBe(300);
  });

  it("audits unused groups, broken links, and unpriced rows", () => {
    const base = emptyProject("Audit");
    const unused = auditWorkspace(base).filter((issue) => issue.kind === "unused-group");
    expect(unused.map((issue) => issue.groupId).sort()).toEqual(["grp-opening", "grp-slab"]);

    const linked = linkGroupToItem(base, itemKeyOf(base.items.find((item) => item.boqCode === "1a")!), "grp-slab", "quantity", "Ground");
    const linkedIssues = auditWorkspace(withResults(linked));
    expect(linkedIssues.some((issue) => issue.groupId === "grp-slab" || issue.groupId === "grp-opening")).toBe(false);
    const broken = {
      ...linked,
      items: linked.items.map((item) => (item.boqCode === "1a" ? { ...item, qtyLink: "G:gone" } : item)),
    };
    const issues = auditWorkspace(withResults(broken));
    expect(issues.some((issue) => issue.kind === "broken-link")).toBe(true);
    expect(issues.some((issue) => issue.kind === "unpriced")).toBe(true);
  });

  it("round-trips workspace entities through a fresh workspace shape", () => {
    const seed = freshWorkspace();
    expect(seed.dimensionGroups).toHaveLength(2);
    expect(seed.dimensionMarks).toHaveLength(2);
    expect(seed.rateLibrary?.[0]?.code).toBe("CONC-30");
  });
});
