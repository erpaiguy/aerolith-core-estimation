import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../nativeAero";
import { AuthApiClient, type FetchLike } from "./authApiClient";
import {
  clockTrusted,
  describeLicense,
  emptySession,
  fromReasonCode,
  isFullLock,
  resolveAccess,
  type LicenseAccessState,
  type LicenseSession,
} from "./licenseState";
import type { LicenseVerifyResponse } from "./payload";
import { releaseConfig, type ReleaseConfig } from "./releaseConfig";
import { ANNUAL, EXPIRED, LIFETIME, TRIAL, TRIAL_DAYS, normalizePlan } from "./subscriptionPlans";
import { inspectLicenceToken } from "./token";

const SESSION_KEY = "aerolith-estimation.license-session";
const DEVICE_KEY = "aerolith-estimation.device";

export type LicenseStore = {
  load(): Promise<LicenseSession | null>;
  save(session: LicenseSession): Promise<void>;
  clear(): Promise<void>;
};

export function browserLicenseStore(): LicenseStore {
  return {
    async load() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? (JSON.parse(raw) as LicenseSession) : null;
      } catch {
        return null;
      }
    },
    async save(session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    },
    async clear() {
      localStorage.removeItem(SESSION_KEY);
    },
  };
}

export function deviceHash(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const next = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_KEY, next);
    return next;
  } catch {
    return "device-unavailable";
  }
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export class LicenseService {
  readonly api: AuthApiClient;
  session: LicenseSession;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly config: ReleaseConfig = releaseConfig,
    private readonly store: LicenseStore = browserLicenseStore(),
    fetchImpl?: FetchLike,
    private readonly hash: string = deviceHash(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.api = new AuthApiClient(config, fetchImpl);
    this.session = emptySession(config.warnHoursBeforeLapse);
    this.session.deviceHash = hash;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    if (this.session.isAuthenticated) {
      this.applyPlanClock();
      this.session = { ...this.session, statusMessage: describeLicense(this.session, this.now()) };
    }
    for (const listener of this.listeners) listener();
  }

  private touch(patch: Partial<LicenseSession>) {
    this.session = { ...this.session, ...patch, deviceHash: this.hash };
  }

  async tryRestore(): Promise<boolean> {
    const saved = await this.store.load();
    if (!saved?.accessToken) {
      this.session = emptySession(this.config.warnHoursBeforeLapse);
      this.session.deviceHash = this.hash;
      this.session.statusMessage = "Signed out. Sign in to continue.";
      this.emit();
      return false;
    }
    this.session = { ...emptySession(this.config.warnHoursBeforeLapse), ...saved, isAuthenticated: true, deviceHash: this.hash };
    this.applyPlanClock();
    await this.refresh();
    return Boolean(this.session.isAuthenticated && this.session.accessToken);
  }

  async login(email: string, password: string): Promise<{ ok: boolean; error: string | null }> {
    if (!email.trim() || !password) return { ok: false, error: "Enter email and password." };
    const response = await this.api.login(email.trim(), password);
    if (!response.success || !response.accessToken) {
      return { ok: false, error: response.error ?? "Sign in failed." };
    }
    this.session = {
      ...emptySession(this.config.warnHoursBeforeLapse),
      isAuthenticated: true,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      userId: response.userId,
      email: response.email ?? email.trim(),
      displayName: response.displayName,
      planCode: normalizePlan(response.planCode),
      planExpiresAtUtc: response.planExpiresAtUtc,
      trialStartedAtUtc: response.trialStartedAtUtc,
      licenseVerified: true,
      verifiedAtUtc: this.now().toISOString(),
      deviceHash: this.hash,
    };
    const activated = await this.api.activate({
      accessToken: response.accessToken,
      appId: this.config.appId,
      deviceHash: this.hash,
      appVersion: this.config.appVersion,
      dbChoice: "local",
    });
    const applied = await this.applyServer(activated, response.accessToken);
    if (!applied) {
      if (isFullLock(resolveAccess(this.session, this.now()))) {
        await this.store.save(this.session);
        this.emit();
        return { ok: true, error: null };
      }
      const message = this.session.statusMessage ?? activated.reasonText ?? activated.error ?? "Could not activate this device.";
      await this.store.clear();
      this.session = emptySession(this.config.warnHoursBeforeLapse);
      this.touch({ statusMessage: message, reasonCode: activated.reasonCode, reasonText: message });
      this.emit();
      return { ok: false, error: message };
    }
    await this.store.save(this.session);
    this.emit();
    return { ok: true, error: null };
  }

  async logout(): Promise<void> {
    const token = this.session.accessToken;
    await this.api.logout(token);
    await this.store.clear();
    this.session = emptySession(this.config.warnHoursBeforeLapse);
    this.session.deviceHash = this.hash;
    this.session.statusMessage = "Signed out. Sign in to continue.";
    this.emit();
  }

  async refresh(): Promise<void> {
    if (!this.session.accessToken) {
      this.session = emptySession(this.config.warnHoursBeforeLapse);
      this.session.deviceHash = this.hash;
      this.emit();
      return;
    }
    if (!clockTrusted(this.session.lastServerTimeUtc, this.now())) {
      const online = await this.refreshOnline();
      if (!online) {
        this.lock("locked_offline", "clock_skew", "System clock is behind the last server time. Correct the clock and connect to restore access.");
        await this.store.save(this.session);
        this.emit();
      }
      return;
    }
    await this.refreshOnline();
  }

  private async refreshOnline(): Promise<boolean> {
    await this.renewSupabase();
    const verify = await this.api.refreshLicense({
      accessToken: this.session.accessToken ?? "",
      appId: this.config.appId,
      deviceHash: this.hash,
      appVersion: this.config.appVersion,
      dbChoice: "local",
    });
    if (verify.isTransientNetworkError) {
      this.applyOfflineFailure();
      await this.store.save(this.session);
      this.emit();
      return false;
    }
    const applied = await this.applyServer(verify, this.session.accessToken);
    const reported = this.session.reportedState;
    const hard = reported === "signed_out_elsewhere" || reported === "revoked";
    if (!applied && hard) {
      await this.store.clear();
      this.touch({ accessToken: null, refreshToken: null, isAuthenticated: false });
    } else {
      await this.store.save(this.session);
    }
    this.emit();
    return applied;
  }

  private async renewSupabase(): Promise<void> {
    if (!this.session.refreshToken) return;
    const login = await this.api.refreshSession(this.session.refreshToken);
    if (!login.success || !login.accessToken) return;
    this.touch({
      accessToken: login.accessToken,
      refreshToken: login.refreshToken ?? this.session.refreshToken,
      userId: login.userId ?? this.session.userId,
      email: login.email ?? this.session.email,
      displayName: login.displayName ?? this.session.displayName,
    });
    await this.store.save(this.session);
  }

  private async applyServer(verify: LicenseVerifyResponse, fallbackToken: string | null): Promise<boolean> {
    const reported = fromReasonCode(verify.reasonCode);
    if (reported === "signed_out_elsewhere" || reported === "revoked") {
      this.touch({
        reportedState: reported,
        reasonCode: verify.reasonCode,
        reasonText: verify.reasonText ?? verify.error,
        licenseVerified: false,
        statusMessage: describeLicense(
          { ...this.session, reportedState: reported, reasonText: verify.reasonText ?? verify.error, reasonCode: verify.reasonCode },
          this.now(),
        ),
      });
      return false;
    }
    if (!verify.success || !verify.authenticated) {
      if (reported) {
        this.touch({
          reportedState: reported,
          reasonCode: verify.reasonCode,
          reasonText: verify.reasonText ?? verify.error,
          licenseVerified: false,
        });
        this.touch({ statusMessage: describeLicense(this.session, this.now()) });
        return false;
      }
      this.touch({
        isAuthenticated: false,
        licenseVerified: false,
        reportedState: null,
        statusMessage: verify.reasonText ?? verify.error ?? "Session expired. Sign in again.",
      });
      return false;
    }
    this.touch({
      isAuthenticated: true,
      reportedState: null,
      reasonCode: verify.reasonCode,
      reasonText: null,
      email: verify.email ?? this.session.email,
      displayName: verify.displayName ?? this.session.displayName,
      userId: verify.userId ?? this.session.userId,
      verifiedAtUtc: this.now().toISOString(),
      lastServerTimeUtc: verify.serverTimeUtc ?? this.now().toISOString(),
      sessionId: verify.sessionId ?? this.session.sessionId,
    });
    if (!(await this.acceptTokens(verify, fallbackToken))) return false;
    if (verify.licenseValid) {
      this.touch({
        licenseVerified: true,
        planCode: normalizePlan(verify.planCode),
        planExpiresAtUtc: verify.planExpiresAtUtc ?? this.session.planExpiresAtUtc,
        entitlementEndsAtUtc: verify.planExpiresAtUtc ?? this.session.entitlementEndsAtUtc,
        trialStartedAtUtc: verify.trialStartedAtUtc ?? this.session.trialStartedAtUtc,
        tokenExpiresAtUtc: verify.tokenExpiresAtUtc ?? this.session.tokenExpiresAtUtc,
      });
      this.applyPlanClock();
      if (resolveAccess(this.session, this.now()) === "locked_term") {
        this.touch({
          reportedState: "locked_term",
          reasonCode: this.session.reasonCode ?? "term_ended",
          reasonText: verify.reasonText ?? verify.error,
          licenseVerified: false,
        });
        this.touch({ statusMessage: describeLicense(this.session, this.now()) });
        return false;
      }
      this.touch({ statusMessage: describeLicense(this.session, this.now()) });
      return this.session.isAuthenticated;
    }
    if (reported) {
      this.touch({
        reportedState: reported,
        licenseVerified: false,
        reasonText: verify.reasonText ?? verify.error,
      });
      this.touch({ statusMessage: describeLicense(this.session, this.now()) });
      return false;
    }
    this.touch({
      licenseVerified: false,
      planCode: EXPIRED,
      reportedState: "locked_term",
      reasonCode: verify.reasonCode ?? "expired",
      reasonText: verify.reasonText ?? verify.error,
    });
    this.touch({ statusMessage: describeLicense(this.session, this.now()) });
    return false;
  }

  private async acceptTokens(verify: LicenseVerifyResponse, fallbackToken: string | null): Promise<boolean> {
    if (fallbackToken) this.touch({ accessToken: fallbackToken });
    const licence = verify.licenceToken;
    if (!licence || licence === this.session.accessToken) return true;
    return this.acceptLicenceToken(licence);
  }

  private async acceptLicenceToken(token: string): Promise<boolean> {
    const inspection = await inspectLicenceToken(token, this.config.licensePublicKeys, this.config.appId, this.now());
    if (!inspection.isJwt) return true;
    this.touch({ tokenKid: inspection.kid });
    if (!inspection.signatureValid || inspection.error) {
      const state: LicenseAccessState = inspection.reasonCode === "offline_lapse" ? "locked_offline" : "revoked";
      this.touch({
        licenseVerified: false,
        reportedState: state,
        reasonCode: inspection.reasonCode ?? "unknown_kid",
        reasonText: inspection.error ?? "Licence token was rejected.",
      });
      this.touch({ statusMessage: describeLicense(this.session, this.now()) });
      return false;
    }
    this.touch({
      tokenKid: inspection.kid ?? this.session.tokenKid,
      sessionId: inspection.sessionId ?? this.session.sessionId,
      tokenExpiresAtUtc: inspection.expiresAtUtc ?? this.session.tokenExpiresAtUtc,
      lastServerTimeUtc: inspection.issuedAtUtc ?? this.session.lastServerTimeUtc,
      entitlementEndsAtUtc: inspection.entitlementEndsAtUtc ?? this.session.entitlementEndsAtUtc,
      planExpiresAtUtc: this.session.planExpiresAtUtc ?? inspection.entitlementEndsAtUtc,
      planCode: inspection.plan ? normalizePlan(inspection.plan) : this.session.planCode,
      userId: inspection.subject ?? this.session.userId,
    });
    if (inspection.deviceHash && inspection.deviceHash.toLowerCase() !== this.hash.toLowerCase()) {
      this.touch({
        reportedState: "signed_out_elsewhere",
        reasonCode: "key_active_on_another_device",
        reasonText: "This licence key is active on another device.",
        licenseVerified: false,
      });
      this.touch({ statusMessage: describeLicense(this.session, this.now()) });
      return false;
    }
    if (inspection.status === "revoked" || inspection.status === "suspended") {
      this.touch({
        reportedState: "revoked",
        reasonCode: inspection.status,
        reasonText: "Contact support.",
        licenseVerified: false,
      });
      this.touch({ statusMessage: describeLicense(this.session, this.now()) });
      return false;
    }
    return true;
  }

  private applyOfflineFailure() {
    this.applyPlanClock();
    const now = this.now();
    if (!clockTrusted(this.session.lastServerTimeUtc, now)) {
      this.lock("locked_offline", "clock_skew", "System clock is behind the last server time. Correct the clock and connect to restore access.");
      return;
    }
    const tokenEnd = this.session.tokenExpiresAtUtc ?? (this.session.verifiedAtUtc
      ? new Date(new Date(this.session.verifiedAtUtc).getTime() + 24 * 3600000).toISOString()
      : null);
    if (tokenEnd && new Date(tokenEnd).getTime() > now.getTime() && !isFullLock(resolveAccess(this.session, now)) && this.session.licenseVerified) {
      this.touch({
        reportedState: null,
        tokenExpiresAtUtc: this.session.tokenExpiresAtUtc ?? tokenEnd,
        statusMessage: describeLicense(this.session, now),
      });
      return;
    }
    this.lock("locked_offline", "offline_lapse", "Connect to the internet to restore access.");
  }

  private lock(state: LicenseAccessState, reasonCode: string, reasonText: string) {
    this.touch({ reportedState: state, reasonCode, reasonText, licenseVerified: false });
    this.touch({ statusMessage: describeLicense(this.session, this.now()) });
  }

  private applyPlanClock() {
    if (!this.session.isAuthenticated) return;
    const plan = normalizePlan(this.session.planCode);
    const now = this.now();
    if (plan === LIFETIME) {
      this.touch({ planCode: LIFETIME });
      return;
    }
    if (plan === ANNUAL) {
      const ended = this.session.planExpiresAtUtc && new Date(this.session.planExpiresAtUtc).getTime() <= now.getTime();
      this.touch({
        planCode: ended ? EXPIRED : ANNUAL,
        reportedState: ended ? "locked_term" : this.session.reportedState,
      });
      return;
    }
    if (plan === EXPIRED) {
      this.touch({ planCode: EXPIRED, reportedState: this.session.reportedState ?? "locked_term" });
      return;
    }
    const started = this.session.trialStartedAtUtc ?? now.toISOString();
    const expires = this.session.planExpiresAtUtc ?? addDays(started, TRIAL_DAYS);
    const ended = new Date(expires).getTime() <= now.getTime();
    this.touch({
      planCode: ended ? EXPIRED : TRIAL,
      trialStartedAtUtc: started,
      planExpiresAtUtc: expires,
      reportedState: ended ? "locked_term" : this.session.reportedState,
    });
  }
}

export function openHttps(url: string): void {
  if (!url.startsWith("https://")) return;
  if (isTauri()) {
    void invoke("open_https", { url }).catch(() => {
      /* The desktop shell rejected the host. */
    });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
