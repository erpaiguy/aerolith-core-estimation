import type {
  AnalysisLine,
  ClientNode,
  EnquiryPack,
  ItemQuote,
  LoadedProject,
  ProjectBill,
  ProjectResource,
  QtoLine,
  QuoteReply,
  ResourceQuote,
  TenderQueryItem,
  TenderQueryList,
  WorkingItem,
} from "./model";
import { BUILTIN_QUOTE_FIELDS, inferParents, stampItem } from "./model";
import { DEFAULT_BILL_ID, itemKeyOf, makeItemKey } from "./bills";
import { defaultClientColumns } from "./boqColumns";
import { addAnalysisInclude, cloneWholeAnalysis, linkWholeAnalysis } from "./projectCompute";
import {
  SAMPLE_DUE_FUTURE,
  SAMPLE_DUE_PAST,
  SAMPLE_ISSUED_AT,
  SAMPLE_LOCKED_AT,
  SAMPLE_QUERY_AT,
  SAMPLE_RECEIVED_AT,
  roundMoney,
} from "./sampleSeed";
import unitsJson from "@fixtures/units.json";
import categoriesJson from "@fixtures/resource_categories.json";

const B1 = DEFAULT_BILL_ID;
const B2 = "bill-2";
const B3 = "bill-3";

interface CampusBill {
  id: string;
  number: number;
  code: string;
  name: string;
  issuedRef: string;
  gfa: number;
  kind: "residential" | "commercial";
  drawing: string;
}

const CAMPUS_BILLS: CampusBill[] = [
  {
    id: B1,
    number: 1,
    code: "1",
    name: "Building 1 — Residential 10,000 m²",
    issuedRef: "B1-BOQ Rev 2",
    gfa: 10000,
    kind: "residential",
    drawing: "B1",
  },
  {
    id: B2,
    number: 2,
    code: "2",
    name: "Building 2 — Residential 15,000 m²",
    issuedRef: "B2-BOQ Rev 2",
    gfa: 15000,
    kind: "residential",
    drawing: "B2",
  },
  {
    id: B3,
    number: 3,
    code: "3",
    name: "Building 3 — Commercial & Office 2,500 m²",
    issuedRef: "B3-BOQ Rev 1",
    gfa: 2500,
    kind: "commercial",
    drawing: "B3",
  },
];

const RESOURCES: ProjectResource[] = [
  rec("PRJ-CEM", "Material", "Civil", "Cement", "Cement OPC 42.5", "bag", 22, 0.05),
  rec("PRJ-SND", "Material", "Civil", "Sand", "Washed sand", "m³", 55, 0.1),
  rec("PRJ-AGG", "Material", "Civil", "Aggregate", "20mm aggregate", "m³", 65, 0.05),
  rec("PRJ-REB", "Material", "Civil", "Steel", "High-yield rebar", "t", 2800, 0.03),
  rec("PRJ-BLK", "Material", "Civil", "Block", "200mm hollow block", "m²", 32, 0.05),
  rec("PRJ-BLK100", "Material", "Civil", "Block", "100mm solid block", "m²", 24, 0.05),
  rec("PRJ-MEM", "Material", "Civil", "Waterproofing", "Torch-on membrane", "m²", 28, 0.08),
  rec("PRJ-INS", "Material", "Civil", "Insulation", "50mm roof insulation", "m²", 18, 0.05),
  rec("PRJ-SCR", "Material", "Finishes", "Screed", "Sand-cement screed", "m³", 220, 0.05),
  rec("PRJ-TIL", "Material", "Finishes", "Tile", "Ceramic floor tile", "m²", 48, 0.08),
  rec("PRJ-PNT", "Material", "Finishes", "Paint", "Emulsion paint", "m²", 9, 0.1),
  rec("PRJ-GYP", "Material", "Finishes", "Ceiling", "Gypsum board ceiling", "m²", 38, 0.05),
  rec("PRJ-DR", "Material", "Joinery", "Door", "Solid-core timber doorset", "Nr", 850, 0),
  rec("PRJ-WIN", "Material", "Joinery", "Window", "Aluminium window", "m²", 420, 0),
  rec("PRJ-PAV", "Material", "External", "Paving", "Interlock paving", "m²", 55, 0.05),
  rec("PRJ-RAF", "Material", "Finishes", "Floor", "Raised access floor", "m²", 185, 0),
  rec("PRJ-CW", "Material", "Envelope", "Glazing", "Unitised curtain wall", "m²", 980, 0.02),
  rec("PRJ-LAB-M", "Labour", "Civil", "Mason", "Mason / concretor", "day", 220, 0),
  rec("PRJ-LAB-S", "Labour", "Civil", "Steelfixer", "Steel fixer", "day", 230, 0),
  rec("PRJ-LAB-C", "Labour", "Finishes", "Carpenter", "Carpenter / joiner", "day", 240, 0),
  rec("PRJ-LAB-P", "Labour", "Finishes", "Painter", "Painter", "day", 180, 0),
  rec("PRJ-PLT", "Plant", "Civil", "Mixer", "Concrete mixer & pump", "day", 520, 0),
  rec("PRJ-EXC", "Plant", "Civil", "Excavator", "20t excavator", "day", 780, 0),
];

