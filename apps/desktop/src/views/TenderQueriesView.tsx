import { useMemo, useState } from "react";
import type { LoadedProject, QueryAttachment, QueryColumnDef, TenderQueryItem, TenderQueryList, TenderQueryReply } from "../model";
import {
  addItemAttachments,
  addItemToList,
  addListAttachments,
  addListColumn,
  addReplyAttachments,
  attachmentsFromFiles,
  attachmentSrc,
  blankQueryItem,
  blankQueryList,
  carryPendingToList,
  closeQuery,
  copyListColumns,
  deleteQueryItem,
  deleteQueryList,
  deleteQueryReply,
  downloadText,
  draftQueryList,
  includedItems,
  importQueryReplies,
  issueQueryList,
  latestReply,
  listsForItem,
  logQueryReply,
  parseQueryReplyCsv,
  pendingItems,
  printQueryList,
  queryCoverage,
  queryItem,
  queryListCsv,
  removeItemAttachment,
  removeLineFromList,
  removeListAttachment,
  removeListColumn,
  removeReplyAttachment,
  reopenQuery,
  setLineField,
  trackLabel,
  trackQuery,
  upsertQueryItem,
  upsertQueryList,
  type QueryStage,
  type QueryTrackStatus,
} from "../tenderQueries";
import { VirtualTable } from "../ui/VirtualTable";
import { Split } from "../ui/Split";
import { DataTable } from "../ui/tableLayout";
import { MenuSelect } from "../ui/MenuSelect";

const STAGES: Array<[QueryStage, string]> = [
  ["log", "Log"],
  ["tracker", "Tracker"],
  ["send", "Send"],
  ["receive", "Receive"],
  ["pending", "Pending"],
];

export function TenderQueriesView({
  project,
  onProject,
  locked,
}: {
  project: LoadedProject;
  onProject: (next: LoadedProject) => void;
  locked?: boolean;
}) {
  const [stage, setStage] = useState<QueryStage>("log");
  const [focusListId, setFocusListId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const cov = queryCoverage(project);
  const openCount = cov.pending + cov.overdue + cov.needsInfo;
  const donePct = cov.total ? (100 * (cov.answered + cov.closed)) / cov.total : 0;
  const pendingPct = cov.total ? (100 * openCount) / cov.total : 0;

  return (
    <div className="buy-workspace queries-workspace">
      <div className="buy-toolbar">
        <strong className="buy-title">Client Queries</strong>
        <div className="seg buy-stages" role="tablist" aria-label="Query stage">
          {STAGES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={stage === id ? "primary" : ""}
              aria-selected={stage === id}
              onClick={() => setStage(id)}
            >
              {label}
              {id === "pending" && openCount ? ` ${openCount}` : ""}
            </button>
          ))}
        </div>
        <div
          className="buy-cov"
          title={`${openCount} still open · ${cov.answered} answered · ${cov.closed} closed of ${cov.total}`}
        >
          <span>
            open {openCount}/{cov.total} · answered {cov.answered}
          </span>
          <span className="buy-bars">
            <span className="bar">
              <i style={{ width: `${pendingPct}%` }} />
            </span>
            <span className="bar">
              <i className="total" style={{ width: `${donePct}%` }} />
            </span>
          </span>
        </div>
      </div>
      <fieldset className="plain buy-body" disabled={locked}>
        {stage === "log" ? (
          <LogStage
            project={project}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onProject={onProject}
            onOpenReceive={(listId, itemId) => {
              setFocusListId(listId);
              setSelectedId(itemId);
              setStage("receive");
            }}
          />
        ) : null}
        {stage === "tracker" ? (
          <TrackerStage
            project={project}
            onProject={onProject}
            onOpenReceive={(id) => {
              setFocusListId(id);
              setStage("receive");
            }}
          />
        ) : null}
        {stage === "send" ? (
          <SendStage
            project={project}
            focusListId={focusListId}
            onProject={onProject}
            onFocusList={setFocusListId}
          />
        ) : null}
        {stage === "receive" ? (
          <ReceiveStage project={project} focusListId={focusListId} onProject={onProject} onFocusList={setFocusListId} />
        ) : null}
        {stage === "pending" ? (
          <PendingStage
            project={project}
            onProject={onProject}
            onOpenSend={(id) => {
              setFocusListId(id);
              setStage("send");
            }}
            onOpenReceive={(id) => {
              setFocusListId(id);
              setStage("receive");
            }}
          />
        ) : null}
      </fieldset>
    </div>
  );
}

