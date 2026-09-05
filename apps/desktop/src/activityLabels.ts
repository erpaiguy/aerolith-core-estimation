import type { Activity } from "./model";

/** User-facing module names. Internal activity ids stay unchanged. */
export const ACTIVITY_LABELS: Record<Activity, string> = {
  dashboard: "Dashboard",
  source: "Client BOQ",
  takeoff: "Take-off",
  estimate: "Working BOQ",
  analysis: "Rate Analysis",
  margins: "Margins",
  queries: "Client Queries",
  buy: "Resource Prices",
  submit: "Submission BOQ",
  masters: "Masters",
  settings: "Settings",
};

export const RIBBON_ORDER: Activity[] = [
  "dashboard",
  "source",
  "takeoff",
  "estimate",
  "analysis",
  "margins",
  "queries",
  "buy",
  "submit",
  "masters",
  "settings",
];

export function activityLabel(id: Activity): string {
  return ACTIVITY_LABELS[id];
}
