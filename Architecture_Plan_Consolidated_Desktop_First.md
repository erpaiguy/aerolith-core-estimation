# Estimation ERP — Consolidated Architecture Plan (Desktop-First)
*For handoff to Cursor. Supersedes v1 and v2 — this is the single reference document.*

---

## 0. Scope for this build

**Primary target: Desktop app only.** Web client is explicitly out of scope until desktop is built, tested, and deployed successfully — see Appendix A. This does **not** mean skip the backend: license validation and multi-user tenant sync still require a cloud service from early on. What's deferred is the browser UI, not the server.

---

## 1. Tenancy & masters model

```
Tenant (company account)
 ├─ Owner/Admin, Estimator, Viewer, and custom roles (tenant-defined)
 ├─ Global Masters (tenant-scoped): Units, Resource Categories, Global Resources, Vendor Directory
 └─ Projects[]
     └─ Local file: <project_name>.aero (SQLite)
          — contains project data + a snapshot of the global masters it uses
```

- **Global Masters**: edited under tenant configuration, tenant-editable per their own setup — not app-hardcoded content, just app-defined schema.
- **Project Masters**: project-scoped instances/overrides — Project Resources, QTO, Working BOQ, Rate Analysis, Comparisons, Submission BOQ.
- A project's `.aero` file snapshots the global masters it depends on at creation time (`source_global_resource_id`, `synced_at` tracked per row), so the file stays fully functional offline without a live connection to tenant data.

---

## 2. File format — `.aero`

- SQLite database, custom `.aero` extension, `PRAGMA user_version` = schema version.
- Contains: full project schema (Section 4) + global-master snapshot + `_meta` (`tenant_id`, `project_id`, `app_version`, `last_synced_at`).
- Not encrypted in v1 — a custom extension with no public schema documentation is sufficient for "casual users can't open it" at this stage. Revisit SQLCipher only if a specific tenant raises it as a real requirement, not preemptively.
- Migrations: versioned SQL scripts bundled with the app; on open, if `user_version` is behind, run pending migrations before allowing writes. Same migration set targets cloud Postgres later.

---

## 3. Replacing spreadsheet lookups with app-native selection

| Excel pattern | App equivalent |
|---|---|
| `VLOOKUP` | Foreign key + searchable dropdown bound to the target table; stores `id`, never row position |
| `SUMIF` | Real aggregate query (`GROUP BY`/`SUM`), recalculated via the dependency graph (Section 12), not on save |
| Vendor columns + `MIN()` | `resource_quotes` table, one row per quote; "auto-select lowest" or manual override sets `is_selected` |
| GETPIVOTDATA summary | A `GROUP BY` query/view, no pivot object |
| New resource mid-entry | Inline "+ Create new" inside the dropdown → quick-create modal → writes to Project Resources first, promotion to Global handled per Section 6 |

---

## 4. Core schema

```
tenants(id, name, license_tier, ...)
users(id, tenant_id, name, auth_hash, ...)

roles(id, tenant_id, name, is_system_default)
permissions(id, module, action)                 -- app-defined, not tenant-editable
role_permissions(role_id, permission_id, allow)
user_roles(user_id, role_id)
approval_rules(id, tenant_id, action_type, required_permission_id)

units(id, tenant_id, code, description, symbol)
resource_categories(id, tenant_id, code, description)
global_resources(id, tenant_id, code, category_id, type, sub_type, description,
                  unit_id, specification, brand, wastage_pct, rate)
vendor_directory(id, tenant_id, name, contact, category)

projects(id, tenant_id, name, client_name, location, status, created_by,
         schema_version, last_synced_at)

client_boq_items(id, project_id, client_link_code, parent_id, sl_no, description,
                  qty, unit_id, rate, amount, locked_at)   -- read-only after lock
working_boq_items(id, project_id, boq_code, client_link_code, category, work_category,
                   description, client_qty, our_qty, quote_qty, cost, margin_pct,
                   rate, amount)
qto_lines(id, project_id, work_category, drawing, description, item, sub_item,
          dims_json, qty, formula_note)

project_resources(id, project_id, global_resource_id, project_code, wastage_pct,
                   project_rate, total_qty, total_amount, source_synced_at)
boq_item_resources(id, working_boq_item_id, project_resource_id, qty, wastage_qty,
                    item_qty, resource_rate, amount)      -- replaces Rate Analysis blocks
resource_quotes(id, project_resource_id, vendor_id, rate, quote_qty, is_selected)

promotion_requests(id, project_resource_id, requested_by, status, approved_by, ts)

submission_boq_items(id, project_id, client_boq_item_id, adjustment_type,
                      -- 'unchanged' | 'addition' | 'omission' | 'new'
                      qty_source, -- 'client_qty' | 'qto_qty' | 'manual', default from project setting
                      manual_qty, effective_qty, final_rate, amount)

document_imports(id, project_id, source_type, original_file_ref, extracted_json,
                  layout_metadata_json, review_status, reviewed_by, locked_at)

audit_log(id, project_id, table_name, row_id, action, diff_json, user_id,
          hash_prev, hash, ts)

platform_db.tenants / subscriptions / invoices / license_keys / leads / support_sessions
  -- separate schema, owner-portal only, never joined against tenant data
```

