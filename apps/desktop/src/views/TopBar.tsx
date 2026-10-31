import { useState } from "react";
import { EmptyState } from "../ui/enterprise";

export function TopBar({
  projectName,
  projectValue,
  user,
  licenseLine,
  notices,
  recents,
  onCommand,
  onPickRecent,
  onSignOut,
  onOwner,
}: {
  projectName: string;
  projectValue: string;
  user: string;
  licenseLine: string;
  notices: Array<{ id: string; title: string; detail: string }>;
  recents: Array<{ name: string; path: string }>;
  onCommand: () => void;
  onPickRecent: (path: string) => void;
  onSignOut: () => void;
  onOwner?: () => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="command-bar">
      <details className="project-switcher">
        <summary>
          <span>{projectName}</span>
          <small>{projectValue}</small>
        </summary>
        <div className="switcher-menu" role="menu">
          <p>Recent projects</p>
          {recents.length === 0 ? <p className="hint">No saved paths yet.</p> : null}
          {recents.map((job) => (
            <button key={job.path} type="button" role="menuitem" onClick={() => onPickRecent(job.path)}>
              <strong>{job.name}</strong>
              <small>{job.path}</small>
            </button>
          ))}
        </div>
      </details>
      <button type="button" className="command-search" onClick={onCommand}>
        Search and commands
        <kbd>Ctrl K</kbd>
      </button>
      <div className="command-bar-end">
        <div className="note-wrap">
          <button type="button" aria-expanded={notesOpen} onClick={() => setNotesOpen((open) => !open)}>
            Notifications
            <span className="note-count">{notices.length}</span>
          </button>
          {notesOpen ? (
            <div className="note-panel" role="region" aria-label="Notifications">
              {notices.length === 0 ? (
                <EmptyState title="No notifications" detail="Open a job to see unused groups, broken links, and unpriced rows." />
              ) : (
                <ul>
                  {notices.map((notice) => (
                    <li key={notice.id}>
                      <strong>{notice.title}</strong>
                      <span>{notice.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
        <div className="note-wrap">
          <button type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            {user}
          </button>
          {menuOpen ? (
            <div className="note-panel" role="menu">
              <p>{licenseLine || "Signed in"}</p>
              {onOwner ? (
                <button type="button" onClick={onOwner}>
                  Owner portal
                </button>
              ) : null}
              <button type="button" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
