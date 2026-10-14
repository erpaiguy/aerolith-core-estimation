import { resetStoredLayout } from "./useLayoutSize";

export function ResetLayoutButton({ ids }: { ids: string[] }) {
  return (
    <button type="button" onClick={() => resetStoredLayout(ids)}>
      Reset layout
    </button>
  );
}
