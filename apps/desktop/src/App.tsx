import { formatMoney, formatPct, moneyClose, configureDisplayFormat, mergeDisplayFormat } from "@aerolith/shared";
import { useEffect, useState, type CSSProperties } from "react";
import { emptyProject, loadCampusSampleProject, loadReferenceProject } from "./loadReference";
import type { Activity, LoadedProject, QtoLine, WorkingItem } from "./model";
import { GOLDEN_TOTAL, hasAnalysisBackup, inferParents, newId, stampItem } from "./model";
import { useAerolithLicense } from "./auth/useAerolithLicense";
import { allowsData, describeLicense, licenseBanner, resolveAccess } from "./auth/licenseState";
import { planDisplayName } from "./auth/subscriptionPlans";
import {
  can,
  ensurePlatform,
  logAudit,
  pushRecent,
  savePlatform,
  saveTenantCatalog,
  sessionScope,
  type Session,
} from "./platform/store";
import type { ConflictItem, PlatformState, PromotionRequest } from "./platform/types";
import { isSoloTenant } from "./platform/tenant";
import {
  applyCatalogToProject,
  applyPromotion,
  bumpCatalog,
  catalogSource,
  effectiveCatalog,
  promotionFromProject,
} from "./tenantCatalog";
import { filterableColumns } from "./boqColumns";
import { applyQtoPosting, applyReplicaPick, diffReplica, uid, withResults } from "./projectCompute";
import { effectiveMarginPct } from "./marginRules";
import {
  DEFAULT_BILL_ID,
  billById,
  billSourceLocked,
  billTotal,
  displayItemRef,
  findItemByKey,
  itemKeyOf,
  parseItemKey,
  quoteMatchesItem,
  sameItemKey,
  sortedBills,
  visibleItems,
} from "./bills";
import { BoqSplit } from "./ui/BillSwitcher";
import { mergeReportFormat, type ReportFormat, type StoredReportTemplate } from "./reportFormat";
import type { ReportFormatPack } from "./views/ReportDesigner";
import { BuyView } from "./views/BuyView";
import { ConflictQueue } from "./views/ConflictQueue";
import { DashboardView } from "./views/DashboardView";
import { FinaliseView } from "./views/FinaliseView";
import type { FinalisePane, SubmissionIssue } from "./finalise";
import { MarginsView } from "./views/MarginsView";
import { HomeView } from "./views/HomeView";
import { ImportWizard } from "./views/ImportWizard";
import { LicensePanel } from "./views/LicensePanel";
import { LoginView } from "./views/LoginView";
import { SplashShell } from "./views/SplashShell";
import { PrintProvider } from "./print/context";
import { Sidebar, type SidebarTarget } from "./views/Sidebar";
import { applyTheme, readTheme, type ThemeName } from "./theme";
import { checkForUpdate, updatesAutoEnabled, type UpdateOffer } from "./updates";
import { cloneResourceMaster, pushRateToMaster } from "./resourceMaster";
import { copyGlobalMaster, projectWithMaster } from "./projectResourceMaster";
import { MastersView } from "./views/MastersView";
import { OwnerView } from "./views/OwnerView";
import { SettingsView } from "./views/SettingsView";
import { TenderQueriesView } from "./views/TenderQueriesView";
import { EstimateView, Inspector, SourceView, SubmitView } from "./views/WorkspaceViews";
import { TakeoffInspector, TakeoffView } from "./views/TakeoffView";
import { RateAnalysisView } from "./views/RateAnalysisView";
import { usePersistedNumber } from "./ui/useLayoutSize";

type Screen = "login" | "owner" | "home" | "import" | "project";

