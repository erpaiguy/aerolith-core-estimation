import { configureDisplayFormat, mergeDisplayFormat } from "@aerolith/shared";
import { useEffect, useState } from "react";
import { emptyProject, loadCampusSampleProject, loadReferenceProject } from "./loadReference";
import type { Activity, LoadedProject, QtoLine, WorkingItem } from "./model";
import { inferParents, newId, stampItem } from "./model";
import { useAerolithLicense } from "./auth/useAerolithLicense";
import { allowsData, describeLicense, licenseBanner, resolveAccess } from "./auth/licenseState";
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
import {
  applyCatalogToProject,
  applyPromotion,
  bumpCatalog,
  effectiveCatalog,
  promotionFromProject,
} from "./tenantCatalog";
import { applyQtoPosting, applyReplicaPick, diffReplica, uid, withResults } from "./projectCompute";
import {
  DEFAULT_BILL_ID,
  billSourceLocked,
  findItemByKey,
  itemKeyOf,
  parseItemKey,
  quoteMatchesItem,
  sameItemKey,
  sortedBills,
} from "./bills";
import { ConflictQueue } from "./views/ConflictQueue";
import type { ReportFormat } from "./reportFormat";
import type { ReportFormatPack } from "./views/ReportDesigner";
import { ImportWizard } from "./views/ImportWizard";
import { LoginView } from "./views/LoginView";
import { SplashShell } from "./views/SplashShell";
import { checkForUpdate, updatesAutoEnabled, type UpdateOffer } from "./updates";
import { cloneResourceMaster } from "./resourceMaster";
import { CloseJobDialog, LandingView, OwnerScreen, SignedOutView } from "./v3/gates";
import { JobWorkspace } from "./v3/JobWorkspace";
import type { Pane } from "./v3/routes";

type Screen = "login" | "owner" | "home" | "import" | "project" | "signedout";

