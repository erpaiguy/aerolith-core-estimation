"""Extract golden fixtures from the reference workbook. Stdlib only."""
from __future__ import annotations

import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "Estimation Master - Complete One Project with Global Masters.xlsx"
OUT = ROOT / "fixtures" / "reference"


def col_row(ref: str) -> tuple[str, int]:
    m = re.match(r"([A-Z]+)(\d+)", ref)
    if not m:
        raise ValueError(ref)
    return m.group(1), int(m.group(2))


def to_num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def load_book(path: Path):
    z = zipfile.ZipFile(path)
    ss_root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    strings = [
        "".join(t.text or "" for t in si.findall(".//m:t", NS))
        for si in ss_root.findall("m:si", NS)
    ]

    def cell_val(c):
        t = c.attrib.get("t")
        v = c.find("m:v", NS)
        f = c.find("m:f", NS)
        formula = f.text if f is not None else None
        value = v.text if v is not None else None
        if t == "s" and value is not None:
            value = strings[int(value)]
        return value, formula

    def load_sheet(target: str):
        root = ET.fromstring(z.read(target))
        grid, formulas = {}, {}
        for row in root.findall("m:sheetData/m:row", NS):
            for c in row.findall("m:c", NS):
                ref = c.attrib.get("r")
                if not ref:
                    continue
                col, rr = col_row(ref)
                val, formula = cell_val(c)
                grid[(col, rr)] = val
                if formula:
                    formulas[(col, rr)] = formula
        return grid, formulas

    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
    sheets = {}
    for s in wb.findall("m:sheets/m:sheet", NS):
        name = s.attrib["name"]
        rid = s.attrib[
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        ]
        target = rid_to[rid]
        if not target.startswith("xl/"):
            target = "xl/" + target
        sheets[name] = load_sheet(target)
    return sheets


def dump(name: str, data) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {path.name} ({path.stat().st_size} bytes)")


