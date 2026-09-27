import { ANNUAL, EXPIRED, LIFETIME, TRIAL, normalizePlan } from "./subscriptionPlans";

export type LicenseAccessState =
  | "signed_out"
  | "trial"
  | "active"
  | "refresh_due"
  | "locked_offline"
  | "locked_term"
  | "signed_out_elsewhere"
  | "revoked";

export type LicenseSession = {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  planCode: string;
  planExpiresAtUtc: string | null;
  trialStartedAtUtc: string | null;
  verifiedAtUtc: string | null;
  licenseVerified: boolean;
  statusMessage: string | null;
  reportedState: LicenseAccessState | null;
  tokenExpiresAtUtc: string | null;
  entitlementEndsAtUtc: string | null;
  lastServerTimeUtc: string | null;
  tokenKid: string | null;
  sessionId: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  deviceHash: string | null;
  warnHoursBeforeLapse: number;
};

const FULL_LOCK = new Set<LicenseAccessState>([
  "locked_offline",
  "locked_term",
  "signed_out_elsewhere",
  "revoked",
]);

export function emptySession(warnHours = 6): LicenseSession {
  return {
    isAuthenticated: false,
    accessToken: null,
    refreshToken: null,
    userId: null,
    email: null,
    displayName: null,
    planCode: TRIAL,
    planExpiresAtUtc: null,
    trialStartedAtUtc: null,
    verifiedAtUtc: null,
    licenseVerified: false,
    statusMessage: "Signed out. Sign in to continue.",
    reportedState: null,
    tokenExpiresAtUtc: null,
    entitlementEndsAtUtc: null,
    lastServerTimeUtc: null,
    tokenKid: null,
    sessionId: null,
    reasonCode: null,
    reasonText: null,
    deviceHash: null,
    warnHoursBeforeLapse: warnHours,
  };
}

export function isFullLock(state: LicenseAccessState): boolean {
  return FULL_LOCK.has(state);
}

export function allowsData(state: LicenseAccessState): boolean {
  return state === "trial" || state === "active" || state === "refresh_due";
}

export function clockTrusted(lastServerTimeUtc: string | null, now: Date): boolean {
  if (!lastServerTimeUtc) return true;
  const last = new Date(lastServerTimeUtc).getTime();
  return now.getTime() >= last - 5 * 60 * 1000;
}

function daysUntil(ends: string | null, now: Date): number | null {
  if (!ends) return null;
  const ms = new Date(ends).getTime() - now.getTime();
  if (ms <= 0) return null;
  return Math.max(1, Math.ceil(ms / 86400000));
}

export function trialDaysRemaining(session: LicenseSession, now = new Date()): number | null {
  if (normalizePlan(session.planCode) !== TRIAL || !session.planExpiresAtUtc) return null;
  if (new Date(session.planExpiresAtUtc).getTime() <= now.getTime()) return null;
  const days = Math.ceil((new Date(session.planExpiresAtUtc).getTime() - now.getTime()) / 86400000);
  return Math.max(0, days);
}

function termEnded(plan: string, expires: string | null, now: Date): boolean {
  if (plan === LIFETIME) return false;
  if (plan === TRIAL || plan === ANNUAL) {
    if (!expires) return true;
    return new Date(expires).getTime() <= now.getTime();
  }
  return false;
}

export function resolveAccess(session: LicenseSession, now = new Date()): LicenseAccessState {
  if (session.reportedState && isFullLock(session.reportedState)) return session.reportedState;
  if (!session.isAuthenticated) return "signed_out";
  if (!clockTrusted(session.lastServerTimeUtc, now)) return "locked_offline";
  const plan = normalizePlan(session.planCode);
  if (plan === EXPIRED || termEnded(plan, session.planExpiresAtUtc, now)) return "locked_term";
  if (session.tokenExpiresAtUtc && new Date(session.tokenExpiresAtUtc).getTime() <= now.getTime()) {
    return "locked_offline";
  }
  if (session.tokenExpiresAtUtc) {
    const hours = (new Date(session.tokenExpiresAtUtc).getTime() - now.getTime()) / 3600000;
    if (hours <= Math.max(1, session.warnHoursBeforeLapse)) return "refresh_due";
  }
  if (plan === TRIAL) return "trial";
  return "active";
}

