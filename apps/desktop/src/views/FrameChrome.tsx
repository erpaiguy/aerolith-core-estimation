import type { LoadedProject } from "../model";
import { billSourceLocked, sortedBills } from "../bills";

export const STAGES = [
  ["overview", "Overview"],
  ["source", "Source"],
  ["measure", "Measure"],
  ["price", "Price"],
  ["commercial", "Commercial"],
  ["submit", "Submit"],
] as const;

export type StageId = (typeof STAGES)[number][0];

export function stageGuide(stage: StageId | "utility", scope: string): string {
  switch (stage) {
    case "overview":
      return `Overview of ${scope}. Direct cost is resources before margin. The working total adds overhead, profit, logistics, and contingency.`;
    case "source":
      return `Source is the client bill for ${scope}. Lock a building when the issued quantities must stay as received.`;
    case "measure":
      return `Measure turns site dimensions into Our qty on ${scope}. Those quantities land on the working bill.`;
    case "price":
      return `Price builds each rate, then writes it onto the working bill for ${scope}.`;
    case "commercial":
      return `Commercial sets the margin, the resource prices behind the rates, and the questions still open with the client. Scope: ${scope}.`;
    case "submit":
      return `Submit reads the bill for ${scope}, checks what would block a seal, then locks a revision you can send.`;
    default:
      return "Library and settings sit beside the job. They change this tender only when you apply them.";
  }
}

export function StageBar({ active, onPick }: { active: StageId | null; onPick: (id: StageId) => void }) {
  return (
    <nav className="stage-bar" aria-label="Stages">
      {STAGES.map(([id, label]) => (
        <button key={id} type="button" className={active === id ? "on" : ""} aria-current={active === id ? "page" : undefined} onClick={() => onPick(id)}>
          {label}
        </button>
      ))}
    </nav>
  );
}

export function BoqChips({
  project,
  value,
  onChange,
}: {
  project: LoadedProject;
  value: string | null;
  onChange: (billId: string | null) => void;
}) {
  const bills = sortedBills(project);
  if (!bills.length) return null;
  const showAll = bills.length > 1;
  return (
    <div className="boq-chips" role="listbox" aria-label="BOQ">
      {showAll ? (
        <button type="button" role="option" aria-selected={value == null} className={value == null ? "on" : ""} onClick={() => onChange(null)}>
          All
        </button>
      ) : null}
      {bills.map((bill) => {
        const locked = Boolean(billSourceLocked(project, bill.id));
        const on = value === bill.id;
        return (
          <button key={bill.id} type="button" role="option" aria-selected={on} className={on ? "on" : ""} title={`${bill.code} — ${bill.name}`} onClick={() => onChange(bill.id)}>
            <span className="bill-code">{bill.code}</span>
            <span className="bill-name">{bill.name}</span>
            {locked ? <span className="bill-lock">Locked</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Subnav({
  label,
  items,
  active,
  onPick,
}: {
  label: string;
  items: Array<readonly [string, string, string?]>;
  active: string;
  onPick: (id: string) => void;
}) {
  const current = items.find(([id]) => id === active);
  const hint = current?.[2];
  return (
    <div className="subnav-wrap">
      <div className="subnav" role="tablist" aria-label={label}>
        {items.map(([id, text, itemHint]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            className={active === id ? "on" : ""}
            title={itemHint}
            onClick={() => onPick(id)}
          >
            {text}
          </button>
        ))}
      </div>
      {hint ? <p className="subnav-hint">{hint}</p> : null}
    </div>
  );
}
