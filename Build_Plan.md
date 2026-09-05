# Aerolith Core Estimation — New App Build Plan (Workbook-aligned)

Handoff for the new desktop product. Complements `Architecture_Plan_Consolidated_Desktop_First.md`.

**Product stance:** new app, new UI, new stack. Not a port of Aerolith Estimation, and not a restyled copy of the Excel workbook. The workbook is the **domain and calculation source**. The architecture markdown is the **platform source** (tenancy, `.aero`, sync, RBAC, import, owner portal). This file is the **build source** — sequencing, schema deltas, UX, and where those two disagree.

---

## 0. How to read the three sources

| Source | Authority | Do not use it for |
|---|---|---|
| `Estimation Master - Complete One Project with Global Masters.xlsx` | Modules, columns, formula graph, commercial model, golden totals, Client BOQ layout (incl. Tender Adjustments) | Screens, sheet chrome, VLOOKUP, pivot tables, one-sheet-per-QTO-category as UI |
| `Architecture_Plan_Consolidated_Desktop_First.md` | Tenant → global masters → `.aero`, sync, RBAC, promotion, document import pipeline, shared renderer *idea*, license/owner split, performance layers | Excel look, Phase 0 “existing TS tests”, typed `client_link_code` as the join key, hiding Tender Adjustments if the bill already has that section |
| **This file** | What to build, in what order, with which math | — |
| Aerolith Estimation (WPF) | Nothing for this product | Any screen, workflow, or extra module not in the workbook or architecture |

Where Excel and the markdown disagree on **estimation math or modules**, follow the workbook and record the gap here. Where they disagree on **platform** (files, sync, roles), follow the markdown. Where either implies an Excel or WPF UI, follow this file.

---

## 1. Reference workbook — what it actually is

One complete project: **Interior Refurbishment for Medical Institute, Location A.** 17 sheets. This is the Phase 1 “identical totals” project named in architecture §14.

### 1.1 Sheet map → new app surfaces

Do not recreate 17 tabs. Recreate the **jobs** those sheets do.

| # | Workbook sheet | Role in the file | New app surface (not a cloned sheet) |
|---|---|---|---|
| 1 | Global Unit Master | 37 units (`UN001` …, symbol `m` / `m2` / `L/s`) | Tenant **Units** editor |
| 2 | Global Resource Category Master | 12 categories (Material … Miscellaneous, incl. Logistics, Overhead, Provisional Sum) | Tenant **Resource categories** editor |
| 3 | Global Resource Master | 534 resources: code, category, type (Civil/ID/MEP/Prelims/PS), sub-type, spec, brand, wastage %, rate | Tenant **Global resources** editor |
| 4 | Client BOQ | Issued bill: title, sections, page subtotals, grand summary. 71 qty lines. Empty rates. Section **7 Tender Adjustments** is a reserved empty block | **Source** — locked document view + import wizard |
| 5–9 | QTO-Demolition / Structure / Walls / Finishes / Joineries | One matrix per work category: location + dimensions, then **one column per BOQ item** to post qty | **Take-off** — one module, filter by work category; line → item FK, not wide columns |
| 10 | Working BOQ | Estimator’s bill: codes, WBS, client/our/quote qty, cost, project margin stack, rate, amount. **70 priced items**, 6 section headers | **Estimate** — working grid + inspector |
| 11 | Project Resource Master | Snapshot of globals used on the job: project code `PRJ-…`, project wastage/rate, `SUMIF` qty from Rate Analysis, rate from the winning comparison | **Buy / Resources** — project resource list |
| 12 | Project Resource Summary | Pivot + `GETPIVOTDATA` % of total by category / type / sub-type | **Project dashboard** charts (not a pivot object) |
| 13 | Rate Analysis | **70 blocks** (one per priced BOQ item), **197 resource lines**. Header VLOOKUPs Working BOQ; lines VLOOKUP Project Resources; `PRODUCT` of 6 qty factors + wastage | **Rate editor** opened from a working line |
| 14 | Vendor Comparison | Quotes **by BOQ item** (subcontract). 3 vendors + `MIN` selected | **Buy** — item quotes |
| 15 | Material Supplier Comparison | Quotes **by project resource**. `MIN` selected → Project Rate | **Buy** — material quotes |
| 16 | Labour Comparison | Same pattern as materials, labour resources | **Buy** — labour quotes |
| 17 | Submission Client BOQ | Same pages as Client BOQ; rates from Working `S`; section 7 filled with qty diffs; **grand total = Working grand total** | **Submit** — preview + export (shared renderer) |