function rec(
  code: string,
  category: string,
  type: string,
  sub: string,
  description: string,
  unit: string,
  rate: number,
  waste: number,
): ProjectResource {
  return {
    project_code: code,
    global_code: code.replace("PRJ-", "GLO-"),
    category,
    type,
    sub_type: sub,
    description,
    unit,
    project_wastage_pct: waste,
    project_rate: rate,
    rate_source: "quote",
    total_qty: null,
    total_amount: null,
  };
}

function L(code: string, qty: number, wastage?: number): AnalysisLine {
  const r = RESOURCES.find((x) => x.project_code === code)!;
  return {
    factors: [qty, null, null, null, null, null],
    wastagePct: wastage ?? r.project_wastage_pct ?? 0,
    resourceRate: r.project_rate ?? 0,
    description: r.description,
    projectResourceCode: code,
    unit: r.unit,
  };
}

type Kit =
  | "concrete"
  | "excavate"
  | "block200"
  | "block100"
  | "roof-wp"
  | "roof-ins"
  | "screed"
  | "tile"
  | "paint"
  | "ceiling"
  | "door"
  | "window"
  | "paving"
  | "raised"
  | "curtain"
  | "landscaping"
  | "direct"
  | "sub";

function kitLines(kit: Kit): AnalysisLine[] {
  switch (kit) {
    case "concrete":
      return [L("PRJ-CEM", 7, 0.05), L("PRJ-SND", 0.45, 0.1), L("PRJ-AGG", 0.85, 0.05), L("PRJ-REB", 0.12, 0.03), L("PRJ-LAB-M", 0.5), L("PRJ-LAB-S", 0.3), L("PRJ-PLT", 0.15)];
    case "excavate":
      return [L("PRJ-EXC", 0.08), L("PRJ-LAB-M", 0.12)];
    case "block200":
      return [L("PRJ-BLK", 1, 0.05), L("PRJ-LAB-M", 0.18), L("PRJ-CEM", 0.4, 0.05), L("PRJ-SND", 0.02, 0.1)];
    case "block100":
      return [L("PRJ-BLK100", 1, 0.05), L("PRJ-LAB-M", 0.14), L("PRJ-CEM", 0.25, 0.05)];
    case "roof-wp":
      return [L("PRJ-MEM", 1, 0.08), L("PRJ-LAB-M", 0.05)];
    case "roof-ins":
      return [L("PRJ-INS", 1, 0.05), L("PRJ-LAB-M", 0.04)];
    case "screed":
      return [L("PRJ-SCR", 0.04, 0.05), L("PRJ-LAB-M", 0.08)];
    case "tile":
      return [L("PRJ-TIL", 1, 0.08), L("PRJ-LAB-M", 0.12), L("PRJ-CEM", 0.15, 0.05)];
    case "paint":
      return [L("PRJ-PNT", 1, 0.1), L("PRJ-LAB-P", 0.06)];
    case "ceiling":
      return [L("PRJ-GYP", 1, 0.05), L("PRJ-LAB-C", 0.08)];
    case "door":
      return [L("PRJ-DR", 1), L("PRJ-LAB-C", 0.35)];
    case "window":
      return [L("PRJ-WIN", 1), L("PRJ-LAB-C", 0.2)];
    case "paving":
      return [L("PRJ-PAV", 1, 0.05), L("PRJ-LAB-M", 0.06), L("PRJ-SND", 0.03, 0.1)];
    case "raised":
      return [L("PRJ-RAF", 1), L("PRJ-LAB-C", 0.15)];
    case "curtain":
      return [L("PRJ-CW", 1, 0.02), L("PRJ-LAB-C", 0.25)];
    case "landscaping":
      return [L("PRJ-SND", 0.08, 0.1), L("PRJ-LAB-M", 0.2)];
    case "direct":
    case "sub":
      return [];
  }
}

interface TItem {
  sl: string;
  description: string;
  altB3?: string;
  unit: string;
  work: string;
  kit: Kit;
  /** Quantity on Building 1 (10,000 m²). Scaled by GFA unless `qty` is set. */
  qty10k: number;
  qty?: [number, number, number];
  cost10k?: number;
  cost?: [number, number, number];
  lump?: boolean;
  linkB2?: boolean;
  cloneB3?: boolean;
  qtyDiffPct?: number;
  formula?: QtoLine["formulaKey"];
}

interface TSection {
  sl: string;
  description: string;
  altB3?: string;
  items: TItem[];
}

