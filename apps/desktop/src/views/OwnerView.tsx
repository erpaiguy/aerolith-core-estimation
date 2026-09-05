import { useState } from "react";
import { licenseStatus } from "../platform/crypto";
import { createTenant, issueLicense, logAudit, savePlatform } from "../platform/store";
import type { PlatformState, Session } from "../platform/store";
import { DEFAULT_TEAM_SEATS, isSoloTenant, tenantProjectsHint } from "../platform/tenant";
import {
  LICENSE_TERM_PRESETS,
  formatLicenseTerm,
  parseLicenseTerm,
  type LicenseTerm,
  type LicenseUnit,
} from "../platform/licenseTerm";
import { DataTable } from "../ui/tableLayout";

type IssueDraft = {
  tenantId: string;
  key: string;
  seats: string;
  preset: string;
  customAmount: string;
  customUnit: LicenseUnit;
  error: string;
};

function defaultDraft(tenantId: string, seats: number): IssueDraft {
  return {
    tenantId,
    key: "",
    seats: String(seats),
    preset: "1y",
    customAmount: "30",
    customUnit: "day",
    error: "",
  };
}

function termFromDraft(draft: IssueDraft): LicenseTerm | null {
  if (draft.preset === "custom") return parseLicenseTerm(draft.customAmount, draft.customUnit);
  return LICENSE_TERM_PRESETS.find((p) => p.id === draft.preset)?.term ?? null;
}

