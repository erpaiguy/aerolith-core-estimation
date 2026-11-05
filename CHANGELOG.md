# Changelog

## 2.0.2

- Estima-inspired shell: dark navigation rail, white command bar, light gray canvas, orange accents (`#F97316` / `#EA580C`).
- Appearance is fixed — no light/dark theme switcher in the sidebar or Settings.
- Home shows project-file KPIs, a project card grid, and a project list table with New project / Open / Import.
- Overview KPIs for total bid, cost, margin, and completion, plus recent activity and project assembly.
- Margins opens as Finalize your estimate with commercial adjustments and a live total bid price card.
- Buy shows procurement KPIs; Reports uses a left template library and preview pane; Help center is in the sidebar.
- App version 2.0.2 so installed copies can update through `estimation-latest.json` on the existing release tag once a signed installer is published from branch `cursor/bid-craft-v2.0.2-4380`.

## 2.0.1

- App version 2.0.1 so installed copies can update from 2.0.0 through `estimation-latest.json` on the existing release tag.
- Includes the enterprise shell and the Take-off / Estimate dual workspace already on this branch.

## 2.0.0

Bid Craft keeps the same app id (`com.aerolith.core`), the same calc kernel, and the same `.aero` projects. This release makes Take-off and Estimate the primary workspace.

- Dual workspace: drawing viewer, drawings and groups rail, and the estimate workbook, with shared selection. Split, focus, and undock a second view. The browser uses a second window on the same origin.
- Dimension groups (area, length, count) with cutouts, zones, and style swatches. Quantity cells store a link expression (`G:<group>`) instead of a bare number while the link is live.
- Cell states for linked quantity and rate, drill-down, broken link, and locked quantity, each with a tooltip that names the source. Show source jumps to the highlighted dimensions.
- Drag a group onto Description or Quantity and pick the field and zone.
- Rate phrase library with Based On build-ups that still feed rate analysis and the 47.5% margin stack.
- Problems list for unused groups, broken links, and unpriced rows.
- Command palette (Ctrl+K). Source, Buy, Submit, and Masters stay in the sidebar.
- `.aero` schema 5 stores drawings, groups, marks, rate build-ups, and quantity links. Older files still open; the new tables appear on the next save.
- Desktop save keeps the previous file as `.aero.bak`. The browser keeps a local draft until you save.
- App version 2.0.0. The in-app updater still reads `estimation-latest.json` on the existing public release tag so installed copies can move to this version once a signed installer is published.

Not in this release: BIM/IFC import, AI takeoff, payments.