const SECTIONS: TSection[] = [
  {
    sl: "1",
    description: "Preliminaries",
    items: [
      { sl: "a", description: "Site establishment and welfare", unit: "L/s", work: "Preliminaries", kit: "direct", qty10k: 1, lump: true, cost10k: 220000, cost: [220000, 280000, 95000] },
      { sl: "b", description: "Temporary works and scaffolding", unit: "L/s", work: "Preliminaries", kit: "direct", qty10k: 1, lump: true, cost10k: 86000, cost: [86000, 120000, 38000] },
      { sl: "c", description: "Setting out, shop drawings and as-builts", unit: "L/s", work: "Preliminaries", kit: "direct", qty10k: 1, lump: true, cost10k: 48000, cost: [48000, 62000, 28000] },
    ],
  },
  {
    sl: "2",
    description: "Substructure",
    items: [
      { sl: "a", description: "Bulk excavation", unit: "m³", work: "Earthworks", kit: "excavate", qty10k: 4500, cloneB3: true, qtyDiffPct: 0.03, formula: "volume" },
      { sl: "b", description: "Lean concrete blinding 50mm", unit: "m³", work: "Concrete", kit: "concrete", qty10k: 180, cloneB3: true, formula: "volume" },
      { sl: "c", description: "Isolated pad foundations", unit: "m³", work: "Concrete", kit: "concrete", qty10k: 720, cloneB3: true, formula: "volume" },
      { sl: "d", description: "Ground floor slab", unit: "m³", work: "Concrete", kit: "concrete", qty10k: 1800, cloneB3: true, formula: "volume" },
    ],
  },
  {
    sl: "3",
    description: "Superstructure",
    items: [
      { sl: "a", description: "Columns", unit: "m³", work: "Concrete", kit: "concrete", qty10k: 620, linkB2: true, formula: "volume" },
      { sl: "b", description: "Beams", unit: "m³", work: "Concrete", kit: "concrete", qty10k: 880, linkB2: true, formula: "volume" },
      { sl: "c", description: "Suspended slabs", unit: "m³", work: "Concrete", kit: "concrete", qty10k: 2100, linkB2: true, formula: "volume" },
      { sl: "d", description: "Staircases", unit: "m³", work: "Concrete", kit: "concrete", qty10k: 85, linkB2: true, formula: "volume" },
    ],
  },
  {
    sl: "4",
    description: "Masonry",
    items: [
      { sl: "a", description: "200mm hollow blockwork", unit: "m²", work: "Masonry", kit: "block200", qty10k: 18000, linkB2: true, formula: "area" },
      { sl: "b", description: "100mm solid blockwork / partitions", unit: "m²", work: "Masonry", kit: "block100", qty10k: 6200, qty: [6200, 9300, 2800], linkB2: true, formula: "area" },
    ],
  },
  {
    sl: "5",
    description: "Roofing and waterproofing",
    items: [
      { sl: "a", description: "Torch-on waterproofing to roof", unit: "m²", work: "Roofing", kit: "roof-wp", qty10k: 2800, qty: [2800, 3800, 1400], linkB2: true, formula: "area" },
      { sl: "b", description: "50mm roof insulation", unit: "m²", work: "Roofing", kit: "roof-ins", qty10k: 2800, qty: [2800, 3800, 1400], formula: "area" },
    ],
  },
  {
    sl: "6",
    description: "Internal finishes",
    items: [
      { sl: "a", description: "Sand-cement floor screed 40mm", unit: "m²", work: "Finishes", kit: "screed", qty10k: 8500, linkB2: true, formula: "area" },
      { sl: "b", description: "Ceramic tiling to wet areas", altB3: "Porcelain tiling to WCs and pantry", unit: "m²", work: "Finishes", kit: "tile", qty10k: 2200, qty: [2200, 3300, 280], linkB2: true, formula: "area" },
      { sl: "c", description: "Emulsion painting to walls and soffits", unit: "m²", work: "Finishes", kit: "paint", qty10k: 28000, formula: "area" },
      { sl: "d", description: "Gypsum false ceiling", altB3: "Gypsum ceiling to office floors", unit: "m²", work: "Finishes", kit: "ceiling", qty10k: 1800, qty: [1800, 2400, 2100], formula: "area" },
    ],
  },
  {
    sl: "7",
    description: "Joinery and metalwork",
    items: [
      { sl: "a", description: "Timber doorsets", altB3: "Fire-rated office doorsets", unit: "Nr", work: "Joinery", kit: "door", qty10k: 90, qty: [90, 135, 42] },
      { sl: "b", description: "Aluminium windows", altB3: "Aluminium windows to cores", unit: "m²", work: "Joinery", kit: "window", qty10k: 1800, qty: [1800, 2600, 180], formula: "area" },
    ],
  },
  {
    sl: "8",
    description: "MEP installations",
    items: [
      { sl: "a", description: "Electrical installation (complete)", unit: "L/s", work: "Electrical", kit: "sub", qty10k: 1, lump: true, cost: [1100000, 1650000, 380000] },
      { sl: "b", description: "HVAC installation (complete)", unit: "L/s", work: "HVAC", kit: "sub", qty10k: 1, lump: true, cost: [1450000, 2100000, 620000] },
      { sl: "c", description: "Plumbing and drainage (complete)", unit: "L/s", work: "Plumbing", kit: "sub", qty10k: 1, lump: true, cost: [620000, 890000, 210000] },
      { sl: "d", description: "Builder's work in connection with services", unit: "m²", work: "Masonry", kit: "block100", qty10k: 400, qty: [400, 580, 220], formula: "area" },
    ],
  },
  {
    sl: "9",
    description: "External works",
    altB3: "Commercial envelope and fit-out",
    items: [
      { sl: "a", description: "Interlock paving", altB3: "Raised access floor", unit: "m²", work: "External", kit: "paving", qty10k: 800, qty: [800, 1200, 2100], formula: "area" },
      { sl: "b", description: "Soft landscaping", altB3: "Unitised curtain walling", unit: "m²", work: "External", kit: "landscaping", qty10k: 450, qty: [450, 680, 980], formula: "area" },
      { sl: "c", description: "Boundary wall", altB3: "Commercial kitchen rough-in", unit: "m²", work: "External", kit: "block200", qty10k: 180, qty: [180, 220, 1], lump: false },
      { sl: "d", description: "Storm drainage", altB3: "Car park markings and signage", unit: "m", work: "External", kit: "excavate", qty10k: 220, qty: [220, 310, 1], cost: [0, 0, 18000] },
    ],
  },
];