function StatusBadge({ status }: { status: QueryTrackStatus }) {
  return <span className={`badge ${status}`}>{trackLabel(status)}</span>;
}

function LogStage({
  project,
  selectedId,
  onSelect,
  onProject,
  onOpenReceive,
}: {
  project: LoadedProject;
  selectedId: string;
  onSelect: (id: string) => void;
  onProject: (next: LoadedProject) => void;
  onOpenReceive: (listId: string, itemId: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const items = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (project.queryItems ?? []).filter((item) => {
      const st = trackQuery(project, item);
      if (status && st !== status) return false;
      if (!q) return true;
      return [item.number, item.documentRef, item.subject, item.question].join(" ").toLowerCase().includes(q);
    });
  }, [project, filter, status]);
  const selected = queryItem(project, selectedId) ?? items[0] ?? null;

  return (
    <>
      <div className="buy-tools">
        <button
          type="button"
          className="primary"
          onClick={() => {
            const started = draftQueryList(project);
            const item = blankQueryItem(started.project);
            const withItem = upsertQueryItem(started.project, item);
            onProject(addItemToList(withItem, started.list.id, item.id));
            onSelect(item.id);
          }}
        >
          New query
        </button>
        <label className="field buy-compact">
          Search
          <input value={filter} placeholder="Number, clause, subject" onChange={(e) => setFilter(e.target.value)} />
        </label>
        <MenuSelect
          className="buy-compact"
          label="Status"
          value={status}
          options={[
            { value: "", label: "All" },
            { value: "draft", label: "Draft" },
            { value: "pending", label: "Awaiting reply" },
            { value: "overdue", label: "Overdue" },
            { value: "needs_info", label: "Needs more information" },
            { value: "answered", label: "Answered" },
            { value: "closed", label: "Closed" },
          ]}
          onChange={setStatus}
        />
        <span className="hint">Every query and client reply for this tender. Lists are rounds of the same log.</span>
      </div>
      <div className="queries-split">
        <Split id="queries" axis="x" defaultSize={400} min={260} max={640} primary="end">
        <div className="buy-grid">
          <VirtualTable
            fill
            layoutKey="queries-log"
            rowCount={items.length}
            header={
              <thead>
                <tr>
                  <th>No</th>
                  <th>Document ref</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Lists</th>
                  <th>Last reply</th>
                  <th>Images</th>
                </tr>
              </thead>
            }
            renderRow={(i) => {
              const item = items[i]!;
              const st = trackQuery(project, item);
              const lists = listsForItem(project, item.id);
              const reply = latestReply(item);
              return (
                <tr
                  key={item.id}
                  className={selected?.id === item.id ? "selected" : ""}
                  onClick={() => onSelect(item.id)}
                >
                  <td>{item.number}</td>
                  <td>{item.documentRef || "—"}</td>
                  <td>{item.subject || item.question.slice(0, 80) || "—"}</td>
                  <td>
                    <StatusBadge status={st} />
                  </td>
                  <td>{lists.map((l) => l.number).join(", ") || "—"}</td>
                  <td>{reply ? reply.receivedAt.slice(0, 10) : "—"}</td>
                  <td className="num">{item.attachments?.length ?? 0}</td>
                </tr>
              );
            }}
          />
        </div>
        <QueryDetail
          project={project}
          item={selected}
          onProject={onProject}
          onOpenReceive={onOpenReceive}
        />
        </Split>
      </div>
    </>
  );
}

