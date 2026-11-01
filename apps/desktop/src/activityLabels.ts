import type { Activity } from "./model";

/** User-facing module names. Internal activity ids stay unchanged. */
export const ACTIVITY_LABELS: Record<Activity, string> = {
  dashboard: "Overview",
  source: "Source",
  takeoff: "Take-off",
  estimate: "Estimate",
  analysis: "Rate Analysis",
  margins: "Margins",
  queries: "Client Queries",
  buy: "Buy",
  submit: "Submit",
  masters: "Masters",
  reports: "Reports",
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
  "reports",
  "settings",
];

export function activityLabel(id: Activity): string {
  return ACTIVITY_LABELS[id];
}