const VENDORS = [
  { id: "v-qbm", name: "Qatar Building Materials" },
  { id: "v-gst", name: "Gulf Steel Trading" },
  { id: "v-anm", name: "Al Noor MEP Contracting" },
  { id: "v-lsi", name: "Lusail Interiors" },
];

function qtyFor(item: TItem, bill: CampusBill): number {
  if (item.qty) {
    const i = CAMPUS_BILLS.findIndex((b) => b.id === bill.id);
    return item.qty[i] ?? item.qty[0]!;
  }
  if (item.lump) return item.qty10k;
  return roundMoney(item.qty10k * (bill.gfa / 10000));
}

function costFor(item: TItem, bill: CampusBill): number {
  if (item.cost) {
    const i = CAMPUS_BILLS.findIndex((b) => b.id === bill.id);
    return item.cost[i] ?? item.cost[0] ?? 0;
  }
  if (item.cost10k) return roundMoney(item.cost10k * (bill.gfa / 10000));
  return 0;
}

function descFor(item: TItem, bill: CampusBill): string {
  return bill.kind === "commercial" && item.altB3 ? item.altB3 : item.description;
}

function kitFor(item: TItem, bill: CampusBill): Kit {
  if (bill.kind !== "commercial" || !item.altB3) return item.kit;
  if (item.sl === "a" && item.work === "External") return "raised";
  if (item.sl === "b" && item.work === "External") return "curtain";
  if (item.sl === "c" && item.work === "External") return "sub";
  if (item.sl === "d" && item.work === "External") return "direct";
  return item.kit;
}

function masterUnits(): LoadedProject["units"] {
  return (unitsJson as Array<{ code: string; description: string; symbol: string }>).map((u) => ({
    code: u.code,
    description: u.description,
    symbol: u.symbol,
  }));
}

function masterCategories(): LoadedProject["categories"] {
  return (categoriesJson as Array<{ code: string; description: string }>).map((c) => ({
    code: c.code,
    description: c.description,
  }));
}

function splitQto(bill: CampusBill, item: WorkingItem, template: TItem, qty: number): QtoLine[] {
  const key = itemKeyOf(item);
  const formula = template.formula ?? "qty";
  const base = {
    workCategory: item.workCategory,
    itemLabel: item.description,
    subItem: null as string | null,
    workingBoqCode: key,
    billId: bill.id,
  };
  const posted = template.qtyDiffPct ? roundMoney(qty * (1 + template.qtyDiffPct)) : qty;
  if (formula === "volume") {
    const h = 0.3;
    const b = 5;
    const l = posted > 0 ? roundMoney(posted / (b * h)) : 0;
    const halfL = roundMoney(l / 2);
    return [
      { ...base, id: `qto-${bill.id}-${item.boqCode}-1`, drawing: `${bill.drawing}-S-201`, locationDesc: "Grid A–D", formulaKey: "volume", dims: { nos1: 1, nos2: 1, l: halfL, b, h } },
      { ...base, id: `qto-${bill.id}-${item.boqCode}-2`, drawing: `${bill.drawing}-S-202`, locationDesc: "Grid E–H", formulaKey: "volume", dims: { nos1: 1, nos2: 1, l: roundMoney(l - halfL), b, h } },
    ];
  }
  if (formula === "area") {
    const width = 4;
    const length = posted > 0 ? roundMoney(posted / width) : 0;
    const half = roundMoney(length / 2);
    return [
      { ...base, id: `qto-${bill.id}-${item.boqCode}-1`, drawing: `${bill.drawing}-A-101`, locationDesc: "Level 1", formulaKey: "area", dims: { nos1: 1, nos2: 1, l: half, b: width } },
      { ...base, id: `qto-${bill.id}-${item.boqCode}-2`, drawing: `${bill.drawing}-A-102`, locationDesc: "Level 2+", formulaKey: "area", dims: { nos1: 1, nos2: 1, l: roundMoney(length - half), b: width } },
    ];
  }
  return [
    {
      ...base,
      id: `qto-${bill.id}-${item.boqCode}-1`,
      drawing: `${bill.drawing}-AR-01`,
      locationDesc: bill.name.split("—")[0]!.trim(),
      formulaKey: "qty",
      dims: { l: posted },
    },
  ];
}

