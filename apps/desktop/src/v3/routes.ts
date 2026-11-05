export type Pane =
  | "dashboard"
  | "source"
  | "takeoff"
  | "estimate"
  | "analysis"
  | "register"
  | "clone"
  | "component"
  | "margins"
  | "queries"
  | "buy"
  | "enquiries"
  | "compare"
  | "followup"
  | "submit"
  | "finalise"
  | "reports"
  | "masters"
  | "settings"
  | "categories"
  | "design"
  | "resource";

export type ScreenId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28;

export const SCREENS: Array<{ id: ScreenId; title: string; pane?: Pane; gate?: string }> = [
  { id: 1, title: "Splash (start page)", gate: "splash" },
  { id: 2, title: "Sign in and licence", gate: "login" },
  { id: 3, title: "Close job and sign out", gate: "close" },
  { id: 4, title: "Landing (jobs)", gate: "home" },
  { id: 5, title: "New job wizard", gate: "wizard" },
  { id: 6, title: "Owner console", gate: "owner" },
  { id: 7, title: "Job dashboard", pane: "dashboard" },
  { id: 8, title: "Client BOQ", pane: "source" },
  { id: 9, title: "Take-off", pane: "takeoff" },
  { id: 10, title: "Working BOQ", pane: "estimate" },
  { id: 11, title: "Rate Analysis by cost category", pane: "analysis" },
  { id: 12, title: "Margins", pane: "margins" },
  { id: 13, title: "Client Queries", pane: "queries" },
  { id: 14, title: "Resource Prices for the bid", pane: "buy" },
  { id: 15, title: "Submission BOQ", pane: "submit" },
  { id: 16, title: "Finalise", pane: "finalise" },
  { id: 17, title: "Reports", pane: "reports" },
  { id: 18, title: "Masters", pane: "masters" },
  { id: 19, title: "Settings", pane: "settings" },
  { id: 20, title: "Design system and states", pane: "design" },
  { id: 21, title: "Link or clone a rate", pane: "clone" },
  { id: 22, title: "Supplier enquiries", pane: "enquiries" },
  { id: 23, title: "Compare and choose for bid", pane: "compare" },
  { id: 24, title: "Follow-up log", pane: "followup" },
  { id: 25, title: "Rate analysis register", pane: "register" },
  { id: 26, title: "Add or edit a component", pane: "component" },
  { id: 27, title: "Settings: cost categories", pane: "categories" },
  { id: 28, title: "Resource detail", pane: "resource" },
];

export function paneTitle(pane: Pane): string {
  return SCREENS.find((s) => s.pane === pane)?.title ?? pane;
}

export type JobNavItem = { pane?: Pane; label: string; future?: boolean };

export const JOB_NAV: Array<{ label: string; hint?: "tender" | "measure" | "price" | "submit"; items: JobNavItem[] }> = [
  { label: "Overview", items: [{ pane: "dashboard", label: "Dashboard" }] },
  {
    label: "Tender",
    hint: "tender",
    items: [
      { label: "Documents and addenda", future: true },
      { label: "Contract review", future: true },
      { pane: "queries", label: "Client queries" },
    ],
  },
  {
    label: "Measure",
    hint: "measure",
    items: [
      { pane: "source", label: "Client BOQ" },
      { pane: "takeoff", label: "Take-off" },
    ],
  },
  {
    label: "Price",
    hint: "price",
    items: [
      { pane: "estimate", label: "Working BOQ" },
      { pane: "register", label: "Rate analysis" },
      { pane: "buy", label: "Resource prices" },
      { label: "Subcontract packages", future: true },
      { label: "Preliminaries", future: true },
    ],
  },
  {
    label: "Risk and money",
    items: [
      { label: "Risk and contingency", future: true },
      { label: "Cash flow and bonds", future: true },
      { pane: "margins", label: "Margins" },
    ],
  },
  {
    label: "Submit",
    hint: "submit",
    items: [
      { label: "Tender review", future: true },
      { label: "Qualifications and pack", future: true },
      { label: "Technical proposal", future: true },
      { pane: "submit", label: "Submission BOQ" },
      { pane: "finalise", label: "Finalise" },
    ],
  },
  {
    label: "After submission",
    items: [
      { label: "Outcome and negotiation", future: true },
      { label: "Handover to project", future: true },
    ],
  },
];

export const WORK_NAV: Array<{ pane?: Pane; label: string; future?: boolean; owner?: boolean }> = [
  { label: "Tender pipeline", future: true },
  { label: "Tender calendar", future: true },
  { label: "Jobs" },
  { label: "Clients", future: true },
  { label: "Company library", future: true },
  { pane: "reports", label: "Reports" },
  { label: "Benchmarks", future: true },
  { pane: "masters", label: "Masters" },
  { pane: "settings", label: "Settings" },
  { label: "Owner console", owner: true },
];

export function jobPane(pane: Pane): boolean {
  return ["dashboard", "source", "takeoff", "estimate", "analysis", "register", "margins", "queries", "buy", "enquiries", "compare", "followup", "submit", "finalise", "resource"].includes(pane);
}

export function pricePane(pane: Pane): boolean {
  return pane === "buy" || pane === "enquiries" || pane === "compare" || pane === "followup" || pane === "resource";
}

export function analysisPane(pane: Pane): boolean {
  return pane === "analysis" || pane === "register" || pane === "clone" || pane === "component";
}

const FOLLOW = /^\[follow-up ([^\]]+)\] ([^:]+): (.*)$/;

export type FollowUp = { enquiryId: string; vendor: string; at: string; channel: string; note: string };

export function readFollowUps(notes: string, enquiryId: string, vendor: string): FollowUp[] {
  return notes
    .split("\n")
    .map((line) => FOLLOW.exec(line.trim()))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => ({ enquiryId, vendor, at: m[1] ?? "", channel: m[2] ?? "", note: m[3] ?? "" }));
}

export function appendFollowUp(notes: string, channel: string, note: string, at = new Date().toISOString()): string {
  const line = `[follow-up ${at}] ${channel}: ${note}`;
  return notes.trim() ? `${notes.trim()}\n${line}` : line;
}
