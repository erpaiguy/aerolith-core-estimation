import type {
  EnquiryPack,
  ItemQuote,
  LoadedProject,
  ProjectResource,
  QtoLine,
  QuoteReply,
  ResourceQuote,
  TenderQueryItem,
  TenderQueryList,
  WorkingItem,
} from "./model";
import { DEFAULT_BILL_ID, itemKeyOf } from "./bills";

/** Fixed stamps so sample jobs do not shift every time they are opened. */
export const SAMPLE_LOCKED_AT = "2026-04-18T08:00:00.000Z";
export const SAMPLE_ISSUED_AT = "2026-07-08T08:00:00.000Z";
export const SAMPLE_RECEIVED_AT = "2026-07-22T11:30:00.000Z";
export const SAMPLE_QUERY_AT = "2026-06-20T09:00:00.000Z";
export const SAMPLE_DUE_PAST = "2026-08-18";
export const SAMPLE_DUE_FUTURE = "2026-10-15";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function competingResourceQuotes(resources: ProjectResource[]): ResourceQuote[] {
  const extra: ResourceQuote[] = [];
  resources.forEach((r, idx) => {
    const base = r.project_rate ?? 0;
    extra.push({
      id: `rq-v2-${idx}`,
      projectResourceCode: r.project_code,
      vendorName: "Vendor 2",
      rate: roundMoney(base * 1.06),
      selected: false,
      quotedQty: r.total_qty,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "30 days",
      remarks: "Ex-works Doha",
    });
    extra.push({
      id: `rq-v3-${idx}`,
      projectResourceCode: r.project_code,
      vendorName: "Vendor 3",
      rate: roundMoney(base * 0.94),
      selected: false,
      quotedQty: r.total_qty,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "45 days",
      remarks: "Subject to mill confirmation",
    });
  });
  return extra;
}

/** Keep posted Our qty identical: same dims, plus drawing / location so Takeoff is not a blank seed. */
export function annotateQto(lines: QtoLine[], items: WorkingItem[]): QtoLine[] {
  const byKey = new Map(items.filter((i) => i.kind === "item").map((i) => [itemKeyOf(i), i]));
  return lines.map((line) => {
    const item = line.workingBoqCode ? byKey.get(line.workingBoqCode) : undefined;
    return {
      ...line,
      drawing: line.drawing?.trim() ? line.drawing : drawingFor(item),
      locationDesc: line.locationDesc?.trim() ? line.locationDesc : locationFor(item),
    };
  });
}

function drawingFor(item: WorkingItem | undefined): string {
  const cat = (item?.boqCategory ?? item?.workCategory ?? "GEN").slice(0, 3).toUpperCase();
  return `AR-${cat}-01`;
}

function locationFor(item: WorkingItem | undefined): string {
  return item?.workCategory?.trim() || item?.boqCategory?.trim() || "General";
}