function campusQueries(): { queryItems: TenderQueryItem[]; queryLists: TenderQueryList[] } {
  const q1: TenderQueryItem = {
    id: "tq-cam-001",
    number: "Q-001",
    documentRef: "B1 / B2 BOQ 3a",
    subject: "Concrete grade — residential towers",
    question: "Please confirm C40 for columns and beams on Buildings 1 and 2, and whether Building 3 office cores follow the same mix.",
    createdAt: SAMPLE_QUERY_AT,
    carriedFromId: null,
    closedAt: null,
    replies: [
      {
        id: "tqr-cam-001",
        listId: "tql-cam-1",
        receivedAt: SAMPLE_RECEIVED_AT,
        fromName: "Structural engineer",
        body: "C40 for B1 and B2 superstructure. Building 3 cores are C45. Same cement type.",
        needsInfo: false,
        needsInfoNote: "",
        fields: { drawing: "S-301" },
        attachments: [],
      },
    ],
    attachments: [],
  };
  const q2: TenderQueryItem = {
    id: "tq-cam-002",
    number: "Q-002",
    documentRef: "B3 BOQ 9b",
    subject: "Curtain wall system on Building 3",
    question: "Is the curtain wall a nominated supplier, or are we to price a contractor-designed unitised system?",
    createdAt: SAMPLE_QUERY_AT,
    carriedFromId: null,
    closedAt: null,
    replies: [
      {
        id: "tqr-cam-002",
        listId: "tql-cam-1",
        receivedAt: "2026-07-24T09:00:00.000Z",
        fromName: "Architect",
        body: "Contractor-designed. Performance specification in Volume 3. Sample bay required.",
        needsInfo: true,
        needsInfoNote: "Please issue the performance specification appendix.",
        fields: {},
        attachments: [],
      },
    ],
    attachments: [],
  };
  const q3: TenderQueryItem = {
    id: "tq-cam-003",
    number: "Q-003",
    documentRef: "B1 Preliminaries 1a",
    subject: "Shared site establishment",
    question: "May Buildings 2 and 3 share the Building 1 site establishment, or is a separate compound required per plot?",
    createdAt: SAMPLE_QUERY_AT,
    carriedFromId: null,
    closedAt: "2026-08-02T12:00:00.000Z",
    replies: [
      {
        id: "tqr-cam-003",
        listId: "tql-cam-1",
        receivedAt: "2026-07-29T10:00:00.000Z",
        fromName: "Project manager",
        body: "One compound serving all three plots is acceptable. Price welfare in each bill as billed.",
        needsInfo: false,
        needsInfoNote: "",
        fields: {},
        attachments: [],
      },
    ],
    attachments: [],
  };
  const q4: TenderQueryItem = {
    id: "tq-cam-004",
    number: "Q-004",
    documentRef: "B2 BOQ 6d",
    subject: "Ceiling void coordination on Building 2",
    question: "HVAC layouts clash with the gypsum ceiling zone on typical floors. Please confirm void depth.",
    createdAt: "2026-08-04T08:00:00.000Z",
    carriedFromId: null,
    closedAt: null,
    replies: [],
    attachments: [],
  };
  const q5: TenderQueryItem = {
    id: "tq-cam-005",
    number: "Q-005",
    documentRef: "B3 BOQ 8a",
    subject: "Office lighting control",
    question: "Are DALI controls required on all office floors or only the typical floor mock-up?",
    createdAt: "2026-08-14T08:00:00.000Z",
    carriedFromId: null,
    closedAt: null,
    replies: [],
    attachments: [],
  };
  return {
    queryItems: [q1, q2, q3, q4, q5],
    queryLists: [
      {
        id: "tql-cam-1",
        number: 1,
        title: "Query list 1 — campus clarification",
        status: "sent",
        sentAt: SAMPLE_ISSUED_AT,
        dueAt: SAMPLE_DUE_PAST,
        notes: "Issued against all three bills. Q-004 is still open.",
        lines: [
          { id: "tcl1-1", itemId: q1.id, included: true, roundNote: "", fields: {} },
          { id: "tcl1-2", itemId: q2.id, included: true, roundNote: "", fields: {} },
          { id: "tcl1-3", itemId: q3.id, included: true, roundNote: "", fields: {} },
          { id: "tcl1-4", itemId: q4.id, included: true, roundNote: "", fields: {} },
        ],
        queryColumns: [{ id: "qc-dwg", label: "Drawing", valueType: "text" }],
        replyColumns: [{ id: "rc-dwg", label: "Drawing", valueType: "text" }],
        attachments: [],
      },
      {
        id: "tql-cam-2",
        number: 2,
        title: "Query list 2 — follow-up (draft)",
        status: "draft",
        sentAt: null,
        dueAt: SAMPLE_DUE_FUTURE,
        notes: "Carry the curtain-wall specification request and the lighting query.",
        lines: [
          { id: "tcl2-1", itemId: q2.id, included: true, roundNote: "Still need the performance appendix.", fields: {} },
          { id: "tcl2-2", itemId: q5.id, included: true, roundNote: "", fields: {} },
        ],
        queryColumns: [{ id: "qc-dwg", label: "Drawing", valueType: "text" }],
        replyColumns: [],
        attachments: [],
      },
    ],
  };
}

