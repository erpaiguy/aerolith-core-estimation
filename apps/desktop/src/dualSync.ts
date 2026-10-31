import { useEffect, useRef, useState } from "react";
import type { Activity, LoadedProject } from "./model";

const CHANNEL = "bidcraft-v2-dual";

export type DualState = {
  type: "state";
  origin: string;
  seq: number;
  project: LoadedProject;
  selected: string | null;
  groupId: string | null;
  activity: Activity;
  billFocus: string | null;
};

type DualHello = { type: "hello"; origin: string; seq: number };
type DualMessage = DualState | DualHello;

export function dockedPane(): "takeoff" | "estimate" | null {
  if (typeof window === "undefined") return null;
  const pane = new URLSearchParams(window.location.search).get("pane");
  return pane === "takeoff" || pane === "estimate" ? pane : null;
}

export function useWorkspaceSync(
  snapshot: {
    project: LoadedProject | null;
    selected: string | null;
    groupId: string | null;
    activity: Activity;
    billFocus: string | null;
  },
  apply: (state: DualState) => void,
): void {
  const role = dockedPane() ?? "main";
  const selfId = useRef(`win-${Math.random().toString(36).slice(2)}`);
  const seq = useRef(0);
  const appliedRemote = useRef(false);
  const snapshotRef = useRef(snapshot);
  const applyRef = useRef(apply);
  snapshotRef.current = snapshot;
  applyRef.current = apply;
  const [echo, setEcho] = useState(0);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      return;
    }
    const post = (message: DualMessage) => channel?.postMessage(message);
    const onMessage = (event: MessageEvent<DualMessage>) => {
      const message = event.data;
      if (!message || message.origin === selfId.current) return;
      if (message.type === "hello") {
        if (role !== "main") return;
        const current = snapshotRef.current;
        if (!current.project) return;
        if (seq.current < 1) seq.current = 1;
        post({
          type: "state",
          origin: selfId.current,
          seq: seq.current,
          project: current.project,
          selected: current.selected,
          groupId: current.groupId,
          activity: current.activity,
          billFocus: current.billFocus,
        });
        return;
      }
      if (message.seq <= seq.current) return;
      seq.current = message.seq;
      appliedRemote.current = true;
      setEcho((n) => n + 1);
      applyRef.current(message);
    };
    channel.addEventListener("message", onMessage);
    if (role !== "main") post({ type: "hello", origin: selfId.current, seq: 0 });
    return () => {
      channel?.removeEventListener("message", onMessage);
      channel?.close();
    };
  }, [role]);

  useEffect(() => {
    if (appliedRemote.current) {
      appliedRemote.current = false;
      return;
    }
    if (!snapshot.project) return;
    seq.current += 1;
    const message: DualState = {
      type: "state",
      origin: selfId.current,
      seq: seq.current,
      project: snapshot.project,
      selected: snapshot.selected,
      groupId: snapshot.groupId,
      activity: snapshot.activity,
      billFocus: snapshot.billFocus,
    };
    try {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage(message);
      channel.close();
    } catch {
      /* this browser has no BroadcastChannel */
    }
  }, [snapshot.project, snapshot.selected, snapshot.groupId, snapshot.activity, snapshot.billFocus, echo]);
}

export async function openDockedPane(pane: "takeoff" | "estimate"): Promise<void> {
  const webUrl = new URL(window.location.href);
  webUrl.searchParams.set("pane", pane);
  const href = webUrl.protocol === "http:" || webUrl.protocol === "https:" ? webUrl.href : `index.html?pane=${pane}`;
  try {
    const { isTauri } = await import("./nativeAero");
    if (isTauri()) {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const label = `bidcraft-${pane}`;
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        await existing.setFocus();
        return;
      }
      const created = new WebviewWindow(label, {
        url: href,
        title: pane === "estimate" ? "Bid Craft — Estimate" : "Bid Craft — Take-off",
        width: 1180,
        height: 820,
      });
      await new Promise<void>((resolve, reject) => {
        created.once("tauri://created", () => resolve());
        created.once("tauri://error", (event) => reject(event));
      });
      return;
    }
  } catch {
    /* fall through to a browser window */
  }
  window.open(href, `bidcraft-${pane}`, "width=1180,height=820");
}
