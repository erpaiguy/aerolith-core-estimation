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
  items: Array<[string, string]>;
  active: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="subnav" role="tablist" aria-label={label}>
      {items.map(([id, text]) => (
        <button key={id} type="button" role="tab" aria-selected={active === id} className={active === id ? "on" : ""} onClick={() => onPick(id)}>
          {text}
        </button>
      ))}
    </div>
  );
}
