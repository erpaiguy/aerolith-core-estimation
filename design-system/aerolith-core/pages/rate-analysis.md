# Rate Analysis Page Overrides

> **PROJECT:** Aerolith Core
> **Page Type:** Rate analysis workspace

Rules here override `design-system/aerolith-core/MASTER.md`.

---

## Layout

- Keep the existing **inspector** column on the right (`280px`). Do not drop it for a full-bleed sheet.
- Left **rail** stays for app navigation. Swiss treatment is visual (slate rail, orange active mark), not a move to top tabs.
- Stage: toolbar → item title (`code` + description) → four KPI cells → resource table.
- KPI strip is a 4-column hairline grid (`#E2E8F0`), not loose dashboard cards.

## Color

- Safety orange `#EA580C` for Rate Analysis CTAs: Add resource line, inspector **Rate analysis**.
- Save `.aero` stays ink (`#0F172A`).
- Selected / focused resource row: `#FFF7ED`.

## Inspector

- Always present on Estimate, Rate analysis, and Take-off at desktop width.
- Below 1280px it remains available as the existing slide-over, toggled from the header.
- Heading is uppercase tracked “Inspector”. Primary action uses the accent fill with black label text.
