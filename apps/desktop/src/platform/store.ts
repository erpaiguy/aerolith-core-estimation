import { hashPin, newSalt } from "./crypto";
import {
  applyIssuedKey,
  mergeRecent,
  normalizeTenant,
  recentsStorageKey,
  systemRoles,
  type RecentJob,
} from "./tenant";
import type { AuditEvent, LicenseKey, PlatformState, Role, TenantRecord } from "./types";
import { generateLicenseKey, licenseExpiresAt, normalizeLicenseKey, type LicenseTerm } from "./licenseTerm";
import type { TenantCatalog } from "../tenantCatalog";
import { bundledResourceSeed, mergeResourceSeed, RESOURCE_SEED_VERSION } from "../resourceMaster";

const KEY = "aerolith.platform.v1";
const RECENTS_LEGACY = "aerolith.recents";
const RECENTS_MIGRATED = "aerolith.recents.migrated";

async function seed(): Promise<PlatformState> {
  const trialStartedAt = new Date().toISOString();
  async function user(id: string, name: string, login: string, pin: string, roleId: string) {
    const salt = newSalt();
    return { id, name, login, salt, pinHash: await hashPin(pin, salt), roleId };
  }
  const demoRoles = systemRoles();
  const soloRoles = systemRoles();
  const ownerSalt = newSalt();
  return {
    owner: { login: "owner", salt: ownerSalt, pinHash: await hashPin("owner", ownerSalt) },
    keys: [],
    tenants: [
      {
        id: "t-demo",
        name: "Aerolith Demo",
        edition: "team",
        seatLimit: 5,
        promotionPolicy: "approval_required",
        trialStartedAt,
        licenseExpiresAt: null,
        catalogVersion: 1,
        promotions: [],
        roles: demoRoles,
        users: [
          await user("u-admin", "Tenant Admin", "admin", "admin", "admin"),
          await user("u-est", "Estimator", "estimator", "estimator", "estimator"),
          await user("u-view", "Viewer", "viewer", "viewer", "viewer"),
        ],
        audit: [
          {
            id: "a-0",
            ts: trialStartedAt,
            actor: "system",
            action: "workspace_created",
            detail:
              "Demo company workspace. One shared database for all users. Admin / Estimator / Viewer. 14-day license grace started.",
          },
        ],
      },
      {
        id: "t-solo",
        name: "Solo sample",
        edition: "solo",
        seatLimit: 1,
        promotionPolicy: "auto",
        trialStartedAt,
        licenseExpiresAt: null,
        catalogVersion: 1,
        promotions: [],
        roles: soloRoles,
        users: [await user("u-solo", "You", "admin", "admin", "admin")],
        audit: [
          {
            id: "a-solo",
            ts: trialStartedAt,
            actor: "system",
            action: "workspace_created",
            detail: "Solo workspace. One database, one seat. PIN admin.",
          },
        ],
      },
    ],
  };
}

function storageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* preview / tests without storage */
  }
}

