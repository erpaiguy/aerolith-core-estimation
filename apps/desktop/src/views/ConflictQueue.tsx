import type { ConflictItem } from "../platform/types";

export function ConflictQueue({
  conflicts,
  onPick,
  onDismiss,
}: {
  conflicts: ConflictItem[];
  onPick: (id: string, side: "local" | "replica") => void;
  onDismiss: () => void;
}) {
  if (!conflicts.length) return null;
  return (
    <div className="conflict-queue">
      <h3>Sync conflicts</h3>
      <p className="hint">
        Money fields cannot merge silently. Pick local or replica for each row.
      </p>
      {conflicts.map((c) => (
        <div className="conflict" key={c.id}>
          <strong>
            {c.boqCode} · {c.field}
          </strong>
          <p>
            Local {c.local} · Replica {c.replica}
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => onPick(c.id, "local")}>
              Keep local
            </button>
            <button type="button" onClick={() => onPick(c.id, "replica")}>
              Take replica
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={onDismiss}>
        Close queue
      </button>
    </div>
  );
}
