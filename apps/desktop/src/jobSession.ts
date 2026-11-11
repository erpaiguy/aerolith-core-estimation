/** Close the job only after a save that actually finished. Cancel and failure stay on the job. */
export async function closeJobIfSaved(save: () => Promise<boolean>, leave: () => void): Promise<boolean> {
  let saved = false;
  try {
    saved = await save();
  } catch {
    saved = false;
  }
  if (saved) leave();
  return saved;
}

/** Amend is an edit. A sealed, read-only, or role-locked job must not open it. */
export function openAmend(editLocked: boolean, open: () => void): boolean {
  if (editLocked) return false;
  open();
  return true;
}

export const SAVE_CANCELLED = "Save cancelled. The job is still open.";
