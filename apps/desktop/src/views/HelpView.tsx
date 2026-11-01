import { useMemo, useState } from "react";
import { ModuleChrome } from "../ui/enterprise";

const TOPICS = [
  {
    id: "takeoff",
    title: "Quantity take-off",
    detail: "Measure drawings, link dimension groups to BOQ quantities, and keep cutouts in sync.",
  },
  {
    id: "estimate",
    title: "Estimate workbook",
    detail: "Build the working bill, drill into rate analysis, and keep client and our quantities side by side.",
  },
  {
    id: "margins",
    title: "Margin stack",
    detail: "Apply overhead, profit, logistics, and contingency once on cost. Scoped assignments overlay the job default.",
  },
  {
    id: "buy",
    title: "Procurement",
    detail: "Issue enquiries, compare vendor replies, and award preferred rates back into the resource book.",
  },
  {
    id: "reports",
    title: "Reports and export",
    detail: "Preview working, category, and submission suites, then print or download a spreadsheet.",
  },
  {
    id: "updates",
    title: "Updates",
    detail: "Settings → Updates checks the signed channel. Installed copies move when a newer manifest is published.",
  },
];

export function HelpView() {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOPICS;
    return TOPICS.filter((topic) => `${topic.title} ${topic.detail}`.toLowerCase().includes(q));
  }, [query]);
  return (
    <div className="enterprise-module help-center">
      <ModuleChrome
        kicker="Support"
        title="Help center"
        detail="Search Bid Craft modules, then open Settings for letterhead, numbers, and the updater."
      />
      <div className="help-search" role="search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="How can we help?"
          aria-label="Search help"
        />
      </div>
      <div className="help-topics">
        {shown.map((topic) => (
          <article key={topic.id} className="help-topic">
            <h2>{topic.title}</h2>
            <p>{topic.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