function QueryDetail({
  project,
  item,
  onProject,
  onOpenReceive,
}: {
  project: LoadedProject;
  item: TenderQueryItem | null;
  onProject: (next: LoadedProject) => void;
  onOpenReceive: (listId: string, itemId: string) => void;
}) {
  if (!item) {
    return (
      <div className="queries-detail">
        <p className="hint">New query to add one, then edit it here. Attach drawings or clause screenshots on the log.</p>
      </div>
    );
  }
  const lists = listsForItem(project, item.id);
  const lastSent = [...lists].reverse().find((l) => l.status === "sent");
  const st = trackQuery(project, item);
  function patch(next: Partial<TenderQueryItem>) {
    onProject(upsertQueryItem(project, { ...item, ...next } as TenderQueryItem));
  }
  return (
    <div className="queries-detail">
      <div className="queries-detail-head">
        <strong>{item.number}</strong>
        <StatusBadge status={st} />
      </div>
      <label className="field">
        Document ref
        <input value={item.documentRef} onChange={(e) => patch({ documentRef: e.target.value })} />
      </label>
      <label className="field">
        Subject
        <input value={item.subject} onChange={(e) => patch({ subject: e.target.value })} />
      </label>
      <label className="field">
        Query
        <textarea rows={5} value={item.question} onChange={(e) => patch({ question: e.target.value })} />
      </label>
      <h4>Images</h4>
      <AttachmentStrip
        files={item.attachments ?? []}
        onAdd={(files) => onProject(addItemAttachments(project, item.id, files))}
        onRemove={(id) => onProject(removeItemAttachment(project, item.id, id))}
      />
      {item.replies.length === 0 ? <p className="hint">No client reply logged yet.</p> : <h4>Replies</h4>}
      {item.replies
        .slice()
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .map((reply) => (
          <article key={reply.id} className="queries-reply">
            <header>
              <span>{reply.fromName || "Client"}</span>
              <span>{reply.receivedAt.slice(0, 10)}</span>
              {reply.needsInfo ? <span className="badge needs_info">Needs more information</span> : null}
              <button type="button" onClick={() => onProject(deleteQueryReply(project, item.id, reply.id))}>
                Delete reply
              </button>
            </header>
            <p className="queries-body">{reply.body || "—"}</p>
            {(project.queryLists ?? [])
              .find((l) => l.id === reply.listId)
              ?.replyColumns?.filter((c) => (reply.fields?.[c.id] ?? "").trim())
              ?.map((c) => (
                <p key={c.id} className="hint">
                  {c.label}: {reply.fields[c.id]}
                </p>
              ))}
            {reply.needsInfoNote ? <p className="hint">{reply.needsInfoNote}</p> : null}
            <AttachmentStrip files={reply.attachments ?? []} />
          </article>
        ))}
      <div className="queries-detail-actions">
        {lastSent ? (
          <button type="button" onClick={() => onOpenReceive(lastSent.id, item.id)}>
            Receive
          </button>
        ) : null}
        {st === "closed" ? (
          <button type="button" onClick={() => onProject(reopenQuery(project, item.id))}>
            Reopen
          </button>
        ) : (
          <button type="button" onClick={() => onProject(closeQuery(project, item.id))}>
            Close
          </button>
        )}
        <ConfirmDelete onConfirm={() => onProject(deleteQueryItem(project, item.id))} />
      </div>
    </div>
  );
}

