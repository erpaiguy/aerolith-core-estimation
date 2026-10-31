import type { ReactNode } from "react";

export type PillTone = "draft" | "sealed" | "sample" | "locked" | "saved" | "warn";

export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`status-pill tone-${tone}`}>{children}</span>;
}

export function FilterBar({
  query,
  onQuery,
  placeholder,
  chips,
  chip,
  onChip,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  chips: string[];
  chip: string;
  onChip: (value: string) => void;
}) {
  return (
    <div className="filter-bar" role="search">
      <input
        value={query}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onQuery(event.target.value)}
      />
      <div className="filter-chips" role="toolbar" aria-label="Filters">
        {chips.map((item) => (
          <button key={item} type="button" className={item === chip ? "on" : ""} onClick={() => onChip(item)}>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DataCard({
  title,
  status,
  tone,
  lines,
  action,
  onOpen,
  selected = false,
}: {
  title: string;
  status: string;
  tone: PillTone;
  lines: string[];
  action: string;
  onOpen: () => void;
  selected?: boolean;
}) {
  return (
    <article className={`data-card ${selected ? "is-selected" : ""}`}>
      <header>
        <h2>{title}</h2>
        <StatusPill tone={tone}>{status}</StatusPill>
      </header>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button type="button" className="primary" onClick={onOpen}>
        {action}
      </button>
    </article>
  );
}

export function ChartFrame({
  title,
  bars,
  format,
}: {
  title: string;
  bars: Array<{ label: string; value: number }>;
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <figure className="chart-frame">
      <figcaption>{title}</figcaption>
      {bars.length === 0 ? <p className="hint">Nothing to chart yet.</p> : null}
      <ul>
        {bars.map((bar) => (
          <li key={bar.label}>
            <span>{bar.label}</span>
            <span className="chart-track" aria-hidden="true">
              <span style={{ width: `${Math.max(2, (bar.value / max) * 100)}%` }} />
            </span>
            <strong>{format ? format(bar.value) : String(bar.value)}</strong>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function ModuleChrome({
  kicker,
  title,
  detail,
  pill,
  children,
}: {
  kicker: string;
  title: string;
  detail: string;
  pill?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="module-chrome">
      <div>
        <p className="kicker">{kicker}</p>
        <h1 className="view">{title}</h1>
        <p className="hint">{detail}</p>
      </div>
      {pill}
      {children}
    </header>
  );
}