function campusBuy(items: WorkingItem[]): {
  resourceQuotes: ResourceQuote[];
  itemQuotes: ItemQuote[];
  enquiries: EnquiryPack[];
  quoteReplies: QuoteReply[];
} {
  const resourceQuotes: ResourceQuote[] = [];
  RESOURCES.forEach((r, idx) => {
    resourceQuotes.push({
      id: `rq-cam-qbm-${idx}`,
      projectResourceCode: r.project_code,
      vendorName: "Qatar Building Materials",
      rate: r.project_rate ?? 0,
      selected: r.category !== "Plant",
      enquiryId: "enq-cam-mat-qbm",
      quotedQty: 0,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "30 days",
    });
    resourceQuotes.push({
      id: `rq-cam-gst-${idx}`,
      projectResourceCode: r.project_code,
      vendorName: "Gulf Steel Trading",
      rate: roundMoney((r.project_rate ?? 0) * (r.sub_type === "Steel" ? 0.97 : 1.08)),
      selected: false,
      enquiryId: "enq-cam-mat-gst",
      quotedQty: 0,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "45 days",
    });
  });
  const labour = RESOURCES.filter((r) => r.category === "Labour");
  labour.forEach((r, idx) => {
    const existing = resourceQuotes.find((q) => q.projectResourceCode === r.project_code && q.vendorName === "Qatar Building Materials");
    if (existing) existing.selected = true;
    resourceQuotes.push({
      id: `rq-cam-lsi-lab-${idx}`,
      projectResourceCode: r.project_code,
      vendorName: "Lusail Interiors",
      rate: roundMoney((r.project_rate ?? 0) * 1.04),
      selected: false,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "30 days",
    });
  });

  const mepCodes = ["8a", "8b", "8c"];
  const mepItems = items.filter((i) => i.kind === "item" && mepCodes.includes(i.boqCode));
  const kitchen = items.find((i) => i.billId === B3 && i.boqCode === "9c");
  const itemQuotes: ItemQuote[] = [];
  for (const i of mepItems) {
    const cost = i.directCost ?? 0;
    itemQuotes.push({
      id: `iq-cam-anm-${i.billId}-${i.boqCode}`,
      billId: i.billId,
      boqCode: itemKeyOf(i),
      vendorName: "Al Noor MEP Contracting",
      rate: cost,
      selected: true,
      enquiryId: "enq-cam-boq-anm",
      quotedQty: i.ourQty || 1,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "Progress claims monthly",
      remarks: "Package rate taken up.",
    });
    itemQuotes.push({
      id: `iq-cam-alt-${i.billId}-${i.boqCode}`,
      billId: i.billId,
      boqCode: itemKeyOf(i),
      vendorName: "Lusail Interiors",
      rate: roundMoney(cost * 1.07),
      selected: false,
      quotedQty: i.ourQty || 1,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "45 days",
      remarks: "Not taken up.",
    });
  }
  if (kitchen) {
    itemQuotes.push({
      id: "iq-cam-anm-b3-9c",
      billId: B3,
      boqCode: itemKeyOf(kitchen),
      vendorName: "Al Noor MEP Contracting",
      rate: 145000,
      selected: true,
      enquiryId: "enq-cam-boq-anm",
      quotedQty: 1,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "Progress claims monthly",
      remarks: "Kitchen rough-in package.",
    });
  }

  const matTargets = RESOURCES.filter((r) => r.category === "Material").slice(0, 10);
  const enquiries: EnquiryPack[] = [
    {
      id: "enq-cam-mat-qbm",
      laneKind: "resource",
      category: "Material",
      vendorName: "Qatar Building Materials",
      status: "issued",
      issuedAt: SAMPLE_ISSUED_AT,
      dueAt: SAMPLE_DUE_PAST,
      notes: "Civil and finishes materials for all three buildings (one project catalogue).",
      lines: matTargets.map((r, i) => ({
        id: `el-cam-qbm-${i}`,
        targetKind: "resource",
        targetCode: r.project_code,
        qty: 0,
        unit: r.unit,
        spec: r.description ?? "",
        included: true,
      })),
    },
    {
      id: "enq-cam-mat-gst",
      laneKind: "resource",
      category: "Material",
      vendorName: "Gulf Steel Trading",
      status: "issued",
      issuedAt: SAMPLE_ISSUED_AT,
      dueAt: SAMPLE_DUE_FUTURE,
      notes: "Rebar and associated metals.",
      lines: matTargets
        .filter((r) => r.sub_type === "Steel" || r.sub_type === "Cement")
        .map((r, i) => ({
          id: `el-cam-gst-${i}`,
          targetKind: "resource" as const,
          targetCode: r.project_code,
          qty: 0,
          unit: r.unit,
          spec: r.description ?? "",
          included: true,
        })),
    },
    {
      id: "enq-cam-boq-anm",
      laneKind: "boq",
      category: "BOQ items",
      vendorName: "Al Noor MEP Contracting",
      status: "issued",
      issuedAt: SAMPLE_ISSUED_AT,
      dueAt: SAMPLE_DUE_FUTURE,
      notes: "MEP packages on every building, plus Building 3 kitchen rough-in.",
      lines: [...mepItems, ...(kitchen ? [kitchen] : [])].map((i, n) => ({
        id: `el-cam-anm-${n}`,
        targetKind: "boq" as const,
        targetCode: itemKeyOf(i),
        qty: i.ourQty || 1,
        unit: i.unit,
        spec: i.description,
        included: true,
      })),
    },
    {
      id: "enq-cam-lab-draft",
      laneKind: "resource",
      category: "Labour",
      vendorName: "Lusail Interiors",
      status: "draft",
      issuedAt: null,
      dueAt: SAMPLE_DUE_FUTURE,
      notes: "Finishes labour — not issued.",
      lines: labour.map((r, i) => ({
        id: `el-cam-lab-${i}`,
        targetKind: "resource" as const,
        targetCode: r.project_code,
        qty: 0,
        unit: r.unit,
        spec: r.description ?? "",
        included: true,
      })),
    },
  ];

  const quoteReplies: QuoteReply[] = [
    {
      id: "qr-cam-qbm",
      vendorName: "Qatar Building Materials",
      enquiryId: "enq-cam-mat-qbm",
      receivedAt: SAMPLE_RECEIVED_AT,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "30 days",
      duration: "ex-stock 5 days",
      currency: "QAR",
      headerFields: { duration: "ex-stock 5 days" },
    },
    {
      id: "qr-cam-gst",
      vendorName: "Gulf Steel Trading",
      enquiryId: "enq-cam-mat-gst",
      receivedAt: "2026-07-23T14:00:00.000Z",
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "45 days",
      duration: "3 weeks mill",
      currency: "QAR",
      headerFields: { duration: "3 weeks mill" },
    },
    {
      id: "qr-cam-anm",
      vendorName: "Al Noor MEP Contracting",
      enquiryId: "enq-cam-boq-anm",
      receivedAt: "2026-07-28T09:30:00.000Z",
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "Progress claims monthly",
      duration: "as construction programme",
      currency: "QAR",
      headerFields: {},
    },
  ];

  return { resourceQuotes, itemQuotes, enquiries, quoteReplies };
}