export function OwnerView({
  platform,
  onPlatform,
  onImpersonate,
  onSignOut,
}: {
  platform: PlatformState;
  onPlatform: (next: PlatformState) => void;
  onImpersonate: (session: Session) => void;
  onSignOut: () => void;
}) {
  const [draft, setDraft] = useState<IssueDraft | null>(null);

  function openIssue(tenantId: string) {
    const tenant = platform.tenants.find((t) => t.id === tenantId);
    if (!tenant) return;
    setDraft(defaultDraft(tenantId, tenant.seatLimit || DEFAULT_TEAM_SEATS));
  }

  function issueKey() {
    if (!draft) return;
    const tenant = platform.tenants.find((t) => t.id === draft.tenantId);
    if (!tenant) return;
    const seats = Math.max(1, Number.parseInt(draft.seats, 10) || 1);
    const term = termFromDraft(draft);
    if (!term) {
      setDraft({ ...draft, error: "Enter a term of at least 1 day, month, or year." });
      return;
    }
    const issued = issueLicense(platform, draft.tenantId, seats, term, draft.key);
    if (!issued) {
      setDraft({
        ...draft,
        error: draft.key.trim()
          ? "That key is already in use, or it is too short (need 4 characters)."
          : "Could not issue a key for this workspace.",
      });
      return;
    }
    const audited = logAudit(issued.state, draft.tenantId, {
      actor: "owner",
      action: "license_issued",
      detail: `${issued.key.key} · ${seats} seat${seats === 1 ? "" : "s"} · ${formatLicenseTerm(term)} until ${issued.key.expiresAt.slice(0, 10)}`,
    });
    onPlatform(audited);
    setDraft(null);
  }

  async function addTenant(edition: "solo" | "team") {
    const name = window.prompt(edition === "solo" ? "Workspace name (just you)" : "Company workspace name");
    if (!name) return;
    let seats = 1;
    if (edition === "team") {
      const raw = window.prompt("Seat limit", String(DEFAULT_TEAM_SEATS));
      if (raw == null) return;
      seats = Math.max(2, Number.parseInt(raw, 10) || DEFAULT_TEAM_SEATS);
    }
    const tenant = await createTenant(name.trim(), edition, seats);
    const next = { ...platform, tenants: [...platform.tenants, tenant] };
    savePlatform(next);
    onPlatform(next);
  }

  function impersonate(tenantId: string) {
    const tenant = platform.tenants.find((t) => t.id === tenantId);
    if (!tenant) return;
    const admin = tenant.users.find((u) => u.roleId === "admin") ?? tenant.users[0];
    const role = tenant.roles.find((r) => r.id === admin?.roleId);
    if (!admin || !role) return;
    const next = logAudit(platform, tenantId, {
      actor: "owner",
      action: "impersonation",
      detail: `Owner signed in as ${admin.login}. Visible to this tenant.`,
    });
    onPlatform(next);
    onImpersonate({
      kind: "tenant",
      tenant: next.tenants.find((t) => t.id === tenantId) ?? tenant,
      userId: admin.id,
      role,
      impersonatedBy: "owner",
    });
  }

  const issueTenant = draft ? platform.tenants.find((t) => t.id === draft.tenantId) : null;

  return (
    <div className="app backstage">
      <aside className="back-nav">
        <div className="who">
          Owner portal
          <small>One installer · many workspaces</small>
        </div>
        <button type="button" className="on">
          Tenants
        </button>
        <div className="sp" />
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </aside>
      <div className="home">
        <h1>Tenants</h1>
        <p className="home-sub">
          Solo workspaces keep one database. Company workspaces share one job store across seats.
        </p>
        <div className="actions">
          <button className="primary" type="button" onClick={() => void addTenant("team")}>
            New company
          </button>
          <button type="button" onClick={() => void addTenant("solo")}>
            New solo
          </button>
        </div>
        <DataTable layoutKey="owner-tenants">
          <thead>
            <tr>
              <th>Workspace</th>
              <th>Edition</th>
              <th>Seats</th>
              <th>License</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {platform.tenants.map((t) => {
              const lic = licenseStatus(t.trialStartedAt, t.licenseExpiresAt);
              const solo = isSoloTenant(t);
              return (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{solo ? "Solo" : "Company"}</td>
                  <td className="num">
                    {t.users.length} / {t.seatLimit}
                  </td>
                  <td>
                    {lic.readOnly ? "Read-only" : lic.paid ? "Licensed" : `Trial · ${lic.daysLeft}d`}
                  </td>
                  <td>
                    <button type="button" onClick={() => impersonate(t.id)}>
                      Impersonate
                    </button>{" "}
                    <button type="button" onClick={() => openIssue(t.id)}>
                      Issue key
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        <h2 className="view" style={{ fontSize: 16, marginTop: 28 }}>
          Keys
        </h2>
        <DataTable layoutKey="owner-keys">
          <thead>
            <tr>
              <th>Key</th>
              <th>Tenant</th>
              <th>Term</th>
              <th>Seats</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {platform.keys.length === 0 ? (
              <tr>
                <td colSpan={5}>No keys issued yet.</td>
              </tr>
            ) : (
              platform.keys.map((k) => (
                <tr key={k.key}>
                  <td>{k.key}</td>
                  <td>{platform.tenants.find((t) => t.id === k.tenantId)?.name ?? k.tenantId}</td>
                  <td>{k.term ? formatLicenseTerm(k.term) : "—"}</td>
                  <td>{k.seatLimit ?? "—"}</td>
                  <td>{k.expiresAt.slice(0, 10)}</td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <p className="hint">{platform.tenants[0] ? tenantProjectsHint(platform.tenants[0].id) : null}</p>
      </div>
      {draft && issueTenant ? (
        <div
          className="owner-issue-mask"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDraft(null);
          }}
        >
          <form
            className="owner-issue"
            onSubmit={(e) => {
              e.preventDefault();
              issueKey();
            }}
          >
            <h2>Issue license</h2>
            <p className="hint">
              Permit {issueTenant.name}. Leave the key blank to generate one, or type your own. Term can be days,
              months, or years.
            </p>
            <label className="field">
              License key
              <input
                value={draft.key}
                onChange={(e) => setDraft({ ...draft, key: e.target.value, error: "" })}
                placeholder="Optional · e.g. AL-MAHA-2026"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="field">
              Seats
              <input
                inputMode="numeric"
                value={draft.seats}
                onChange={(e) => setDraft({ ...draft, seats: e.target.value, error: "" })}
              />
            </label>
            <p className="hint">1 seat is solo. 2 or more is a company workspace.</p>
            <label className="field">
              Term
              <select
                value={draft.preset}
                onChange={(e) => setDraft({ ...draft, preset: e.target.value, error: "" })}
              >
                {LICENSE_TERM_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            </label>
            {draft.preset === "custom" ? (
              <div className="owner-issue-custom">
                <label className="field">
                  Length
                  <input
                    inputMode="numeric"
                    value={draft.customAmount}
                    onChange={(e) => setDraft({ ...draft, customAmount: e.target.value, error: "" })}
                  />
                </label>
                <label className="field">
                  Unit
                  <select
                    value={draft.customUnit}
                    onChange={(e) => setDraft({ ...draft, customUnit: e.target.value as LicenseUnit, error: "" })}
                  >
                    <option value="day">Days</option>
                    <option value="month">Months</option>
                    <option value="year">Years</option>
                  </select>
                </label>
              </div>
            ) : null}
            {draft.error ? <p className="hint">{draft.error}</p> : null}
            <div className="actions">
              <button className="primary" type="submit">
                Issue
              </button>
              <button type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