There is **no vendor directory sheet**. Architecture still adds `vendor_directory` — keep it. “Vendor 1 / 2 / 3” column headers are the spreadsheet stand-in for named vendors.

There is **no enquiry register, RFI, cover letter, bar bending, cutlist, or drawing takeoff** in this workbook. Do not pull those in from Aerolith Estimation.

### 1.2 Commercial model (this is the calc kernel)

Read this before writing schema. Architecture §4 and §9 simplified it; several simplifications are wrong relative to the file.

**Quantities (Working BOQ columns J, L, M, N)**

| Field | In the file | Rule |
|---|---|---|
| Client qty | Issued qty | Never overwritten by take-off |
| Our qty | From the QTO sheet total cell for that item (`'QTO-Structure'!T25`, etc.) | Sum of take-off lines posted to that item |
| Qty diff | `Our − Client` | 7 lines in this project are non-zero |
| Quote qty | Equals Our qty (`N = L`) | This is the qty that **scales Rate Analysis** (resource totals) |

**Cost (Rate Analysis → Working `O` / `P`)**

- Each priced Working line has one analysis **block**.
- Resource line quantity = `PRODUCT(Nos, Nos, Qty1, Qty2, Qty3, Qty4)` then wastage % from Project Resource Master, then `Item qty = qty + wastage qty`.
- `Total qty` on the line = item qty × Working quote qty (the BOQ qty in the block header).
- Line amount = item qty × resource rate (project rate).
- **Item total cost** (block footer) ÷ quote qty = **unit cost** on Working (`O`). `Cost amount P = O × N`.
- Rate Analysis is **cost only**. It does not apply overhead or profit.

**Margin (Working `Q4:Q8` — project-level, not per line)**

| Factor | Cell | Value in this project |
|---|---|---|
| Overhead | Q4 | 10% |
| Profit | Q5 | 30% |
| Logistics | Q6 | 2.5% |
| Contingency | Q7 | 5% |
| **Total margin** | Q8 = SUM(Q4:Q7) | **47.5%** |

Per priced line: `Margin unit Q = Cost unit O × total margin %`. `Rate S = O + Q` (i.e. cost × 1.475). `Amount T = S × Quote qty`.

This is the waterfall architecture §12 already named. It must live as **four project percentages**, not as `working_boq_items.margin_pct` alone, and **not** as OH/profit inside Rate Analysis.

**Submission (sheet 17)**

1. Page layout, numbering, section titles, page subtotals, grand summary = Client BOQ (architecture §9 steps 1 and 6 are right).
2. Each original line: **Client qty × Working rate** (not Our qty).
3. Section **7 Tender Adjustments**: one output line per Working row whose qty diff ≠ 0; qty = diff (can be negative); rate = same Working rate; amount = diff × rate. Client BOQ already reserved this empty section (rows a–g).
4. Grand total **100,826,297.13** = Working `T94` = Client-qty amounts + adjustments.

Architecture §9.3 says tag `adjustment_type` and **never show it**. The workbook **shows** adjustments as a billed section the client already printed as “7 - Tender Adjustments”. Follow the workbook: when the project qty policy is “client bill + annex”, render that section. Do not add an “Adjustment type” column on every line.

**Preliminaries and provisional sums** are ordinary Client/Working sections (1 and 6), mostly `L/s` items with a one-line analysis. They are **not** separate registers.

### 1.3 Golden totals (Phase 0 / 1 fixtures)

Exact stored values from the file (IEEE floats). Tests should compare **rounded to 2 decimal places** (money) unless using integer minor units throughout.

| Metric | Excel stored value | 2 dp |
|---|---|---|
| Total margin % | 0.475 | 47.50% |
| Working cost amount (P94) | 68356811.614583328 | 68,356,811.61 |
| Working margin amount (R94) | 32469485.516927078 | 32,469,485.52 |
| Working / Submission grand total | 100826297.13151044 | **100,826,297.13** |
| Submission Tender Adjustments | 12284222.500434028 | 12,284,222.50 |
| Priced Working items / analysis blocks | 70 | |
| Rate Analysis resource lines | 197 | |
| Project resources | 64 | |
| Qty-diff lines (adjustments) | 7 | |
| Global resources | 534 | |
| Units | 37 | |

