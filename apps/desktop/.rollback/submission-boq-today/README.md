# Rollback: Submission BOQ before Plan C dual surface

Taken before the priced-grid + packet-preview flow.

Git was not available on this machine, so restore by copying these files back:

- `DocumentRenderer.tsx` → `apps/desktop/src/views/DocumentRenderer.tsx`
- `reportExport.ts` → `apps/desktop/src/reportExport.ts`
- `styles.css` → `apps/desktop/src/styles.css`

That restores the print-first Submission BOQ (paper preview + live report designer).