export function App() {
  const [platform, setPlatform] = useState<PlatformState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>("login");
  const [project, setProject] = useState<LoadedProject | null>(null);
  const [activity, setActivity] = useState<Activity>("estimate");
  const [selected, setSelected] = useState<string | null>(null);
  const [, setQtoLineId] = useState<string | null>(null);
  const [rateCode, setRateCode] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [replica, setReplica] = useState<LoadedProject | null>(null);
  const [billFocus, setBillFocus] = useState<string | null>(DEFAULT_BILL_ID);
  const [importMode, setImportMode] = useState<"create" | "append" | "amend">("create");
  const license = useAerolithLicense();
  const [updateOffer, setUpdateOffer] = useState<UpdateOffer | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [pane, setPane] = useState<Pane>("dashboard");
  const [closeAsk, setCloseAsk] = useState(false);
  const [jobsOpened, setJobsOpened] = useState(0);
  const [editCount, setEditCount] = useState(0);

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
  const displayFormat = mergeDisplayFormat(liveTenant?.displayFormat);
  const access = resolveAccess(license.session);
  const licenseReadOnly = license.session.isAuthenticated && !allowsData(access);
  const licenseLine = license.session.isAuthenticated ? describeLicense(license.session) : "";
  const roleEdit = (mod: string) => can(session, mod, "edit");
  const permModule =
    activity === "analysis" || activity === "queries" || activity === "margins" ? "estimate" : activity;
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
    setPane("dashboard");
    setJobsOpened((n) => n + 1);
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
    setPane("estimate");
    setSelected(`${DEFAULT_BILL_ID}::1a`);
  }

  function openReference() {
    try {
      openProject(loadReferenceProject());
      setActivity("dashboard");
      setPane("dashboard");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not open the reference project.");
    }
  }

  function signOut() {
    void license.logout().then(() => {
      setSession(null);
      setProject(null);
      setFilePath(null);
      setScreen("signedout");
    });
  }

  function openCampusSample() {
    try {
      openProject(loadCampusSampleProject());
      setActivity("dashboard");
      setPane("dashboard");
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
    setEditCount((n) => n + 1);
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
    setPane("analysis");
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
    setPane("estimate");
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

  if (screen === "signedout") {
    return (
      <SignedOutView
        jobs={jobsOpened}
        edits={editCount}
        onSignIn={() => setScreen("login")}
      />
    );
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
      <OwnerScreen
        platform={platform}
        onPlatform={applyPlatform}
        onImpersonate={(s) => {
          setSession(s);
          setScreen("home");
        }}
        onSignOut={signOut}
        onJobs={() => setScreen("home")}
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
          setPane("source");
        }}
        onAppend={(next) => {
          commit(next);
          setScreen("project");
          setActivity("estimate");
          setPane("estimate");
          if (importMode !== "amend") {
            const last = sortedBills(next).at(-1);
            if (last) setBillFocus(last.id);
          }
        }}
      />
    );
  }

  if (screen === "home" || !project) {
    const who = license.session.displayName || license.session.email || (session.kind === "owner" ? "Owner" : session.role.name);
    return (
      <LandingView
        session={session}
        who={who}
        licenseLine={licenseLine}
        canImport={can(session, "import", "import") || can(session, "import", "edit")}
        onNew={openNew}
        onOpen={() => void openAeroFile()}
        onImport={() => {
          setImportMode("create");
          setScreen("import");
        }}
        onSample={openReference}
        onCampus={openCampusSample}
        onSignOut={signOut}
        onOwner={session.kind === "owner" ? () => setScreen("owner") : undefined}
        attention={updateOffer ? [`Update ${updateOffer.version} is ready`] : []}
      />
    );
  }

  const whoLabel =
    license.session.displayName ||
    license.session.email ||
    (session.kind === "owner" ? "Owner" : session.role.name);
  const roleName = session.kind === "owner" ? "Owner" : session.role.name;

  function leaveJob() {
    setProject(null);
    setFilePath(null);
    setRateCode(null);
    setQtoLineId(null);
    setSaveMsg("");
    setCloseAsk(false);
    setScreen("home");
    setPane("dashboard");
  }

  function show(next: Pane) {
    if (next === "analysis" && selected) {
      openRate(selected);
      return;
    }
    setPane(next);
    const activityFor: Partial<Record<Pane, Activity>> = {
      dashboard: "dashboard",
      source: "source",
      takeoff: "takeoff",
      estimate: "estimate",
      analysis: "analysis",
      register: "analysis",
      clone: "analysis",
      component: "analysis",
      margins: "margins",
      queries: "queries",
      buy: "buy",
      enquiries: "buy",
      compare: "buy",
      followup: "buy",
      resource: "buy",
      submit: "submit",
      finalise: "submit",
      reports: "dashboard",
      masters: "masters",
      settings: "settings",
      categories: "settings",
      design: "settings",
    };
    const act = activityFor[next];
    if (act) setActivity(act);
  }

  if (closeAsk) {
    return (
      <CloseJobDialog
        name={project.name}
        note={saveMsg}
        onCancel={() => setCloseAsk(false)}
        onDiscard={leaveJob}
        onSave={() => {
          void saveAero().finally(leaveJob);
        }}
      />
    );
  }

  const notice = (
    <>
      {catalogStale && liveTenant ? (
        <div className="banner">
          Company catalogue is at v{liveTenant.catalogVersion}. This job is v{project.catalogVersion ?? 1}.
          <button className="b p s" type="button" onClick={() => setProject(applyCatalogToProject(project, effectiveCatalog(liveTenant)))}>Refresh snapshot</button>
        </div>
      ) : null}
      {updateOffer ? (
        <div className="banner" role="status">
          Bid Craft {updateOffer.version} is available. {updateOffer.notes}
          <button className="b p s" type="button" disabled={updateBusy} onClick={() => {
            setUpdateBusy(true);
            void updateOffer.install().catch((err) => {
              setUpdateBusy(false);
              window.alert(err instanceof Error ? err.message : "Could not install the update.");
            });
          }}>{updateBusy ? "Installing…" : "Download, install, and relaunch"}</button>
        </div>
      ) : null}
      {conflicts.length ? (
        <ConflictQueue conflicts={conflicts} onPick={resolveConflict} onDismiss={() => { setConflicts([]); setReplica(null); }} />
      ) : null}
    </>
  );

  return (
    <JobWorkspace
        pane={pane}
        onPane={show}
        project={project}
        billId={billFocus}
        onBill={setBillFocus}
        locked={editLocked}
        selected={selected}
        onSelect={setSelected}
        onCommit={(next) => commit(next)}
        onPatch={patchItem}
        onQto={setQto}
        onAddItem={addItem}
        onAddSection={addSection}
        onRemove={removeItem}
        onAmend={() => { setImportMode("amend"); setScreen("import"); }}
        onSeal={() => commit({ ...project, sealedAt: new Date().toISOString() }, "seal")}
        onRevision={() => commit({ ...project, sealedAt: null, revision: project.revision + 1 }, "revision")}
        who={`${whoLabel} · ${roleName}`}
        saved={saveMsg}
        licence={licenseLine || licenseBanner(license.session)}
        fileName={filePath ?? `${project.name}.aero`}
        showOwner={session.kind === "owner"}
        session={session}
        license={license.session}
        licenseBusy={license.busy}
        onJobs={() => setCloseAsk(true)}
        onOpen={() => void openAeroFile()}
        onSave={() => void saveAero()}
        onClose={() => setCloseAsk(true)}
        onSignOut={signOut}
        onOwner={session.kind === "owner" ? () => setScreen("owner") : undefined}
        onRefresh={() => void license.refresh()}
        onAccount={license.openAccount}
        onPricing={license.openPricing}
        onCheckUpdate={() => { void checkForUpdate().then(setUpdateOffer).catch(() => setUpdateOffer(null)); }}
        onCompare={() => void compareReplica()}
        onSaveFormat={saveReportFormat}
        onSaveCatalog={() => saveCatalogEdits({ units: project.units, categories: project.categories, vendors: project.vendors })}
        onPromote={requestPromote}
        notice={(catalogStale && liveTenant) || updateOffer || conflicts.length ? notice : undefined}
      />
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
