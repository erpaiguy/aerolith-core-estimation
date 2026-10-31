import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const SECTIONS = [
  {
    id: "flow",
    title: "How a tender moves",
    body: [
      "Overview is the reading room. It does not edit the bill. It shows direct cost, the margin, and the working total for the building you have open, and it can jump you to lines that still need a rate, a quantity, or an analysis.",
      "Source is the client bill as issued. Add BOQ brings another bill into the same job. Amend BOQ revises one that is already here. Lock a building when those client quantities must not change.",
      "Measure is the take-off. Dimensions you enter become Our qty on the working bill.",
      "Price has two rooms. Rate analysis builds one item from labour, material, plant, and subcontract. Working BOQ is the whole bill with your quantities and those rates written on it.",
      "Commercial holds the margin stack (overhead, profit, logistics, contingency), the resource prices behind the analyses, and the queries still open with the client.",
      "Submit is the bill as it will be read, then the checks that would block a seal, then the seal that locks the revision.",
    ],
  },
  {
    id: "buildings",
    title: "Buildings and locked bills",
    body: [
      "The BOQ menu is the building you are looking at. All buildings adds every bill. Choosing one building limits the grids and the totals to that bill. The same item number can exist on more than one bill; the rate still comes from one analysis.",
      "Locked on a building means the client quantities on that bill stay as issued. You can still price them. You do not rewrite the source.",
    ],
  },
  {
    id: "numbers",
    title: "How the totals are built",
    body: [
      "Direct cost is the resource total on the analysed items, before margin.",
      "Margin is overhead, profit, logistics, and contingency, taken from the rules on Commercial → Margins. A rule can cover the job, one building, a section, a category, or a single item.",
      "The working total is direct cost plus that margin. It is the figure Overview, the status bar, and the submission are describing.",
      "On Overview, bars in one chart share a single track and the amounts share one column, so a longer bar and a larger amount are the same comparison.",
    ],
  },
  {
    id: "tools",
    title: "Search, undo, and print",
    body: [
      "Search items filters the lists on Measure and Price. It does not search the whole job file.",
      "Undo reverses the last edit. Redo is in the File menu, next to Undo.",
      "Print and Save PDF sit on the sheet you are reading. The page layout is chosen in Settings → Report layouts.",
      "Settings is the license, appearance, currency, and the library of units and resources. Closing the job from File returns you to the desk without sealing.",
    ],
  },
] as const;

export function HelpSheet({
  open,
  section,
  onClose,
}: {
  open: boolean;
  section: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const node = cardRef.current?.querySelector<HTMLElement>(`#help-${section}`);
    node?.scrollIntoView({ block: "start" });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, section]);

  if (!open) return null;

  return createPortal(
    <div className="help-sheet" role="presentation" onMouseDown={onClose}>
      <div
        ref={cardRef}
        className="help-sheet-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="help-title">Using Bid Craft</h2>
          <button ref={closeRef} type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="help-sheet-body">
          {SECTIONS.map((block) => (
            <section key={block.id} id={`help-${block.id}`} aria-labelledby={`help-${block.id}-title`}>
              <h3 id={`help-${block.id}-title`}>{block.title}</h3>
              {block.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