**Submission qty source**: default set once per project (a single setting, e.g. "quote as QTO qty"), applied to all lines; user overrides per-line where needed. Don't force a per-line prompt on every row.

---

## 5. Sync (needed now, even without a web client)

- Local writes commit to SQLite immediately — offline-first, no network round trip on keystrokes.
- Background worker batches row-level changes (`updated_at`, `updated_by`) and pushes to the tenant's cloud Postgres when online.
- Last-write-wins by default; **hard conflict prompt** on `working_boq_items.rate` and `submission_boq_items` specifically — those are the two places a silent overwrite costs real money.
- Same sync layer later powers the web client — building it now instead of at "phase 7" avoids redoing this work twice.

---

## 6. RBAC & promotion policy

- Tenant Admin creates/edits/deletes roles and assigns permissions per module/action (view, create, edit, delete, approve, promote, import, export).
- Tenant Admin has full rights over their tenant's data and process configuration — not over the app's core schema/calculation logic, which stays app-controlled.
- `promotion_policy` per tenant: `auto` | `approval_required` | `disabled`. New resources always land in Project Resources first; promotion to Global follows the tenant's chosen policy, logged either way.
- Approval authority is permission-based, not role-hardcoded — any role holding the relevant permission can approve.

---

## 7. Client BOQ import pipeline

```
Upload (PDF text-layer / PDF scanned / Excel / Word / Image)
   → format detector → text extraction OR OCR
   → row/column mapping review UI (mandatory, every format)
   → user confirms → Client BOQ locked, versioned, immutable
```

- OCR output is always a draft requiring human confirmation — never auto-committed, regardless of confidence score.
- Locked record stores: original file, extracted line items, and layout metadata (section breaks, numbering style, column structure) — reused by the Submission BOQ renderer (Section 9).
- No edit permission exists for Client BOQ post-lock, by schema design, not convention.

---

## 8. Client BOQ ↔ Working BOQ linkage

- User assigns a custom sequential code per Client BOQ line at review time.
- Working BOQ items carry the same `client_link_code`; one client line can map to several working items (QTO splits a line into sub-components).
- Code is `internal_only` — drives linkage and submission auto-fill, excluded from any rendered output by the renderer itself, not by per-document choice.

---

## 9. Submission BOQ engine (Document Rendering Engine)

Shared renderer, used for both the read-only Client BOQ view and Submission BOQ export, so layout logic exists once:

1. Base structure = Client BOQ's locked layout metadata (same numbering, sections, page format).
2. For each line, resolve via `client_link_code` to its Working BOQ item(s).
3. Compare quantities → tag `adjustment_type` (`unchanged`/`addition`/`omission`/`new`) — internal tracking only, never a visible column.
4. Quantity used in the output = `qty_source` resolution: project default (client qty / QTO qty) unless a line has a manual override or explicit per-line source selection.
5. Rate injected from Working BOQ / Rate Analysis final calculated rate.
6. `client_link_code` and any other internal-only fields are excluded at render time.

---

## 10. Owner Portal (separate app, separate login)

- `platform_db`, physically separate from tenant schemas.
- **License validation**: desktop calls a validate endpoint on launch with license key + machine fingerprint; caches a signed token with an offline grace period (length = policy decision, not architecture — flag as configurable, not fixed). Grace period expiry → read-only mode, not a hard lock; never block access to a user's own already-created data.
- **Impersonation/support access**: logged in `support_sessions`, and mirrored into the tenant's own activity log — a tenant should always be able to see when the vendor accessed their data.
- v1 modules: tenant list, license/subscription management, audited impersonation. CRM and financial dashboards are a later phase — not needed to run the core product.

