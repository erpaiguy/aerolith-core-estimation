import type {
  LoadedProject,
  QueryAttachment,
  QueryColumnDef,
  TenderQueryItem,
  TenderQueryList,
  TenderQueryListLine,
  TenderQueryReply,
} from "./model";
import { slugColumnId } from "./boqColumns";
import { uid } from "./projectCompute";
import { mergeReportFormat, type ReportFormat } from "./reportFormat";
import { jobDocument } from "./print/types";

export type QueryStage = "log" | "tracker" | "send" | "receive" | "pending";

export type QueryTrackStatus = "draft" | "pending" | "overdue" | "answered" | "needs_info" | "closed";

export function ensureQueryLog(project: LoadedProject): LoadedProject {
  if (project.queryItems && project.queryLists) return project;
  return { ...project, queryItems: project.queryItems ?? [], queryLists: project.queryLists ?? [] };
}

export function nextQueryNumber(project: LoadedProject): string {
  let max = 0;
  for (const item of project.queryItems ?? []) {
    const n = Number((item.number.match(/(\d+)\s*$/) ?? [])[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `Q-${String(max + 1).padStart(3, "0")}`;
}

export function nextListNumber(project: LoadedProject): number {
  return Math.max(0, ...(project.queryLists ?? []).map((l) => l.number)) + 1;
}

export function blankQueryItem(project: LoadedProject, carriedFromId: string | null = null): TenderQueryItem {
  return {
    id: uid("tq"),
    number: nextQueryNumber(project),
    documentRef: "",
    subject: "",
    question: "",
    createdAt: new Date().toISOString(),
    carriedFromId,
    closedAt: null,
    replies: [],
    attachments: [],
  };
}

export function blankQueryList(project: LoadedProject): TenderQueryList {
  const n = nextListNumber(project);
  return {
    id: uid("tql"),
    number: n,
    title: `Query list ${n}`,
    status: "draft",
    sentAt: null,
    dueAt: null,
    notes: "",
    lines: [],
    queryColumns: [],
    replyColumns: [],
    attachments: [],
  };
}

export function upsertQueryItem(project: LoadedProject, item: TenderQueryItem): LoadedProject {
  const list = project.queryItems ?? [];
  const next = list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
  return { ...project, queryItems: next };
}

export function upsertQueryList(project: LoadedProject, pack: TenderQueryList): LoadedProject {
  const list = project.queryLists ?? [];
  const next = list.some((x) => x.id === pack.id) ? list.map((x) => (x.id === pack.id ? pack : x)) : [...list, pack];
  return { ...project, queryLists: next };
}

export function queryItem(project: LoadedProject, id: string): TenderQueryItem | undefined {
  return (project.queryItems ?? []).find((x) => x.id === id);
}

export function listsForItem(project: LoadedProject, itemId: string): TenderQueryList[] {
  return (project.queryLists ?? []).filter((l) => l.lines.some((line) => line.itemId === itemId && line.included));
}

export function latestReply(item: TenderQueryItem): TenderQueryReply | undefined {
  return [...item.replies].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).at(-1);
}

export function trackQuery(project: LoadedProject, item: TenderQueryItem, now = Date.now()): QueryTrackStatus {
  if (item.closedAt) return "closed";
  const sent = listsForItem(project, item.id).filter((l) => l.status === "sent");
  if (!sent.length) return "draft";
  const reply = latestReply(item);
  if (reply?.needsInfo) return "needs_info";
  if (replyHasContent(reply)) return "answered";
  const overdue = sent.some((l) => {
    if (!l.dueAt) return false;
    const due = new Date(l.dueAt).getTime();
    return Number.isFinite(due) && due < now;
  });
  return overdue ? "overdue" : "pending";
}

export function trackLabel(status: QueryTrackStatus): string {
  if (status === "draft") return "Draft";
  if (status === "pending") return "Awaiting reply";
  if (status === "overdue") return "Overdue";
  if (status === "answered") return "Answered";
  if (status === "needs_info") return "Needs more information";
  return "Closed";
}

export function pendingItems(project: LoadedProject, now = Date.now()): TenderQueryItem[] {
  return (project.queryItems ?? []).filter((item) => {
    const s = trackQuery(project, item, now);
    return s === "pending" || s === "overdue" || s === "needs_info";
  });
}

export function queryCoverage(project: LoadedProject, now = Date.now()) {
  const items = project.queryItems ?? [];
  const counts = { total: items.length, draft: 0, pending: 0, overdue: 0, answered: 0, needsInfo: 0, closed: 0 };
  for (const item of items) {
    const s = trackQuery(project, item, now);
    if (s === "draft") counts.draft += 1;
    else if (s === "pending") counts.pending += 1;
    else if (s === "overdue") counts.overdue += 1;
    else if (s === "answered") counts.answered += 1;
    else if (s === "needs_info") counts.needsInfo += 1;
    else counts.closed += 1;
  }
  return counts;
}

export function replyHasContent(reply: TenderQueryReply | undefined): boolean {
  if (!reply) return false;
  if (reply.body.trim()) return true;
  if (Object.values(reply.fields ?? {}).some((v) => v.trim())) return true;
  if ((reply.attachments ?? []).length) return true;
  return false;
}

export function addItemToList(project: LoadedProject, listId: string, itemId: string, roundNote = "", fields?: Record<string, string>): LoadedProject {
  const pack = (project.queryLists ?? []).find((l) => l.id === listId);
  if (!pack) return project;
  if (pack.lines.some((l) => l.itemId === itemId)) {
    return upsertQueryList(project, {
      ...pack,
      lines: pack.lines.map((l) =>
        l.itemId === itemId ? { ...l, included: true, roundNote: roundNote || l.roundNote, fields: { ...l.fields, ...(fields ?? {}) } } : l,
      ),
    });
  }
  const line: TenderQueryListLine = { id: uid("qln"), itemId, included: true, roundNote, fields: fields ?? {} };
  return upsertQueryList(project, { ...pack, lines: [...pack.lines, line] });
}

export function draftQueryList(project: LoadedProject): { project: LoadedProject; list: TenderQueryList } {
  const existing = (project.queryLists ?? []).find((l) => l.status === "draft");
  if (existing) return { project, list: existing };
  const list = blankQueryList(project);
  return { project: upsertQueryList(project, list), list };
}

export function carryPendingToList(
  project: LoadedProject,
  listId: string,
  itemIds?: string[],
  now = Date.now(),
): LoadedProject {
  const pending = pendingItems(project, now);
  const wanted = itemIds ? pending.filter((i) => itemIds.includes(i.id)) : pending;
  let next = project;
  for (const item of wanted) {
    const reply = latestReply(item);
    const note = reply?.needsInfo ? reply.needsInfoNote || "Further information requested on the last reply." : "";
    const prev = previousLineFields(next, item.id, listId);
    const dest = (next.queryLists ?? []).find((l) => l.id === listId);
    const fields: Record<string, string> = {};
    for (const col of dest?.queryColumns ?? []) {
      if (prev[col.id]) fields[col.id] = prev[col.id]!;
    }
    next = addItemToList(next, listId, item.id, note, fields);
  }
  return next;
}

function previousLineFields(project: LoadedProject, itemId: string, destListId: string): Record<string, string> {
  const sent = listsForItem(project, itemId).filter((l) => l.status === "sent" && l.id !== destListId);
  const last = sent.sort((a, b) => a.number - b.number).at(-1);
  return last?.lines.find((l) => l.itemId === itemId)?.fields ?? {};
}

export function issueQueryList(project: LoadedProject, listId: string): LoadedProject {
  return {
    ...project,
    queryLists: (project.queryLists ?? []).map((l) =>
      l.id === listId ? { ...l, status: "sent" as const, sentAt: l.sentAt ?? new Date().toISOString() } : l,
    ),
  };
}

export function closeQuery(project: LoadedProject, itemId: string): LoadedProject {
  const item = queryItem(project, itemId);
  if (!item) return project;
  return upsertQueryItem(project, { ...item, closedAt: new Date().toISOString() });
}

export function reopenQuery(project: LoadedProject, itemId: string): LoadedProject {
  const item = queryItem(project, itemId);
  if (!item) return project;
  return upsertQueryItem(project, { ...item, closedAt: null });
}

export function logQueryReply(
  project: LoadedProject,
  itemId: string,
  patch: Partial<TenderQueryReply> & Pick<TenderQueryReply, "body">,
): LoadedProject {
  const item = queryItem(project, itemId);
  if (!item) return project;
  const existing = patch.id ? item.replies.find((r) => r.id === patch.id) : undefined;
  const reply: TenderQueryReply = {
    id: existing?.id ?? patch.id ?? uid("tqr"),
    listId: patch.listId ?? existing?.listId ?? null,
    receivedAt: patch.receivedAt ?? existing?.receivedAt ?? new Date().toISOString(),
    fromName: patch.fromName ?? existing?.fromName ?? "",
    body: patch.body,
    needsInfo: patch.needsInfo ?? existing?.needsInfo ?? false,
    needsInfoNote: patch.needsInfoNote ?? existing?.needsInfoNote ?? "",
    fields: patch.fields ?? existing?.fields ?? {},
    attachments: patch.attachments ?? existing?.attachments ?? [],
  };
  const replies = existing
    ? item.replies.map((r) => (r.id === existing.id ? reply : r))
    : [...item.replies, reply];
  return upsertQueryItem(project, { ...item, replies });
}

export function includedItems(project: LoadedProject, pack: TenderQueryList | null): TenderQueryItem[] {
  if (!pack) return [];
  const wanted = pack.lines.filter((l) => l.included).map((l) => l.itemId);
  return wanted.map((id) => queryItem(project, id)).filter((x): x is TenderQueryItem => Boolean(x));
}

export function deleteQueryItem(project: LoadedProject, itemId: string): LoadedProject {
  return {
    ...project,
    queryItems: (project.queryItems ?? []).filter((i) => i.id !== itemId),
    queryLists: (project.queryLists ?? []).map((l) => ({ ...l, lines: l.lines.filter((x) => x.itemId !== itemId) })),
  };
}

export function deleteQueryList(project: LoadedProject, listId: string): LoadedProject {
  return {
    ...project,
    queryLists: (project.queryLists ?? []).filter((l) => l.id !== listId),
    queryItems: (project.queryItems ?? []).map((item) => ({
      ...item,
      replies: item.replies.map((r) => (r.listId === listId ? { ...r, listId: null } : r)),
    })),
  };
}

export function removeLineFromList(project: LoadedProject, listId: string, itemId: string): LoadedProject {
  const pack = (project.queryLists ?? []).find((l) => l.id === listId);
  if (!pack) return project;
  return upsertQueryList(project, { ...pack, lines: pack.lines.filter((l) => l.itemId !== itemId) });
}

export function deleteQueryReply(project: LoadedProject, itemId: string, replyId: string): LoadedProject {
  const item = queryItem(project, itemId);
  if (!item) return project;
  return upsertQueryItem(project, { ...item, replies: item.replies.filter((r) => r.id !== replyId) });
}

export function blankQueryColumn(label: string, existing: QueryColumnDef[]): QueryColumnDef {
  const name = label.trim() || "Column";
  return {
    id: slugColumnId(name, "qc", existing.map((c) => c.id)),
    label: name,
    valueType: "text",
  };
}

export function addListColumn(
  project: LoadedProject,
  listId: string,
  kind: "query" | "reply",
  label: string,
): LoadedProject {
  const pack = (project.queryLists ?? []).find((l) => l.id === listId);
  if (!pack) return project;
  const key = kind === "query" ? "queryColumns" : "replyColumns";
  const cols = pack[key] ?? [];
  return upsertQueryList(project, { ...pack, [key]: [...cols, blankQueryColumn(label, cols)] });
}

export function removeListColumn(project: LoadedProject, listId: string, kind: "query" | "reply", columnId: string): LoadedProject {
  const pack = (project.queryLists ?? []).find((l) => l.id === listId);
  if (!pack) return project;
  if (kind === "query") {
    return upsertQueryList(project, {
      ...pack,
      queryColumns: pack.queryColumns.filter((c) => c.id !== columnId),
      lines: pack.lines.map((l) => {
        if (!(columnId in (l.fields ?? {}))) return l;
        const fields = { ...l.fields };
        delete fields[columnId];
        return { ...l, fields };
      }),
    });
  }
  return upsertQueryList(project, { ...pack, replyColumns: pack.replyColumns.filter((c) => c.id !== columnId) });
}

export function copyListColumns(
  project: LoadedProject,
  fromId: string,
  toId: string,
  kind: "query" | "reply",
): LoadedProject {
  const from = (project.queryLists ?? []).find((l) => l.id === fromId);
  const to = (project.queryLists ?? []).find((l) => l.id === toId);
  if (!from || !to || from.id === to.id) return project;
  const cols = (kind === "query" ? from.queryColumns : from.replyColumns).map((c) => ({ ...c }));
  if (kind === "query") return upsertQueryList(project, { ...to, queryColumns: cols });
  return upsertQueryList(project, { ...to, replyColumns: cols });
}

export function setLineField(
  project: LoadedProject,
  listId: string,
  itemId: string,
  columnId: string,
  value: string,
): LoadedProject {
  const pack = (project.queryLists ?? []).find((l) => l.id === listId);
  if (!pack) return project;
  return upsertQueryList(project, {
    ...pack,
    lines: pack.lines.map((l) => (l.itemId === itemId ? { ...l, fields: { ...(l.fields ?? {}), [columnId]: value } } : l)),
  });
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export function attachmentSrc(att: QueryAttachment): string {
  return `data:${att.mime || "image/jpeg"};base64,${att.data}`;
}

export async function attachmentsFromFiles(files: Iterable<File>): Promise<QueryAttachment[]> {
  const out: QueryAttachment[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert(`${file.name} is larger than 6 MB.`);
      continue;
    }
    const data = await readFileBase64(file);
    out.push({
      id: uid("att"),
      name: file.name,
      mime: file.type || "image/jpeg",
      data,
      createdAt: new Date().toISOString(),
    });
  }
  return out;
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function addItemAttachments(project: LoadedProject, itemId: string, files: QueryAttachment[]): LoadedProject {
  const item = queryItem(project, itemId);
  if (!item || !files.length) return project;
  return upsertQueryItem(project, { ...item, attachments: [...(item.attachments ?? []), ...files] });
}

export function removeItemAttachment(project: LoadedProject, itemId: string, attachmentId: string): LoadedProject {
  const item = queryItem(project, itemId);
  if (!item) return project;
  return upsertQueryItem(project, { ...item, attachments: (item.attachments ?? []).filter((a) => a.id !== attachmentId) });
}

export function addListAttachments(project: LoadedProject, listId: string, files: QueryAttachment[]): LoadedProject {
  const pack = (project.queryLists ?? []).find((l) => l.id === listId);
  if (!pack || !files.length) return project;
  return upsertQueryList(project, { ...pack, attachments: [...(pack.attachments ?? []), ...files] });
}

export function removeListAttachment(project: LoadedProject, listId: string, attachmentId: string): LoadedProject {
  const pack = (project.queryLists ?? []).find((l) => l.id === listId);
  if (!pack) return project;
  return upsertQueryList(project, { ...pack, attachments: (pack.attachments ?? []).filter((a) => a.id !== attachmentId) });
}

export function addReplyAttachments(
  project: LoadedProject,
  itemId: string,
  replyId: string,
  files: QueryAttachment[],
): LoadedProject {
  const item = queryItem(project, itemId);
  if (!item || !files.length) return project;
  return upsertQueryItem(project, {
    ...item,
    replies: item.replies.map((r) => (r.id === replyId ? { ...r, attachments: [...(r.attachments ?? []), ...files] } : r)),
  });
}

export function removeReplyAttachment(
  project: LoadedProject,
  itemId: string,
  replyId: string,
  attachmentId: string,
): LoadedProject {
  const item = queryItem(project, itemId);
  if (!item) return project;
  return upsertQueryItem(project, {
    ...item,
    replies: item.replies.map((r) =>
      r.id === replyId ? { ...r, attachments: (r.attachments ?? []).filter((a) => a.id !== attachmentId) } : r,
    ),
  });
}

function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function slugCol(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
}

export function queryListCsv(project: LoadedProject, pack: TenderQueryList): string {
  const qCols = pack.queryColumns ?? [];
  const rCols = pack.replyColumns ?? [];
  const header = [
    "list_no",
    "query_no",
    "document_ref",
    "subject",
    "question",
    "round_note",
    ...qCols.map((c) => slugCol(c.label)),
    "reply",
    "received_at",
    "from_name",
    "needs_info",
    "needs_info_note",
    ...rCols.map((c) => `reply_${slugCol(c.label)}`),
  ];
  const rows = pack.lines
    .filter((l) => l.included)
    .map((l) => {
      const item = queryItem(project, l.itemId);
      if (!item) return null;
      return [
        csvCell(String(pack.number)),
        csvCell(item.number),
        csvCell(item.documentRef),
        csvCell(item.subject),
        csvCell(item.question),
        csvCell(l.roundNote),
        ...qCols.map((c) => csvCell(l.fields?.[c.id] ?? "")),
        "",
        "",
        "",
        "",
        "",
        ...rCols.map(() => ""),
      ].join(",");
    })
    .filter(Boolean);
  return [header.join(","), ...rows].join("\n");
}

export type ParsedQueryReplyRow = {
  queryNo: string;
  reply: string;
  receivedAt: string;
  fromName: string;
  needsInfo: boolean;
  needsInfoNote: string;
  fields: Record<string, string>;
};

export function parseQueryReplyCsv(text: string, replyColumns: QueryColumnDef[] = []): ParsedQueryReplyRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const cols = splitCsvLine(lines[0]!).map((c) => c.trim().toLowerCase());
  const idx = (name: string) => cols.indexOf(name);
  const out: ParsedQueryReplyRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const queryNo = (cells[idx("query_no")] ?? "").trim();
    if (!queryNo) continue;
    const needsRaw = (cells[idx("needs_info")] ?? "").trim().toLowerCase();
    const fields: Record<string, string> = {};
    for (const col of replyColumns) {
      let i = idx(`reply_${slugCol(col.label)}`);
      if (i < 0) i = idx(slugCol(col.label));
      if (i < 0) continue;
      const v = (cells[i] ?? "").trim();
      if (v) fields[col.id] = v;
    }
    out.push({
      queryNo,
      reply: (cells[idx("reply")] ?? "").trim(),
      receivedAt: (cells[idx("received_at")] ?? "").trim(),
      fromName: (cells[idx("from_name")] ?? "").trim(),
      needsInfo: needsRaw === "1" || needsRaw === "yes" || needsRaw === "true",
      needsInfoNote: (cells[idx("needs_info_note")] ?? "").trim(),
      fields,
    });
  }
  return out;
}

export function importQueryReplies(
  project: LoadedProject,
  rows: ParsedQueryReplyRow[],
  listId: string | null,
): LoadedProject {
  let next = project;
  for (const row of rows) {
    if (!row.reply && !Object.keys(row.fields).length) continue;
    const item = (next.queryItems ?? []).find((i) => i.number === row.queryNo);
    if (!item) continue;
    next = logQueryReply(next, item.id, {
      listId,
      body: row.reply,
      receivedAt: row.receivedAt || new Date().toISOString(),
      fromName: row.fromName,
      needsInfo: row.needsInfo,
      needsInfoNote: row.needsInfoNote,
      fields: row.fields,
    });
  }
  return next;
}

export function downloadText(filename: string, body: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printQueryList(project: LoadedProject, pack: TenderQueryList, format?: Partial<ReportFormat> | null): void {
  const fmt = mergeReportFormat(format);
  const qCols = pack.queryColumns ?? [];
  const due = pack.dueAt ? `Reply due ${pack.dueAt.slice(0, 10)}` : "";
  const doc = jobDocument(
    project.name,
    project.sealedAt ? `r${project.revision} sealed` : `r${project.revision}`,
    fmt,
    pack.title || "Client Queries",
    [
      {
        title: [pack.title, due].filter(Boolean).join(" · "),
        columns: [
          { label: "No", width: 8 },
          { label: "Document ref", width: 16 },
          { label: "Subject", width: 20 },
          { label: "Query", width: 28 },
          { label: "This round", width: 14 },
          ...qCols.map((c) => ({ label: c.label, width: 12 })),
        ],
        rows: pack.lines
          .filter((l) => l.included)
          .map((l) => {
            const item = queryItem(project, l.itemId);
            if (!item) return null;
            return {
              cells: [item.number, item.documentRef, item.subject, item.question, l.roundNote, ...qCols.map((c) => l.fields?.[c.id] ?? "")],
            };
          })
          .filter((row): row is { cells: string[] } => row != null),
      },
    ],
  );
  void import("./print/actions").then((m) => m.printDocument(doc));
}