export function App() {
  const [platform, setPlatform] = useState<PlatformState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>("login");
  const [project, setProject] = useState<LoadedProject | null>(null);
  const [activity, setActivity] = useState<Activity>("estimate");
  const [finalisePane, setFinalisePane] = useState<FinalisePane>("summary");
  const [settingsTab, setSettingsTab] = useState<"license" | "legal">("license");
  const [settingsFocus, setSettingsFocus] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [qtoLineId, setQtoLineId] = useState<string | null>(null);
  const [rateCode, setRateCode] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [replica, setReplica] = useState<LoadedProject | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [billFocus, setBillFocus] = useState<string | null>(DEFAULT_BILL_ID);
  const [importMode, setImportMode] = useState<"create" | "append" | "amend">("create");
  const inspectorW = usePersistedNumber("aerolith-split:inspector", 300, 220, 560);
  const license = useAerolithLicense();
  const [theme, setTheme] = useState<ThemeName>(readTheme);
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem("bidcraft.navCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const [masterTab, setMasterTab] = useState<"units" | "categories" | "vendors" | "resources">("units");
  const [updateOffer, setUpdateOffer] = useState<UpdateOffer | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => {
    if (!updatesAutoEnabled()) return;
    void checkForUpdate().then(setUpdateOffer).catch(() => undefined);
  }, []);

  useEffect(() => {
    void ensurePlatform()
      .then(setPlatform)
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : "Could not start the workspace.");
      });
  }, []);

  useEffect(() => {
    if (!platform || !license.ready || !license.session.isAuthenticated) return;
    setSession((current) => current ?? workspaceSession(platform));
  }, [platform, license.ready, license.session.isAuthenticated]);

  const tenant = session?.kind === "tenant" ? session.tenant : null;
  const liveTenant = tenant && platform ? (platform.tenants.find((t) => t.id === tenant.id) ?? tenant) : tenant;
  const workspaceId = liveTenant?.id ?? (session?.kind === "owner" ? "owner" : null);
  const reportFormat = mergeReportFormat(liveTenant?.reportFormat);
  const displayFormat = mergeDisplayFormat(liveTenant?.displayFormat);
  const access = resolveAccess(license.session);
  const licenseReadOnly = license.session.isAuthenticated && !allowsData(access);
  const licenseLine = license.session.isAuthenticated ? describeLicense(license.session) : "";
  const roleEdit = (mod: string) => can(session, mod, "edit");
  const permModule =
    activity === "analysis" || activity === "queries" || activity === "margins" || activity === "finalise" ? "estimate" : activity;
  const sealed = Boolean(project?.sealedAt);
  const editLocked =
    licenseReadOnly || sealed || (session?.kind === "tenant" && !roleEdit(permModule));

  useEffect(() => {
    configureDisplayFormat({
      ...displayFormat,
      currency: project?.currency ?? displayFormat.currency,
    });
  }, [
    displayFormat.currency,
    displayFormat.qtyDecimals,
    displayFormat.rateDecimals,
    displayFormat.amountDecimals,
    displayFormat.nosDecimals,
    displayFormat.dimDecimals,
    project?.currency,
  ]);

  function applyPlatform(next: PlatformState) {
    setPlatform(next);
    setSession((s) => {
      if (!s || s.kind !== "tenant") return s;
      const t = next.tenants.find((x) => x.id === s.tenant.id);
      if (!t) return s;
      const user = t.users.find((u) => u.id === s.userId);
      const role = (user && t.roles.find((r) => r.id === user.roleId)) || s.role;
      return { ...s, tenant: t, role };
    });
  }

  function saveReportFormat(next: ReportFormat, pack?: ReportFormatPack) {
    if (!platform || !liveTenant) return;
    const nextPlat: PlatformState = {
      ...platform,
      tenants: platform.tenants.map((t) =>
        t.id === liveTenant.id
          ? {
              ...t,
              reportFormat: next as unknown as Record<string, unknown>,
              ...(pack
                ? {
                    reportTemplates: pack.templates,
                    activeReportTemplateId: pack.activeId,
                  }
                : {}),
            }
          : t,
      ),
    };
    savePlatform(nextPlat);
    applyPlatform(nextPlat);
  }

  function openProject(next: LoadedProject, path?: string | null) {
    const live = withResults(next);
    setProject(live);
    setActivity("dashboard");
    setSelected(null);
    setQtoLineId(null);
    setRateCode(null);
    setBillFocus(sortedBills(live)[0]?.id ?? DEFAULT_BILL_ID);
    setSaveMsg("");
    setFilePath(path ?? null);
    setConflicts([]);
    setReplica(null);
    setScreen("project");
    if (path) {
      const scope = workspaceId ?? sessionScope(session);
      if (scope) pushRecent(next.name, path, scope);
    }
  }

  function openNew() {
    openProject(
      emptyProject(
        "New project",
        displayFormat.currency,
        effectiveCatalog(liveTenant),
        cloneResourceMaster(liveTenant?.resourceMaster ?? []),
      ),
    );
    setActivity("estimate");
    setSelected(`${DEFAULT_BILL_ID}::1a`);
  }

  function openReference() {
    try {
      openProject(loadReferenceProject());
      setActivity("estimate");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not open the reference project.");
    }
  }

  function signOut() {
    void license.logout().then(() => {
      setSession(null);
      setProject(null);
      setFilePath(null);
      setScreen("login");
    });
  }

  function openCampusSample() {
    try {
      openProject(loadCampusSampleProject());
      setActivity("estimate");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not open the campus sample.");
    }
  }

  async function openAeroFile(pathHint?: string) {
    try {
      const { isTauri, openAeroFromDisk, readAeroAtPath } = await import("./nativeAero");
      if (!isTauri()) {
        window.alert("Open .aero from disk is available in the desktop app (npm run dev:desktop).");
        return;
      }
      const picked = pathHint ? await readAeroAtPath(pathHint) : await openAeroFromDisk(liveTenant?.id);
      if (!picked) return;
      const { aeroToProject } = await import("./aero");
      openProject(await aeroToProject(picked.bytes), picked.path);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not open .aero");
    }
  }

  async function saveAero() {
    if (!project) return;
    try {
      const native = await import("./nativeAero");
      if (native.isTauri()) {
        const path = await native.pickSaveAeroPath(project.name, filePath, liveTenant?.id);
        if (!path) return;
        setSaveMsg("Saving…");
        const { projectToAero } = await import("./aero");
        const saved = await native.writeAeroBytes(path, await projectToAero(project));
        setFilePath(saved);
        const scope = workspaceId ?? sessionScope(session);
        if (scope) pushRecent(project.name, saved, scope);
        setSaveMsg(`Saved ${saved}`);
        return;
      }
      const { projectToAero, downloadAero } = await import("./aero");
      const bytes = await projectToAero(project);
      try {
        const picked = await native.saveAeroWithBrowserPicker(bytes, project.name);
        if (picked) {
          setSaveMsg(`Saved ${picked}`);
          return;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        throw err;
      }
      downloadAero(bytes, project.name);
      setSaveMsg("Saved .aero to your downloads folder (browser preview).");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save .aero";
      setSaveMsg(message);
      window.alert(message);
    }
  }

  async function compareReplica() {
    if (!project) return;
    try {
      const { isTauri, openAeroFromDisk, pickAeroBytesInBrowser } = await import("./nativeAero");
      const { aeroToProject } = await import("./aero");
      let bytes: Uint8Array | null = null;
      if (isTauri()) {
        const picked = await openAeroFromDisk(liveTenant?.id);
        if (!picked) return;
        bytes = picked.bytes;
      } else {
        bytes = await pickAeroBytesInBrowser();
        if (!bytes) return;
      }
      const other = withResults(await aeroToProject(bytes));
      const found = diffReplica(project, other);
      setReplica(other);
      setConflicts(found);
      if (!found.length) window.alert("No money-field conflicts with that replica.");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not compare replica");
    }
  }

  function commit(next: LoadedProject, kind: "edit" | "seal" | "revision" = "edit") {
    if (licenseReadOnly) return;
    if (session?.kind === "tenant" && !can(session, permModule, "edit") && kind === "edit") return;
    if (project?.sealedAt && kind === "edit") return;
    setProject(withResults({ ...next, isDemo: false }));
  }

  function patchItem(code: string, patch: Partial<WorkingItem>) {
    if (!project || editLocked) return;
    const nextPatch: Partial<WorkingItem> = { ...patch };
    if (patch.directCost != null && patch.priceMode == null && patch.lines == null) {
      nextPatch.priceMode = "direct";
    }
    if (patch.lines != null && patch.priceMode == null) {
      nextPatch.priceMode = "analysis";
    }
    if (patch.clientQty != null && billSourceLocked(project, findItemByKey(project.items, code)?.billId ?? "")) {
      const { clientQty: _c, ...rest } = nextPatch;
      if (Object.keys(rest).length === 0) return;
      commit({
        ...project,
        items: project.items.map((i) => (sameItemKey(i, code) ? { ...i, ...rest } : i)),
      });
      return;
    }
    if (nextPatch.extra) {
      const current = findItemByKey(project.items, code);
      const extra = { ...(current?.extra ?? {}), ...nextPatch.extra };
      if (current && billSourceLocked(project, current.billId)) {
        for (const col of project.clientColumns.filter((c) => c.role === "extra")) {
          extra[col.id] = current?.extra?.[col.id] ?? "";
        }
      }
      nextPatch.extra = extra;
    }
    commit({
      ...project,
      items: project.items.map((i) => (sameItemKey(i, code) ? { ...i, ...nextPatch } : i)),
    });
  }

  function openRate(code: string) {
    setSelected(code);
    setRateCode(code);
    const { billId } = parseItemKey(code);
    if (billId) setBillFocus(billId);
    setActivity("analysis");
  }

  function lastSection(): string {
    if (!project) return "1";
    const pool = billFocus ? project.items.filter((i) => i.billId === billFocus) : project.items;
    return [...pool].reverse().find((i) => i.kind === "section")?.boqCode ?? "1";
  }

  function addItem() {
    if (!project || editLocked || !billFocus) return;
    const billId = billFocus;
    const pool = project.items.filter((i) => i.billId === billId);
    const n = pool.filter((i) => i.kind === "item").length + 1;
    const parent = lastSection();
    const code = `${parent}${n}`;
    const item = stampItem({
      billId,
      boqCode: code,
      slNo: String(n),
      kind: "item",
      parentCode: parent,
      description: "New item",
      boqCategory: pool.find((i) => i.boqCode === parent)?.description ?? null,
      workCategory: null,
      subWorkCategory: null,
      group1: null,
      group2: null,
      group3: null,
      clientQty: billSourceLocked(project, billId) ? 0 : 1,
      ourQty: 1,
      unit: "Nr",
      directCost: 0,
      priceMode: "analysis",
      analysisOrigin: "own",
      includes: [],
      lines: [],
    });
    commit({
      ...project,
      items: [...project.items, item],
      qtoLines: [
        ...project.qtoLines,
        {
          id: uid("qto"),
          billId,
          workCategory: null,
          drawing: null,
          locationDesc: null,
          itemLabel: item.description,
          subItem: null,
          formulaKey: "qty",
          dims: { l: 1 },
          workingBoqCode: itemKeyOf(item),
        },
      ],
    });
    setSelected(itemKeyOf(item));
    setActivity("estimate");
    setRateCode(null);
  }

  function addSection() {
    if (!project || editLocked || !billFocus) return;
    const billId = billFocus;
    const n = project.items.filter((i) => i.billId === billId && i.kind === "section").length + 1;
    const code = String(n);
    commit({
      ...project,
      items: inferParents([
        ...project.items,
        stampItem({
          billId,
          boqCode: code,
          slNo: code,
          kind: "section",
          parentCode: null,
          description: `Section ${n}`,
          boqCategory: null,
          workCategory: null,
          subWorkCategory: null,
          group1: null,
          group2: null,
          group3: null,
          clientQty: 0,
          ourQty: 0,
          unit: null,
          lines: [],
        }),
      ]),
    });
  }

  function removeItem(code: string) {
    if (!project || editLocked) return;
    const target = findItemByKey(project.items, code);
    commit({
      ...project,
      items: project.items.filter((i) => !sameItemKey(i, code) && !(target && i.billId === target.billId && i.parentCode === target.boqCode && target.kind === "section")),
      qtoLines: project.qtoLines.filter((l) => l.workingBoqCode !== code && l.workingBoqCode !== target?.boqCode),
      itemQuotes: project.itemQuotes.filter((q) => q.boqCode !== code && !(target && quoteMatchesItem(q, target))),
    });
    if (selected === code) setSelected(null);
    if (rateCode === code) setRateCode(null);
    setQtoLineId((id) => {
      const line = project.qtoLines.find((l) => l.id === id);
      return line?.workingBoqCode === code ? null : id;
    });
  }

  function setQto(lines: QtoLine[]) {
    if (!project || editLocked) return;
    commit(applyQtoPosting({ ...project, qtoLines: lines }));
  }

  function resolveConflict(id: string, side: "local" | "replica") {
    if (!project || !replica) return;
    const row = conflicts.find((c) => c.id === id);
    if (!row) return;
    if (side === "replica") {
      setProject(withResults({ ...applyReplicaPick(project, replica, row), isDemo: false }));
    }
    setConflicts(conflicts.filter((c) => c.id !== id));
  }

  function saveCatalogEdits(next: { units: LoadedProject["units"]; categories: LoadedProject["categories"]; vendors: LoadedProject["vendors"] }) {
    if (!platform || !liveTenant) {
      if (project) commit({ ...project, ...next });
      return;
    }
    const catalog = bumpCatalog(effectiveCatalog(liveTenant), next);
    const actor =
      session?.kind === "tenant"
        ? (liveTenant.users.find((u) => u.id === session.userId)?.login ?? "user")
        : "owner";
    const saved = saveTenantCatalog(platform, liveTenant.id, catalog);
    applyPlatform(
      logAudit(saved, liveTenant.id, {
        actor,
        action: "catalog_saved",
        detail: `Tenant global masters v${catalog.version}`,
      }),
    );
    if (project) setProject(applyCatalogToProject(project, catalog));
  }

  function requestPromote(kind: "unit" | "category" | "vendor", code: string, label: string) {
    if (!platform || !session) {
      window.alert("Sign in to a workspace before promoting.");
      return;
    }
    const target = liveTenant ?? platform.tenants[0];
    if (!target) {
      window.alert("No tenant workspace is available for promotion.");
      return;
    }
    if (target.promotionPolicy === "disabled") {
      window.alert("Promotion is disabled for this tenant.");
      return;
    }
    if (session.kind === "tenant" && !can(session, "masters", "promote") && session.role.id !== "admin") {
      window.alert("Your role cannot promote masters.");
      return;
    }
    const actor =
      session.kind === "tenant"
        ? (target.users.find((u) => u.id === session.userId)?.login ?? "user")
        : "owner";
    const auto = target.promotionPolicy === "auto";
    const payload = project ? promotionFromProject(project, kind, code, label) : { kind, code, label };
    const req: PromotionRequest = {
      id: newId("pr"),
      requestedBy: actor,
      status: auto ? "approved" : "pending",
      ...payload,
    };
    let nextPlat: PlatformState = {
      ...platform,
      tenants: platform.tenants.map((t) =>
        t.id === target.id ? { ...t, promotions: [req, ...t.promotions] } : t,
      ),
    };
    let catalog = effectiveCatalog(target);
    if (auto) {
      catalog = applyPromotion(catalog, req);
      nextPlat = saveTenantCatalog(nextPlat, target.id, catalog);
    }
    applyPlatform(
      logAudit(nextPlat, target.id, {
        actor,
        action: auto ? "promotion_auto" : "promotion_requested",
        detail: `${kind} ${code}`,
      }),
    );
    if (auto && project) setProject(applyCatalogToProject(project, catalog));
    window.alert(
      auto
        ? `Promoted ${kind} "${label || code}" to the tenant catalog. New jobs will load it.`
        : `Promotion request for ${kind} "${label || code}" is waiting in Settings.`,
    );
    if (!auto && session.kind === "tenant") setActivity("settings");
  }

  const catalogStale = Boolean(
    liveTenant && project && (project.catalogVersion ?? 1) < liveTenant.catalogVersion,
  );

  if (!platform || !license.ready) {
    return <SplashShell status={!platform ? "Starting workspace…" : "Checking licence…"} />;
  }

  if (!license.session.isAuthenticated) {
    return (
      <LoginView
        busy={license.busy}
        error={license.error}
        onSubmit={(email, password) => {
          void license.login(email, password).then((ok) => {
            if (!ok) return;
            setSession(workspaceSession(platform));
            setScreen("home");
          });
        }}
        onSignup={license.openSignup}
        onPricing={license.openPricing}
      />
    );
  }

  if (!session) {
    return <SplashShell status="Opening workspace…" />;
  }

  if (screen === "owner" && session.kind === "owner") {
    return (
      <OwnerView
        platform={platform}
        onPlatform={applyPlatform}
        onImpersonate={(s) => {
          setSession(s);
          setScreen("home");
        }}
        onSignOut={() => {
          setSession(null);
          setScreen("login");
        }}
      />
    );
  }

  if (screen === "import") {
    return (
      <ImportWizard
        currency={displayFormat.currency}
        catalog={effectiveCatalog(liveTenant)}
        appendTo={importMode !== "create" ? project : null}
        amendBillId={importMode === "amend" ? billFocus : null}
        onCancel={() => setScreen(importMode !== "create" && project ? "project" : "home")}
        onCreate={(next) => {
          openProject(next);
          setActivity("source");
        }}
        onAppend={(next) => {
          commit(next);
          setScreen("project");
          setActivity("estimate");
          if (importMode !== "amend") {
            const last = sortedBills(next).at(-1);
            if (last) setBillFocus(last.id);
          }
        }}
      />
    );
  }

  if (screen === "home" || !project) {
    return (
      <HomeView
        session={session}
        canImport={can(session, "import", "import") || can(session, "import", "edit")}
        onNew={openNew}
        onOpen={() => void openAeroFile()}
        onSampleSingle={openReference}
        onSampleCampus={openCampusSample}
        onImport={() => {
          setImportMode("create");
          setScreen("import");
        }}
        onOpenPath={(path) => void openAeroFile(path)}
        accountName={license.session.displayName || license.session.email}
        licenseLine={licenseLine}
        onSignOut={signOut}
        onOwnerPortal={session.kind === "owner" ? () => setScreen("owner") : undefined}
      />
    );
  }

  const priced = project.items.filter((i) => i.kind === "item");
  const total = priced.reduce((s, i) => s + (i.result?.amount ?? 0), 0);
  const adj = priced.reduce((s, i) => s + (i.result?.adjustmentAmount ?? 0), 0);
  const unpriced = priced.filter((i) => !i.result || i.result.rate === 0).length;
  const diffs = priced.filter((i) => i.ourQty !== i.clientQty).length;
  const missing = priced.filter((i) => !hasAnalysisBackup(i) && !project.itemQuotes.some((q) => quoteMatchesItem(q, i) && q.selected)).length;
  const green = moneyClose(total, GOLDEN_TOTAL);
  const sel = findItemByKey(project.items, selected) ?? null;
  const focusBill = billById(project, billFocus);
  const shownItems = visibleItems(project, billFocus);
  const shownTotal = billFocus ? billTotal(project.items, billFocus) : total;

  const showInspector = activity === "estimate" || activity === "analysis" || activity === "takeoff";
  const fillStage =
    activity === "buy" ||
    activity === "queries" ||
    activity === "estimate" ||
    activity === "analysis" ||
    activity === "takeoff" ||
    activity === "submit" ||
    activity === "source" ||
    activity === "dashboard" ||
    activity === "margins" ||
    activity === "finalise" ||
    activity === "masters" ||
    activity === "settings";
  const whoLabel =
    license.session.displayName ||
    license.session.email ||
    (session.kind === "owner"
      ? "Owner"
      : (session.tenant.users.find((u) => u.id === session.userId)?.name ?? session.role.name));
  const initials = whoLabel
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const formulaItem = sel?.kind === "item" ? sel : null;
  const inspectorVisible = showInspector && inspectorOpen;

  function goTo(id: Activity) {
    if (!project) return;
    if (id === "takeoff") {
      const items = shownItems.filter((i) => i.kind === "item");
      const keep = selected && items.some((i) => itemKeyOf(i) === selected) ? selected : null;
      const diff = items.find((i) => i.ourQty !== i.clientQty);
      const code = keep ?? (diff ? itemKeyOf(diff) : null) ?? (items[0] ? itemKeyOf(items[0]) : null);
      if (code) setSelected(code);
    }
    if (id === "analysis") {
      const items = shownItems.filter((i) => i.kind === "item");
      const keep = rateCode && items.some((i) => itemKeyOf(i) === rateCode) ? rateCode : null;
      const selectedItem = selected && items.some((i) => itemKeyOf(i) === selected) ? selected : null;
      const missingItem = items.find(
        (i) =>
          !hasAnalysisBackup(i) &&
          !project.itemQuotes.some((q) => quoteMatchesItem(q, i) && q.selected),
      );
      const code =
        keep ?? selectedItem ?? (missingItem ? itemKeyOf(missingItem) : null) ?? (items[0] ? itemKeyOf(items[0]) : null);
      if (code) {
        setRateCode(code);
        setSelected(code);
      }
    }
    setActivity(id);
  }

  function canView(id: Activity) {
    if (!session) return false;
    return (
      can(session, id === "analysis" || id === "queries" || id === "margins" || id === "finalise" ? "estimate" : id, "view") ||
      (id === "settings" && session.kind === "owner")
    );
  }

  return (
    <div
      className={`app shell ${navCollapsed ? "nav-collapsed" : ""} ${editLocked ? "readonly" : ""} ${inspectorVisible ? "inspector-open" : "no-inspector"}`}
      style={inspectorVisible ? ({ ["--inspector-w"]: `${inspectorW.value}px` } as CSSProperties) : undefined}
    >
      <Sidebar
        activity={activity}
        masterOpen={masterTab === "resources"}
        collapsed={navCollapsed}
        theme={theme}
        projectName={project.name}
        revision={`${project.sealedAt ? `sealed r${project.revision}` : `r${project.revision}`}${
          license.session.isAuthenticated
            ? ` · ${licenseReadOnly ? "read-only · " : ""}${planDisplayName(license.session.planCode)}`
            : ""
        }`}
        total={formatMoney(total, project.currency)}
        user={`${initials} · ${session.kind === "owner" ? "owner" : session.role.name}`}
        trial={licenseBanner(license.session)}
        showInspector={showInspector}
        inspectorOpen={inspectorOpen}
        canView={canView}
        onNavigate={(id: SidebarTarget) => {
          if (id === "resources") {
            setMasterTab("resources");
            goTo("masters");
            return;
          }
          if (id === "masters") setMasterTab("units");
          goTo(id);
        }}
        onToggle={() => {
          setNavCollapsed((value) => {
            const next = !value;
            try {
              localStorage.setItem("bidcraft.navCollapsed", next ? "1" : "0");
            } catch {
              /* ignore */
            }
            return next;
          });
        }}
        onTheme={(next) => {
          setTheme(next);
          applyTheme(next);
        }}
        onClose={() => {
          setProject(null);
          setFilePath(null);
          setRateCode(null);
          setQtoLineId(null);
          setSaveMsg("");
          setScreen("home");
        }}
        onOpen={() => void openAeroFile()}
        onSave={() => void saveAero()}
        onToggleInspector={() => setInspectorOpen((v) => !v)}
        onLegal={() => {
          setSettingsTab("legal");
          setSettingsFocus((n) => n + 1);
          goTo("settings");
        }}
      />
      <div className="shell-banners">
        {updateOffer ? (
          <div className="banner" role="status">
            Bid Craft {updateOffer.version} is available. {updateOffer.notes}
            <button
              type="button"
              className="primary"
              disabled={updateBusy}
              onClick={() => {
                setUpdateBusy(true);
                void updateOffer.install().catch((err) => {
                  setUpdateBusy(false);
                  window.alert(err instanceof Error ? err.message : "Could not install the update.");
                });
              }}
            >
              {updateBusy ? "Installing…" : "Download, install, and relaunch"}
            </button>
          </div>
        ) : null}
        {catalogStale ? (
          <div className="banner">
            Global catalog is at v{liveTenant?.catalogVersion}. This project is v{project.catalogVersion ?? 1}.
            <button
              type="button"
              className="primary"
              onClick={() =>
                setProject(applyCatalogToProject(project, effectiveCatalog(liveTenant)))
              }
            >
              Refresh snapshot
            </button>
          </div>
        ) : null}
        {session.kind === "tenant" && session.impersonatedBy ? (
          <div className="banner">Owner impersonation is active. This tenant can see it in Settings → Audit.</div>
        ) : null}
      </div>
      <main className={`stage ${fillStage ? "stage-fill" : ""}`}>
        <PrintProvider project={project} format={reportFormat}>
        {activity === "dashboard" ? (
          <BoqSplit project={project} value={billFocus} onChange={setBillFocus} layoutId="boq-rail-dashboard">
            <DashboardView
              project={project}
              billId={billFocus}
              license={
                <LicensePanel
                  session={license.session}
                  busy={license.busy}
                  onRefresh={() => void license.refresh()}
                  onAccount={license.openAccount}
                  onPricing={license.openPricing}
                  onSignOut={signOut}
                />
              }
            />
          </BoqSplit>
        ) : null}
        {activity === "estimate" ? (
          <BoqSplit project={project} value={billFocus} onChange={setBillFocus} layoutId="boq-rail-estimate">
          <EstimateView
            items={shownItems}
            selected={selected}
            onSelect={setSelected}
            onOpenRate={openRate}
            currency={project.currency}
            onPatch={patchItem}
            onAdd={addItem}
            onAddSection={addSection}
            onRemove={removeItem}
            locked={editLocked}
            sourceLocked={billFocus ? billSourceLocked(project, billFocus) : false}
            quotedCodes={new Set(project.itemQuotes.filter((q) => q.selected).map((q) => q.boqCode))}
            clientColumns={project.clientColumns}
            workingColumns={project.workingColumns}
            showBillColumn={false}
            billLabel={(id) => billById(project, id)?.name ?? id}
            addDisabled={!billFocus}
            bills={!billFocus ? sortedBills(project) : []}
            clientLocked={(id) => billSourceLocked(project, id)}
            tools={
              <>
                <button
                  type="button"
                  disabled={editLocked}
                  onClick={() => {
                    setImportMode("append");
                    setScreen("import");
                  }}
                >
                  Add BOQ
                </button>
                <button
                  type="button"
                  disabled={editLocked}
                  onClick={() => {
                    setImportMode("amend");
                    setScreen("import");
                  }}
                >
                  Amend BOQ
                </button>
              </>
            }
            onAddColumn={(col) => commit({ ...project, workingColumns: [...project.workingColumns, col] })}
            onRemoveColumn={(id) =>
              commit({
                ...project,
                workingColumns: project.workingColumns.filter((c) => c.id !== id),
                items: project.items.map((i) => {
                  if (!i.extra || !(id in i.extra)) return i;
                  const extra = { ...i.extra };
                  delete extra[id];
                  return { ...i, extra };
                }),
              })
            }
          />
          </BoqSplit>
        ) : null}
        {activity === "analysis" ? (
          <BoqSplit project={project} value={billFocus} onChange={setBillFocus} layoutId="boq-rail-analysis">
          <RateAnalysisView
            project={project}
            rateCode={rateCode}
            marginPct={effectiveMarginPct(project, findItemByKey(project.items, rateCode))}
            locked={editLocked}
            onSelect={openRate}
            onPatch={patchItem}
            onProject={(next) => commit(next)}
            onBack={() => setActivity("estimate")}
            billId={billFocus}
          />
          </BoqSplit>
        ) : null}
        {activity === "margins" ? (
          <BoqSplit project={project} value={billFocus} onChange={setBillFocus} layoutId="boq-rail-margins">
            <MarginsView
              project={project}
              billId={billFocus}
              locked={editLocked}
              onProject={(next) => commit(next)}
            />
          </BoqSplit>
        ) : null}
        {activity === "source" ? (
          <BoqSplit project={project} value={billFocus} onChange={setBillFocus} layoutId="boq-rail-source">
          <SourceView
            project={project}
            total={shownTotal}
            format={reportFormat}
            billId={billFocus}
            onBillChange={setBillFocus}
            onAmend={
              editLocked
                ? undefined
                : () => {
                    setImportMode("amend");
                    setScreen("import");
                  }
            }
          />
          </BoqSplit>
        ) : null}
        {activity === "takeoff" ? (
          <BoqSplit project={project} value={billFocus} onChange={setBillFocus} layoutId="boq-rail-takeoff">
          <TakeoffView
            items={shownItems}
            lines={project.qtoLines}
            onSelect={setSelected}
            selected={selected}
            selectedLineId={qtoLineId}
            onSelectLine={setQtoLineId}
            onChangeLines={setQto}
            locked={editLocked}
            filterColumns={filterableColumns(project)}
          />
          </BoqSplit>
        ) : null}
        {activity === "queries" ? (
          <TenderQueriesView project={project} locked={editLocked} onProject={(next) => commit(next)} />
        ) : null}
        {activity === "buy" ? (
          <>
            {conflicts.length ? (
              <ConflictQueue
                conflicts={conflicts}
                onPick={resolveConflict}
                onDismiss={() => {
                  setConflicts([]);
                  setReplica(null);
                }}
              />
            ) : null}
            <BoqSplit project={project} value={billFocus} onChange={setBillFocus} layoutId="boq-rail-buy">
            <BuyView project={project} locked={editLocked} onProject={(next) => commit(next)} billId={billFocus} />
            </BoqSplit>
          </>
        ) : null}
        {activity === "finalise" ? (
          <FinaliseView
            project={project}
            locked={editLocked}
            pane={finalisePane}
            onPane={setFinalisePane}
            onProject={(next) => commit(next)}
            onJump={(issue: SubmissionIssue) => {
              if (issue.pane) setFinalisePane(issue.pane);
              if (issue.itemKey) {
                setSelected(issue.itemKey);
                const item = findItemByKey(project.items, issue.itemKey);
                if (item) setBillFocus(item.billId);
              }
              if (issue.activity !== "finalise") setActivity(issue.activity);
            }}
          />
        ) : null}
        {activity === "submit" ? (
          <BoqSplit project={project} value={billFocus} onChange={setBillFocus} layoutId="boq-rail-submit">
          <SubmitView
            project={project}
            total={total}
            adj={adj}
            locked={licenseReadOnly || (session.kind === "tenant" && !roleEdit("submit"))}
            format={reportFormat}
            canExport={can(session, "export", "export")}
            canDesign={roleEdit("submit") || can(session, "settings", "edit")}
            onFormat={saveReportFormat}
            onPack={(pack) => saveReportFormat(pack.format ?? reportFormat, pack)}
            templates={(liveTenant?.reportTemplates ?? []) as StoredReportTemplate[]}
            activeTemplateId={liveTenant?.activeReportTemplateId ?? null}
            onSeal={() => commit({ ...project, sealedAt: new Date().toISOString() }, "seal")}
            onNewRevision={() =>
              commit({ ...project, sealedAt: null, revision: project.revision + 1 }, "revision")
            }
            billFocus={billFocus}
            onBillChange={setBillFocus}
          />
          </BoqSplit>
        ) : null}
        {activity === "masters" ? (
          <MastersView
            project={project}
            catalog={effectiveCatalog(liveTenant)}
            catalogSource={catalogSource(liveTenant)}
            catalogVersion={liveTenant?.catalogVersion ?? effectiveCatalog(liveTenant).version}
            canEditCatalog={
              session.kind === "owner" ||
              (session.kind === "tenant" && (session.role.id === "admin" || isSoloTenant(session.tenant)))
            }
            onChangeProject={(patch) => commit({ ...project, ...patch })}
            onChangeCatalog={saveCatalogEdits}
            onPromote={requestPromote}
            locked={editLocked}
            masterTab={masterTab}
            onMasterTab={setMasterTab}
            currency={project.currency}
            globalResourceRows={liveTenant?.resourceMaster ?? []}
            projectResourceRows={project.resourceMaster ?? []}
            onGlobalResourceRows={(rows) => {
              if (!platform || !liveTenant) return;
              const next = {
                ...platform,
                tenants: platform.tenants.map((tenant) =>
                  tenant.id === liveTenant.id ? { ...tenant, resourceMaster: rows } : tenant,
                ),
              };
              savePlatform(next);
              applyPlatform(next);
            }}
            onProjectResourceRows={(rows) => commit(projectWithMaster(project, rows))}
            onPushRate={(row) => {
              if (!platform || !liveTenant) return;
              const next = {
                ...platform,
                tenants: platform.tenants.map((tenant) =>
                  tenant.id === liveTenant.id
                    ? { ...tenant, resourceMaster: pushRateToMaster(tenant.resourceMaster ?? [], row) }
                    : tenant,
                ),
              };
              savePlatform(next);
              applyPlatform(next);
            }}
            onCopyGlobal={() => {
              if (!liveTenant) return;
              commit(copyGlobalMaster(project, liveTenant.resourceMaster ?? []));
            }}
          />
        ) : null}
        {activity === "settings" && session ? (
          <SettingsView
            session={session}
            platform={platform}
            onPlatform={applyPlatform}
            onPromote={requestPromote}
            onCompareReplica={() => void compareReplica()}
            project={project}
            onProject={(next) => setProject(withResults(next))}
            license={license.session}
            licenseBusy={license.busy}
            onRefreshLicense={() => void license.refresh()}
            onAccount={license.openAccount}
            onPricing={license.openPricing}
            onSignOut={signOut}
            theme={theme}
            onTheme={(next) => {
              setTheme(next);
              applyTheme(next);
            }}
            initialTab={settingsTab}
            settingsFocus={settingsFocus}
          />
        ) : null}
        </PrintProvider>
      </main>
      {inspectorVisible ? (
      <aside className="inspector">
        <div
          className="split-gutter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize inspector"
          tabIndex={0}
          onPointerDown={inspectorW.beginDrag("x", -1)}
          onDoubleClick={inspectorW.reset}
        />
        <h3>Inspector</h3>
        <ConflictQueue
          conflicts={conflicts}
          onPick={resolveConflict}
          onDismiss={() => {
            setConflicts([]);
            setReplica(null);
          }}
        />
        {activity === "takeoff" ? (
          <TakeoffInspector
            item={sel}
            line={
              project.qtoLines.find((l) => l.id === qtoLineId && (l.workingBoqCode === selected || (sel && l.workingBoqCode === itemKeyOf(sel)))) ?? null
            }
            itemLines={project.qtoLines.filter((l) => l.workingBoqCode === selected || (sel && l.workingBoqCode === itemKeyOf(sel)))}
          />
        ) : sel ? (
          <Inspector
            item={sel}
            currency={project.currency}
            rateOpen={activity === "analysis" && !!sel && rateCode === itemKeyOf(sel)}
            locked={editLocked}
            sourceLocked={sel ? billSourceLocked(project, sel.billId) : false}
            itemQuoteLabel={
              sel
                ? (project.itemQuotes.find((q) => quoteMatchesItem(q, sel) && q.selected)?.vendorName ?? null)
                : null
            }
            linkedLabel={sel?.linkedBoqCode ? displayItemRef(project, sel.linkedBoqCode) : null}
            onOpenRate={() => sel && openRate(itemKeyOf(sel))}
            onPatch={patchItem}
            onRemove={removeItem}
            extraColumns={[
              ...project.clientColumns.filter((c) => c.role === "extra").map((c) => ({ ...c, locked: true })),
              ...project.workingColumns.map((c) => ({ ...c, locked: false })),
            ]}
          />
        ) : (
          <p className="hint">Select a row, then edit it here.</p>
        )}
        <div className="legal">
          Qty policy: client bill + tender adjustments. Margin{" "}
          {formatPct(effectiveMarginPct(project, formulaItem))} on cost (once)
          {(project.marginRules ?? []).some((r) => r.enabled) ? " · scoped rules on Margins" : ""}. Client qty is immutable after
          the Client BOQ is locked. Our qty posts from take-off.
        </div>
      </aside>
      ) : null}
      <footer className="status" role="status">
        <span>
          Ready
          {focusBill ? ` · ${focusBill.name}` : ""}
          {` · ${priced.length} items`}
          {focusBill && billSourceLocked(project, focusBill.id) ? " · Client BOQ locked" : ""}
        </span>
        <span>{unpriced} unpriced</span>
        <span>{diffs} qty diffs</span>
        <span>{missing} missing analysis</span>
        {saveMsg ? <span className="status-msg">{saveMsg}</span> : null}
        <span className={`grand ${green ? "ok" : ""}`}>
          {green ? "GREEN " : ""}
          {formatMoney(total, project.currency)}
        </span>
      </footer>
    </div>
  );
}

function workspaceSession(platform: PlatformState): Session {
  const tenant = platform.tenants.find((t) => t.edition === "solo") ?? platform.tenants[0];
  const user = tenant?.users[0];
  const role = tenant?.roles.find((item) => item.id === user?.roleId) ?? tenant?.roles[0];
  if (!tenant || !user || !role) {
    throw new Error("No individual workspace is available.");
  }
  return { kind: "tenant", tenant, userId: user.id, role };
}
