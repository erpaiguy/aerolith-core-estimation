import { useEffect, useMemo, useRef, useState } from "react";

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: CommandItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) => `${command.label} ${command.hint ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setCursor((index) => Math.min(index, Math.max(shown.length - 1, 0)));
  }, [shown.length]);

  if (!open) return null;
  return (
    <div className="palette-back" role="presentation" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Commands"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          placeholder="Jump to a module or command"
          aria-label="Command search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((index) => Math.min(index + 1, Math.max(shown.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const command = shown[cursor];
              if (!command) return;
              command.run();
              onClose();
            }
          }}
        />
        <ul role="listbox" aria-label="Matching commands">
          {shown.length === 0 ? <li className="hint">No matching command.</li> : null}
          {shown.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === cursor}
                className={index === cursor ? "on" : ""}
                onMouseEnter={() => setCursor(index)}
                onClick={() => {
                  command.run();
                  onClose();
                }}
              >
                <span>{command.label}</span>
                {command.hint ? <small>{command.hint}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