def main() -> None:
    sheets = load_book(XLSX)

    g, _ = sheets["Global Unit Master"]
    units = []
    r = 2
    while g.get(("A", r)) is not None:
        units.append(
            {
                "sl": to_num(g.get(("A", r))),
                "code": g.get(("B", r)),
                "description": g.get(("C", r)),
                "symbol": g.get(("D", r)),
            }
        )
        r += 1

    g, _ = sheets["Global Resource Category Master"]
    categories = []
    r = 2
    while g.get(("A", r)) is not None:
        categories.append(
            {
                "sl": to_num(g.get(("A", r))),
                "code": g.get(("B", r)),
                "description": g.get(("C", r)),
            }
        )
        r += 1

    wg, wf = sheets["Working BOQ"]
    project = {
        "name": wg.get(("A", 1)),
        "title": wg.get(("A", 2)),
        "overhead_pct": to_num(wg.get(("Q", 4))),
        "profit_pct": to_num(wg.get(("Q", 5))),
        "logistics_pct": to_num(wg.get(("Q", 6))),
        "contingency_pct": to_num(wg.get(("Q", 7))),
        "total_margin_pct": to_num(wg.get(("Q", 8))),
        "qty_source_default": "client_plus_adjustments",
        "currency": "QAR",
        "cost_amount": to_num(wg.get(("P", 94))),
        "margin_amount": to_num(wg.get(("R", 94))),
        "grand_total": to_num(wg.get(("T", 94))),
    }

    working = []
    r = 11
    while r <= 93:
        code = wg.get(("A", r))
        desc = wg.get(("I", r))
        quote = to_num(wg.get(("N", r)))
        if code and quote is None and desc:
            working.append(
                {
                    "row": r,
                    "kind": "section",
                    "boq_code": str(code),
                    "sl_no": str(wg.get(("B", r)) or ""),
                    "description": desc,
                }
            )
        elif quote is not None:
            working.append(
                {
                    "row": r,
                    "kind": "item",
                    "boq_code": str(code),
                    "sl_no": str(wg.get(("B", r)) or ""),
                    "boq_category": wg.get(("C", r)),
                    "work_category": wg.get(("D", r)),
                    "sub_work_category": wg.get(("E", r)),
                    "group1": wg.get(("F", r)),
                    "group2": wg.get(("G", r)),
                    "group3": wg.get(("H", r)),
                    "description": desc,
                    "client_qty": to_num(wg.get(("J", r))),
                    "unit": wg.get(("K", r)),
                    "our_qty": to_num(wg.get(("L", r))),
                    "qty_diff": to_num(wg.get(("M", r))),
                    "quote_qty": quote,
                    "cost_rate": to_num(wg.get(("O", r))),
                    "cost_amount": to_num(wg.get(("P", r))),
                    "margin_rate": to_num(wg.get(("Q", r))),
                    "margin_amount": to_num(wg.get(("R", r))),
                    "rate": to_num(wg.get(("S", r))),
                    "amount": to_num(wg.get(("T", r))),
                    "cost_formula": wf.get(("O", r)),
                    "our_qty_formula": wf.get(("L", r)),
                }
            )
        r += 1

    rg, rf = sheets["Rate Analysis"]
    analyses = []
    r = 1
    max_r = max(rr for (_, rr) in rg.keys())
    while r <= max_r:
        if rg.get(("A", r)) == "BOQ Code":
            code = str(rg.get(("B", r)))
            header_row = r
            desc = rg.get(("B", r + 1))
            qty = to_num(rg.get(("B", r + 2)))
            unit = rg.get(("B", r + 3))
            lines = []
            rr = r + 6
            footer = None
            while rr <= max_r and rg.get(("A", rr)) != "BOQ Code":
                a = rg.get(("A", rr))
                b = rg.get(("B", rr))
                c = rg.get(("C", rr))
                if c == "Item Total Cost":
                    footer = {
                        "boq_code": str(a) if a is not None else code,
                        "amount": to_num(rg.get(("P", rr))),
                        "total_amount": to_num(rg.get(("R", rr))),
                    }
                    rr += 1
                    continue
                if b and str(b).startswith("PRJ-"):
                    factors = [
                        to_num(rg.get((col, rr))) or 0
                        for col in ("D", "E", "F", "G", "H", "I")
                    ]
                    lines.append(
                        {
                            "sl": to_num(a),
                            "project_resource_code": str(b),
                            "description": c,
                            "factors": factors,
                            "qty": to_num(rg.get(("J", rr))),
                            "unit": rg.get(("K", rr)),
                            "wastage_pct": to_num(rg.get(("L", rr))),
                            "wastage_qty": to_num(rg.get(("M", rr))),
                            "item_qty": to_num(rg.get(("N", rr))),
                            "resource_rate": to_num(rg.get(("O", rr))),
                            "amount": to_num(rg.get(("P", rr))),
                            "total_qty": to_num(rg.get(("Q", rr))),
                            "total_amount": to_num(rg.get(("R", rr))),
                        }
                    )
                rr += 1
            analyses.append(
                {
                    "boq_code": code,
                    "description": desc,
                    "analysis_qty": qty,
                    "unit": unit,
                    "header_row": header_row,
                    "lines": lines,
                    "item_total_cost": footer,
                }
            )
            r = rr
            continue
        r += 1

    pg, pf = sheets["Project Resource Master"]
    resources = []
    r = 2
    while pg.get(("A", r)) is not None:
        resources.append(
            {
                "sl": to_num(pg.get(("A", r))),
                "global_code": pg.get(("B", r)),
                "project_code": pg.get(("C", r)),
                "category": pg.get(("D", r)),
                "type": pg.get(("E", r)),
                "sub_type": pg.get(("F", r)),
                "description": pg.get(("G", r)),
                "unit": pg.get(("H", r)),
                "specification": pg.get(("I", r)),
                "brand": pg.get(("J", r)),
                "global_wastage_pct": to_num(pg.get(("K", r))),
                "global_rate": to_num(pg.get(("L", r))),
                "project_wastage_pct": to_num(pg.get(("M", r))),
                "project_rate": to_num(pg.get(("N", r))),
                "total_qty": to_num(pg.get(("O", r))),
                "total_amount": to_num(pg.get(("P", r))),
                "rate_formula": pf.get(("N", r)),
                "qty_formula": pf.get(("O", r)),
            }
        )
        r += 1

    cg, _ = sheets["Client BOQ"]
    client_nodes = []
    r = 1
    max_c = max(rr for (_, rr) in cg.keys())
    while r <= max_c:
        a, b = cg.get(("A", r)), cg.get(("B", r))
        qty = to_num(cg.get(("C", r)))
        if r == 1:
            client_nodes.append({"row": r, "kind": "title", "description": a})
        elif r == 2:
            client_nodes.append({"row": r, "kind": "subtitle", "description": a})
        elif a == "Sl. No.":
            client_nodes.append({"row": r, "kind": "column_header"})
        elif qty is not None:
            client_nodes.append(
                {
                    "row": r,
                    "kind": "item",
                    "sl_no": str(a) if a is not None else "",
                    "description": b,
                    "qty": qty,
                    "unit": cg.get(("D", r)),
                }
            )
        elif a and b and qty is None:
            client_nodes.append(
                {
                    "row": r,
                    "kind": "section",
                    "sl_no": str(a),
                    "description": b,
                }
            )
        elif b and "Grand Total" in str(b):
            client_nodes.append({"row": r, "kind": "grand_total", "description": b})
        elif b and "Grand Summary" in str(b):
            client_nodes.append({"row": r, "kind": "summary_heading", "description": b})
        elif b and "Sub-total" in str(b):
            client_nodes.append({"row": r, "kind": "subtotal", "description": b})
        elif b and "subtotal" in str(b).lower():
            client_nodes.append({"row": r, "kind": "page_subtotal", "description": b})
        elif b and "(Contd.)" in str(b):
            client_nodes.append({"row": r, "kind": "page_break", "description": b})
        elif b:
            client_nodes.append({"row": r, "kind": "layout", "description": b, "sl_no": str(a) if a else ""})
        r += 1

    sg, _ = sheets["Submission Client BOQ"]
    submission_total = to_num(sg.get(("F", 270)))
    adjustments = []
    r = 228
    while r <= 252:
        qty = to_num(sg.get(("C", r)))
        desc = sg.get(("B", r))
        if qty is not None and desc:
            adjustments.append(
                {
                    "row": r,
                    "boq_code": str(sg.get(("A", r)) or ""),
                    "description": desc,
                    "qty": qty,
                    "unit": sg.get(("D", r)),
                    "rate": to_num(sg.get(("E", r))),
                    "amount": to_num(sg.get(("F", r))),
                }
            )
        r += 1

    goldens = {
        "project_name": project["name"],
        "overhead_pct": project["overhead_pct"],
        "profit_pct": project["profit_pct"],
        "logistics_pct": project["logistics_pct"],
        "contingency_pct": project["contingency_pct"],
        "total_margin_pct": project["total_margin_pct"],
        "working_cost_amount": project["cost_amount"],
        "working_margin_amount": project["margin_amount"],
        "working_grand_total": project["grand_total"],
        "submission_grand_total": submission_total,
        "tender_adjustments_total": sum(x["amount"] or 0 for x in adjustments),
        "priced_item_count": sum(1 for x in working if x["kind"] == "item"),
        "analysis_block_count": len(analyses),
        "analysis_line_count": sum(len(a["lines"]) for a in analyses),
        "project_resource_count": len(resources),
        "adjustment_line_count": len(adjustments),
        "money_decimals": 2,
    }

    dump("project.json", project)
    dump("units.json", units)
    dump("resource_categories.json", categories)
    dump("working_boq.json", working)
    dump("rate_analyses.json", analyses)
    dump("project_resources.json", resources)
    dump("client_boq.json", client_nodes)
    dump("tender_adjustments.json", adjustments)
    dump("goldens.json", goldens)
    print(json.dumps(goldens, indent=2))


if __name__ == "__main__":
    main()
