import { describe, expect, it } from "vitest";
import { AuthApiClient } from "./authApiClient";
import { LicenseService, type LicenseStore } from "./licenseService";
import { describeLicense, resolveAccess, trialDaysRemaining, type LicenseSession } from "./licenseState";
import { readLicense, readSupabaseAuth } from "./payload";
import { assertReleaseConfig, releaseConfig } from "./releaseConfig";
import { TRIAL_DAYS, normalizePlan, planDisplayName } from "./subscriptionPlans";

function memoryStore(): LicenseStore & { saved: LicenseSession | null } {
  const box: LicenseStore & { saved: LicenseSession | null } = {
    saved: null,
    async load() {
      return box.saved;
    },
    async save(session) {
      box.saved = session;
    },
    async clear() {
      box.saved = null;
    },
  };
  return box;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("release config", () => {
  it("ships Aerolith email auth for this app, not mock auth", () => {
    expect(() => assertReleaseConfig()).not.toThrow();
    expect(releaseConfig.useMockAuth).toBe(false);
    expect(releaseConfig.appId).toBe("aerolith-estimation");
    expect(releaseConfig.tenancyMode).toBe("individual");
    expect(releaseConfig.licenseApiUrl).toBe("https://mmuwdnzbapnbqnqfrwox.supabase.co/functions/v1");
    expect(releaseConfig.signupUrl).toBe("https://www.theaerolithcore.com/account/login");
    expect(releaseConfig.accountUrl).toBe("https://www.theaerolithcore.com/account");
    expect(releaseConfig.pricingUrl).toBe("https://www.theaerolithcore.com/pricing");
    expect(releaseConfig.supabaseAnonKey.length).toBeGreaterThan(20);
    expect(releaseConfig.licensePublicKeys[0]?.kid).toBe("2026-1");
  });
});

describe("subscription plans", () => {
  it("gives this app a 30 day trial and keeps other plans named for later", () => {
    expect(TRIAL_DAYS).toBe(30);
    expect(normalizePlan("demo")).toBe("trial");
    expect(normalizePlan("annual")).toBe("annual");
    expect(normalizePlan("pro")).toBe("lifetime");
    expect(planDisplayName("trial")).toBe("Trial");
  });
});

describe("payload reader", () => {
  it("reads supabase auth and license aliases", () => {
    const login = readSupabaseAuth(
      JSON.stringify({
        access_token: "atk",
        refresh_token: "rtk",
        user: { id: "user-1", email: "ada@example.com", user_metadata: { full_name: "Ada" } },
      }),
      true,
    );
    expect(login.success).toBe(true);
    expect(login.displayName).toBe("Ada");
    const license = readLicense(
      JSON.stringify({
        success: true,
        authenticated: true,
        license_valid: true,
        plan: "trial",
        trial_started_at: "2026-09-01T00:00:00.000Z",
        plan_expires_at: "2026-10-01T00:00:00.000Z",
      }),
    );
    expect(license.licenseValid).toBe(true);
    expect(license.planCode).toBe("trial");
    expect(license.planExpiresAtUtc).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("license service", () => {
  const now = new Date("2026-09-01T00:00:00.000Z");

  function clientFetch(activate: Record<string, unknown>): typeof fetch {
    return (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/v1/token")) {
        return jsonResponse({
          access_token: "access-1",
          refresh_token: "refresh-1",
          user: { id: "user-1", email: "ada@example.com", user_metadata: { full_name: "Ada Lovelace" } },
        });
      }
      if (url.endsWith("/license-activate") || url.endsWith("/license-refresh")) {
        return jsonResponse(activate);
      }
      return jsonResponse({ error: "missing" }, 404);
    }) as typeof fetch;
  }

  it("starts a 30 day trial for aerolith-estimation when the server omits an end date", async () => {
    const store = memoryStore();
    const service = new LicenseService(
      releaseConfig,
      store,
      clientFetch({
        success: true,
        authenticated: true,
        licenseValid: true,
        plan: "trial",
        trialStartedAtUtc: now.toISOString(),
        email: "ada@example.com",
      }),
      "device-1",
      () => now,
    );
    const result = await service.login("ada@example.com", "secret");
    expect(result.ok).toBe(true);
    expect(service.session.planCode).toBe("trial");
    expect(service.session.planExpiresAtUtc).toBe("2026-10-01T00:00:00.000Z");
    expect(trialDaysRemaining(service.session, now)).toBe(30);
    expect(resolveAccess(service.session, now)).toBe("trial");
    expect(describeLicense(service.session, now)).toBe("Trial · 30 days left");
    expect(store.saved?.accessToken).toBe("access-1");
  });

  it("keeps the server trial end and sends this app id", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("/auth/v1/token")) {
        return jsonResponse({ access_token: "access-1", refresh_token: "refresh-1", user: { id: "u", email: "ada@example.com" } });
      }
      const body = JSON.parse(String(init?.body)) as { app_id: string };
      expect(body.app_id).toBe("aerolith-estimation");
      return jsonResponse({
        success: true,
        authenticated: true,
        licenseValid: true,
        plan_code: "trial",
        trialStartedAt: "2026-09-01T00:00:00.000Z",
        planExpiresAt: "2026-10-01T00:00:00.000Z",
      });
    }) as typeof fetch;
    const service = new LicenseService(releaseConfig, memoryStore(), fetchImpl, "device-1", () => now);
    const result = await service.login("ada@example.com", "secret");
    expect(result.ok).toBe(true);
    expect(seen.some((url) => url.endsWith("/license-activate"))).toBe(true);
    expect(describeLicense(service.session, now)).toBe("Trial · 30 days left");
  });

  it("rejects a bad password without opening the workspace", async () => {
    const fetchImpl = (async () => jsonResponse({ msg: "Invalid login credentials" }, 400)) as typeof fetch;
    const service = new LicenseService(releaseConfig, memoryStore(), fetchImpl, "device-1", () => now);
    const result = await service.login("ada@example.com", "nope");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid login credentials/);
    expect(service.session.isAuthenticated).toBe(false);
  });
});

describe("auth client", () => {
  it("posts the password grant to supabase", async () => {
    let auth = "";
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      auth = String(input);
      expect(new Headers(init?.headers).get("apikey")).toBe(releaseConfig.supabaseAnonKey);
      return jsonResponse({ msg: "Invalid login credentials" }, 400);
    }) as typeof fetch;
    const client = new AuthApiClient(releaseConfig, fetchImpl);
    const login = await client.login("ada@example.com", "secret");
    expect(auth).toContain("/auth/v1/token?grant_type=password");
    expect(login.success).toBe(false);
  });
});
