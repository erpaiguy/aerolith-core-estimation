import { describe, expect, it } from "vitest";
import {
  evaluateLink,
  groupQuantity,
  groupQuantityMap,
  isDrillGroup,
  readQuantityLink,
  referencedGroupIds,
  type GroupInput,
  type MarkInput,
} from "./links.ts";

const slab: GroupInput = { id: "grp-slab", kind: "area", factor: 1, cutout: false, parentId: null };
const opening: GroupInput = {
  id: "grp-opening",
  kind: "area",
  factor: 1,
  cutout: true,
  parentId: "grp-slab",
};
const groups = [slab, opening];
const marks: MarkInput[] = [
  { groupId: "grp-slab", length: 10, width: 4, count: 1, deduct: false, overrideQty: null },
  { groupId: "grp-opening", length: 2, width: 1, count: 1, deduct: false, overrideQty: null },
];

describe("dimension group quantities", () => {
  it("subtracts a cutout group from the parent net", () => {
    expect(groupQuantity("grp-opening", groups, marks)).toBe(2);
    expect(groupQuantity("grp-slab", groups, marks)).toBe(38);
  });

  it("honours an override and a deduct mark", () => {
    const solo: GroupInput = { id: "g", kind: "length", factor: 2, cutout: false, parentId: null };
    const rows: MarkInput[] = [
      { groupId: "g", length: 5, width: null, count: 2, deduct: false, overrideQty: null },
      { groupId: "g", length: 1, width: null, count: 1, deduct: true, overrideQty: 3 },
    ];
    expect(groupQuantity("g", [solo], rows)).toBe(14);
  });

  it("treats a cycle as unresolved", () => {
    const a: GroupInput = { id: "a", kind: "count", factor: 1, cutout: true, parentId: "b" };
    const b: GroupInput = { id: "b", kind: "count", factor: 1, cutout: true, parentId: "a" };
    expect(Number.isNaN(groupQuantity("a", [a, b], []))).toBe(true);
  });
});

describe("quantity link expressions", () => {
  const qty = groupQuantityMap(groups, marks);

  it("evaluates group refs, factors, and sums", () => {
    expect(evaluateLink("G:grp-slab", qty)).toMatchObject({ ok: true, value: 38 });
    expect(evaluateLink("G:grp-slab*2", qty)).toMatchObject({ ok: true, value: 76 });
    expect(evaluateLink("G:grp-slab + G:grp-opening", qty)).toMatchObject({ ok: true, value: 40 });
    expect(evaluateLink("(G:grp-slab - 2)*1", qty)).toMatchObject({ ok: true, value: 36 });
  });

  it("names every referenced group even when one is missing", () => {
    const broken = evaluateLink("G:grp-slab+G:missing", qty);
    expect(broken.ok).toBe(false);
    expect(broken.error).toMatch(/missing/i);
    expect(referencedGroupIds("G:grp-slab+G:missing")).toEqual(["grp-slab", "missing"]);
  });

  it("rejects divide by zero", () => {
    expect(evaluateLink("G:grp-slab/0", qty).ok).toBe(false);
  });

  it("classifies linked, drill-down, broken, and locked cells", () => {
    const name = (id: string) => (id === "grp-slab" ? "Slab" : id);
    const linked = readQuantityLink({
      expression: "G:grp-opening",
      locked: false,
      quantities: qty,
      groups,
      marks,
      groupName: name,
    });
    expect(linked.state).toBe("linked");
    expect(linked.title).toMatch(/Opening|grp-opening|Net 2/);

    const drill = readQuantityLink({
      expression: "G:grp-slab",
      locked: false,
      quantities: qty,
      groups,
      marks,
      groupName: (id) => (id === "grp-slab" ? "Slab" : id),
    });
    expect(isDrillGroup("grp-slab", groups, marks)).toBe(true);
    expect(drill.state).toBe("drill");
    expect(drill.title).toMatch(/Slab/);

    const broken = readQuantityLink({
      expression: "G:gone",
      locked: false,
      quantities: qty,
      groups,
      marks,
      groupName: name,
    });
    expect(broken.state).toBe("broken");

    const locked = readQuantityLink({
      expression: "G:grp-slab",
      locked: true,
      quantities: qty,
      groups,
      marks,
      groupName: name,
    });
    expect(locked.state).toBe("locked");
    expect(locked.title).toMatch(/Locked/);
  });
});
