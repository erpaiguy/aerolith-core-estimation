import { describe, expect, it, beforeEach } from "vitest";
import { can, pushRecent, recents, type Session } from "./store";
import {
  addUserBlockedReason,
  applySeatLicense,
  canAddSeat,
  isSoloTenant,
  mergeRecent,
  normalizeTenant,
  recentsStorageKey,
  seatsRemaining,
  systemRoles,
  tenantProjectsHint,
} from "./tenant";
import type { TenantRecord } from "./types";

function tenant(partial: Partial<TenantRecord> & Pick<TenantRecord, "id" | "name">): TenantRecord {
  return normalizeTenant({
    promotionPolicy: "auto",
    users: [],
    roles: systemRoles(),
    audit: [],
    licenseExpiresAt: null,
    trialStartedAt: "2026-01-01T00:00:00.000Z",
    catalogVersion: 1,
    promotions: [],
    edition: "solo",
    seatLimit: 1,
    ...partial,
  });
}

function user(id: string, roleId = "admin") {
  return { id, name: id, login: id, salt: "s", pinHash: "h", roleId };
}

describe("tenant edition", () => {
  it("does not re-infer edition from user count once it is stored", () => {
    const soloWithStaleCount = tenant({
      id: "t-1",
      name: "Me",
      edition: "solo",
      seatLimit: 1,
      users: [user("u1")],
    });
    expect(normalizeTenant(soloWithStaleCount).edition).toBe("solo");
    expect(isSoloTenant(soloWithStaleCount)).toBe(true);
  });

  it("fills missing edition from user count only on first migrate", () => {
    const one = normalizeTenant({
      id: "a",
      name: "A",
      promotionPolicy: "auto",
      users: [user("u1")],
      roles: systemRoles(),
      audit: [],
      licenseExpiresAt: null,
      trialStartedAt: "2026-01-01T00:00:00.000Z",
      catalogVersion: 1,
      promotions: [],
    });
    const many = normalizeTenant({
      id: "b",
      name: "B",
      promotionPolicy: "approval_required",
      users: [user("u1"), user("u2")],
      roles: systemRoles(),
      audit: [],
      licenseExpiresAt: null,
      trialStartedAt: "2026-01-01T00:00:00.000Z",
      catalogVersion: 1,
      promotions: [],
    });
    expect(one.edition).toBe("solo");
    expect(one.seatLimit).toBe(1);
    expect(many.edition).toBe("team");
    expect(many.seatLimit).toBeGreaterThanOrEqual(2);
  });

  it("blocks a second user on a solo workspace", () => {
    const t = tenant({ id: "t", name: "Solo", edition: "solo", seatLimit: 1, users: [user("u1")] });
    expect(canAddSeat(t)).toBe(false);
    expect(addUserBlockedReason(t)).toMatch(/solo/i);
  });

  it("allows users on a team workspace until the seat limit", () => {
    const t = tenant({
      id: "t",
      name: "Co",
      edition: "team",
      seatLimit: 3,
      users: [user("u1"), user("u2")],
    });
    expect(seatsRemaining(t)).toBe(1);
    expect(canAddSeat(t)).toBe(true);
    const full = { ...t, users: [...t.users, user("u3")] };
    expect(canAddSeat(full)).toBe(false);
  });

  it("a multi-seat license upgrades solo to a shared team database", () => {
    const t = tenant({ id: "t", name: "Me", edition: "solo", seatLimit: 1, users: [user("u1")] });
    const next = applySeatLicense(t, 8, "2027-01-01T00:00:00.000Z");
    expect(next.edition).toBe("team");
    expect(next.seatLimit).toBe(8);
    expect(next.licenseExpiresAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("will not shrink a team below people already on the workspace", () => {
    const t = tenant({
      id: "t",
      name: "Co",
      edition: "team",
      seatLimit: 5,
      users: [user("u1"), user("u2"), user("u3")],
    });
    const next = applySeatLicense(t, 1, "2027-01-01T00:00:00.000Z");
    expect(next.edition).toBe("team");
    expect(next.seatLimit).toBeGreaterThanOrEqual(3);
  });

  it("points every tenant at one shared projects folder", () => {
    expect(tenantProjectsHint("t-demo")).toBe("Documents\\Aerolith\\Tenants\\t-demo\\Projects");
  });
});

describe("tenant-scoped recents", () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    const storage = {
      get length() {
        return mem.size;
      },
      clear: () => mem.clear(),
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, String(v));
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      key: () => null,
    };
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  });

  it("keeps job lists per tenant, not per user", () => {
    pushRecent("Job A", "C:\\a.aero", "t-demo");
    pushRecent("Job B", "C:\\b.aero", "t-other");
    expect(recents("t-demo").map((r) => r.name)).toEqual(["Job A"]);
    expect(recents("t-other").map((r) => r.name)).toEqual(["Job B"]);
    expect(recentsStorageKey("t-demo")).toBe("aerolith.recents.t-demo");
  });

  it("dedupes the same path on the shared tenant list", () => {
    const once = mergeRecent([], "Job", "/x.aero", "2026-01-01T00:00:00.000Z");
    const twice = mergeRecent(once, "Job renamed", "/x.aero", "2026-01-02T00:00:00.000Z");
    expect(twice).toHaveLength(1);
    expect(twice[0].name).toBe("Job renamed");
  });
});

describe("can()", () => {
  const roles = systemRoles();
  const t = tenant({
    id: "t-demo",
    name: "Demo",
    edition: "team",
    seatLimit: 5,
    users: [user("u-admin", "admin"), user("u-view", "viewer")],
    roles,
  });

  it("lets an admin edit estimate on the shared tenant database", () => {
    const session: Session = {
      kind: "tenant",
      tenant: t,
      userId: "u-admin",
      role: roles.find((r) => r.id === "admin")!,
    };
    expect(can(session, "estimate", "edit")).toBe(true);
    expect(can(session, "settings", "edit")).toBe(true);
  });

  it("keeps a viewer read-only even though they share the same database", () => {
    const session: Session = {
      kind: "tenant",
      tenant: t,
      userId: "u-view",
      role: roles.find((r) => r.id === "viewer")!,
    };
    expect(can(session, "estimate", "view")).toBe(true);
    expect(can(session, "estimate", "edit")).toBe(false);
    expect(can(session, "settings", "view")).toBe(false);
  });

  it("owner bypasses module checks", () => {
    expect(can({ kind: "owner" }, "settings", "edit")).toBe(true);
  });
});
