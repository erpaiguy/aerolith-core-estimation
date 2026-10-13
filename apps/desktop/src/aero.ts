import type { FormulaKey } from "@aerolith/calc";
import { normalizeBoqCarry } from "@aerolith/calc";
import schemaSql from "../../../packages/schema/sqlite_v1.sql?raw";
import type {
  LoadedProject,
  WorkingItem,
  QuoteFieldDef,
  TenderQueryItem,
  TenderQueryList,
  QueryAttachment,
  QueryColumnDef,
} from "./model";
import { stampItem } from "./model";
import { DEFAULT_BILL_ID, ensureProjectBills, itemKeyOf } from "./bills";
import { defaultClientColumns, parseColumnDefs } from "./boqColumns";
import { parseMarginPresets, parseMarginRules } from "./marginRules";
import { parseStoredResourceMaster } from "./resourceMaster";

type SqlJsStatic = {
  Database: new (data?: ArrayLike<number>) => {
    exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
    prepare(sql: string): {
      run(params?: unknown[]): void;
      reset(): void;
      free(): void;
    };
    export(): Uint8Array;
    close(): void;
  };
};

async function sqlEngine(): Promise<SqlJsStatic> {
  const wasmUrl = (await import("sql.js/dist/sql-wasm.wasm?url")).default;
  const loaded: unknown = await import("sql.js/dist/sql-wasm.js");
  const initSqlJs = unwrapInit(loaded);
  if (!initSqlJs) {
    throw new Error("sql.js did not load");
  }
  return initSqlJs({ locateFile: () => wasmUrl });
}