The engine must beat Excel’s float noise: store money as integer minor units; quantities 4 decimal places. Fixture tests: 2 dp equality to the table above.

### 1.4 Formula graph the app replaces (architecture §3, now counted)

| Excel pattern | Count (order of) | App equivalent |
|---|---|---|
| `VLOOKUP` Rate Analysis ↔ Working / Project Resources | ~1,000+ | FK: analysis belongs to working item; resource line → project resource |
| `VLOOKUP` on comparison sheets | ~140 | FK to working item or project resource |
| `SUMIF` Project Resource qty from Rate Analysis `Q` | 63 | `SUM(boq_item_resources.total_qty)` grouped by resource |
| `MIN` of three vendor rates | 48 | `is_selected` on quotes; default “lowest” with manual override |
| `GETPIVOTDATA` % of total | Summary sheet | `GROUP BY` category / type / sub-type |
| `PRODUCT` of dim factors (QTO + analysis) | QTO + 197 analysis lines | Named qty formulas, not grid geometry |
| Cross-sheet `'QTO-*'!T25` into Working Our qty | per measured item | `SUM(qto_lines.qty) WHERE working_boq_item_id = ?` |
| `'Working BOQ'!S12` into Submission rate | every billed line | Renderer reads working rate by FK |
| Wide QTO columns T…AK as BOQ items | 5 sheets | Column → `working_boq_item_id` on the take-off line |

---

## 2. What we keep from the architecture plan

Unchanged: desktop-first Tauri + React; cloud for license/sync (no browser UI yet); tenant global masters; `.aero` SQLite snapshot; Client BOQ lock; shared renderer *engine*; promotion policy; custom RBAC; license grace → read-only; owner `platform_db` isolation; Glide Data Grid + windowed queries + dirty-graph calc; Drizzle logical schema for SQLite + Postgres.

---

## 3. Improvements — architecture markdown vs the workbook

Ranked by cost of getting them wrong. This list **replaces** the previous WPF-heavy improvement list.

### 3.1 Blockers before Phase 1 code

1. **There is no TypeScript calc engine and no “51 existing tests.”** Phase 0 builds a new kernel. Golden fixtures come from **this xlsx** (section 1.3), not from Aerolith Estimation.

2. **Drop “grid styled like Excel” as the v1 theme.** The file is a workbook; the product is not. Fast keyboard grids yes; 17 tabs, print titles, and VLOOKUP cells no.

3. **Money and rounding are missing.** The file stores 100826297.13151044. The app stores integer minor units and rounds money to 2 dp. Otherwise “identical totals” is undefined.

4. **Margin is four project percentages, not `working_boq_items.margin_pct` and not analysis OH/profit.** Schema must have `projects.overhead_pct`, `profit_pct`, `logistics_pct`, `contingency_pct` (names can match the file). Line margin is derived. Rate Analysis stays cost-only. Architecture §12 waterfall is this model; §4 schema does not match it.

5. **Submission qty policy in this project is “Client qty on the bill + Tender Adjustments annex,” with rates costed on Our/Quote qty.** Architecture only lists `client_qty` | `qto_qty` | `manual` and hides adjustments. Add `client_plus_adjustments` as a first-class `qty_source_default`. The reference file uses it. Rendering section 7 is required for that policy, not an internal tag.

6. **Mapping/review UI belongs with the first Excel import** (architecture §7), including this workbook as a test import. Do not wait for Phase 3.

7. **100k-row behaviour is a Phase 1 design constraint.** Windowed queries, virtualized grids, dirty-node calc now. Last phase = load test only.

8. **SQLite and Postgres are not one SQL file.** Shared logical schema, two SQL artefacts.

### 3.2 Schema the markdown dropped from the workbook

9. **Working BOQ WBS is wider than `category` + `work_category`.** File columns: BOQ Category, Work Category, Sub Work Category, Group 1, Group 2, Group 3. Keep all six as optional classification fields (used for filters and the resource summary). Do not invent a new WBS product; store what the file uses.

