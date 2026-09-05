import type { LicenseKey, TenantEdition, TenantRecord } from "./types";
import { fullAllow, viewAllow, type Role } from "./types";

export const DEFAULT_TEAM_SEATS = 5;

export function estimatorAllow() {
  const allow = fullAllow();
  allow.settings = ["view"];
  return allow;
}

export function systemRoles(): Role[] {
  return [
    { id: "admin", name: "Admin", system: true, allow: fullAllow() },
    { id: "estimator", name: "Estimator", system: true, allow: estimatorAllow() },
    { id: "viewer", name: "Viewer", system: true, allow: viewAllow() },
  ];
}

export function isSoloTenant(tenant: Pick<TenantRecord, "edition">): boolean {
  return tenant.edition === "solo";
}

export function seatsUsed(tenant: Pick<TenantRecord, "users">): number {
  return tenant.users.length;
}

export function seatsRemaining(tenant: Pick<TenantRecord, "users" | "seatLimit">): number {
  return Math.max(0, tenant.seatLimit - tenant.users.length);
}

export function canAddSeat(tenant: Pick<TenantRecord, "users" | "seatLimit">): boolean {
  return tenant.users.length < tenant.seatLimit;
}

export function addUserBlockedReason(tenant: Pick<TenantRecord, "edition" | "users" | "seatLimit">): string | null {
  if (tenant.users.length < tenant.seatLimit) return null;
  if (tenant.edition === "solo") {
    return "This is a solo workspace (1 seat). Ask the owner for a company license to add people.";
  }
  return `All ${tenant.seatLimit} seats are in use. Ask the owner to raise the seat limit.`;
}

/** Folder under Documents\Aerolith\Tenants\<id>\Projects — shared by every user of this tenant. */
export function tenantProjectsHint(tenantId: string): string {
  return `Documents\\Aerolith\\Tenants\\${tenantId}\\Projects`;
}

/**
 * One-time fill for tenants saved before edition existed.
 * After this, edition is stored and must not be re-derived from user count.
 */
export function normalizeTenant(
  tenant: Omit<TenantRecord, "edition" | "seatLimit"> & Partial<Pick<TenantRecord, "edition" | "seatLimit">>,
): TenantRecord {
  const users = tenant.users ?? [];
  const edition: TenantEdition =
    tenant.edition === "solo" || tenant.edition === "team"
      ? tenant.edition
      : users.length > 1
        ? "team"
        : "solo";
  let seatLimit = typeof tenant.seatLimit === "number" && tenant.seatLimit >= 1 ? tenant.seatLimit : NaN;
  if (!Number.isFinite(seatLimit)) {
    seatLimit = edition === "solo" ? 1 : Math.max(users.length, DEFAULT_TEAM_SEATS);
  }
  if (edition === "solo") seatLimit = 1;
  else seatLimit = Math.max(seatLimit, users.length, 1);
  return {
    ...tenant,
    edition,
    seatLimit,
    catalogVersion: tenant.catalogVersion ?? 1,
    promotions: tenant.promotions ?? [],
  };
}

export function applySeatLicense(tenant: TenantRecord, seatLimit: number, expiresAt: string): TenantRecord {
  const seats = Math.max(1, Math.floor(seatLimit) || 1);
  const edition: TenantEdition = seats <= 1 ? "solo" : "team";
  if (edition === "solo" && tenant.users.length > 1) {
    return {
      ...tenant,
      licenseExpiresAt: expiresAt,
      edition: "team",
      seatLimit: Math.max(tenant.users.length, tenant.seatLimit),
    };
  }
  return {
    ...tenant,
    licenseExpiresAt: expiresAt,
    edition,
    seatLimit: edition === "solo" ? 1 : Math.max(seats, tenant.users.length),
  };
}

export function applyIssuedKey(tenant: TenantRecord, key: LicenseKey): TenantRecord {
  const seats = key.seatLimit ?? tenant.seatLimit;
  return applySeatLicense(tenant, seats, key.expiresAt);
}

export function recentsStorageKey(scope: string): string {
  return `aerolith.recents.${scope}`;
}

export type RecentJob = { name: string; path: string; at: string };

export function mergeRecent(list: RecentJob[], name: string, path: string, at = new Date().toISOString()): RecentJob[] {
  return [{ name, path, at }, ...list.filter((r) => r.path !== path)].slice(0, 12);
}

export function scopeForSession(kind: "tenant" | "owner", tenantId?: string): string {
  if (kind === "owner") return "owner";
  return tenantId || "unknown";
}