function TrackerStage({
  project,
  onProject,
  onOpenReceive,
}: {
  project: LoadedProject;
  onProject: (next: LoadedProject) => void;
  onOpenReceive: (listId: string) => void;
}) {
  const lists = [...(project.queryLists ?? [])].sort((a, b) => a.number - b.number);
  const items = project.queryItems ?? [];

  return (
    <>
      <div className="buy-tools">
        <span className="hint">Each column is a query list sent to the client. Carry open items onto the next list from Pending.</span>
      </div>
      <div className="buy-track queries-tracker">
        <DataTable layoutKey="queries-lists">
          <thead>
            <tr>
              <th>List</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Due</th>
              <th className="num">Queries</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lists.length === 0 ? (
              <tr>
                <td colSpan={6}>No lists yet. Compose the first round on Send.</td>
              </tr>
            ) : (
              lists.map((l) => {
                const n = l.lines.filter((x) => x.included).length;
                return (
                  <tr key={l.id}>
                    <td>
                      {l.number}. {l.title}
                    </td>
                    <td>
                      <span className={`badge ${l.status === "sent" ? "sent" : "draft"}`}>
                        {l.status === "sent" ? "Sent" : "Draft"}
                      </span>
                    </td>
                    <td>{l.sentAt ? l.sentAt.slice(0, 10) : "—"}</td>
                    <td>{l.dueAt ? l.dueAt.slice(0, 10) : "—"}</td>
                    <td className="num">{n}</td>
                    <td>
                      {l.status === "sent" ? (
                        <button type="button" onClick={() => onOpenReceive(l.id)}>
                          Receive
                        </button>
                      ) : null}
                      <ConfirmDelete onConfirm={() => onProject(deleteQueryList(project, l.id))} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </DataTable>
      </div>
      <div className="buy-grid buy-matrix">
        <VirtualTable
          fill
          layoutKey="queries-tracker"
          rowCount={items.length}
          header={
            <thead>
              <tr>
                <th>No</th>
                <th>Subject</th>
                <th>Status</th>
                {lists.map((l) => (
                  <th key={l.id} className="buy-vendor">
                    List {l.number}
                  </th>
                ))}
                <th>Last reply</th>
              </tr>
            </thead>
          }
          renderRow={(i) => {
            const item = items[i]!;
            const st = trackQuery(project, item);
            const reply = latestReply(item);
            return (
              <tr key={item.id}>
                <td>{item.number}</td>
                <td>{item.subject || item.documentRef || "—"}</td>
                <td>
                  <StatusBadge status={st} />
                </td>
                {lists.map((l) => {
                  const line = l.lines.find((x) => x.itemId === item.id && x.included);
                  const listReply = item.replies.find((r) => r.listId === l.id);
                  let cell = "—";
                  if (line && l.status === "draft") cell = "On draft";
                  else if (line && listReply?.needsInfo) cell = "Needs info";
                  else if (line && listReply) cell = "Replied";
                  else if (line && l.status === "sent") cell = "Sent";
                  return <td key={l.id}>{cell}</td>;
                })}
                <td>{reply ? reply.receivedAt.slice(0, 10) : "—"}</td>
              </tr>
            );
          }}
        />
      </div>
    </>
  );
}

function SendStage({
  project,
  focusListId,
  onProject,
  onFocusList,
}: {
  project: LoadedProject;
  focusListId: string;
  onProject: (next: LoadedProject) => void;
  onFocusList: (id: string) => void;
}) {
  const lists = project.queryLists ?? [];
  const live = lists.find((l) => l.id === focusListId) ?? lists.find((l) => l.status === "draft") ?? lists[0] ?? null;
  const lines = live?.lines ?? [];

  function save(next: TenderQueryList) {
    onProject(upsertQueryList(project, next));
    onFocusList(next.id);
  }

  function addList() {
    const list = blankQueryList(project);
    save(list);
  }

  function addQuery() {
    const started = live && live.status === "draft" ? { project, list: live } : draftQueryList(project);
    const item = blankQueryItem(started.project);
    const withItem = upsertQueryItem(started.project, item);
    const next = addItemToList(withItem, started.list.id, item.id);
    onProject(next);
    onFocusList(started.list.id);
  }

  function addPending() {
    const started = live && live.status === "draft" ? { project, list: live } : draftQueryList(project);
    const next = carryPendingToList(started.project, started.list.id);
    onProject(next);
    onFocusList(started.list.id);
  }

  function issue(kind: "csv" | "print") {
    if (!live) return;
    const next = issueQueryList(project, live.id);
    const sent = (next.queryLists ?? []).find((l) => l.id === live.id) ?? live;
    if (kind === "csv") downloadText(`query-list-${sent.number}.csv`, queryListCsv(next, sent));
    else printQueryList(next, sent);
    onProject(next);
  }

  const qCols = live?.queryColumns ?? [];
  const others = lists.filter((l) => l.id !== live?.id && (l.queryColumns?.length ?? 0) > 0);

  return (
    <>
      <div className="buy-tools">
        <button type="button" onClick={addList}>
          New list
        </button>
        <button type="button" onClick={addQuery}>
          Add query
        </button>
        <button type="button" onClick={addPending}>
          Add pending
        </button>
        {live ? (
          <>
            <MenuSelect
              className="buy-compact"
              label="List"
              value={live.id}
              options={lists.map((l) => ({
                value: l.id,
                label: `${l.number}. ${l.title} · ${l.status}`,
              }))}
              onChange={onFocusList}
            />
            <label className="field buy-compact">
              Title
              <input value={live.title} onChange={(e) => save({ ...live, title: e.target.value })} />
            </label>
            <label className="field buy-compact">
              Reply due
              <input
                type="date"
                value={(live.dueAt ?? "").slice(0, 10)}
                onChange={(e) => save({ ...live, dueAt: e.target.value || null })}
              />
            </label>
            <label className="field buy-compact buy-notes">
              Notes
              <input value={live.notes} onChange={(e) => save({ ...live, notes: e.target.value })} />
            </label>
            <ColumnBar
              label="This list columns"
              columns={qCols}
              locked={live.status === "sent"}
              onAdd={(name) => onProject(addListColumn(project, live.id, "query", name))}
              onRemove={(id) => onProject(removeListColumn(project, live.id, "query", id))}
            />
            {others.length ? (
              <MenuSelect
                className="buy-compact"
                label="Copy columns"
                value=""
                options={[
                  { value: "", label: "From another list…" },
                  ...others.map((l) => ({ value: l.id, label: `List ${l.number}` })),
                ]}
                onChange={(from) => {
                  if (from) onProject(copyListColumns(project, from, live.id, "query"));
                }}
              />
            ) : null}
            <AttachmentStrip
              files={live.attachments ?? []}
              onAdd={(files) => onProject(addListAttachments(project, live.id, files))}
              onRemove={(id) => onProject(removeListAttachment(project, live.id, id))}
            />
            {live.status === "draft" ? (
              <>
                <button type="button" className="primary" onClick={() => issue("csv")}>
                  Send CSV
                </button>
                <button type="button" onClick={() => issue("print")}>
                  Print / PDF
                </button>
                <ConfirmDelete
                  action="Delete list"
                  onConfirm={() => {
                    onProject(deleteQueryList(project, live.id));
                    onFocusList("");
                  }}
                />
              </>
            ) : (
              <span className="hint">This list is sent. Log replies on Receive, or start a new list for follow-ups.</span>
            )}
          </>
        ) : (
          <span className="hint">New list, add queries (or pull Pending), then send to the client. Columns belong to that list only.</span>
        )}
      </div>
      <div className="buy-grid">
        <VirtualTable
          fill
          layoutKey="queries-send"
          rowHeight={72}
          rowCount={lines.length}
          header={
            <thead>
              <tr>
                <th />
                <th>No</th>
                <th>Document ref</th>
                <th>Subject</th>
                <th>Query</th>
                <th>This round</th>
                {qCols.map((c) => (
                  <th key={c.id}>{c.label}</th>
                ))}
                <th>Images</th>
                <th />
              </tr>
            </thead>
          }
          renderRow={(i) => {
            const line = lines[i]!;
            const item = queryItem(project, line.itemId);
            if (!item || !live) return <tr key={line.id} />;
            const locked = live.status === "sent";
            return (
              <tr key={line.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={line.included}
                    disabled={locked}
                    aria-label={`Include ${item.number}`}
                    onChange={(e) =>
                      save({
                        ...live,
                        lines: live.lines.map((l) => (l.id === line.id ? { ...l, included: e.target.checked } : l)),
                      })
                    }
                  />
                </td>
                <td>{item.number}</td>
                <td>
                  <input
                    className="cell"
                    value={item.documentRef}
                    disabled={locked && Boolean(item.documentRef)}
                    onChange={(e) => onProject(upsertQueryItem(project, { ...item, documentRef: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    className="cell"
                    value={item.subject}
                    disabled={locked && Boolean(item.subject)}
                    onChange={(e) => onProject(upsertQueryItem(project, { ...item, subject: e.target.value }))}
                  />
                </td>
                <td>
                  <textarea
                    className="cell queries-cell-text"
                    rows={2}
                    value={item.question}
                    disabled={locked}
                    onChange={(e) => onProject(upsertQueryItem(project, { ...item, question: e.target.value }))}
                  />
                </td>
                <td>
                  <textarea
                    className="cell queries-cell-text"
                    rows={2}
                    value={line.roundNote}
                    disabled={locked}
                    placeholder="Follow-up for this list"
                    onChange={(e) =>
                      save({
                        ...live,
                        lines: live.lines.map((l) => (l.id === line.id ? { ...l, roundNote: e.target.value } : l)),
                      })
                    }
                  />
                </td>
                {qCols.map((c) => (
                  <td key={c.id}>
                    <ExtraField
                      def={c}
                      value={line.fields?.[c.id] ?? ""}
                      disabled={locked}
                      onChange={(v) => onProject(setLineField(project, live.id, item.id, c.id, v))}
                    />
                  </td>
                ))}
                <td>
                  <AttachmentStrip
                    compact
                    files={item.attachments ?? []}
                    onAdd={(files) => onProject(addItemAttachments(project, item.id, files))}
                    onRemove={(id) => onProject(removeItemAttachment(project, item.id, id))}
                  />
                </td>
                <td>
                  {locked ? null : (
                    <button type="button" onClick={() => onProject(removeLineFromList(project, live.id, item.id))}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            );
          }}
        />
      </div>
    </>
  );
}

function ReceiveStage({
  project,
  focusListId,
  onProject,
  onFocusList,
}: {
  project: LoadedProject;
  focusListId: string;
  onProject: (next: LoadedProject) => void;
  onFocusList: (id: string) => void;
}) {
  const sent = (project.queryLists ?? []).filter((l) => l.status === "sent");
  const live = sent.find((l) => l.id === focusListId) ?? sent[0] ?? null;
  const items = includedItems(project, live);

  function replyFor(item: TenderQueryItem): TenderQueryReply | undefined {
    return item.replies.find((r) => r.listId === live?.id) ?? latestReply(item);
  }

  function saveReply(item: TenderQueryItem, patch: Partial<TenderQueryReply> & Pick<TenderQueryReply, "body">) {
    const current = item.replies.find((r) => r.listId === live?.id);
    onProject(
      logQueryReply(project, item.id, {
        ...current,
        ...patch,
        id: current?.id,
        listId: live?.id ?? null,
        body: patch.body,
        fields: patch.fields ?? current?.fields ?? {},
        attachments: patch.attachments ?? current?.attachments ?? [],
      }),
    );
  }

  function importFile(file: File) {
    if (!live) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseQueryReplyCsv(String(reader.result ?? ""), live.replyColumns ?? []);
      onProject(importQueryReplies(project, rows, live.id));
    };
    reader.readAsText(file);
  }

  const rCols = live?.replyColumns ?? [];
  const others = sent.filter((l) => l.id !== live?.id && (l.replyColumns?.length ?? 0) > 0);

  return (
    <>
      <div className="buy-tools">
        {!live ? (
          <span className="hint">Send a query list first, then log the client replies here. Reply columns can differ from the query sheet.</span>
        ) : (
          <>
            <MenuSelect
              className="buy-compact"
              label="Sent list"
              value={live.id}
              options={sent.map((l) => ({
                value: l.id,
                label: `${l.number}. ${l.title} · ${l.sentAt?.slice(0, 10) ?? "sent"}`,
              }))}
              onChange={onFocusList}
            />
            <ColumnBar
              label="Reply columns"
              columns={rCols}
              onAdd={(name) => onProject(addListColumn(project, live.id, "reply", name))}
              onRemove={(id) => onProject(removeListColumn(project, live.id, "reply", id))}
            />
            {others.length ? (
              <MenuSelect
                className="buy-compact"
                label="Copy reply columns"
                value=""
                options={[
                  { value: "", label: "From another list…" },
                  ...others.map((l) => ({ value: l.id, label: `List ${l.number}` })),
                ]}
                onChange={(from) => {
                  if (from) onProject(copyListColumns(project, from, live.id, "reply"));
                }}
              />
            ) : null}
            <label className="field buy-compact">
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="hint">Reply columns are for this list only. They do not have to match the query columns.</span>
          </>
        )}
      </div>
      <div className="buy-grid">
        <VirtualTable
          fill
          layoutKey="queries-receive"
          rowHeight={96}
          rowCount={items.length}
          header={
            <thead>
              <tr>
                <th>No</th>
                <th>Query</th>
                <th>Reply</th>
                <th>From</th>
                <th>Received</th>
                {rCols.map((c) => (
                  <th key={c.id}>{c.label}</th>
                ))}
                <th>Images</th>
                <th>Needs more information</th>
              </tr>
            </thead>
          }
          renderRow={(i) => {
            const item = items[i]!;
            const reply = replyFor(item);
            return (
              <tr key={item.id}>
                <td>{item.number}</td>
                <td>
                  <div className="queries-asked">
                    <strong>{item.subject || item.documentRef || item.number}</strong>
                    <span>{item.question}</span>
                  </div>
                </td>
                <td>
                  <textarea
                    className="cell queries-cell-text"
                    rows={3}
                    value={reply?.body ?? ""}
                    onChange={(e) => saveReply(item, { body: e.target.value, fromName: reply?.fromName ?? "", receivedAt: reply?.receivedAt })}
                  />
                </td>
                <td>
                  <input
                    className="cell"
                    value={reply?.fromName ?? ""}
                    placeholder="Client"
                    onChange={(e) => saveReply(item, { body: reply?.body ?? "", fromName: e.target.value, receivedAt: reply?.receivedAt })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={(reply?.receivedAt ?? "").slice(0, 10)}
                    onChange={(e) =>
                      saveReply(item, {
                        body: reply?.body ?? "",
                        fromName: reply?.fromName ?? "",
                        receivedAt: e.target.value || new Date().toISOString(),
                      })
                    }
                  />
                </td>
                {rCols.map((c) => (
                  <td key={c.id}>
                    <ExtraField
                      def={c}
                      value={reply?.fields?.[c.id] ?? ""}
                      onChange={(v) =>
                        saveReply(item, {
                          body: reply?.body ?? "",
                          fromName: reply?.fromName ?? "",
                          receivedAt: reply?.receivedAt,
                          fields: { ...(reply?.fields ?? {}), [c.id]: v },
                        })
                      }
                    />
                  </td>
                ))}
                <td>
                  <AttachmentStrip
                    compact
                    files={reply?.attachments ?? []}
                    onAdd={async (files) => {
                      let proj = project;
                      let current = reply;
                      if (!current) {
                        proj = logQueryReply(project, item.id, { body: "", listId: live?.id ?? null });
                        current = queryItem(proj, item.id)?.replies.find((r) => r.listId === live?.id);
                      }
                      if (!current) return;
                      onProject(addReplyAttachments(proj, item.id, current.id, files));
                    }}
                    onRemove={(id) => reply && onProject(removeReplyAttachment(project, item.id, reply.id, id))}
                  />
                </td>
                <td>
                  <label className="queries-need">
                    <input
                      type="checkbox"
                      checked={Boolean(reply?.needsInfo)}
                      disabled={!reply}
                      onChange={(e) =>
                        saveReply(item, {
                          body: reply?.body ?? "",
                          fromName: reply?.fromName ?? "",
                          receivedAt: reply?.receivedAt,
                          needsInfo: e.target.checked,
                        })
                      }
                    />
                    Incomplete
                  </label>
                  {reply?.needsInfo ? (
                    <input
                      className="cell"
                      placeholder="What is still missing?"
                      value={reply.needsInfoNote}
                      onChange={(e) =>
                        saveReply(item, {
                          body: reply.body,
                          fromName: reply.fromName,
                          receivedAt: reply.receivedAt,
                          needsInfo: true,
                          needsInfoNote: e.target.value,
                        })
                      }
                    />
                  ) : null}
                </td>
              </tr>
            );
          }}
        />
      </div>
    </>
  );
}

function PendingStage({
  project,
  onProject,
  onOpenSend,
  onOpenReceive,
}: {
  project: LoadedProject;
  onProject: (next: LoadedProject) => void;
  onOpenSend: (listId: string) => void;
  onOpenReceive: (listId: string) => void;
}) {
  const items = pendingItems(project);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function carry() {
    const started = draftQueryList(project);
    const ids = picked.size ? [...picked] : undefined;
    const next = carryPendingToList(started.project, started.list.id, ids);
    onProject(next);
    onOpenSend(started.list.id);
  }

  return (
    <>
      <div className="buy-tools">
        <button type="button" className="primary" disabled={!items.length} onClick={carry}>
          {picked.size ? `Add ${picked.size} to next list` : "Add all to next list"}
        </button>
        <span className="hint">
          Awaiting reply, overdue, or a reply that still needs information. Those go on the next query list.
        </span>
      </div>
      <div className="buy-grid">
        <VirtualTable
          fill
          layoutKey="queries-pending"
          rowCount={items.length}
          header={
            <thead>
              <tr>
                <th />
                <th>No</th>
                <th>Document ref</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Last reply</th>
                <th />
              </tr>
            </thead>
          }
          renderRow={(i) => {
            const item = items[i]!;
            const st = trackQuery(project, item);
            const reply = latestReply(item);
            const lastSent = [...listsForItem(project, item.id)].reverse().find((l) => l.status === "sent");
            return (
              <tr key={item.id}>
                <td>
                  <input type="checkbox" checked={picked.has(item.id)} onChange={() => toggle(item.id)} />
                </td>
                <td>{item.number}</td>
                <td>{item.documentRef || "—"}</td>
                <td>{item.subject || item.question.slice(0, 80) || "—"}</td>
                <td>
                  <StatusBadge status={st} />
                </td>
                <td>
                  {reply ? (
                    <span className="queries-asked">
                      <span>{reply.receivedAt.slice(0, 10)}</span>
                      {reply.needsInfoNote ? <span>{reply.needsInfoNote}</span> : null}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {lastSent ? (
                    <button type="button" onClick={() => onOpenReceive(lastSent.id)}>
                      Receive
                    </button>
                  ) : null}
                  <button type="button" onClick={() => onProject(closeQuery(project, item.id))}>
                    Close
                  </button>
                </td>
              </tr>
            );
          }}
        />
      </div>
    </>
  );
}

function ConfirmDelete({
  action = "Delete",
  onConfirm,
}: {
  action?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)}>
        {action}
      </button>
    );
  }
  return (
    <span className="confirm-delete">
      <button
        type="button"
        className="primary"
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
      >
        Confirm delete
      </button>
      <button type="button" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}

function ColumnBar({
  label,
  columns,
  locked,
  onAdd,
  onRemove,
}: {
  label: string;
  columns: QueryColumnDef[];
  locked?: boolean;
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const name = draft.trim();
    if (!name) return;
    onAdd(name);
    setDraft("");
  }
  return (
    <div className="buy-factors" role="group" aria-label={label}>
      <span className="buy-factors-label">{label}</span>
      {columns.map((c) => (
        <span key={c.id} className="buy-factor on">
          {c.label}
          {locked ? null : (
            <button type="button" className="buy-factor-remove" aria-label={`Remove ${c.label}`} onClick={() => onRemove(c.id)}>
              ×
            </button>
          )}
        </span>
      ))}
      {locked ? null : (
        <>
          <input
            className="queries-col-name"
            type="text"
            value={draft}
            placeholder="Column name"
            aria-label={`${label} name`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" onClick={add} disabled={!draft.trim()}>
            Add column
          </button>
        </>
      )}
    </div>
  );
}

function ExtraField({
  def,
  value,
  disabled,
  onChange,
}: {
  def: QueryColumnDef;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <input
      className="cell"
      type={def.valueType === "date" ? "date" : def.valueType === "number" ? "number" : "text"}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function AttachmentStrip({
  files,
  compact,
  onAdd,
  onRemove,
}: {
  files: QueryAttachment[];
  compact?: boolean;
  onAdd?: (files: QueryAttachment[]) => void | Promise<void>;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className={`queries-thumbs${compact ? " compact" : ""}`}>
      {files.map((att) => (
        <span key={att.id} className="queries-thumb">
          <a href={attachmentSrc(att)} target="_blank" rel="noreferrer" title={att.name}>
            <img src={attachmentSrc(att)} alt={att.name} />
          </a>
          {onRemove ? (
            <button type="button" className="buy-factor-remove" aria-label={`Remove ${att.name}`} onClick={() => onRemove(att.id)}>
              ×
            </button>
          ) : null}
        </span>
      ))}
      {onAdd ? (
        <label className="queries-attach">
          Attach image
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const list = e.target.files;
              if (!list?.length) return;
              void attachmentsFromFiles(list).then((next) => {
                if (next.length) void onAdd(next);
              });
              e.target.value = "";
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