10. **Working BOQ is a tree.** Section rows (`1 Preliminaries`) plus item rows (`1a`). Client BOQ has `parent_id` in the markdown; Working BOQ in §4 is flat. Add `parent_id`, `node_kind` (`section` | `item`), `sort_order`.

11. **Join with stable IDs.** In the file the join key is Working `BOQ Code` (`1a`) ↔ Client sl.no `a` under section `1` ↔ Rate Analysis block header ↔ Submission. Generate UUIDs; persist a display `boq_code` (`1a`) for humans and for matching an imported Client numbering style. Users should not type a secret `client_link_code`.

12. **Three quote tables, not one.**  
    - Material / Labour comparison → `resource_quotes(project_resource_id, vendor_id, …)` (architecture already has this).  
    - Vendor comparison → **`item_quotes(working_boq_item_id, vendor_id, …)`** for subcontract lumps. Architecture missed this. The file’s Project Rate for some rows comes from Vendor Comparison `L`, not from a resource.

13. **Rate Analysis needs a header + dimensional lines.** `rate_analyses` (working item, analysis qty/unit) and `boq_item_resources` with six factor slots (or `dims_json`) + wastage + `PRODUCT` rule. A single `qty` column cannot reproduce `PRODUCT(D:I)`.

14. **QTO is not `dims_json` plus a mystery formula.** File factors: drawing, location description, item, sub-item, room L/B/H, take-off Nos/Nos/L/B/H/T, then derived Qty / Area / Volume / Perimeter / Surface, posted into **one** BOQ item. Store `work_category`, `formula_key` (e.g. `product`, `area`, `volume`, `perimeter_x_h`), `dims_json`, `working_boq_item_id`. One Take-off module; work category is a filter, not five screens.

15. **Project resource snapshot columns the markdown shortened.** File: global code, project code `PRJ-…`, category, type, sub-type, spec, brand, global wastage/rate, **project** wastage/rate, total qty, total amount. Project rate is either typed, copied from global, or **pushed from the selected quote**. Track `rate_overridden` and `rate_source` (`global` | `quote` | `manual`).

16. **Client BOQ layout is richer than a line table.** Title, section headers, `(Contd.)` page starts, page subtotals, section subtotals, Grand Summary listing sections 1–7. `layout_metadata_json` must cover those node kinds or the shared renderer cannot match sheet 17.

17. **Soft-archive masters from schema v1.** `archived_at` on units/categories/resources/vendors.

18. **Defer hash-chain audit.** Actor + diff + timestamp is enough.

19. **`.aero` is a document:** recents, crash-safe write, migration progress. Default folder: Documents / Aerolith / Projects.

20. **Global snapshot refresh:** never auto-change a project rate the user (or a selected quote) set; prompt for untouched snapshot rows.

### 3.3 UX — workbook jobs, not workbook chrome

21. **Project workspace:** activity rail **Source · Take-off · Estimate · Buy · Submit**, centre grid, right inspector. Not a ribbon of 17 sheets.

22. **Home is a work queue:** recent `.aero` files, unpriced lines, license/sync. Pipeline KPIs secondary.

23. **Three visual languages:** Source (locked document), Working (exceptions: unpriced, qty diff, missing analysis), Submit (client-looking preview).

24. **Rate Analysis is an editor**, not an 894-row block sheet. Open from the working line; live unit cost; apply back.

25. **Take-off is a table + formula picker**, not a matrix with BOQ items as columns. Posting to an item is a searchable field (architecture §3 “+ Create new” pattern applies here too).

26. **Buy is one place with three boards** (items / materials / labour), not three Excel sheets. Same interaction: named vendors, rates, select lowest or override.

27. **Keyboard, range paste, undo** on grids. Command palette. Density control. Status bar: unpriced count, margin %, sync, license.

28. **Import wizard** for Client BOQ (and later QTO/resources). This xlsx’s Client BOQ sheet is the first mapping fixture (Sl. No. / Description / Qty / Unit / Rate / Amount + section rows).

29. **Dashboard replaces the pivot:** cost by resource category / type / sub-type; margin stack (the four % → amounts); quote coverage.

### 3.4 Do not add from Aerolith Estimation

These appeared in the previous plan because the WPF app has them. They are **not** in the workbook or the architecture. Out of this roadmap:

