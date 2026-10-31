# Bid Craft 2.0 enterprise UI

Date: 2026-10-31. Status: approved. Branch: `cursor/bid-craft-v2.0-4380`. Version stays `2.0.0`. This document is the implementation contract for the enterprise shell. It does not change the calc kernel, `.aero` schema, license, or updater.

## Approach

Design tokens and primitives first, then the shell, then each module’s chrome. Take-off and Estimate stay the dense dual workspace already on this branch. Home, Source, Buy, Submit, Masters, and Reports use spacious enterprise chrome.

## Product constraints

- UI name Bid Craft. App id `com.aerolith.core`. Currency default QAR.
- Modules that remain reachable: Source, Take-off, Estimate, Buy, Submit, Masters, plus Rate Analysis, Margins, Client Queries, and the in-job summary.
- Margin stack, quantity policy, and `.aero` persistence are unchanged.
- No ribbon, no copied third-party estimating branding, no new paid UI kit, no new chart library.
- Deadline is not a project field. Cards say “No deadline” unless the job is sealed, in which case they show the sealed timestamp. Owner is the signed-in user. Value is the working total only for the job that is open; saved recents say “Open to total”.

## Shell

Left rail, collapsible:

1. Home
2. Source
3. Take-off
4. Estimate
5. Buy
6. Submit
7. Masters
8. Reports
9. Settings

A “More” group keeps Rate Analysis, Margins, Client Queries, Job summary, and Resource master. Those are not removed.

Top bar, on Home and inside a job:

- Project switcher: the open job, then recent `.aero` paths.
- Command button (Ctrl+K / ⌘K) opening the existing command palette.
- Notifications: when a job is open, the unused-group, broken-link, and unpriced audit; otherwise an empty state.
- User and license line, with Sign out.

Home in the rail returns to the portfolio and keeps the open job in memory so its card can reopen it. Close still drops the job and returns to the portfolio.

## Density

Spacious pages use 24px page padding, 12px radius, and large cards. Take-off and Estimate sit in `.pane-dense`, which tightens padding and keeps the drawing rail, measure strip, and workbook grid.

## Tokens

Defined on `:root` and inherited by the dark theme through the existing color variables:

- Space: 4, 8, 16, 24, 32, 48.
- Type: 11, 13, 15, 20, 28.
- Radius: 6 (dense), 12 (cards), 18 (pills).
- Elevation: hairline shadow and the existing overlay shadow.
- Semantic status: draft, sealed, sample, locked, warn.
- Aliases `--ui-pad`, `--ui-radius`, `--ui-card-pad`, overridden under `.pane-dense`.

## Primitives

- `CommandBar`: the top bar described above.
- `FilterBar`: search field plus chips.
- `DataCard`: title, status pill, three meta lines, open action.
- `ChartFrame`: horizontal bars from `{ label, value }`. No axes library.
- `StatusPill`: draft, sealed, sample, locked, saved.
- `EmptyState`: title plus one action.
- Existing `DataTable` and `MenuSelect` stay. New surfaces use the tokens above.

## Modules

### Home

KPI strip: jobs listed, open-job value, unpriced rows on the open job, whether the open job is sealed.

Filter chips: All, Current, Samples. Search matches card titles.

Cards: the open job, recent files, the single-BOQ sample, the campus sample, New project, Open `.aero`, Import, and Restore draft when a draft exists. Opening a card enters Source for a new import, Take-off for the open job and samples, or the native open path for a recent file.

### Source

Spacious header, locked/unlocked pill, search that filters bill cards, one card per bill (name, issued ref, status). The existing client-BOQ preview and Amend action stay under the register. Import remains the existing wizard.

### Take-off and Estimate

Unchanged dual workspace, wrapped as dense. Show Source, groups, measure strip, live links, and the problems list stay.

### Buy and Submit

Spacious header. Buy shows a two-bar chart of resources with a selected quote versus resources without one. Submit shows priced rows versus unpriced rows. The existing comparison grids, Award lowest, and submission sheet stay under the chart.

### Masters

Four cards: Units, Categories, Vendors, Resources, with counts. Search filters those cards. Choosing a card selects that master tab. The existing editors are the detail under the cards, including rate libraries already in the project.

### Reports

Suite cards: Working summary, Cost by category, Submission, plus any saved report templates by name.

Choosing a suite shows a `ChartFrame` preview (margin steps, category totals, or priced versus unpriced). Columns for that suite are listed beside the chart. “Edit letterhead” opens Settings, where the existing report format lives.

Export: Print PDF uses the existing print path. Spreadsheet uses a one-sheet `.xlsx` built the same way as the resource-master workbook (spreadsheet XML packed with the existing zip dependency). Submission can also download the existing CSV.

## Out of scope

BIM, AI takeoff, payments, a new deadline column, merging to `main`, and running Publish Estimation release.