export function referenceQueries(): { queryItems: TenderQueryItem[]; queryLists: TenderQueryList[] } {
  const q1: TenderQueryItem = {
    id: "tq-ref-001",
    number: "Q-001",
    documentRef: "BOQ 3a / Spec C20",
    subject: "Concrete grade for superstructure",
    question: "Please confirm whether superstructure members are C40 or C45, and whether a sulphate-resisting mix is required below DPC.",
    createdAt: SAMPLE_QUERY_AT,
    carriedFromId: null,
    closedAt: null,
    replies: [
      {
        id: "tqr-ref-001",
        listId: "tql-ref-1",
        receivedAt: SAMPLE_RECEIVED_AT,
        fromName: "Engineer — Medical Institute",
        body: "Use C40 throughout superstructure. Sulphate-resisting cement only in substructure as already specified.",
        needsInfo: false,
        needsInfoNote: "",
        fields: { drawing: "S-201" },
        attachments: [],
      },
    ],
    attachments: [],
  };
  const q2: TenderQueryItem = {
    id: "tq-ref-002",
    number: "Q-002",
    documentRef: "BOQ 6 / Finishes",
    subject: "Floor finish in treatment rooms",
    question: "Drawings show vinyl; the bill describes ceramic tiling. Which finish is to be priced?",
    createdAt: SAMPLE_QUERY_AT,
    carriedFromId: null,
    closedAt: null,
    replies: [
      {
        id: "tqr-ref-002",
        listId: "tql-ref-1",
        receivedAt: "2026-07-24T09:10:00.000Z",
        fromName: "Architect",
        body: "Treatment rooms remain vinyl. Issue of revised finishes schedule to follow.",
        needsInfo: true,
        needsInfoNote: "Please issue the revised finishes schedule and room data sheets.",
        fields: {},
        attachments: [],
      },
    ],
    attachments: [],
  };
  const q3: TenderQueryItem = {
    id: "tq-ref-003",
    number: "Q-003",
    documentRef: "Preliminaries 1a",
    subject: "Working hours",
    question: "Can noisy works proceed after 18:00 in the occupied wing?",
    createdAt: SAMPLE_QUERY_AT,
    carriedFromId: null,
    closedAt: "2026-07-30T14:00:00.000Z",
    replies: [
      {
        id: "tqr-ref-003",
        listId: "tql-ref-1",
        receivedAt: "2026-07-28T16:00:00.000Z",
        fromName: "Facilities",
        body: "No noisy works after 18:00. Weekend access by permit only.",
        needsInfo: false,
        needsInfoNote: "",
        fields: {},
        attachments: [],
      },
    ],
    attachments: [],
  };
  const q4: TenderQueryItem = {
    id: "tq-ref-004",
    number: "Q-004",
    documentRef: "Drawing A-104",
    subject: "Existing services in demolition areas",
    question: "Please confirm live services to be isolated before strip-out of Wing B.",
    createdAt: "2026-08-01T08:00:00.000Z",
    carriedFromId: null,
    closedAt: null,
    replies: [],
    attachments: [],
  };
  const q5: TenderQueryItem = {
    id: "tq-ref-005",
    number: "Q-005",
    documentRef: "Addendum 2",
    subject: "Attendance on nominated subcontractors",
    question: "Is attendance on the medical-gas installer to be measured separately or deemed included in preliminaries?",
    createdAt: "2026-08-12T08:00:00.000Z",
    carriedFromId: null,
    closedAt: null,
    replies: [],
    attachments: [],
  };

  const list1: TenderQueryList = {
    id: "tql-ref-1",
    number: 1,
    title: "Query list 1 — clarification round",
    status: "sent",
    sentAt: SAMPLE_ISSUED_AT,
    dueAt: SAMPLE_DUE_PAST,
    notes: "First round issued with the tender. Q-004 is still awaiting a reply.",
    lines: [
      { id: "tql1-l1", itemId: q1.id, included: true, roundNote: "", fields: {} },
      { id: "tql1-l2", itemId: q2.id, included: true, roundNote: "", fields: {} },
      { id: "tql1-l3", itemId: q3.id, included: true, roundNote: "", fields: {} },
      { id: "tql1-l4", itemId: q4.id, included: true, roundNote: "", fields: {} },
    ],
    queryColumns: [{ id: "qc-drawing", label: "Drawing", valueType: "text" }],
    replyColumns: [{ id: "rc-drawing", label: "Drawing", valueType: "text" }],
    attachments: [],
  };
  const list2: TenderQueryList = {
    id: "tql-ref-2",
    number: 2,
    title: "Query list 2 — follow-up (draft)",
    status: "draft",
    sentAt: null,
    dueAt: SAMPLE_DUE_FUTURE,
    notes: "Carry Q-002 (needs information) and the new attendance query.",
    lines: [
      { id: "tql2-l1", itemId: q2.id, included: true, roundNote: "Still waiting for the finishes schedule.", fields: {} },
      { id: "tql2-l2", itemId: q5.id, included: true, roundNote: "", fields: {} },
    ],
    queryColumns: [{ id: "qc-drawing", label: "Drawing", valueType: "text" }],
    replyColumns: [],
    attachments: [],
  };

  return { queryItems: [q1, q2, q3, q4, q5], queryLists: [list1, list2] };
}

export function referenceBuyFlow(project: LoadedProject): Pick<
  LoadedProject,
  "enquiries" | "quoteReplies" | "itemQuotes" | "resourceQuotes"
