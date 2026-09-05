import { describe, expect, it } from "vitest";
import { emptyProject } from "./loadReference";
import { withResults } from "./projectCompute";
import {
  addItemAttachments,
  addItemToList,
  addListColumn,
  blankQueryItem,
  blankQueryList,
  carryPendingToList,
  closeQuery,
  copyListColumns,
  deleteQueryItem,
  draftQueryList,
  importQueryReplies,
  issueQueryList,
  logQueryReply,
  parseQueryReplyCsv,
  pendingItems,
  queryListCsv,
  removeItemAttachment,
  trackQuery,
  upsertQueryItem,
  upsertQueryList,
} from "./tenderQueries";

function job() {
  return withResults(emptyProject("Tender queries"));
}

describe("tender queries", () => {
  it("tracks draft, pending, answered, needs-info, and overdue", () => {
    let project = job();
    const list = blankQueryList(project);
    const item = blankQueryItem(project);
    project = upsertQueryList(upsertQueryItem(project, item), list);
    project = addItemToList(project, list.id, item.id);
    const live = project.queryItems[0]!;
    expect(trackQuery(project, live)).toBe("draft");

    project = issueQueryList(project, list.id);
    expect(trackQuery(project, project.queryItems[0]!)).toBe("pending");

    const overdueList = { ...(project.queryLists[0]!), dueAt: "2020-01-01" };
    const overdue = upsertQueryList(project, overdueList);
    expect(trackQuery(overdue, overdue.queryItems[0]!, Date.parse("2026-09-02"))).toBe("overdue");

    project = logQueryReply(project, live.id, { body: "Use clause 3.2", listId: list.id, fromName: "Engineer" });
    expect(trackQuery(project, project.queryItems[0]!)).toBe("answered");

    project = logQueryReply(project, live.id, {
      body: "See drawing",
      listId: list.id,
      fromName: "Engineer",
      needsInfo: true,
      needsInfoNote: "Which revision?",
    });
    expect(trackQuery(project, project.queryItems[0]!)).toBe("needs_info");
    expect(pendingItems(project).map((i) => i.id)).toContain(live.id);
  });

  it("carries pending and incomplete replies onto the next query list", () => {
    let project = job();
    const first = blankQueryList(project);
    const open = blankQueryItem(project);
    project = addItemToList(upsertQueryList(upsertQueryItem(project, open), first), first.id, open.id);
    project = issueQueryList(project, first.id);
    project = logQueryReply(project, open.id, {
      body: "Partial answer",
      listId: first.id,
      needsInfo: true,
      needsInfoNote: "Confirm thickness",
    });

    const started = draftQueryList(project);
    project = carryPendingToList(started.project, started.list.id);
    const next = project.queryLists.find((l) => l.id === started.list.id)!;
    expect(next.status).toBe("draft");
    expect(next.number).toBe(2);
    expect(next.lines.some((l) => l.itemId === open.id && l.included)).toBe(true);
    expect(next.lines.find((l) => l.itemId === open.id)?.roundNote).toContain("thickness");
  });

  it("closed queries leave the pending list", () => {
    let project = job();
    const list = blankQueryList(project);
    const item = blankQueryItem(project);
    project = addItemToList(upsertQueryList(upsertQueryItem(project, item), list), list.id, item.id);
    project = issueQueryList(project, list.id);
    expect(pendingItems(project)).toHaveLength(1);
    project = closeQuery(project, item.id);
    expect(trackQuery(project, project.queryItems[0]!)).toBe("closed");
    expect(pendingItems(project)).toHaveLength(0);
  });

  it("round-trips replies from the sent CSV", () => {
    let project = job();
    const list = blankQueryList(project);
    const item = { ...blankQueryItem(project), documentRef: "BOQ 3.1", subject: "Concrete grade", question: "Confirm C40?" };
    project = addItemToList(upsertQueryList(upsertQueryItem(project, item), list), list.id, item.id);
    project = issueQueryList(project, list.id);
    const csv = queryListCsv(project, project.queryLists[0]!);
    expect(csv.split("\n")[0]).toContain("query_no");
    const rows = parseQueryReplyCsv(csv).map((r) => ({
      ...r,
      reply: "C40 as specified",
      fromName: "Client",
      receivedAt: "2026-09-02",
    }));
    project = importQueryReplies(project, rows, list.id);
    expect(project.queryItems[0]?.replies[0]?.body).toBe("C40 as specified");
    expect(trackQuery(project, project.queryItems[0]!)).toBe("answered");
  });

  it("lets each list own its query columns and a different reply sheet", () => {
    let project = job();
    const a = blankQueryList(project);
    project = upsertQueryList(project, a);
    project = addListColumn(project, a.id, "query", "Drawing");
    project = addListColumn(project, a.id, "reply", "Engineer comment");
    const listA = project.queryLists[0]!;
    expect(listA.queryColumns.map((c) => c.label)).toEqual(["Drawing"]);
    expect(listA.replyColumns.map((c) => c.label)).toEqual(["Engineer comment"]);

    const b = blankQueryList(project);
    project = upsertQueryList(project, b);
    expect(project.queryLists.find((l) => l.id === b.id)?.queryColumns).toEqual([]);
    project = copyListColumns(project, a.id, b.id, "query");
    expect(project.queryLists.find((l) => l.id === b.id)?.queryColumns.map((c) => c.label)).toEqual(["Drawing"]);
    expect(project.queryLists.find((l) => l.id === b.id)?.replyColumns).toEqual([]);
  });

  it("deletes a query from the log and drops it from lists", () => {
    let project = job();
    const list = blankQueryList(project);
    const item = blankQueryItem(project);
    project = addItemToList(upsertQueryList(upsertQueryItem(project, item), list), list.id, item.id);
    project = deleteQueryItem(project, item.id);
    expect(project.queryItems).toHaveLength(0);
    expect(project.queryLists[0]?.lines).toHaveLength(0);
  });

  it("stores image attachments on a query", () => {
    let project = job();
    const item = blankQueryItem(project);
    project = upsertQueryItem(project, item);
    project = addItemAttachments(project, item.id, [
      { id: "att-1", name: "clause.png", mime: "image/png", data: "QQ==", createdAt: "2026-09-02" },
    ]);
    expect(project.queryItems[0]?.attachments).toHaveLength(1);
    project = removeItemAttachment(project, item.id, "att-1");
    expect(project.queryItems[0]?.attachments).toHaveLength(0);
  });
});