- Enquiry register and 12-step procedure strip
- RFI / qualifications / cover letter
- Separate Prelims / PS **registers** (they are BOQ sections here)
- Link modes (excluded / rate-only / included-in) — this file is always qty × rate; negatives live in Tender Adjustments
- Rate-analysis-level OH/profit (would double-wrap the 47.5% stack)
- Bar bending, cutlist, kits, drawing-canvas takeoff
- Any WPF screen or Excel skin

Revisions/seal after submit: **not** in the xlsx, but still add a light seal in the Submit phase so a priced export is frozen. Not a WPF clone.

---

## 4. Schema deltas (relative to architecture §4)

```
# Project commercial (from Working Q4:Q8)
projects.qty_source_default  -- 'client_qty' | 'qto_qty' | 'client_plus_adjustments'
projects.overhead_pct, profit_pct, logistics_pct, contingency_pct
-- derived total_margin_pct = sum of the four

# Money / qty
rates and amounts: INTEGER minor units
qty: NUMERIC, app-enforced 4 dp

# Client BOQ layout nodes (not only items)
client_boq_nodes(id, project_id, parent_id, kind, -- title|section|item|page_break|subtotal|summary_row
  sl_no, description, qty, unit_id, sort_order, page_ref, locked_at)

# Working tree
working_boq_items(id, project_id, parent_id, node_kind, -- section|item
  boq_code, client_boq_node_id, sl_no,
  boq_category, work_category, sub_work_category, group1, group2, group3,
  description, client_qty, our_qty, quote_qty, unit_id,
  cost_rate, rate,  -- amounts derived
  sort_order)

# Take-off
qto_lines(id, project_id, work_category, drawing, location_desc,
  item_label, sub_item, formula_key, dims_json,
  working_boq_item_id, qty)

# Rate analysis
rate_analyses(id, project_id, working_boq_item_id, analysis_qty, analysis_unit_id)
boq_item_resources(id, rate_analysis_id, project_resource_id,
  factors_json,  -- six PRODUCT slots as in the file
  qty, wastage_pct, wastage_qty, item_qty, resource_rate, amount, total_qty)

# Project resources
project_resources(..., global_resource_id, project_code,
  type, sub_type, specification, brand,
  global_wastage_pct, global_rate, project_wastage_pct, project_rate,
  rate_source, -- global|quote|manual
  rate_overridden, source_synced_at, total_qty, total_amount)

# Quotes
resource_quotes(id, project_resource_id, vendor_id, rate, quote_qty, is_selected)
item_quotes(id, working_boq_item_id, vendor_id, rate, quote_qty, is_selected)
vendor_directory(...)  -- tenant master; not in the xlsx, required so quotes are not "Vendor 1"

# Submission
submission_boq_items(..., source_kind, -- 'client_line' | 'tender_adjustment'
  qty_source, effective_qty, final_rate, amount)
-- tender_adjustment rows generated from qty diff when policy is client_plus_adjustments

# Masters
archived_at on units, resource_categories, global_resources, vendors

# Audit v1
audit_log without hash chain
```

Original import files: store beside the `.aero` (or blob sidecar), not only as giant JSON.

---

## 5. Product principles (UI)

1. The grid is a tool, not the product.
2. Never make the user reconstruct VLOOKUP / SUMIF / MIN / GETPIVOTDATA.
3. Show **one** Quote qty on Working, with a badge for source (Our / Client / Manual).
4. Source data is sacred after lock. Working is judgement. Submit is what the client sees.
5. Offline default: keystroke → SQLite. Network is a badge.
6. Calm, high contrast, comfortable/compact density.

---

## 6. Tech stack

| Layer | Choice |
|---|---|
| Desktop | Tauri 2 + React + TypeScript |
| UI | Design system from day one. **Not** an Excel skin |
| Grids | Glide Data Grid |
| Local | SQLite inside `.aero` |
| Calc | New TS kernel + dirty graph; heavy work off the UI thread |
| Cloud | NestJS + Postgres + Drizzle (shared logical schema) |
| Auth | Argon2id; JWT online; cached session offline |
| Charts | Recharts on the dashboard only |
| Tests | Vitest + golden JSON extracted from this xlsx |

Owner Portal v1: same installer, separate login; `platform_db` stays physically separate.

---

## 7. Decisions

### Closed by the workbook (do not reopen without a product reason)