export function accessLabel(state: LicenseAccessState): string {
  switch (state) {
    case "signed_out":
      return "Signed out";
    case "trial":
      return "Trial";
    case "active":
      return "Active";
    case "refresh_due":
      return "Refresh due";
    case "locked_offline":
      return "Locked · offline lapse";
    case "locked_term":
      return "Locked · term ended";
    case "signed_out_elsewhere":
      return "Signed out elsewhere";
    case "revoked":
      return "Revoked or suspended";
    default:
      return "Signed out";
  }
}

function describeTrial(session: LicenseSession, now: Date): string {
  const days = trialDaysRemaining(session, now) ?? 0;
  return `Trial · ${days} day${days === 1 ? "" : "s"} left`;
}

function describeActive(session: LicenseSession, now: Date): string {
  const ends = session.entitlementEndsAtUtc ?? session.planExpiresAtUtc;
  const days = daysUntil(ends, now);
  if (days != null && days > 30 && ends) {
    const when = new Date(ends).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `Active · paid term running · ends ${when}`;
  }
  if (days != null) return `Active · licence ends in ${days} day${days === 1 ? "" : "s"}`;
  if (normalizePlan(session.planCode) === LIFETIME) return "Active · single seat · this device";
  return "Active · paid term running";
}

export function describeLicense(session: LicenseSession, now = new Date()): string {
  const state = resolveAccess(session, now);
  if (isFullLock(state) && session.reasonText) return session.reasonText;
  switch (state) {
    case "signed_out":
      return "Signed out. Sign in to continue.";
    case "trial":
      return describeTrial(session, now);
    case "active":
      return describeActive(session, now);
    case "refresh_due": {
      const hours = session.tokenExpiresAtUtc
        ? Math.max(1, Math.ceil((new Date(session.tokenExpiresAtUtc).getTime() - now.getTime()) / 3600000))
        : session.warnHoursBeforeLapse;
      return `Connect within ${hours} hour${hours === 1 ? "" : "s"}`;
    }
    case "locked_offline":
      return session.reasonCode === "clock_skew"
        ? "System clock is behind the last server time. Correct the clock and connect to restore access."
        : "Connect to the internet to restore access.";
    case "locked_term":
      return "Your trial or licence term has ended. Buy or renew to continue. Projects open read-only until then.";
    case "signed_out_elsewhere":
      return "Signed out because this account was used elsewhere.";
    case "revoked":
      return "Contact support.";
    default:
      return "Signed out. Sign in to continue.";
  }
}

export function licenseBanner(session: LicenseSession, now = new Date()): string {
  const state = resolveAccess(session, now);
  if (state === "trial") return describeTrial(session, now);
  if (state === "refresh_due") return describeLicense(session, now);
  if (state === "active") {
    const days = daysUntil(session.entitlementEndsAtUtc ?? session.planExpiresAtUtc, now);
    if (days != null && days <= 30) return `Active · licence ends in ${days} day${days === 1 ? "" : "s"}`;
  }
  return "";
}

export function fromReasonCode(reasonCode: string | null | undefined): LicenseAccessState | null {
  switch ((reasonCode ?? "").trim().toLowerCase()) {
    case "signed_out_elsewhere":
    case "session_superseded":
    case "key_active_on_another_device":
    case "device_mismatch":
      return "signed_out_elsewhere";
    case "revoked":
    case "suspended":
      return "revoked";
    case "expired":
    case "term_ended":
    case "trial_ended":
      return "locked_term";
    case "clock_skew":
    case "offline_lapse":
      return "locked_offline";
    default:
      return null;
  }
}
