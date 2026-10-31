import type { FinalisePane } from "../finalise";
import type { Activity, LoadedProject } from "../model";
import { billById, billSourceLocked, sortedBills } from "../bills";
import type { LineFocus } from "../lineFocus";
import type { BarMenuItem } from "./AppBar";
import type { StageId } from "./FrameChrome";
import type { SettingsTab } from "./SettingsView";

export type WorkspaceMenu = {
  label: string;
  items: BarMenuItem[];
  /** Marks the menu that owns the screen currently open. */
  active?: boolean;
};

export function boqMenuLabel(project: LoadedProject, billFocus: string | null): string {
  const bills = sortedBills(project);
  if (!billFocus && bills.length > 1) return "BOQ · All";
  const bill = billById(project, billFocus) ?? bills[0];
  return bill ? `BOQ · ${bill.code}` : "BOQ";
}

export function scopeLabel(project: LoadedProject, billFocus: string | null): string {
  const bills = sortedBills(project);
  if (!billFocus && bills.length > 1) return "all buildings";
  const bill = billById(project, billFocus) ?? bills[0];
  return bill ? `${bill.code} ${bill.name}` : "this job";
}

export function workspaceMenus(input: {
  stage: StageId | "utility";
  activity: Activity;
  finalisePane: FinalisePane;
  project: LoadedProject;
  billFocus: string | null;
  editLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  showInspector: boolean;
  inspectorOpen: boolean;
  onOpen: () => void;
  onSave: () => void;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleInspector: () => void;
  onGo: (id: Activity) => void;
  onException: (kind: LineFocus) => void;
  onBill: (id: string | null) => void;
  onAddBoq: () => void;
  onAmendBoq: () => void;
  onSubmitStep: (id: "summary" | "checks" | "seal") => void;
  onSettings: (tab: SettingsTab) => void;
  onLibrary: () => void;
  onHelp: (section: string) => void;
}): WorkspaceMenu[] {
  const bills = sortedBills(input.project);
  const showAll = bills.length > 1;

  const file: WorkspaceMenu = {
    label: "File",
    items: [
      { label: "Open", hint: "Open an .aero job from this computer.", onSelect: input.onOpen },
      { label: "Save", hint: "Write this job back to its .aero file.", onSelect: input.onSave },
      { label: "Close", hint: "Leave this job and return to the desk.", onSelect: input.onClose },
      { label: "Undo", hint: "Reverse the last edit.", separatorBefore: true, disabled: !input.canUndo, onSelect: input.onUndo },
      { label: "Redo", hint: "Apply the edit you just undid.", disabled: !input.canRedo, onSelect: input.onRedo },
      ...(input.showInspector
        ? [
            {
              label: input.inspectorOpen ? "Hide inspector" : "Show inspector",
              hint: "The side panel for the selected line.",
              onSelect: input.onToggleInspector,
            },
          ]
        : []),
    ],
  };

  const overview: WorkspaceMenu = {
    label: "Overview",
    active: input.stage === "overview",
    items: [
      {
        label: "Job overview",
        hint: "Cost, margin, and working total for the building you have open.",
        active: input.activity === "dashboard",
        onSelect: () => input.onGo("dashboard"),
      },
      {
        label: "Unpriced items",
        hint: "Lines whose rate is still zero. Opens them on the working bill.",
        separatorBefore: true,
        onSelect: () => input.onException("unpriced"),
      },
      {
        label: "Quantity differences",
        hint: "Where Our qty does not match the client qty.",
        onSelect: () => input.onException("diff"),
      },
      {
        label: "Missing analysis",
        hint: "Items with no rate build-up and no selected quote.",
        onSelect: () => input.onException("missing"),
      },
    ],
  };

  const source: WorkspaceMenu = {
    label: "Source",
    active: input.stage === "source",
    items: [
      {
        label: "Client BOQ",
        hint: "The bill as issued. This is the source the rest of the job prices.",
        active: input.activity === "source",
        onSelect: () => input.onGo("source"),
      },
      {
        label: "Add BOQ",
        hint: "Bring another issued bill into this job.",
        separatorBefore: true,
        disabled: input.editLocked,
        onSelect: input.onAddBoq,
      },
      {
        label: "Amend BOQ",
        hint: "Revise the client bill already in the job.",
        disabled: input.editLocked,
        onSelect: input.onAmendBoq,
      },
    ],
  };

  const measure: WorkspaceMenu = {
    label: "Measure",
    active: input.stage === "measure",
    items: [
      {
        label: "Take-off",
        hint: "Site dimensions for the selected item. They become Our qty on the working bill.",
        active: input.activity === "takeoff",
        onSelect: () => input.onGo("takeoff"),
      },
    ],
  };

  const price: WorkspaceMenu = {
    label: "Price",
    active: input.stage === "price",
    items: [
      {
        label: "Working BOQ",
        hint: "Your quantities and rates, written against the client bill.",
        active: input.activity === "estimate",
        onSelect: () => input.onGo("estimate"),
      },
      {
        label: "Rate analysis",
        hint: "Build the rate for an item from labour, material, plant, and subcontract.",
        onSelect: () => input.onGo("analysis"),
      },
    ],
  };

  const commercial: WorkspaceMenu = {
    label: "Commercial",
    active: input.stage === "commercial",
    items: [
      {
        label: "Margins",
        hint: "Overhead, profit, logistics, and contingency. This is what turns cost into the working total.",
        active: input.activity === "margins",
        onSelect: () => input.onGo("margins"),
      },
      {
        label: "Resource prices",
        hint: "The rate book behind every analysis. Changing a price reprices the resources that use it.",
        onSelect: () => input.onGo("buy"),
      },
      {
        label: "Client queries",
        hint: "Questions still open with the client, and replies that should change the bill.",
        onSelect: () => input.onGo("queries"),
      },
    ],
  };

  const submit: WorkspaceMenu = {
    label: "Submit",
    active: input.stage === "submit",
    items: [
      {
        label: "Summary",
        hint: "The submission bill as it will be read.",
        active: input.activity === "submit" || (input.activity === "finalise" && input.finalisePane !== "checks" && input.finalisePane !== "pack"),
        onSelect: () => input.onSubmitStep("summary"),
      },
      {
        label: "Checks",
        hint: "What still blocks a clean seal.",
        active: input.activity === "finalise" && input.finalisePane === "checks",
        onSelect: () => input.onSubmitStep("checks"),
      },
      {
        label: "Seal",
        hint: "Lock this revision so the packet can be sent.",
        active: input.activity === "finalise" && input.finalisePane === "pack",
        onSelect: () => input.onSubmitStep("seal"),
      },
    ],
  };

  const boqItems: BarMenuItem[] = [
    ...(showAll
      ? [
          {
            label: "All buildings",
            hint: "Add every bill in the job. The grand summary stays in view.",
            active: input.billFocus == null,
            onSelect: () => input.onBill(null),
          },
        ]
      : []),
    ...bills.map((bill) => {
      const locked = Boolean(billSourceLocked(input.project, bill.id));
      return {
        label: `${bill.code}  ${bill.name}`,
        hint: locked
          ? "Client quantities on this bill are locked."
          : bill.issuedRef
            ? `Issued reference ${bill.issuedRef}.`
            : "Limit the screens and the totals to this bill.",
        separatorBefore: showAll && bill === bills[0],
        active: input.billFocus === bill.id,
        onSelect: () => input.onBill(bill.id),
      };
    }),
  ];

  const boq: WorkspaceMenu = {
    label: boqMenuLabel(input.project, input.billFocus),
    items: boqItems,
  };

  const settings: WorkspaceMenu = {
    label: "Settings",
    active: input.activity === "settings" || input.activity === "masters",
    items: [
      { label: "License", hint: "Account, plan, and renewal.", active: input.activity === "settings", onSelect: () => input.onSettings("license") },
      { label: "Appearance", hint: "Light or dark, density, and how the centre of the screen is arranged.", onSelect: () => input.onSettings("appearance") },
      { label: "Numbers", hint: "Currency and how many decimal places money and quantities show.", onSelect: () => input.onSettings("numbers") },
      { label: "Report layouts", hint: "The pages Print and Save PDF use.", onSelect: () => input.onSettings("report") },
      { label: "Updates", hint: "Whether Bid Craft looks for a newer version.", onSelect: () => input.onSettings("updates") },
      { label: "Legal", hint: "Terms and the notices that ship with the app.", separatorBefore: true, onSelect: () => input.onSettings("legal") },
      { label: "Library", hint: "Units and the resource master shared by this workspace.", separatorBefore: true, active: input.activity === "masters", onSelect: input.onLibrary },
    ],
  };

  const help: WorkspaceMenu = {
    label: "Help",
    items: [
      { label: "How a tender moves", hint: "Source, measure, price, commercial, then submit.", onSelect: () => input.onHelp("flow") },
      { label: "Buildings and locked bills", hint: "What All means, and what Locked protects.", onSelect: () => input.onHelp("buildings") },
      { label: "How the totals are built", hint: "Direct cost, the margin stack, and the working total.", onSelect: () => input.onHelp("numbers") },
      { label: "Search, undo, and print", hint: "The tools that sit on the bar, not inside a step.", onSelect: () => input.onHelp("tools") },
    ],
  };

  return [file, overview, source, measure, price, commercial, submit, boq, settings, help];
}
