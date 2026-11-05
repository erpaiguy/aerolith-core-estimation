import { useMemo, useState, type ReactNode } from "react";
import type { LoadedProject } from "../model";
import { billSourceLocked, sortedBills } from "../bills";
import { ChartFrame, DataCard, FilterBar, ModuleChrome, StatusPill } from "../ui/enterprise";

export function SourceShell({
  project,
  billId,
  onBill,
  onImport,
  children,
}: {
  project: LoadedProject;
  billId: string | null;
  onBill: (id: string) => void;
  onImport?: () => void;
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState("All");
  const bills = sortedBills(project).filter((bill) => {
    const locked = billSourceLocked(project, bill.id);
    if (chip === "Locked" && !locked) return false;
    if (chip === "Draft" && locked) return false;
    const hay = `${bill.name} ${bill.code} ${bill.issuedRef}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });
  return (
    <div className="enterprise-module">
      <ModuleChrome
        kicker="Source"
        title="Document register"
        detail="Each issued bill stays readable here. Amend and import keep the existing wizard."
        pill={<StatusPill tone={project.sourceLockedAt ? "locked" : "draft"}>{project.sourceLockedAt ? "Locked" : "Open"}</StatusPill>}
      >
        {onImport ? (
          <button type="button" onClick={onImport}>
            Import
          </button>
        ) : null}
      </ModuleChrome>
      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Search bills"
        chips={["All", "Draft", "Locked"]}
        chip={chip}
        onChip={setChip}
      />
      <div className="card-grid">
        {bills.map((bill) => {
          const locked = billSourceLocked(project, bill.id);
          return (
            <DataCard
              key={bill.id}
              title={bill.name}
              status={locked ? "Locked" : "Draft"}
              tone={locked ? "locked" : "draft"}
              lines={[bill.issuedRef || "No issued reference", `BOQ ${bill.code}`, "No deadline"]}
              action={bill.id === billId ? "Showing" : "Open bill"}
              selected={bill.id === billId}
              onOpen={() => onBill(bill.id)}
            />
          );
        })}
      </div>
      {children}
    </div>
  );
}

export function BuyShell({ project, children }: { project: LoadedProject; children: ReactNode }) {
  const coverage = useMemo(() => {
    const selected = new Set(project.resourceQuotes.filter((quote) => quote.selected).map((quote) => quote.projectResourceCode));
    const withQuote = project.resources.filter((row) => selected.has(row.project_code)).length;
    const pending = Math.max(0, project.resources.length - withQuote);
    return {
      withQuote,
      pending,
      bars: [
        { label: "Preferred quote", value: withQuote },
        { label: "No quote yet", value: pending },
      ],
    };
  }, [project.resourceQuotes, project.resources]);
  const packs = project.enquiries?.length ?? 0;
  return (
    <div className="enterprise-module">
      <ModuleChrome
        kicker="Buy"
        title="Procurement"
        detail="Track vendor quotes and purchase coverage. Comparison grids stay below."
      />
      <section className="kpi-strip buy-kpis" aria-label="Procurement summary">
        <article>
          <span>Resources</span>
          <strong>{project.resources.length}</strong>
        </article>
        <article>
          <span>Preferred quotes</span>
          <strong>{coverage.withQuote}</strong>
        </article>
        <article>
          <span>Pending</span>
          <strong>{coverage.pending}</strong>
        </article>
        <article>
          <span>Enquiry packs</span>
          <strong>{packs}</strong>
        </article>
      </section>
      <ChartFrame title="Quote coverage" bars={coverage.bars} />
      {children}
    </div>
  );
}

export function SubmitShell({ project, children }: { project: LoadedProject; children: ReactNode }) {
  const items = project.items.filter((item) => item.kind === "item");
  const unpriced = items.filter((item) => !item.result || item.result.rate === 0).length;
  return (
    <div className="enterprise-module">
      <ModuleChrome
        kicker="Submit"
        title="Tender package"
        detail="The submission sheet below is the package. Coverage is priced rows against rows still waiting for a rate."
        pill={<StatusPill tone={project.sealedAt ? "sealed" : "draft"}>{project.sealedAt ? "Sealed" : "Draft"}</StatusPill>}
      />
      <ChartFrame
        title="Submission coverage"
        bars={[
          { label: "Priced", value: items.length - unpriced },
          { label: "Unpriced", value: unpriced },
        ]}
      />
      {children}
    </div>
  );
}

export function MastersShell({
  project,
  tab,
  onTab,
  children,
}: {
  project: LoadedProject;
  tab: "units" | "categories" | "vendors" | "resources";
  onTab: (tab: "units" | "categories" | "vendors" | "resources") => void;
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const cards = [
    { id: "units" as const, title: "Units", count: project.units.length, detail: "Measurement units for this job." },
    { id: "categories" as const, title: "Categories", count: project.categories.length, detail: "Resource categories." },
    { id: "vendors" as const, title: "Vendors", count: project.vendors.length, detail: "Vendor directory snapshot." },
    {
      id: "resources" as const,
      title: "Resources",
      count: (project.resourceMaster ?? project.resources).length,
      detail: "Rate library and project resources.",
    },
  ].filter((card) => card.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="enterprise-module">
      <ModuleChrome
        kicker="Masters"
        title="Libraries"
        detail="Search the libraries, then edit the one you open. Rate build-ups used by Estimate stay on the project."
      />
      <FilterBar query={query} onQuery={setQuery} placeholder="Search libraries" chips={["All"]} chip="All" onChip={() => undefined} />
      <div className="card-grid">
        {cards.map((card) => (
          <DataCard
            key={card.id}
            title={card.title}
            status={tab === card.id ? "Open" : `${card.count}`}
            tone={tab === card.id ? "sealed" : "draft"}
            lines={[`${card.count} rows`, card.detail, "Bid Craft"]}
            action={tab === card.id ? "Editing" : "Open"}
            selected={tab === card.id}
            onOpen={() => onTab(card.id)}
          />
        ))}
      </div>
      {children}
    </div>
  );
}
