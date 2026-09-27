import { hashPin, newSalt } from "../platform/crypto";
import { logAudit, savePlatform, saveTenantCatalog, type Session } from "../platform/store";
import type { LicenseSession } from "../auth/licenseState";
import { LicensePanel } from "./LicensePanel";
import {
  ALL_ACTIONS,
  MODULES,
  fullAllow,
  type ActionId,
  type ModuleId,
  type PlatformState,
  type PromotionPolicy,
  type Role,
} from "../platform/types";
import {
  addUserBlockedReason,
  canAddSeat,
  isSoloTenant,
  seatsRemaining,
  tenantProjectsHint,
} from "../platform/tenant";
import { mergeReportFormat, type ReportFormat, type StoredReportTemplate } from "../reportFormat";
import { ReportFormatFields } from "./DocumentRenderer";
import { applyCatalogToProject, applyPromotion, effectiveCatalog } from "../tenantCatalog";
import type { LoadedProject } from "../model";
import { useState } from "react";
import { Split } from "../ui/Split";
import { DataTable } from "../ui/tableLayout";
import {
  CURRENCIES,
  formatMoney,
  formatQty,
  formatNos,
  formatDim,
  formatMoneyPlain,
  currencyMarker,
  mergeDisplayFormat,
  type DisplayFormat,
} from "@aerolith/shared";

type SettingsTab =
  | "license"
  | "numbers"
  | "replica"
  | "report"
  | "users"
  | "roles"
  | "promotion"
  | "audit";