function unwrapInit(
  loaded: unknown,
): ((config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>) | undefined {
  if (typeof loaded === "function") {
    return loaded as (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
  }
  if (loaded && typeof loaded === "object" && "default" in loaded) {
    return unwrapInit((loaded as { default: unknown }).default);
  }
  return undefined;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function nullable(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rows(db: { exec(sql: string): Array<{ columns: string[]; values: unknown[][] }> }, sql: string) {
  const result = db.exec(sql);
  if (!result.length) return [] as Record<string, unknown>[];
  const { columns, values } = result[0];
  return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

function tryRows(db: { exec(sql: string): Array<{ columns: string[]; values: unknown[][] }> }, sql: string) {
  try {
    return rows(db, sql);
  } catch {
    return [] as Record<string, unknown>[];
  }
}

function parseJsonMap(raw: unknown): Record<string, string> | undefined {
  const s = nullable(raw);
  if (!s) return undefined;
  try {
    const parsed = JSON.parse(s) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]));
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function parseJsonValue(raw: unknown): unknown {
  const s = nullable(raw);
  if (!s) return [];
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return [];
  }
}

function parseQueryColumns(raw: unknown): QueryColumnDef[] {
  const s = nullable(raw);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: QueryColumnDef[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? "").trim();
      const label = String(r.label ?? "").trim();
      if (!id || !label) continue;
      out.push({
        id,
        label,
        valueType: r.valueType === "number" || r.valueType === "date" ? r.valueType : "text",
      });
    }
    return out;
  } catch {
    return [];
  }
}

function parseAttachments(raw: unknown): QueryAttachment[] {
  const s = nullable(raw);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: QueryAttachment[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? "").trim();
      const data = String(r.data ?? "").trim();
      if (!id || !data) continue;
      out.push({
        id,
        name: String(r.name ?? "image"),
        mime: String(r.mime ?? "image/jpeg"),
        data,
        createdAt: String(r.createdAt ?? ""),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function loadEnquiries(db: { exec(sql: string): Array<{ columns: string[]; values: unknown[][] }> }) {
  const linesByPack = new Map<string, LoadedProject["enquiries"][number]["lines"]>();
  for (const r of tryRows(db, "SELECT * FROM enquiry_lines")) {
    const pack = str(r.pack_uuid);
    const list = linesByPack.get(pack) ?? [];
    list.push({
      id: str(r.line_uuid) || `el-${list.length + 1}`,
      targetKind: str(r.target_kind) === "boq" ? "boq" : "resource",
      targetCode: str(r.target_code),
      qty: num(r.qty),
      unit: nullable(r.unit),
      spec: str(r.spec),
      included: num(r.included) !== 0,
    });
    linesByPack.set(pack, list);
  }
  return tryRows(db, "SELECT * FROM enquiry_packs").map((r) => ({
    id: str(r.uuid),
    laneKind: str(r.lane_kind) === "boq" ? ("boq" as const) : ("resource" as const),
    category: nullable(r.category),
    vendorName: str(r.vendor_name),
    status: str(r.status) === "issued" ? ("issued" as const) : ("draft" as const),
    issuedAt: nullable(r.issued_at),
    dueAt: nullable(r.due_at),
    notes: str(r.notes),
    lines: linesByPack.get(str(r.uuid)) ?? [],
  }));
}

function loadQueryLog(db: { exec(sql: string): Array<{ columns: string[]; values: unknown[][] }> }): {
  queryItems: TenderQueryItem[];
  queryLists: TenderQueryList[];
} {
  const repliesByItem = new Map<string, TenderQueryItem["replies"]>();
  for (const r of tryRows(db, "SELECT * FROM tender_query_replies")) {
    const itemId = str(r.item_uuid);
    const list = repliesByItem.get(itemId) ?? [];
    list.push({
      id: str(r.uuid) || `tqr-${list.length + 1}`,
      listId: nullable(r.list_uuid),
      receivedAt: str(r.received_at),
      fromName: str(r.from_name),
      body: str(r.body),
      needsInfo: num(r.needs_info) === 1,
      needsInfoNote: str(r.needs_info_note),
      fields: parseJsonMap(r.fields_json) ?? {},
      attachments: parseAttachments(r.attachments_json),
    });
    repliesByItem.set(itemId, list);
  }
  const queryItems: TenderQueryItem[] = tryRows(db, "SELECT * FROM tender_query_items").map((r) => ({
    id: str(r.uuid),
    number: str(r.number),
    documentRef: str(r.document_ref),
    subject: str(r.subject),
    question: str(r.question),
    createdAt: str(r.created_at),
    carriedFromId: nullable(r.carried_from),
    closedAt: nullable(r.closed_at),
    replies: repliesByItem.get(str(r.uuid)) ?? [],
    attachments: parseAttachments(r.attachments_json),
  }));
  const linesByList = new Map<string, TenderQueryList["lines"]>();
  for (const r of tryRows(db, "SELECT * FROM tender_query_list_lines")) {
    const listId = str(r.list_uuid);
    const list = linesByList.get(listId) ?? [];
    list.push({
      id: str(r.line_uuid) || `qln-${list.length + 1}`,
      itemId: str(r.item_uuid),
      included: num(r.included) !== 0,
      roundNote: str(r.round_note),
      fields: parseJsonMap(r.fields_json) ?? {},
    });
    linesByList.set(listId, list);
  }
  const queryLists: TenderQueryList[] = tryRows(db, "SELECT * FROM tender_query_lists").map((r) => ({
    id: str(r.uuid),
    number: Math.max(1, Math.floor(num(r.list_no) || 1)),
    title: str(r.title),
    status: str(r.status) === "sent" ? ("sent" as const) : ("draft" as const),
    sentAt: nullable(r.sent_at),
    dueAt: nullable(r.due_at),
    notes: str(r.notes),
    lines: linesByList.get(str(r.uuid)) ?? [],
    queryColumns: parseQueryColumns(r.query_columns_json),
    replyColumns: parseQueryColumns(r.reply_columns_json),
    attachments: parseAttachments(r.attachments_json),
  }));
  return { queryItems, queryLists };
}

export async function projectToAero(project: LoadedProject): Promise<Uint8Array> {
  const live = ensureProjectBills(project);
  const SQL = await sqlEngine();
  const db = new SQL.Database();
  db.exec(schemaSql);
  db.exec("PRAGMA user_version = 4");

  const meta = db.prepare("INSERT INTO _meta (key, value) VALUES (?, ?)");
  const put = (k: string, v: string) => {
    meta.run([k, v]);
    meta.reset();
  };
  put("schema_version", "4");
  put("app", "aerolith-core");
  put("name", live.name);
  put("location_note", live.locationNote);
  put("currency", live.currency);
  put("qty_source", live.qtySource);
  put("overhead_pct", String(live.margin.overheadPct));
  put("profit_pct", String(live.margin.profitPct));
  put("logistics_pct", String(live.margin.logisticsPct));
  put("contingency_pct", String(live.margin.contingencyPct));
  put("margin_presets", JSON.stringify(live.marginPresets ?? []));
  put("margin_rules", JSON.stringify(live.marginRules ?? []));
  put("is_demo", live.isDemo ? "1" : "0");
  put("source_locked_at", live.sourceLockedAt ?? "");
  put("sealed_at", live.sealedAt ?? "");
  put("revision", String(live.revision ?? 1));
  put("catalog_version", String(live.catalogVersion ?? 1));
  put("resource_master", JSON.stringify(live.resourceMaster ?? null));
  put("import_needs_review", live.importNeedsReview ? "1" : "0");
  put("client_columns", JSON.stringify(live.clientColumns ?? []));
  put("working_columns", JSON.stringify(live.workingColumns ?? []));
  meta.free();

  const u = db.prepare("INSERT INTO units (code, description, symbol) VALUES (?, ?, ?)");
  for (const row of live.units) {
    u.run([row.code, row.description, row.symbol]);
    u.reset();
  }
  u.free();

  const c = db.prepare("INSERT INTO resource_categories (code, description) VALUES (?, ?)");
  for (const row of live.categories) {
    c.run([row.code, row.description]);
    c.reset();
  }
  c.free();

  const billsStmt = db.prepare(
    `INSERT INTO project_bills (uuid, bill_no, code, name, issued_ref, source_locked_at, sort_order)
     VALUES (?,?,?,?,?,?,?)`,
  );
  live.bills.forEach((b, i) => {
    billsStmt.run([b.id, b.number, b.code, b.name, b.issuedRef, b.sourceLockedAt ?? "", i]);
    billsStmt.reset();
  });
  billsStmt.free();

  const w = db.prepare(
    `INSERT INTO working_boq_items
      (id, parent_id, node_kind, uuid, bill_id, boq_code, client_link_code, sl_no, boq_category, work_category, sub_work_category,
       group1, group2, group3, description, client_qty, our_qty, unit, direct_cost, price_mode, analysis_origin,
       linked_boq_code, extra_json, carry_mode, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const idOf = (it: (typeof live.items)[number], parentCode: string | null) => {
    if (!parentCode) return null;
    const idx = live.items.findIndex((p) => p.billId === it.billId && p.boqCode === parentCode);
    return idx >= 0 ? idx + 1 : null;
  };
  live.items.forEach((it, i) => {
    w.run([
      i + 1,
      idOf(it, it.parentCode),
      it.kind,
      it.id,
      it.billId,
      it.boqCode,
      it.clientLinkCode,
      it.slNo,
      it.boqCategory,
      it.workCategory,
      it.subWorkCategory,
      it.group1,
      it.group2,
      it.group3,
      it.description,
      it.clientQty,
      it.ourQty,
      it.unit,
      it.directCost ?? 0,
      it.priceMode ?? null,
      it.analysisOrigin ?? "own",
      it.linkedBoqCode ?? null,
      it.extra && Object.keys(it.extra).length ? JSON.stringify(it.extra) : null,
      it.carryMode && it.carryMode !== "normal" ? it.carryMode : null,
      i,
    ]);
    w.reset();
  });
  w.free();

  const ln = db.prepare(
    `INSERT INTO rate_analysis_lines
      (boq_code, sl, project_resource_code, description, unit, f1, f2, f3, f4, f5, f6,
       wastage_pct, resource_rate)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const it of live.items) {
    it.lines.forEach((line, i) => {
      const f = line.factors;
      ln.run([
        itemKeyOf(it),
        i + 1,
        line.projectResourceCode ?? null,
        line.description ?? null,
        line.unit ?? null,
        f[0] ?? null,
        f[1] ?? null,
        f[2] ?? null,
        f[3] ?? null,
        f[4] ?? null,
        f[5] ?? null,
        line.wastagePct,
        line.resourceRate,
      ]);
      ln.reset();
    });
  }
  ln.free();

  const pr = db.prepare(
    `INSERT INTO project_resources
      (global_code, project_code, category, type, sub_type, description, unit,
       project_wastage_pct, project_rate, rate_source)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const r of live.resources) {
    pr.run([
      r.global_code,
      r.project_code,
      r.category,
      r.type,
      r.sub_type,
      r.description,
      r.unit,
      r.project_wastage_pct,
      r.project_rate,
      r.rate_source ?? null,
    ]);
    pr.reset();
  }
  pr.free();

  const vn = db.prepare("INSERT INTO vendors (name) VALUES (?)");
  for (const v of live.vendors) {
    vn.run([v.name]);
    vn.reset();
  }
  vn.free();

  const cn = db.prepare(
    "INSERT INTO client_boq_nodes (row_no, kind, sl_no, description, qty, unit, extra_json, bill_id, boq_code) VALUES (?,?,?,?,?,?,?,?,?)",
  );
  for (const n of live.clientNodes) {
    cn.run([
      n.row,
      n.kind,
      n.sl_no ?? null,
      n.description ?? null,
      n.qty ?? null,
      n.unit ?? null,
      n.extra && Object.keys(n.extra).length ? JSON.stringify(n.extra) : null,
      n.billId ?? live.bills[0]?.id ?? DEFAULT_BILL_ID,
      n.boqCode ?? null,
    ]);
    cn.reset();
  }
  cn.free();

  const q = db.prepare(
    `INSERT INTO qto_lines
      (work_category, drawing, location_desc, item_label, sub_item, formula_key,
       nos1, nos2, l, b, h, t, working_boq_code, bill_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const line of live.qtoLines) {
    q.run([
      line.workCategory,
      line.drawing,
      line.locationDesc,
      line.itemLabel,
      line.subItem,
      line.formulaKey,
      line.dims.nos1 ?? null,
      line.dims.nos2 ?? null,
      line.dims.l ?? null,
      line.dims.b ?? null,
      line.dims.h ?? null,
      line.dims.t ?? null,
      line.workingBoqCode,
      line.billId ?? null,
    ]);
    q.reset();
  }
  q.free();

  const rq = db.prepare(
    `INSERT INTO resource_quotes
      (uuid, project_resource_code, vendor_name, rate, is_selected, enquiry_id, reply_id, quoted_qty, remarks,
       valid_until, payment_terms, line_fields)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const quote of live.resourceQuotes) {
    rq.run([
      quote.id,
      quote.projectResourceCode,
      quote.vendorName,
      quote.rate,
      quote.selected ? 1 : 0,
      quote.enquiryId ?? null,
      quote.replyId ?? null,
      quote.quotedQty ?? null,
      quote.remarks ?? null,
      quote.validUntil ?? null,
      quote.paymentTerms ?? null,
      quote.lineFields ? JSON.stringify(quote.lineFields) : null,
    ]);
    rq.reset();
  }
  rq.free();

  const iq = db.prepare(
    `INSERT INTO item_quotes
      (uuid, boq_code, bill_id, vendor_name, rate, is_selected, enquiry_id, reply_id, quoted_qty, remarks,
       valid_until, payment_terms, line_fields)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const quote of live.itemQuotes) {
    iq.run([
      quote.id,
      quote.boqCode,
      quote.billId ?? null,
      quote.vendorName,
      quote.rate,
      quote.selected ? 1 : 0,
      quote.enquiryId ?? null,
      quote.replyId ?? null,
      quote.quotedQty ?? null,
      quote.remarks ?? null,
      quote.validUntil ?? null,
      quote.paymentTerms ?? null,
      quote.lineFields ? JSON.stringify(quote.lineFields) : null,
    ]);
    iq.reset();
  }
  iq.free();

  const ep = db.prepare(
    `INSERT INTO enquiry_packs (uuid, lane_kind, category, vendor_name, status, issued_at, due_at, notes)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  const el = db.prepare(
    `INSERT INTO enquiry_lines (pack_uuid, line_uuid, target_kind, target_code, qty, unit, spec, included)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  for (const pack of live.enquiries ?? []) {
    ep.run([pack.id, pack.laneKind, pack.category, pack.vendorName, pack.status, pack.issuedAt, pack.dueAt ?? null, pack.notes]);
    ep.reset();
    for (const line of pack.lines) {
      el.run([
        pack.id,
        line.id,
        line.targetKind,
        line.targetCode,
        line.qty,
        line.unit,
        line.spec,
        line.included ? 1 : 0,
      ]);
      el.reset();
    }
  }
  ep.free();
  el.free();

  const qr = db.prepare(
    `INSERT INTO quote_replies
      (uuid, vendor_name, enquiry_id, received_at, valid_until, payment_terms, duration, currency, header_json)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  for (const reply of live.quoteReplies ?? []) {
    qr.run([
      reply.id,
      reply.vendorName,
      reply.enquiryId,
      reply.receivedAt,
      reply.validUntil,
      reply.paymentTerms,
      reply.duration ?? "",
      reply.currency,
      JSON.stringify(reply.headerFields ?? {}),
    ]);
    qr.reset();
  }
  qr.free();

  const fd = db.prepare("INSERT INTO quote_field_defs (uuid, label, value_type, scope, compare_flag) VALUES (?,?,?,?,?)");
  for (const def of live.quoteFieldDefs ?? []) {
    fd.run([def.id, def.label, def.valueType, def.scope, def.compare ? 1 : 0]);
    fd.reset();
  }
  fd.free();

  const tqi = db.prepare(
    `INSERT INTO tender_query_items
      (uuid, number, document_ref, subject, question, created_at, carried_from, closed_at, attachments_json)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  const tqr = db.prepare(
    `INSERT INTO tender_query_replies
      (item_uuid, uuid, list_uuid, received_at, from_name, body, needs_info, needs_info_note, fields_json, attachments_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const item of live.queryItems ?? []) {
    tqi.run([
      item.id,
      item.number,
      item.documentRef,
      item.subject,
      item.question,
      item.createdAt,
      item.carriedFromId,
      item.closedAt,
      JSON.stringify(item.attachments ?? []),
    ]);
    tqi.reset();
    for (const reply of item.replies) {
      tqr.run([
        item.id,
        reply.id,
        reply.listId,
        reply.receivedAt,
        reply.fromName,
        reply.body,
        reply.needsInfo ? 1 : 0,
        reply.needsInfoNote,
        JSON.stringify(reply.fields ?? {}),
        JSON.stringify(reply.attachments ?? []),
      ]);
      tqr.reset();
    }
  }
  tqi.free();
  tqr.free();

  const tql = db.prepare(
    `INSERT INTO tender_query_lists
      (uuid, list_no, title, status, sent_at, due_at, notes, query_columns_json, reply_columns_json, attachments_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const tqll = db.prepare(
    `INSERT INTO tender_query_list_lines (list_uuid, line_uuid, item_uuid, included, round_note, fields_json)
     VALUES (?,?,?,?,?,?)`,
  );
  for (const pack of live.queryLists ?? []) {
    tql.run([
      pack.id,
      pack.number,
      pack.title,
      pack.status,
      pack.sentAt,
      pack.dueAt,
      pack.notes,
      JSON.stringify(pack.queryColumns ?? []),
      JSON.stringify(pack.replyColumns ?? []),
      JSON.stringify(pack.attachments ?? []),
    ]);
    tql.reset();
    for (const line of pack.lines) {
      tqll.run([pack.id, line.id, line.itemId, line.included ? 1 : 0, line.roundNote, JSON.stringify(line.fields ?? {})]);
      tqll.reset();
    }
  }
  tql.free();
  tqll.free();

  const inc = db.prepare(
    `INSERT INTO rate_analysis_includes
      (host_boq_code, source_boq_code, relation, factor, snapshot_unit_cost, snapshot_json)
     VALUES (?,?,?,?,?,?)`,
  );
  for (const it of live.items) {
    for (const row of it.includes ?? []) {
      inc.run([
        itemKeyOf(it),
        row.sourceBoqCode,
        row.relation,
        row.factor,
        row.snapshotUnitCost ?? null,
        row.snapshotLines ? JSON.stringify(row.snapshotLines) : null,
      ]);
      inc.reset();
    }
  }
  inc.free();

  const bytes = db.export();
  db.close();
  return bytes;
}

export async function aeroToProject(bytes: Uint8Array): Promise<LoadedProject> {
  const SQL = await sqlEngine();
  const db = new SQL.Database(bytes);
  try {
    db.exec(schemaSql);
  } catch {
    /* existing file already has tables */
  }
  for (const sql of [
    "ALTER TABLE working_boq_items ADD COLUMN uuid TEXT",
    "ALTER TABLE working_boq_items ADD COLUMN bill_id TEXT",
    "ALTER TABLE client_boq_nodes ADD COLUMN bill_id TEXT",
    "ALTER TABLE client_boq_nodes ADD COLUMN boq_code TEXT",
    "ALTER TABLE qto_lines ADD COLUMN bill_id TEXT",
    "ALTER TABLE item_quotes ADD COLUMN bill_id TEXT",
    `CREATE TABLE IF NOT EXISTS project_bills (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL,
      bill_no INTEGER NOT NULL,
      code TEXT,
      name TEXT,
      issued_ref TEXT,
      source_locked_at TEXT,
      sort_order INTEGER NOT NULL
    )`,
    "ALTER TABLE working_boq_items ADD COLUMN client_link_code TEXT",
    "ALTER TABLE working_boq_items ADD COLUMN price_mode TEXT",
    "ALTER TABLE working_boq_items ADD COLUMN analysis_origin TEXT",
    "ALTER TABLE working_boq_items ADD COLUMN linked_boq_code TEXT",
    "ALTER TABLE working_boq_items ADD COLUMN extra_json TEXT",
    "ALTER TABLE working_boq_items ADD COLUMN carry_mode TEXT",
    "ALTER TABLE client_boq_nodes ADD COLUMN extra_json TEXT",
    `CREATE TABLE IF NOT EXISTS rate_analysis_includes (
      id INTEGER PRIMARY KEY,
      host_boq_code TEXT NOT NULL,
      source_boq_code TEXT NOT NULL,
      relation TEXT NOT NULL,
      factor REAL NOT NULL DEFAULT 1,
      snapshot_unit_cost REAL,
      snapshot_json TEXT
    )`,
    "ALTER TABLE resource_quotes ADD COLUMN uuid TEXT",
    "ALTER TABLE resource_quotes ADD COLUMN enquiry_id TEXT",
    "ALTER TABLE resource_quotes ADD COLUMN reply_id TEXT",
    "ALTER TABLE resource_quotes ADD COLUMN quoted_qty REAL",
    "ALTER TABLE resource_quotes ADD COLUMN remarks TEXT",
    "ALTER TABLE resource_quotes ADD COLUMN valid_until TEXT",
    "ALTER TABLE resource_quotes ADD COLUMN payment_terms TEXT",
    "ALTER TABLE resource_quotes ADD COLUMN line_fields TEXT",
    "ALTER TABLE item_quotes ADD COLUMN uuid TEXT",
    "ALTER TABLE item_quotes ADD COLUMN enquiry_id TEXT",
    "ALTER TABLE item_quotes ADD COLUMN reply_id TEXT",
    "ALTER TABLE item_quotes ADD COLUMN quoted_qty REAL",
    "ALTER TABLE item_quotes ADD COLUMN remarks TEXT",
    "ALTER TABLE item_quotes ADD COLUMN valid_until TEXT",
    "ALTER TABLE item_quotes ADD COLUMN payment_terms TEXT",
    "ALTER TABLE item_quotes ADD COLUMN line_fields TEXT",
    `CREATE TABLE IF NOT EXISTS enquiry_packs (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL,
      lane_kind TEXT NOT NULL,
      category TEXT,
      vendor_name TEXT NOT NULL,
      status TEXT NOT NULL,
      issued_at TEXT,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS enquiry_lines (
      id INTEGER PRIMARY KEY,
      pack_uuid TEXT NOT NULL,
      line_uuid TEXT NOT NULL,
      target_kind TEXT NOT NULL,
      target_code TEXT NOT NULL,
      qty REAL,
      unit TEXT,
      spec TEXT,
      included INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS quote_replies (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL,
      vendor_name TEXT NOT NULL,
      enquiry_id TEXT,
      received_at TEXT,
      valid_until TEXT,
      payment_terms TEXT,
      currency TEXT,
      header_json TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS quote_field_defs (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL,
      label TEXT NOT NULL,
      value_type TEXT NOT NULL,
      scope TEXT NOT NULL
    )`,
    "ALTER TABLE enquiry_packs ADD COLUMN due_at TEXT",
    "ALTER TABLE quote_replies ADD COLUMN duration TEXT",
    "ALTER TABLE quote_field_defs ADD COLUMN compare_flag INTEGER",
    `CREATE TABLE IF NOT EXISTS tender_query_items (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL,
      number TEXT NOT NULL,
      document_ref TEXT,
      subject TEXT,
      question TEXT,
      created_at TEXT,
      carried_from TEXT,
      closed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS tender_query_replies (
      id INTEGER PRIMARY KEY,
      item_uuid TEXT NOT NULL,
      uuid TEXT NOT NULL,
      list_uuid TEXT,
      received_at TEXT,
      from_name TEXT,
      body TEXT,
      needs_info INTEGER NOT NULL DEFAULT 0,
      needs_info_note TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS tender_query_lists (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL,
      list_no INTEGER NOT NULL,
      title TEXT,
      status TEXT NOT NULL,
      sent_at TEXT,
      due_at TEXT,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS tender_query_list_lines (
      id INTEGER PRIMARY KEY,
      list_uuid TEXT NOT NULL,
      line_uuid TEXT NOT NULL,
      item_uuid TEXT NOT NULL,
      included INTEGER NOT NULL DEFAULT 1,
      round_note TEXT
    )`,
    "ALTER TABLE tender_query_items ADD COLUMN attachments_json TEXT",
    "ALTER TABLE tender_query_replies ADD COLUMN fields_json TEXT",
    "ALTER TABLE tender_query_replies ADD COLUMN attachments_json TEXT",
    "ALTER TABLE tender_query_lists ADD COLUMN query_columns_json TEXT",
    "ALTER TABLE tender_query_lists ADD COLUMN reply_columns_json TEXT",
    "ALTER TABLE tender_query_lists ADD COLUMN attachments_json TEXT",
    "ALTER TABLE tender_query_list_lines ADD COLUMN fields_json TEXT",
  ]) {
    try {
      db.exec(sql);
    } catch {
      /* column already exists */
    }
  }
  const metaRows = rows(db, "SELECT key, value FROM _meta");
  const meta = Object.fromEntries(metaRows.map((r) => [str(r.key), str(r.value)]));

  const lineRows = rows(db, "SELECT * FROM rate_analysis_lines ORDER BY sl");
  const linesByCode = new Map<string, WorkingItem["lines"]>();
  for (const r of lineRows) {
    const code = str(r.boq_code);
    const list = linesByCode.get(code) ?? [];
    list.push({
      factors: [r.f1, r.f2, r.f3, r.f4, r.f5, r.f6].map((f) => (f == null ? null : num(f))),
      wastagePct: num(r.wastage_pct),
      resourceRate: num(r.resource_rate),
      description: nullable(r.description),
      projectResourceCode: nullable(r.project_resource_code),
      unit: nullable(r.unit),
    });
    linesByCode.set(code, list);
  }

  const includesByCode = new Map<string, NonNullable<WorkingItem["includes"]>>();
  for (const r of tryRows(db, "SELECT * FROM rate_analysis_includes")) {
    const host = str(r.host_boq_code);
    const list = includesByCode.get(host) ?? [];
    let snapshotLines: WorkingItem["lines"] | undefined;
    const raw = nullable(r.snapshot_json);
    if (raw) {
      try {
        snapshotLines = JSON.parse(raw) as WorkingItem["lines"];
      } catch {
        snapshotLines = undefined;
      }
    }
    list.push({
      id: str(r.id) || `inc-${list.length + 1}`,
      sourceBoqCode: str(r.source_boq_code),
      relation: str(r.relation) === "clone" ? "clone" : "link",
      factor: num(r.factor) || 1,
      snapshotUnitCost: r.snapshot_unit_cost == null ? undefined : num(r.snapshot_unit_cost),
      snapshotLines,
    });
    includesByCode.set(host, list);
  }

  const itemRows = rows(db, "SELECT * FROM working_boq_items ORDER BY sort_order");
  const items: WorkingItem[] = itemRows.map((r) => {
    const boqCode = str(r.boq_code);
    const billId = nullable(r.bill_id) || DEFAULT_BILL_ID;
    const key = `${billId}::${boqCode}`;
    const kind = str(r.node_kind) === "section" ? "section" : "item";
    return stampItem({
      id: nullable(r.uuid) ?? undefined,
      billId,
      boqCode,
      clientLinkCode: nullable(r.client_link_code) ?? boqCode,
      slNo: str(r.sl_no),
      kind,
      description: str(r.description),
      boqCategory: nullable(r.boq_category),
      workCategory: nullable(r.work_category),
      subWorkCategory: nullable(r.sub_work_category),
      group1: nullable(r.group1),
      group2: nullable(r.group2),
      group3: nullable(r.group3),
      clientQty: num(r.client_qty),
      ourQty: num(r.our_qty),
      unit: nullable(r.unit),
      directCost: num(r.direct_cost),
      priceMode: str(r.price_mode) === "direct" ? "direct" : str(r.price_mode) === "analysis" ? "analysis" : undefined,
      analysisOrigin:
        str(r.analysis_origin) === "link" || str(r.analysis_origin) === "clone"
          ? (str(r.analysis_origin) as "link" | "clone")
          : "own",
      linkedBoqCode: nullable(r.linked_boq_code),
      includes: includesByCode.get(key) ?? includesByCode.get(boqCode) ?? [],
      extra: parseJsonMap(r.extra_json) ?? {},
      carryMode: normalizeBoqCarry(r.carry_mode),
      lines: linesByCode.get(key) ?? linesByCode.get(boqCode) ?? [],
      parentCode: null,
    });
  });
  const byDbId = new Map(itemRows.map((r, i) => [num(r.id), items[i]!]));
  for (const r of itemRows) {
    const item = byDbId.get(num(r.id));
    if (!item) continue;
    if (r.parent_id == null) {
      item.parentCode = null;
      continue;
    }
    item.parentCode = byDbId.get(num(r.parent_id))?.boqCode ?? null;
  }

  const loadedBills = tryRows(db, "SELECT * FROM project_bills ORDER BY sort_order").map((r) => ({
    id: str(r.uuid) || DEFAULT_BILL_ID,
    number: Math.max(1, Math.floor(num(r.bill_no) || 1)),
    code: str(r.code) || "1",
    name: str(r.name) || "BOQ 1",
    issuedRef: str(r.issued_ref),
    sourceLockedAt: nullable(r.source_locked_at),
  }));

  const project: LoadedProject = {
    name: meta.name || "Untitled project",
    locationNote: meta.location_note || "",
    margin: {
      overheadPct: num(meta.overhead_pct),
      profitPct: num(meta.profit_pct),
      logisticsPct: num(meta.logistics_pct),
      contingencyPct: num(meta.contingency_pct),
    },
    marginPresets: parseMarginPresets(parseJsonValue(meta.margin_presets)),
    marginRules: parseMarginRules(parseJsonValue(meta.margin_rules)),
    currency: meta.currency || "INR",
    qtySource: "client_plus_adjustments",
    bills: loadedBills,
    items,
    clientColumns: parseColumnDefs(meta.client_columns) ?? defaultClientColumns(),
    workingColumns: parseColumnDefs(meta.working_columns) ?? [],
    resourceMaster: parseStoredResourceMaster(meta.resource_master),
    resources: rows(db, "SELECT * FROM project_resources").map((r) => ({
      project_code: str(r.project_code),
      global_code: nullable(r.global_code),
      category: nullable(r.category),
      type: nullable(r.type),
      sub_type: nullable(r.sub_type),
      description: nullable(r.description),
      unit: nullable(r.unit),
      project_wastage_pct: r.project_wastage_pct == null ? null : num(r.project_wastage_pct),
      project_rate: r.project_rate == null ? null : num(r.project_rate),
      rate_source: nullable(r.rate_source) as LoadedProject["resources"][number]["rate_source"],
      total_qty: null,
      total_amount: null,
    })),
    units: rows(db, "SELECT * FROM units").map((r) => ({
      code: str(r.code),
      description: str(r.description),
      symbol: str(r.symbol),
    })),
    categories: rows(db, "SELECT * FROM resource_categories").map((r) => ({
      code: str(r.code),
      description: str(r.description),
    })),
    vendors: tryRows(db, "SELECT * FROM vendors").map((r, i) => ({
      id: `v-${i + 1}`,
      name: str(r.name),
    })),
    clientNodes: tryRows(db, "SELECT * FROM client_boq_nodes ORDER BY row_no").map((r) => ({
      row: num(r.row_no),
      kind: str(r.kind),
      sl_no: nullable(r.sl_no) ?? undefined,
      description: nullable(r.description) ?? undefined,
      qty: r.qty == null ? undefined : num(r.qty),
      unit: nullable(r.unit) ?? undefined,
      extra: parseJsonMap(r.extra_json) ?? {},
      billId: nullable(r.bill_id) ?? undefined,
      boqCode: nullable(r.boq_code) ?? undefined,
    })),
    qtoLines: tryRows(db, "SELECT * FROM qto_lines").map((r, i) => ({
      id: `qto-${i + 1}`,
      billId: nullable(r.bill_id) ?? undefined,
      workCategory: nullable(r.work_category),
      drawing: nullable(r.drawing),
      locationDesc: nullable(r.location_desc),
      itemLabel: nullable(r.item_label),
      subItem: nullable(r.sub_item),
      formulaKey: (str(r.formula_key) || "qty") as FormulaKey,
      dims: {
        nos1: r.nos1 == null ? null : num(r.nos1),
        nos2: r.nos2 == null ? null : num(r.nos2),
        l: r.l == null ? null : num(r.l),
        b: r.b == null ? null : num(r.b),
        h: r.h == null ? null : num(r.h),
        t: r.t == null ? null : num(r.t),
      },
      workingBoqCode: nullable(r.working_boq_code),
    })),
    resourceQuotes: tryRows(db, "SELECT * FROM resource_quotes").map((r, i) => ({
      id: nullable(r.uuid) || `rq-${i + 1}`,
      projectResourceCode: str(r.project_resource_code),
      vendorName: str(r.vendor_name),
      rate: num(r.rate),
      selected: num(r.is_selected) === 1,
      enquiryId: nullable(r.enquiry_id),
      replyId: nullable(r.reply_id),
      quotedQty: r.quoted_qty == null ? null : num(r.quoted_qty),
      remarks: nullable(r.remarks),
      validUntil: nullable(r.valid_until),
      paymentTerms: nullable(r.payment_terms),
      lineFields: parseJsonMap(r.line_fields),
    })),
    itemQuotes: tryRows(db, "SELECT * FROM item_quotes").map((r, i) => ({
      id: nullable(r.uuid) || `iq-${i + 1}`,
      billId: nullable(r.bill_id) ?? undefined,
      boqCode: str(r.boq_code),
      vendorName: str(r.vendor_name),
      rate: num(r.rate),
      selected: num(r.is_selected) === 1,
      enquiryId: nullable(r.enquiry_id),
      replyId: nullable(r.reply_id),
      quotedQty: r.quoted_qty == null ? null : num(r.quoted_qty),
      remarks: nullable(r.remarks),
      validUntil: nullable(r.valid_until),
      paymentTerms: nullable(r.payment_terms),
      lineFields: parseJsonMap(r.line_fields),
    })),
    enquiries: loadEnquiries(db),
    quoteReplies: tryRows(db, "SELECT * FROM quote_replies").map((r) => ({
      id: str(r.uuid),
      vendorName: str(r.vendor_name),
      enquiryId: nullable(r.enquiry_id),
      receivedAt: str(r.received_at),
      validUntil: nullable(r.valid_until),
      paymentTerms: str(r.payment_terms),
      duration: str(r.duration),
      currency: str(r.currency) || meta.currency || "INR",
      headerFields: parseJsonMap(r.header_json) ?? {},
    })),
    quoteFieldDefs: tryRows(db, "SELECT * FROM quote_field_defs").map((r) => ({
      id: str(r.uuid),
      label: str(r.label),
      valueType:
        str(r.value_type) === "number" || str(r.value_type) === "date" || str(r.value_type) === "money"
          ? (str(r.value_type) as QuoteFieldDef["valueType"])
          : "text",
      scope: str(r.scope) === "line" || str(r.scope) === "both" ? (str(r.scope) as QuoteFieldDef["scope"]) : "header",
      compare: r.compare_flag == null ? true : num(r.compare_flag) !== 0,
      builtin: ["spec", "duration", "payment"].includes(str(r.uuid)),
    })),
    ...loadQueryLog(db),
    sourceLockedAt: meta.source_locked_at || null,
    sealedAt: meta.sealed_at || null,
    revision: Math.max(1, Math.floor(num(meta.revision) || 1)),
    catalogVersion: Math.max(1, Math.floor(num(meta.catalog_version) || 1)),
    importNeedsReview: meta.import_needs_review === "1",
    isDemo: meta.is_demo === "1",
  };
  db.close();
  return ensureProjectBills(project);
}

export function downloadAero(bytes: Uint8Array, filename: string): void {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".aero") ? filename : `${filename}.aero`;
  a.click();
  URL.revokeObjectURL(url);
}