> {
  const materials = project.resources.filter((r) => (r.category ?? "") === "Material").slice(0, 8);
  const priced = project.items.filter((i) => i.kind === "item");
  const boqTargets = priced.slice(0, 2);

  const enqMat2: EnquiryPack = {
    id: "enq-ref-mat-v2",
    laneKind: "resource",
    category: "Material",
    vendorName: "Vendor 2",
    status: "issued",
    issuedAt: SAMPLE_ISSUED_AT,
    dueAt: SAMPLE_DUE_PAST,
    notes: "Cement, sand, and aggregates — return with mill certificates.",
    lines: materials.map((r, i) => ({
      id: `el-mat-v2-${i}`,
      targetKind: "resource",
      targetCode: r.project_code,
      qty: r.total_qty ?? 0,
      unit: r.unit,
      spec: r.description ?? "",
      included: true,
    })),
  };
  const enqMat3: EnquiryPack = {
    id: "enq-ref-mat-v3",
    laneKind: "resource",
    category: "Material",
    vendorName: "Vendor 3",
    status: "issued",
    issuedAt: SAMPLE_ISSUED_AT,
    dueAt: SAMPLE_DUE_FUTURE,
    notes: "Same pack as Vendor 2 for comparison.",
    lines: materials.map((r, i) => ({
      id: `el-mat-v3-${i}`,
      targetKind: "resource",
      targetCode: r.project_code,
      qty: r.total_qty ?? 0,
      unit: r.unit,
      spec: r.description ?? "",
      included: true,
    })),
  };
  const enqBoq: EnquiryPack = {
    id: "enq-ref-boq-v2",
    laneKind: "boq",
    category: "BOQ items",
    vendorName: "Vendor 2",
    status: "issued",
    issuedAt: SAMPLE_ISSUED_AT,
    dueAt: SAMPLE_DUE_FUTURE,
    notes: "Preliminaries attendance — for comparison only; analysis remains the source of the rate.",
    lines: boqTargets.map((i, n) => ({
      id: `el-boq-v2-${n}`,
      targetKind: "boq",
      targetCode: itemKeyOf(i),
      qty: i.ourQty,
      unit: i.unit,
      spec: i.description,
      included: true,
    })),
  };
  const enqDraft: EnquiryPack = {
    id: "enq-ref-lab-draft",
    laneKind: "resource",
    category: "Labour",
    vendorName: "Vendor 3",
    status: "draft",
    issuedAt: null,
    dueAt: SAMPLE_DUE_FUTURE,
    notes: "Labour pack not yet issued.",
    lines: project.resources
      .filter((r) => (r.category ?? "") === "Labour")
      .slice(0, 5)
      .map((r, i) => ({
        id: `el-lab-draft-${i}`,
        targetKind: "resource" as const,
        targetCode: r.project_code,
        qty: r.total_qty ?? 0,
        unit: r.unit,
        spec: r.description ?? "",
        included: true,
      })),
  };

  const itemQuotes: ItemQuote[] = boqTargets.flatMap((i) => [
    {
      id: `iq-ref-v2-${i.boqCode}`,
      billId: i.billId || DEFAULT_BILL_ID,
      boqCode: itemKeyOf(i),
      vendorName: "Vendor 2",
      rate: 155000,
      selected: false,
      enquiryId: enqBoq.id,
      quotedQty: i.ourQty,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "30 days",
      remarks: "Not taken up — working rate stays on analysis.",
    },
    {
      id: `iq-ref-v3-${i.boqCode}`,
      billId: i.billId || DEFAULT_BILL_ID,
      boqCode: itemKeyOf(i),
      vendorName: "Vendor 3",
      rate: 149500,
      selected: false,
      quotedQty: i.ourQty,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "45 days",
      remarks: "Not taken up.",
    },
  ]);

  const quoteReplies: QuoteReply[] = [
    {
      id: "qr-ref-mat-v2",
      vendorName: "Vendor 2",
      enquiryId: enqMat2.id,
      receivedAt: SAMPLE_RECEIVED_AT,
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "30 days",
      duration: "2 weeks",
      currency: project.currency,
      headerFields: { duration: "2 weeks", payment: "30 days" },
    },
    {
      id: "qr-ref-mat-v3",
      vendorName: "Vendor 3",
      enquiryId: enqMat3.id,
      receivedAt: "2026-07-25T10:00:00.000Z",
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "45 days",
      duration: "3 weeks",
      currency: project.currency,
      headerFields: { duration: "3 weeks", payment: "45 days" },
    },
    {
      id: "qr-ref-boq-v2",
      vendorName: "Vendor 2",
      enquiryId: enqBoq.id,
      receivedAt: "2026-07-26T12:00:00.000Z",
      validUntil: SAMPLE_DUE_FUTURE,
      paymentTerms: "30 days",
      duration: "as programme",
      currency: project.currency,
      headerFields: {},
    },
  ];

  return {
    resourceQuotes: [...project.resourceQuotes, ...competingResourceQuotes(project.resources)],
    enquiries: [enqMat2, enqMat3, enqBoq, enqDraft],
    quoteReplies,
    itemQuotes,
  };
}

export function seedReferenceWorkflow(project: LoadedProject): LoadedProject {
  const buy = referenceBuyFlow(project);
  const queries = referenceQueries();
  const wingCol = { id: "w-wing", label: "Wing", role: "extra" as const, valueType: "text" as const };
  let wing = 0;
  return {
    ...project,
    locationNote:
      "Reference project loaded from the Estimation Master workbook. Resource Prices, Client Queries, and Take-off drawings are seeded; the working total is unchanged.",
    sourceLockedAt: SAMPLE_LOCKED_AT,
    bills: project.bills.map((b) => ({ ...b, sourceLockedAt: b.sourceLockedAt ?? SAMPLE_LOCKED_AT })),
    workingColumns: [wingCol],
    items: project.items.map((i) => {
      if (i.kind !== "item") return i;
      wing += 1;
      return { ...i, extra: { ...(i.extra ?? {}), [wingCol.id]: wing % 2 === 0 ? "West" : "East" } };
    }),
    qtoLines: annotateQto(project.qtoLines, project.items),
    resourceQuotes: buy.resourceQuotes,
    enquiries: buy.enquiries,
    quoteReplies: buy.quoteReplies,
    itemQuotes: buy.itemQuotes,
    queryItems: queries.queryItems,
    queryLists: queries.queryLists,
  };
}