| # | Decision | Locked value |
|---|---|---|
| A | Qty policy | Support all three. **This reference project = `client_plus_adjustments`** (Client qty on original lines, diffs in section 7, analyses scaled by Our/Quote qty) |
| B | Margin | Four project % (OH, profit, logistics, contingency), applied to unit cost. Rate Analysis cost-only |
| C | Currency | Single currency per tenant (file has no FX) |
| G | Prelims / PS | BOQ sections, not separate modules |
| I | Comparisons | Item quotes + resource quotes (materials and labour share one table, filtered by category) |
| J | QTO UI | One module, many work categories, formula keys — not five cloned sheets |

### Still open (policy)

| # | Decision | Needed by | Recommendation |
|---|---|---|---|
| D | Offline license grace | Phase 6 | Configurable; 14 days default |
| E | Default `.aero` folder | Phase 1 | Documents / Aerolith / Projects + Recents |
| F | Starter units/categories | Phase 1 | Optional pack cloned from this file’s Unit + Category sheets (schema only, user-editable) |
| H | Sync conflict UI | Phase 6 | Inspector queue, not one modal per row |
| K | Money rounding vs Excel float | Phase 0 | Minor units + 2 dp; fixtures allow 0.01 |

---

## 8. Build roadmap (replaces architecture §14)

Exit criteria use **this workbook**. UI is new throughout.

| Phase | Name | Scope | Exit criterion |
|---|---|---|---|
| **0** | Calc kernel | Qty resolution, `PRODUCT` + wastage, analysis compose, four-factor margin, submission amounts (client lines + generated adjustments), dirty graph. Fixtures from this xlsx | 2 dp match to section 1.3; one edit dirties only dependents |
| **1** | Desktop foundation | Tauri, design system, `.aero`, migrations, windowed grids. Project-scoped Units / Categories / Resources / Vendors. Working BOQ tree, QTO lines, Rate editor, resource list. Import **this xlsx** via mapping wizard (start with Working + masters if Client lock comes in Phase 2) | Open the reference `.aero`; Working grand total = 100,826,297.13 |
| **2** | Source + policy | Locked Client BOQ layout nodes, generated IDs + `boq_code`, qty badges, `client_plus_adjustments` | Client qty immutable; Our qty from QTO sum; 7 adjustment lines appear only on Submit |
| **3** | Document import | PDF text-layer / Word; same wizard; layout metadata (sections, page breaks, summary). OCR last, always draft | A scanned BOQ cannot commit without review |
| **4** | Submit | Shared renderer matching Client pages; section 7 when policy requires; dashboard instead of pivot; light seal + new revision | Submission grand total matches Working; internal ids absent; Client layout preserved |
| **5** | Tenant + RBAC | Cloud users, custom roles, promotion, global snapshot + refresh prompt | Custom role gates a module; promote follows policy |
| **6** | Sync + license | Row sync; hard conflict on cost, rates, quotes, QTO qty, margin %; grace → read-only | Two machines, no silent money overwrite |
| **7** | Owner surface | Tenants, seats/keys, audited impersonation visible to the tenant | Tenant sees vendor access in their log |
| **8** | Scale | 100k load test, indexes, graph profile | Cell edit stays perceptibly instant |

Deferred: tenant web app, Owner CRM/MRR (architecture Appendix A).

Not in this roadmap: WPF modules listed in §3.4, Excel theme, five QTO windows.

---

## 9. Suggested repo layout (after Phase 0 fixtures exist)

```
apps/desktop/          Tauri + React
packages/calc/         Kernel + golden fixtures from the xlsx
packages/schema/       Drizzle logical schema, two SQL dialects
packages/shared/       Decimal policy, qty-source, formula keys
apps/api/              NestJS from Phase 5
fixtures/reference/    JSON extracted from the xlsx (no UI)
```

`.aero` = SQLite + `PRAGMA user_version`. Refuse writes until migrations finish.

---

## 10. Document authority (conflict rules)

| Topic | Winner |
|---|---|
| Commercial math, modules, golden totals, Tender Adjustments as a visible section | Workbook |
| Tenancy, `.aero`, sync, RBAC, import pipeline stages, owner/platform split | Architecture markdown |
| UI, IA, sequencing, IDs vs VLOOKUP, mapping wizard timing, performance-in-foundation | **This file** |
| Aerolith Estimation screens or extra modules | **Neither** — out of scope |