---

## 11. Performance architecture (100,000+ rows)

Three layers — each solves a different bottleneck:

- **Data**: SQLite, indexed on every FK used in JOIN/WHERE (`project_id`, `boq_code`, `resource_id`, `client_link_code`). Query windowed pages, never load a full 100k-row table into memory.
- **UI**: Glide Data Grid (canvas-rendered, virtualized) for every large table, not just the primary BOQ views. Lazy-load off-screen rows.
- **Calculation**: extend the existing TS engine with a **dependency graph** — each derived value knows its upstream dependencies. An edit marks one node dirty and propagates only to dependents; it does not trigger a full project recompute. Run this off the UI thread (Tauri async command) so the grid never blocks mid-recalculation. This is the layer most likely to be under-built if treated as an afterthought — it's the actual reason Excel feels instant at scale, not just its storage.

---

## 12. App shell — screens (desktop)

- **Login** → tenant context → role-based landing
- **Tenant Home Dashboard**: project list, KPI tiles (active projects, pipeline value, average margin), recent activity feed
- **Global Masters**: Units, Resource Categories, Global Resources, Vendor Directory (permission-gated per Section 6)
- **Project Workspace**: tab/ribbon across modules — Client BOQ (locked view) · QTO · Working BOQ · Project Resources · Rate Analysis · Vendor/Material/Labour Comparison · Submission BOQ. Grid styled to resemble a default Excel sheet (gridlines, cell selection, familiar header look) as the v1 theme.
- **Project Dashboard**: cost breakdown by resource category (replaces GETPIVOTDATA), margin waterfall (cost → overhead → profit → logistics → contingency → quoted rate), vendor comparison summary
- **Settings**: users & custom roles, license/sync status, schema version, promotion policy, submission qty-source default

---

## 13. Tech stack

- **Desktop shell**: Tauri (Rust) — direct filesystem access to `.aero`
- **Frontend**: React + TypeScript
- **Grid**: Glide Data Grid
- **Local DB**: SQLite (Tauri SQL plugin / `better-sqlite3`)
- **Cloud backend**: Node/NestJS + Postgres, schema structurally identical to local SQLite (Drizzle ORM both sides, one migration set)
- **Auth**: Argon2id/JWT, no third-party auth provider
- **Charts**: Recharts or similar OSS lib for dashboards

---

## 14. Roadmap for Cursor build

| Phase | Scope | Exit criterion |
|---|---|---|
| **0** | Extend TS calc engine with dependency-graph/dirty-propagation | 51 existing tests pass; new test proves partial recompute touches only dependent nodes |
| **1** | Desktop shell + local SQLite schema + core grids: QTO, Working BOQ, Rate Analysis, Project Resources. Excel-only Client BOQ import first. Single tenant/user, no RBAC yet. | This reference project reproduces identical totals to the source workbook |
| **2** | RBAC engine, custom roles, soft-delete/archive on masters | Tenant Admin creates a custom role that correctly gates a module |
| **3** | Full document import pipeline: text-layer PDF/Word first, image/OCR last. Mapping/review UI. Client BOQ lock. `client_link_code` linkage. | A scanned BOQ never auto-commits without passing review |
| **4** | Submission BOQ engine + shared Document Rendering Engine + qty-source logic (project default + per-line override) | Submission output matches Client BOQ layout; additions/omissions correctly flagged and hidden |
| **5** | Cloud backend + sync (license validation live) | Two desktop installs on one tenant sync without silent data loss |
| **6** | Owner Portal v1: tenant list, license management, audited impersonation | Tenant sees vendor access logged in their own activity feed |
| **7** | Performance hardening at 100k+ rows: load test, profile dependency graph under real edit patterns, tune indexes | Cell edit → recalculation → grid update stays perceptibly instant at full scale |

Web client and Owner Portal v2 (CRM/financials) are intentionally excluded from this roadmap — see Appendix A.

---

## Appendix A — Deferred (not in this roadmap)

- **Tenant Web App**: thin client to the same API built in Phase 5. Start only after desktop Phase 7 is complete and deployed. Building it earlier duplicates UI work against an unproven data layer.
- **Owner Portal v2**: Sales CRM, financial/MRR dashboards. Not required to operate or sell the core product; v1's license + tenant management is sufficient to launch.

## Appendix B — Still open (policy, not architecture)

- Offline license grace period length.