export function loadCampusSampleProject(): LoadedProject {
  const bills: ProjectBill[] = CAMPUS_BILLS.map((b) => ({
    id: b.id,
    number: b.number,
    code: b.code,
    name: b.name,
    issuedRef: b.issuedRef,
    sourceLockedAt: SAMPLE_LOCKED_AT,
  }));

  const items: WorkingItem[] = [];
  const clientNodes: ClientNode[] = [
    { row: 1, kind: "title", description: "Al Maha Campus, Lusail — Bills of Quantities" },
  ];
  const qtoLines: QtoLine[] = [];
  const levelCol = { id: "w-level", label: "Level", role: "extra" as const, valueType: "text" as const };
  let row = 1;

  for (const bill of CAMPUS_BILLS) {
    for (const section of SECTIONS) {
      const sectionName = bill.kind === "commercial" && section.altB3 ? section.altB3 : section.description;
      const sectionItem = stampItem({
        id: `it-${bill.id}-${section.sl}`,
        billId: bill.id,
        boqCode: section.sl,
        slNo: section.sl,
        kind: "section",
        parentCode: null,
        description: sectionName,
        boqCategory: sectionName,
        workCategory: null,
        subWorkCategory: null,
        group1: bill.name,
        group2: null,
        group3: null,
        clientQty: 0,
        ourQty: 0,
        unit: null,
        lines: [],
      });
      items.push(sectionItem);
      row += 1;
      clientNodes.push({
        row,
        kind: "section",
        sl_no: section.sl,
        description: sectionName,
        billId: bill.id,
        boqCode: itemKeyOf(sectionItem),
      });
      for (const t of section.items) {
        const qty = qtyFor(t, bill);
        const kit = kitFor(t, bill);
        const cost = costFor(t, bill);
        const lines = kitLines(kit);
        const isSub = kit === "sub" || (kit === "direct" && cost > 0 && lines.length === 0);
        const code = `${section.sl}${t.sl}`;
        const item = stampItem({
          id: `it-${bill.id}-${code}`,
          billId: bill.id,
          boqCode: code,
          slNo: t.sl,
          kind: "item",
          parentCode: section.sl,
          description: descFor(t, bill),
          boqCategory: sectionName,
          workCategory: t.work,
          subWorkCategory: null,
          group1: bill.name,
          group2: t.work,
          group3: null,
          clientQty: qty,
          ourQty: qty,
          unit:
            bill.kind === "commercial" && section.sl === "9" && (t.sl === "c" || t.sl === "d") ? "L/s" : t.unit,
          lines,
          extra: { [levelCol.id]: t.formula === "area" ? "Typical floors" : "All levels" },
          priceMode: lines.length ? "analysis" : "direct",
          analysisOrigin: "own",
          directCost: lines.length ? undefined : cost || undefined,
        });
        if (isSub && cost && item.lines.length === 0) {
          item.directCost = cost;
          item.priceMode = "direct";
        }
        items.push(item);
        row += 1;
        clientNodes.push({
          row,
          kind: "item",
          sl_no: t.sl,
          description: item.description,
          qty,
          unit: item.unit ?? undefined,
          billId: bill.id,
          boqCode: itemKeyOf(item),
        });
        qtoLines.push(
          ...splitQto(bill, item, kit === "sub" || t.lump ? { ...t, formula: "qty" } : t, qty),
        );
      }
    }
  }

  let project: LoadedProject = {
    name: "Al Maha Campus, Lusail",
    locationNote:
      "Three issued bills — Building 1 residential 10,000 m², Building 2 residential 15,000 m², Building 3 commercial & office 2,500 m². Same issued numbers on each bill. Resources are one project catalogue.",
    margin: {
      overheadPct: 0.1,
      profitPct: 0.3,
      logisticsPct: 0.025,
      contingencyPct: 0.05,
    },
    marginPresets: [],
    marginRules: [],
    currency: "QAR",
    qtySource: "client_plus_adjustments",
    bills,
    items: inferParents(items),
    clientNodes,
    clientColumns: defaultClientColumns(),
    workingColumns: [levelCol],
    resources: RESOURCES.map((r) => ({ ...r })),
    units: masterUnits(),
    categories: masterCategories(),
    vendors: VENDORS,
    qtoLines,
    resourceQuotes: [],
    itemQuotes: [],
    enquiries: [],
    quoteReplies: [],
    quoteFieldDefs: [
      ...BUILTIN_QUOTE_FIELDS.map((d) => ({ ...d })),
      { id: "warranty", label: "Warranty", valueType: "text", scope: "header", compare: true },
    ],
    queryItems: [],
    queryLists: [],
    sourceLockedAt: SAMPLE_LOCKED_AT,
    sealedAt: null,
    revision: 1,
    catalogVersion: 1,
    isDemo: true,
  };

  const linkCodes = new Set(
    SECTIONS.flatMap((s) => s.items.filter((i) => i.linkB2).map((i) => `${s.sl}${i.sl}`)),
  );
  const cloneCodes = new Set(
    SECTIONS.flatMap((s) => s.items.filter((i) => i.cloneB3).map((i) => `${s.sl}${i.sl}`)),
  );

  for (const code of linkCodes) {
    project = linkWholeAnalysis(project, makeItemKey(B2, code), makeItemKey(B1, code));
  }
  for (const code of cloneCodes) {
    project = cloneWholeAnalysis(project, makeItemKey(B3, code), makeItemKey(B1, code));
  }
  project = addAnalysisInclude(project, makeItemKey(B3, "8d"), makeItemKey(B1, "4b"), "link", 0.08);

  const buy = campusBuy(project.items);
  const queries = campusQueries();
  return {
    ...project,
    ...buy,
    ...queries,
  };
}