export function SettingsView({
  session,
  platform,
  onPlatform,
  onCompareReplica,
  project,
  onProject,
  license = null,
  licenseBusy = false,
  onRefreshLicense,
  onAccount,
  onPricing,
  onSignOut,
}: {
  session: Session;
  platform: PlatformState;
  onPlatform: (next: PlatformState) => void;
  onPromote?: (kind: "unit" | "category" | "vendor", code: string, label: string) => void;
  onCompareReplica?: () => void;
  project?: LoadedProject | null;
  onProject?: (next: LoadedProject) => void;
  license?: LicenseSession | null;
  licenseBusy?: boolean;
  onRefreshLicense?: () => void;
  onAccount?: () => void;
  onPricing?: () => void;
  onSignOut?: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("license");
  if (session.kind !== "tenant") {
    return <p className="hint">Settings belong to a tenant workspace.</p>;
  }
  const tenant = platform.tenants.find((t) => t.id === session.tenant.id) ?? session.tenant;
  const actor = tenant.users.find((u) => u.id === session.userId)?.login ?? "user";
  const admin = session.role.id === "admin" || Boolean(session.impersonatedBy);
  const solo = isSoloTenant(tenant);
  const tabs: Array<[SettingsTab, string]> = [
    ["license", "License"],
    ["numbers", "Numbers"],
    ...(onCompareReplica ? ([["replica", "Replica compare"]] as Array<[SettingsTab, string]>) : []),
    ["report", "Report layouts"],
    ...(solo
      ? []
      : ([
          ["users", "Users"],
          ["roles", "Roles"],
          ["promotion", "Promotion"],
        ] as Array<[SettingsTab, string]>)),
    ["audit", "Audit"],
  ];
  const active = tabs.some(([id]) => id === tab) ? tab : "license";

  function patchTenant(patch: Partial<typeof tenant>) {
    const next = {
      ...platform,
      tenants: platform.tenants.map((t) => (t.id === tenant.id ? { ...t, ...patch } : t)),
    };
    savePlatform(next);
    onPlatform(next);
  }

  const numbers = mergeDisplayFormat({
    ...tenant.displayFormat,
    currency: project?.currency ?? tenant.displayFormat?.currency,
  });
  const placeOptions = [0, 1, 2, 3, 4, 5, 6];

  function patchNumbers(patch: Partial<DisplayFormat>) {
    const nextFmt = mergeDisplayFormat({ ...numbers, ...patch });
    patchTenant({ displayFormat: nextFmt });
    if (patch.currency != null && project && onProject && nextFmt.currency !== project.currency) {
      onProject({ ...project, currency: nextFmt.currency });
    }
  }

  async function addUser() {
    const blocked = addUserBlockedReason(tenant);
    if (blocked) {
      window.alert(blocked);
      return;
    }
    const login = window.prompt("Login id");
    if (!login) return;
    const pin = window.prompt("PIN") ?? "changeme";
    const salt = newSalt();
    const user = {
      id: `u-${Date.now()}`,
      name: login,
      login,
      salt,
      pinHash: await hashPin(pin, salt),
      roleId: tenant.roles[1]?.id ?? "estimator",
    };
    const nextState = logAudit(
      { ...platform, tenants: platform.tenants.map((t) => (t.id === tenant.id ? { ...t, users: [...t.users, user] } : t)) },
      tenant.id,
      { actor, action: "user_added", detail: login },
    );
    onPlatform(nextState);
  }

  function addRole() {
    const name = window.prompt("Role name");
    if (!name) return;
    const role: Role = { id: `role-${Date.now()}`, name, system: false, allow: fullAllow() };
    patchTenant({ roles: [...tenant.roles, role] });
  }

  function setAllow(roleId: string, module: ModuleId, action: ActionId, on: boolean) {
    patchTenant({
      roles: tenant.roles.map((r) => {
        if (r.id !== roleId) return r;
        const cur = r.allow[module] ?? [];
        const allow = on ? [...new Set([...cur, action])] : cur.filter((a) => a !== action);
        return { ...r, allow: { ...r.allow, [module]: allow } };
      }),
    });
  }

  function decidePromotion(id: string, status: "approved" | "rejected") {
    const row = tenant.promotions.find((p) => p.id === id);
    const promotions = tenant.promotions.map((p) => (p.id === id ? { ...p, status } : p));
    let catalog = tenant.catalog;
    let catalogVersion = tenant.catalogVersion;
    if (status === "approved" && row) {
      const nextCatalog = applyPromotion(effectiveCatalog(tenant), row);
      catalog = nextCatalog;
      catalogVersion = nextCatalog.version;
    }
    let next = {
      ...platform,
      tenants: platform.tenants.map((t) =>
        t.id === tenant.id ? { ...t, promotions, catalog, catalogVersion } : t,
      ),
    };
    if (status === "approved" && catalog) {
      next = saveTenantCatalog(next, tenant.id, catalog);
    }
    const audited = logAudit(next, tenant.id, {
      actor,
      action: status === "approved" ? "promotion_approved" : "promotion_rejected",
      detail: row?.label ?? id,
    });
    onPlatform(audited);
    if (status === "approved" && catalog && project && onProject) {
      onProject(applyCatalogToProject(project, catalog));
    }
  }

  return (
    <div className="settings-layout">
      <Split id="settings-nav" axis="x" defaultSize={196} min={140} max={360}>
      <nav className="settings-nav" aria-label="Settings">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={active === id ? "on" : ""}
            aria-current={active === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className={`settings-pane${active === "report" ? " settings-pane-fill" : ""}`}>
      {active === "license" ? (
      <div className="settings-section">
      <h1 className="view">License</h1>
      <p className="hint">
        Aerolith account · {solo ? "individual" : "company"} workspace · {numbers.currency}. Jobs stay in{" "}
        {tenantProjectsHint(tenant.id)}.
        {session.impersonatedBy ? ` Vendor access by ${session.impersonatedBy} is recorded in Audit.` : ""}
      </p>
      {license && onAccount && onPricing ? (
        <LicensePanel
          session={license}
          busy={licenseBusy}
          onRefresh={onRefreshLicense}
          onAccount={onAccount}
          onPricing={onPricing}
          onSignOut={onSignOut}
        />
      ) : (
        <p className="hint">Sign in with an Aerolith account to see the trial.</p>
      )}
      </div>
      ) : null}
      {active === "numbers" ? (
      <div className="settings-section">
        <h2 className="view">Numbers</h2>
        <p className="hint">
          Currency is a label on this job and the default for new jobs. Figures are not converted.
          Nos (take-off and rate) and dimensions (L, B, H, Qty 1–4, Qty, Item qty) round up to the
          decimal places here. Rate and amount round half-up. Rate/Amount cells show the number only;
          the heading carries the currency marker, e.g. Rate (QAR) or Rate ($).
        </p>
        <div className="settings-numbers">
          <label className="field">
            Currency
            <select value={numbers.currency} onChange={(e) => patchNumbers({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
              {CURRENCIES.some((c) => c.code === numbers.currency) ? null : (
                <option value={numbers.currency}>{numbers.currency}</option>
              )}
            </select>
          </label>
          <label className="field">
            Nos decimals
            <select
              value={numbers.nosDecimals}
              onChange={(e) => patchNumbers({ nosDecimals: Number(e.target.value) })}
            >
              {placeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Dimension decimals
            <select
              value={numbers.dimDecimals}
              onChange={(e) => patchNumbers({ dimDecimals: Number(e.target.value) })}
            >
              {placeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Quantity decimals
            <select
              value={numbers.qtyDecimals}
              onChange={(e) => patchNumbers({ qtyDecimals: Number(e.target.value) })}
            >
              {placeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Rate decimals
            <select
              value={numbers.rateDecimals}
              onChange={(e) => patchNumbers({ rateDecimals: Number(e.target.value) })}
            >
              {placeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Amount decimals
            <select
              value={numbers.amountDecimals}
              onChange={(e) => patchNumbers({ amountDecimals: Number(e.target.value) })}
            >
              {placeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="settings-preview">
          Nos {formatNos(12.341, numbers.nosDecimals)}
          {" · L "}
          {formatDim(12.341999, numbers.dimDecimals)}
          {" · qty "}
          {formatQty(12.345678, numbers.qtyDecimals)}
          {" · "}
          Rate ({currencyMarker(numbers.currency)}) {formatMoneyPlain(1475.5, numbers.rateDecimals)}
          {" · "}
          Amount ({currencyMarker(numbers.currency)}) {formatMoneyPlain(100826297.13, numbers.amountDecimals)}
          {" · "}
          {formatMoney(100826297.13, numbers.currency, numbers.amountDecimals)}
        </p>
      </div>
      ) : null}
      {active === "replica" && onCompareReplica ? (
        <div className="settings-section">
          <h2 className="view">Replica compare</h2>
          <p className="hint">
            Open another .aero and list money-field conflicts against this job. Advanced — not on the top bar.
          </p>
          <button type="button" onClick={onCompareReplica}>
            Check replica vs this job
          </button>
        </div>
      ) : null}
      {active === "report" ? (
      <div className="settings-section settings-report">
        <ReportFormatFields
          value={mergeReportFormat(tenant.reportFormat as Partial<ReportFormat> | undefined)}
          onChange={(next) => patchTenant({ reportFormat: next as unknown as Record<string, unknown> })}
          templates={(tenant.reportTemplates ?? []) as StoredReportTemplate[]}
          activeId={tenant.activeReportTemplateId ?? null}
          currency={numbers.currency}
          onPack={(pack) =>
            patchTenant({
              reportFormat: (pack.format ?? mergeReportFormat(tenant.reportFormat as Partial<ReportFormat> | undefined)) as unknown as Record<string, unknown>,
              reportTemplates: pack.templates,
              activeReportTemplateId: pack.activeId,
            })
          }
        />
      </div>
      ) : null}
      {active === "users" && !solo ? (
      <div className="settings-section">
      <h2 className="view">Users</h2>
      <p className="hint">
        {seatsRemaining(tenant)} seat{seatsRemaining(tenant) === 1 ? "" : "s"} left. Everyone listed here
        works on the same tenant database.
      </p>
      <DataTable layoutKey="settings-users">
        <thead>
          <tr>
            <th>Name</th>
            <th>Login</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {tenant.users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.login}</td>
              <td>
                <select
                  disabled={!admin}
                  value={u.roleId}
                  onChange={(e) =>
                    patchTenant({
                      users: tenant.users.map((x) => (x.id === u.id ? { ...x, roleId: e.target.value } : x)),
                    })
                  }
                >
                  {tenant.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {admin ? (
        <div className="actions">
          <button type="button" disabled={!canAddSeat(tenant)} onClick={() => void addUser()}>
            Add user
          </button>
          <button type="button" onClick={addRole}>
            Add custom role
          </button>
        </div>
      ) : null}
      </div>
      ) : null}
      {active === "roles" && !solo ? (
      <div className="settings-section">
      <h2 className="view">Roles</h2>
      {tenant.roles.map((role) => (
        <div className="note" key={role.id} style={{ marginBottom: 12 }}>
          <h2>{role.name}</h2>
          <DataTable layoutKey={`settings-role-${role.id}`}>
            <thead>
              <tr>
                <th>Module</th>
                {ALL_ACTIONS.map((a) => (
                  <th key={a}>{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m.id}>
                  <td>{m.label}</td>
                  {ALL_ACTIONS.map((a) => (
                    <td key={a}>
                      <input
                        type="checkbox"
                        disabled={!admin || role.system}
                        checked={(role.allow[m.id] ?? []).includes(a)}
                        onChange={(e) => setAllow(role.id, m.id, a, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      ))}
      </div>
      ) : null}
      {active === "promotion" && !solo ? (
      <div className="settings-section">
      <h2 className="view">Promotion</h2>
      <label className="field">
        Policy
        <select
          disabled={!admin}
          value={tenant.promotionPolicy}
          onChange={(e) => patchTenant({ promotionPolicy: e.target.value as PromotionPolicy })}
        >
          <option value="approval_required">Approval required</option>
          <option value="auto">Auto</option>
          <option value="disabled">Disabled</option>
        </select>
      </label>
      <p className="hint">
        Promote from Masters → This project. Approved rows become tenant global masters and load on every
        new job. Tenant admins can also edit the Tenant catalog tab directly.
      </p>
      <DataTable layoutKey="settings-promotion">
        <thead>
          <tr>
            <th>Item</th>
            <th>By</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tenant.promotions.length === 0 ? (
            <tr>
              <td colSpan={4}>No promotion requests.</td>
            </tr>
          ) : (
            tenant.promotions.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.kind} {p.code} {p.label}
                </td>
                <td>{p.requestedBy}</td>
                <td>{p.status}</td>
                <td>
                  {admin && p.status === "pending" ? (
                    <>
                      <button type="button" className="primary" onClick={() => decidePromotion(p.id, "approved")}>
                        Approve
                      </button>{" "}
                      <button type="button" onClick={() => decidePromotion(p.id, "rejected")}>
                        Reject
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      </div>
      ) : null}
      {active === "audit" ? (
      <div className="settings-section">
      <h2 className="view">Audit</h2>
      <DataTable layoutKey="settings-audit">
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {tenant.audit.slice(0, 40).map((a) => (
            <tr key={a.id}>
              <td>{new Date(a.ts).toLocaleString()}</td>
              <td>{a.actor}</td>
              <td>{a.action}</td>
              <td>{a.detail}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      </div>
      ) : null}
      </div>
      </Split>
    </div>
  );
}