export function readPlatform(): PlatformState | null {
  try {
    const raw = storageGet(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PlatformState;
  } catch {
    return null;
  }
}

export function savePlatform(state: PlatformState): void {
  storageSet(KEY, JSON.stringify(state));
}

export function saveTenantCatalog(state: PlatformState, tenantId: string, catalog: TenantCatalog): PlatformState {
  const next: PlatformState = {
    ...state,
    tenants: state.tenants.map((t) =>
      t.id === tenantId ? { ...t, catalog, catalogVersion: catalog.version } : t,
    ),
  };
  savePlatform(next);
  void import("../nativeMasters")
    .then((m) => m.persistTenantCatalog(tenantId, catalog))
    .catch(() => {});
  return next;
}

async function hydrateCatalogs(tenants: TenantRecord[]): Promise<TenantRecord[]> {
  try {
    const native = await import("../nativeMasters");
    const out: TenantRecord[] = [];
    for (const t of tenants) {
      const disk = await native.tryReadTenantCatalog(t.id);
      if (disk && (!t.catalog || disk.version > (t.catalog.version ?? 0))) {
        out.push({
          ...t,
          catalog: disk,
          catalogVersion: Math.max(t.catalogVersion ?? 1, disk.version),
        });
      } else {
        out.push(t);
      }
    }
    return out;
  } catch {
    return tenants;
  }
}

function migrateLegacyRecents(tenants: TenantRecord[]): void {
  if (storageGet(RECENTS_MIGRATED)) return;
  const legacy = storageGet(RECENTS_LEGACY);
  const first = tenants[0];
  if (legacy && first && !storageGet(recentsStorageKey(first.id))) {
    storageSet(recentsStorageKey(first.id), legacy);
  }
  storageSet(RECENTS_MIGRATED, "1");
}

async function withResourceSeed(tenants: TenantRecord[]): Promise<TenantRecord[]> {
  const seed = await bundledResourceSeed();
  return tenants.map((tenant) => {
    const merged = mergeResourceSeed(tenant.resourceMaster, seed, tenant.resourceMasterSeedVersion, RESOURCE_SEED_VERSION);
    return { ...tenant, resourceMaster: merged.rows, resourceMasterSeedVersion: merged.version };
  });
}

export async function ensurePlatform(): Promise<PlatformState> {
  const existing = readPlatform();
  if (existing?.tenants?.length) {
    let tenants = existing.tenants.map((t) => normalizeTenant(t));
    if (!tenants.some((t) => t.id === "t-solo")) {
      const extra = await createTenant("Solo sample", "solo", 1, "system");
      tenants = [...tenants, { ...extra, id: "t-solo" }];
    }
    tenants = await hydrateCatalogs(tenants);
    tenants = await withResourceSeed(tenants);
    migrateLegacyRecents(tenants);
    const patched: PlatformState = { ...existing, tenants };
    savePlatform(patched);
    return patched;
  }
  const state = await seed();
  const tenants = await withResourceSeed(await hydrateCatalogs(state.tenants));
  const patched = { ...state, tenants };
  savePlatform(patched);
  return patched;
}

export function logAudit(state: PlatformState, tenantId: string, event: Omit<AuditEvent, "id" | "ts">): PlatformState {
  const next: PlatformState = {
    ...state,
    tenants: state.tenants.map((t) =>
      t.id === tenantId
        ? {
            ...t,
            audit: [
              { id: `a-${Date.now()}`, ts: new Date().toISOString(), ...event },
              ...t.audit,
            ].slice(0, 200),
          }
        : t,
    ),
  };
  savePlatform(next);
  return next;
}

export function recents(scope: string): RecentJob[] {
  try {
    return JSON.parse(storageGet(recentsStorageKey(scope)) || "[]") as RecentJob[];
  } catch {
    return [];
  }
}

export function pushRecent(name: string, path: string, scope: string): void {
  const next = mergeRecent(recents(scope), name, path);
  storageSet(recentsStorageKey(scope), JSON.stringify(next));
}

export async function createTenant(
  name: string,
  edition: "solo" | "team",
  seatLimit: number,
  actor = "owner",
): Promise<TenantRecord> {
  const trialStartedAt = new Date().toISOString();
  const adminSalt = newSalt();
  const seats = edition === "solo" ? 1 : Math.max(2, Math.floor(seatLimit) || 5);
  return {
    id: `t-${Date.now()}`,
    name,
    edition,
    seatLimit: seats,
    promotionPolicy: edition === "solo" ? "auto" : "approval_required",
    trialStartedAt,
    licenseExpiresAt: null,
    catalogVersion: 1,
    promotions: [],
    roles: systemRoles(),
    users: [
      {
        id: `u-${Date.now()}`,
        name: edition === "solo" ? name : "Tenant Admin",
        login: "admin",
        salt: adminSalt,
        pinHash: await hashPin("admin", adminSalt),
        roleId: "admin",
      },
    ],
    audit: [
      {
        id: `a-${Date.now()}`,
        ts: trialStartedAt,
        actor,
        action: "tenant_created",
        detail:
          edition === "solo"
            ? `${name} · solo workspace · 1 shared database · 1 seat`
            : `${name} · company workspace · 1 shared database · ${seats} seats`,
      },
    ],
  };
}

export function applyLicenseKey(state: PlatformState, tenantId: string, keyValue: string): PlatformState | null {
  const needle = keyValue.trim().toLowerCase();
  const found = state.keys.find((k) => k.key.toLowerCase() === needle && k.tenantId === tenantId);
  if (!found) return null;
  const next: PlatformState = {
    ...state,
    tenants: state.tenants.map((t) => (t.id === tenantId ? applyIssuedKey(t, found) : t)),
  };
  savePlatform(next);
  return next;
}

export function issueLicense(
  state: PlatformState,
  tenantId: string,
  seatLimit: number,
  term: LicenseTerm = { amount: 1, unit: "year" },
  keyText?: string,
  now = new Date(),
): { state: PlatformState; key: LicenseKey } | null {
  const tenant = state.tenants.find((t) => t.id === tenantId);
  if (!tenant) return null;
  if (!Number.isFinite(term.amount) || term.amount < 1) return null;
  const custom = keyText != null ? normalizeLicenseKey(keyText) : "";
  const value = custom || generateLicenseKey();
  if (value.length < 4) return null;
  if (state.keys.some((k) => k.key.toLowerCase() === value.toLowerCase())) return null;
  const key: LicenseKey = {
    key: value,
    tenantId,
    issuedAt: now.toISOString(),
    expiresAt: licenseExpiresAt(now, term).toISOString(),
    seatLimit: Math.max(1, Math.floor(seatLimit) || 1),
    term,
  };
  const next: PlatformState = {
    ...state,
    keys: [...state.keys, key],
    tenants: state.tenants.map((t) => (t.id === tenantId ? applyIssuedKey(t, key) : t)),
  };
  savePlatform(next);
  return { state: next, key };
}

export type { PlatformState } from "./types";
export type Session =
  | { kind: "tenant"; tenant: TenantRecord; userId: string; role: Role; impersonatedBy?: string }
  | { kind: "owner" };

export function sessionScope(session: Session | null): string | null {
  if (!session) return null;
  if (session.kind === "owner") return "owner";
  return session.tenant.id;
}

export function can(session: Session | null, module: string, action: string): boolean {
  if (!session) return false;
  if (session.kind === "owner") return true;
  const allowed = session.role.allow[module as keyof Role["allow"]] ?? [];
  return allowed.includes(action as never);
}
