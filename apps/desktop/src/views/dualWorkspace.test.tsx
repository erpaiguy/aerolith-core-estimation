import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { withResults } from "../projectCompute";
import { emptyProject } from "../loadReference";
import { PrintProvider } from "../print/context";
import { DualWorkspace } from "./DualWorkspace";

describe("dual workspace", () => {
  it("renders the drawing rail, measure tools, and workbook together", () => {
    const project = withResults(emptyProject("New project"));
    const html = renderToStaticMarkup(
      createElement(PrintProvider, {
        project,
        children: createElement(DualWorkspace, {
          project,
          items: project.items,
          activity: "estimate",
          layoutMode: "split",
          selected: null,
          groupId: "grp-slab",
          billFocus: project.bills[0]?.id ?? null,
          auditOpen: true,
          phraseOpen: false,
          onAudit: () => undefined,
          onPhrase: () => undefined,
          onLayout: () => undefined,
          onActivity: () => undefined,
          onSelect: () => undefined,
          onSelectGroup: () => undefined,
          onSelectLine: () => undefined,
          selectedLineId: null,
          onProject: () => undefined,
          onPatch: () => undefined,
          onAdd: () => undefined,
          onAddSection: () => undefined,
          onRemove: () => undefined,
          onOpenRate: () => undefined,
          clientColumns: project.clientColumns,
          workingColumns: project.workingColumns,
          onAddColumn: () => undefined,
          onRemoveColumn: () => undefined,
        }),
      }),
    );
    expect(html).toContain("A-101");
    expect(html).toContain("Slab");
    expect(html).toContain("Opening");
    expect(html).toContain("Ground");
    expect(html).toContain("Area");
    expect(html).toContain("Cutout");
    expect(html).toContain("Rate phrases");
    expect(html).toContain("Type the first item here");
    expect(html).toContain("Unused group");
  });
});
