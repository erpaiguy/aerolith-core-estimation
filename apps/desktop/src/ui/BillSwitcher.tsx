import type { ReactNode } from "react";
import type { LoadedProject } from "../model";
import { sortedBills } from "../bills";
import { Split } from "./Split";

export function BillSwitcher({
  project,
  value,
  onChange,
  allowAll = true,
}: {
  project: LoadedProject;
  value: string | null;
  onChange: (billId: string | null) => void;
  allowAll?: boolean;
}) {
  const bills = sortedBills(project);
  if (!bills.length) return null;
  const showAll = allowAll && bills.length > 1;
  return (
    <div className="seg boq-seg boq-stack" role="listbox" aria-label="BOQ">
      {showAll ? (
        <button
          type="button"
          role="option"
          aria-selected={value == null}
          className={value == null ? "primary" : ""}
          onClick={() => onChange(null)}
        >
          All BOQs
        </button>
      ) : null}
      {bills.map((b) => (
        <button
          key={b.id}
          type="button"
          role="option"
          aria-selected={value === b.id}
          className={value === b.id ? "primary" : ""}
          onClick={() => onChange(b.id)}
          title={b.issuedRef || b.name}
        >
          <span className="bill-code">{b.code}</span>
          <span className="bill-name">{b.name}</span>
        </button>
      ))}
    </div>
  );
}

export function BoqSplit({
  project,
  value,
  onChange,
  allowAll = true,
  children,
}: {
  project: LoadedProject;
  value: string | null;
  onChange?: (billId: string | null) => void;
  allowAll?: boolean;
  children: ReactNode;
}) {
  const bills = sortedBills(project);
  if (bills.length <= 1 || !onChange) return children;
  return (
    <Split id="boq-rail" axis="x" defaultSize={220} min={160} max={380} className="boq-split">
      <aside className="boq-rail" aria-label="BOQs">
        <p className="boq-rail-label">BOQ</p>
        <BillSwitcher project={project} value={value} onChange={onChange} allowAll={allowAll} />
      </aside>
      <div className="boq-split-main">{children}</div>
    </Split>
  );
}
