import { useState, type ReactNode } from "react";
import type { LicenseSession } from "../auth/licenseState";
import type { LoadedProject, QtoLine, WorkingItem } from "../model";
import type { Session } from "../platform/store";
import { jobFigures } from "./figures";
import { Shell } from "./chrome";
import { AnalysisScreen, DashboardScreen, FinaliseScreen, MarginsScreen, QueriesScreen, SourceScreen, SubmitScreen, TakeoffScreen, WorkingScreen, type MeasureApi } from "./Measure";
import { CloneScreen, CompareScreen, ComponentScreen, EnquiriesScreen, FollowScreen, PricesScreen, RegisterScreen, ResourceScreen } from "./Commercial";
import { CategoriesScreen, DesignScreen, MastersScreen, ReportsScreen, SettingsScreen } from "./Library";
import type { Pane } from "./routes";

export function JobWorkspace({
  pane,
  onPane,
  project,
  billId,
  onBill,
  locked,
  selected,
  onSelect,
  onCommit,
  onPatch,
  onQto,
  onAddItem,
  onAddSection,
  onRemove,
  onAmend,
  onSeal,
  onRevision,
  who,
  saved,
  licence,
  fileName,
  showOwner,
  session,
  license,
  licenseBusy,
  onJobs,
  onOpen,
  onSave,
  onClose,
  onSignOut,
  onOwner,
  onRefresh,
  onAccount,
  onPricing,
  onCheckUpdate,
  onCompare,
  onSaveFormat,
  onSaveCatalog,
  onPromote,
  notice,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  pane: Pane;
  onPane: (pane: Pane) => void;
  project: LoadedProject;
  billId: string | null;
  onBill: (id: string) => void;
  locked: boolean;
  selected: string | null;
  onSelect: (key: string) => void;
  onCommit: (next: LoadedProject) => void;
  onPatch: (code: string, patch: Partial<WorkingItem>) => void;
  onQto: (lines: QtoLine[]) => void;
  onAddItem: () => void;
  onAddSection: () => void;
  onRemove: (code: string) => void;
  onAmend: () => void;
  onSeal: () => void;
  onRevision: () => void;
  who: string;
  saved: string;
  licence: string;
  fileName: string;
  showOwner: boolean;
  session: Session;
  license: LicenseSession;
  licenseBusy: boolean;
  onJobs: () => void;
  onOpen: () => void;
  onSave: () => void;
  onClose: () => void;
  onSignOut: () => void;
  onOwner?: () => void;
  onRefresh: () => void;
  onAccount: () => void;
  onPricing: () => void;
  onCheckUpdate: () => void;
  onCompare: () => void;
  onSaveFormat: (format: import("../reportFormat").ReportFormat) => void;
  onSaveCatalog: () => void;
  onPromote: (kind: "unit" | "category" | "vendor", code: string, label: string) => void;
  notice?: ReactNode;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const [resourceCode, setResourceCode] = useState<string | null>(project.resources[0]?.project_code ?? null);
  const [lineIndex, setLineIndex] = useState<number | null>(0);
  const [toast, setToast] = useState("");
  const fig = jobFigures(project, billId);
  const measure: MeasureApi = {
    project, billId, locked, selected, onSelect, onPatch, onCommit, onPane, onQto, onAddItem, onAddSection, onRemove, onAmend, onSeal, onRevision,
    onEditLine: setLineIndex,
  };
  const commercial = {
    project, billId, locked, selected, resourceCode, lineIndex, onSelect, onResource: setResourceCode, onCommit, onPatch, onPane,
  };
  return (
    <Shell
      pane={pane}
      projectName={project.name}
      location={project.locationNote || "This job"}
      revision={project.sealedAt ? `Sealed r${project.revision}` : `Draft r${project.revision}`}
      total={fig.total}
      currency={project.currency}
      who={who}
      saved={saved}
      licence={licence}
      fileName={fileName || `${project.name}.aero`}
      unpriced={fig.unpriced.length}
      qtyDiffs={fig.qtyDiff.length}
      openQueries={fig.openQueries.length}
      sealed={fig.sealed}
      showOwner={showOwner}
      notice={notice}
      onPane={onPane}
      onJobs={onJobs}
      onOpen={onOpen}
      onSave={onSave}
      onClose={onClose}
      onSignOut={onSignOut}
      onOwner={onOwner}
      onAddItem={onAddItem}
      onAddSection={onAddSection}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={onUndo}
      onRedo={onRedo}
    >
      {toast ? <div className="banner" role="status">{toast} <button className="b s" type="button" onClick={() => setToast("")}>Dismiss</button></div> : null}
      {pane === "dashboard" ? <DashboardScreen api={measure} onBill={onBill} /> : null}
      {pane === "source" ? <SourceScreen api={measure} onBill={onBill} /> : null}
      {pane === "takeoff" ? <TakeoffScreen api={measure} /> : null}
      {pane === "estimate" ? <WorkingScreen api={measure} /> : null}
      {pane === "analysis" ? <AnalysisScreen api={measure} /> : null}
      {pane === "margins" ? <MarginsScreen api={measure} /> : null}
      {pane === "queries" ? <QueriesScreen api={measure} /> : null}
      {pane === "submit" ? <SubmitScreen api={measure} /> : null}
      {pane === "finalise" ? <FinaliseScreen api={measure} /> : null}
      {pane === "buy" ? <PricesScreen api={commercial} /> : null}
      {pane === "resource" ? <ResourceScreen api={commercial} /> : null}
      {pane === "enquiries" ? <EnquiriesScreen api={commercial} /> : null}
      {pane === "compare" ? <CompareScreen api={commercial} /> : null}
      {pane === "followup" ? <FollowScreen api={commercial} /> : null}
      {pane === "register" ? <RegisterScreen api={commercial} /> : null}
      {pane === "clone" ? <CloneScreen api={commercial} /> : null}
      {pane === "component" ? <ComponentScreen api={commercial} /> : null}
      {pane === "reports" ? <ReportsScreen project={project} billId={billId} onPane={onPane} onSaveFormat={onSaveFormat} /> : null}
      {pane === "masters" ? <MastersScreen project={project} locked={locked} onCommit={onCommit} onPane={onPane} onSaveCatalog={onSaveCatalog} onPromote={onPromote} /> : null}
      {pane === "categories" ? <CategoriesScreen project={project} locked={locked} onCommit={onCommit} /> : null}
      {pane === "settings" ? (
        <SettingsScreen
          project={project}
          session={session}
          license={license}
          licenseBusy={licenseBusy}
          locked={locked}
          onCommit={onCommit}
          onPane={onPane}
          onRefresh={onRefresh}
          onAccount={onAccount}
          onPricing={onPricing}
          onSignOut={onSignOut}
          onCheckUpdate={onCheckUpdate}
          onCompare={onCompare}
        />
      ) : null}
      {pane === "design" ? <DesignScreen onToast={setToast} /> : null}
    </Shell>
  );
}
