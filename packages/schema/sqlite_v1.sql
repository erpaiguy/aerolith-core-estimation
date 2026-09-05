CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  description TEXT,
  symbol TEXT
);

CREATE TABLE IF NOT EXISTS resource_categories (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_bills (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL,
  bill_no INTEGER NOT NULL,
  code TEXT,
  name TEXT,
  issued_ref TEXT,
  source_locked_at TEXT,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS working_boq_items (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER,
  node_kind TEXT NOT NULL,
  uuid TEXT,
  bill_id TEXT,
  boq_code TEXT,
  client_link_code TEXT,
  sl_no TEXT,
  boq_category TEXT,
  work_category TEXT,
  sub_work_category TEXT,
  group1 TEXT,
  group2 TEXT,
  group3 TEXT,
  description TEXT,
  client_qty REAL,
  our_qty REAL,
  unit TEXT,
  direct_cost REAL,
  price_mode TEXT,
  analysis_origin TEXT,
  linked_boq_code TEXT,
      extra_json TEXT,
      carry_mode TEXT,
      sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_analysis_lines (
  id INTEGER PRIMARY KEY,
  boq_code TEXT NOT NULL,
  sl INTEGER,
  project_resource_code TEXT,
  description TEXT,
  unit TEXT,
  f1 REAL, f2 REAL, f3 REAL, f4 REAL, f5 REAL, f6 REAL,
  wastage_pct REAL,
  resource_rate REAL
);

CREATE TABLE IF NOT EXISTS project_resources (
  id INTEGER PRIMARY KEY,
  global_code TEXT,
  project_code TEXT NOT NULL,
  category TEXT,
  type TEXT,
  sub_type TEXT,
  description TEXT,
  unit TEXT,
  project_wastage_pct REAL,
  project_rate REAL,
  rate_source TEXT
);

CREATE TABLE IF NOT EXISTS client_boq_nodes (
  id INTEGER PRIMARY KEY,
  row_no INTEGER,
  kind TEXT NOT NULL,
  sl_no TEXT,
  description TEXT,
  qty REAL,
  unit TEXT,
  extra_json TEXT,
  bill_id TEXT,
  boq_code TEXT
);

CREATE TABLE IF NOT EXISTS qto_lines (
  id INTEGER PRIMARY KEY,
  work_category TEXT,
  drawing TEXT,
  location_desc TEXT,
  item_label TEXT,
  sub_item TEXT,
  formula_key TEXT NOT NULL,
  nos1 REAL, nos2 REAL, l REAL, b REAL, h REAL, t REAL,
  working_boq_code TEXT,
  bill_id TEXT
);

CREATE TABLE IF NOT EXISTS resource_quotes (
  id INTEGER PRIMARY KEY,
  uuid TEXT,
  project_resource_code TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  rate REAL,
  is_selected INTEGER NOT NULL DEFAULT 0,
  enquiry_id TEXT,
  reply_id TEXT,
  quoted_qty REAL,
  remarks TEXT,
  valid_until TEXT,
  payment_terms TEXT,
  line_fields TEXT
);

CREATE TABLE IF NOT EXISTS item_quotes (
  id INTEGER PRIMARY KEY,
  uuid TEXT,
  boq_code TEXT NOT NULL,
  bill_id TEXT,
  vendor_name TEXT NOT NULL,
  rate REAL,
  is_selected INTEGER NOT NULL DEFAULT 0,
  enquiry_id TEXT,
  reply_id TEXT,
  quoted_qty REAL,
  remarks TEXT,
  valid_until TEXT,
  payment_terms TEXT,
  line_fields TEXT
);

CREATE TABLE IF NOT EXISTS enquiry_packs (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL,
  lane_kind TEXT NOT NULL,
  category TEXT,
  vendor_name TEXT NOT NULL,
  status TEXT NOT NULL,
  issued_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS enquiry_lines (
  id INTEGER PRIMARY KEY,
  pack_uuid TEXT NOT NULL,
  line_uuid TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_code TEXT NOT NULL,
  qty REAL,
  unit TEXT,
  spec TEXT,
  included INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS quote_replies (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  enquiry_id TEXT,
  received_at TEXT,
  valid_until TEXT,
  payment_terms TEXT,
  currency TEXT,
  header_json TEXT
);

CREATE TABLE IF NOT EXISTS quote_field_defs (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL,
  label TEXT NOT NULL,
  value_type TEXT NOT NULL,
  scope TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tender_query_items (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL,
  number TEXT NOT NULL,
  document_ref TEXT,
  subject TEXT,
  question TEXT,
  created_at TEXT,
  carried_from TEXT,
  closed_at TEXT,
  attachments_json TEXT
);

CREATE TABLE IF NOT EXISTS tender_query_replies (
  id INTEGER PRIMARY KEY,
  item_uuid TEXT NOT NULL,
  uuid TEXT NOT NULL,
  list_uuid TEXT,
  received_at TEXT,
  from_name TEXT,
  body TEXT,
  needs_info INTEGER NOT NULL DEFAULT 0,
  needs_info_note TEXT,
  fields_json TEXT,
  attachments_json TEXT
);

CREATE TABLE IF NOT EXISTS tender_query_lists (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL,
  list_no INTEGER NOT NULL,
  title TEXT,
  status TEXT NOT NULL,
  sent_at TEXT,
  due_at TEXT,
  notes TEXT,
  query_columns_json TEXT,
  reply_columns_json TEXT,
  attachments_json TEXT
);

CREATE TABLE IF NOT EXISTS tender_query_list_lines (
  id INTEGER PRIMARY KEY,
  list_uuid TEXT NOT NULL,
  line_uuid TEXT NOT NULL,
  item_uuid TEXT NOT NULL,
  included INTEGER NOT NULL DEFAULT 1,
  round_note TEXT,
  fields_json TEXT
);

CREATE TABLE IF NOT EXISTS rate_analysis_includes (
  id INTEGER PRIMARY KEY,
  host_boq_code TEXT NOT NULL,
  source_boq_code TEXT NOT NULL,
  relation TEXT NOT NULL,
  factor REAL NOT NULL DEFAULT 1,
  snapshot_unit_cost REAL,
  snapshot_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_working_boq_code ON working_boq_items(boq_code);
CREATE INDEX IF NOT EXISTS idx_working_bill ON working_boq_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_working_uuid ON working_boq_items(uuid);
CREATE INDEX IF NOT EXISTS idx_working_client_link ON working_boq_items(client_link_code);
CREATE INDEX IF NOT EXISTS idx_rate_boq ON rate_analysis_lines(boq_code);
CREATE INDEX IF NOT EXISTS idx_qto_boq ON qto_lines(working_boq_code);
CREATE INDEX IF NOT EXISTS idx_res_code ON project_resources(project_code);
CREATE INDEX IF NOT EXISTS idx_quotes_res ON resource_quotes(project_resource_code);
CREATE INDEX IF NOT EXISTS idx_quotes_item ON item_quotes(boq_code);
CREATE INDEX IF NOT EXISTS idx_includes_host ON rate_analysis_includes(host_boq_code);
CREATE INDEX IF NOT EXISTS idx_enquiry_pack ON enquiry_lines(pack_uuid);
CREATE INDEX IF NOT EXISTS idx_quote_reply ON quote_replies(uuid);
CREATE INDEX IF NOT EXISTS idx_tender_query_item ON tender_query_items(uuid);
CREATE INDEX IF NOT EXISTS idx_tender_query_reply ON tender_query_replies(item_uuid);
CREATE INDEX IF NOT EXISTS idx_tender_query_list ON tender_query_list_lines(list_uuid);
