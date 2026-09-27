export type LicenseVerifyResponse = {
  success: boolean;
  error: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  authenticated: boolean;
  licenseValid: boolean;
  planCode: string;
  planExpiresAtUtc: string | null;
  trialStartedAtUtc: string | null;
  email: string | null;
  displayName: string | null;
  userId: string | null;
  licenceToken: string | null;
  serverTimeUtc: string | null;
  tokenExpiresAtUtc: string | null;
  sessionId: string | null;
  kid: string | null;
  isTransientNetworkError: boolean;
};

export type LoginResponse = {
  success: boolean;
  error: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  planCode: string | null;
  planExpiresAtUtc: string | null;
  trialStartedAtUtc: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pick(root: Record<string, unknown>, names: string[]): unknown {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(root)) {
    if (wanted.has(key.toLowerCase())) return value;
  }
  return undefined;
}

function str(root: Record<string, unknown>, names: string[]): string | null {
  const value = pick(root, names);
  return typeof value === "string" && value.trim() ? value : null;
}

function bool(root: Record<string, unknown>, names: string[]): boolean | null {
  const value = pick(root, names);
  return typeof value === "boolean" ? value : null;
}

function time(root: Record<string, unknown>, names: string[]): string | null {
  const value = pick(root, names);
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    if (/^\d+$/.test(value)) return new Date(Number(value) * 1000).toISOString();
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function unwrap(root: Record<string, unknown>): Record<string, unknown> {
  if (bool(root, ["success", "authenticated", "licenseValid", "license_valid"]) != null) return root;
  if (str(root, ["access_token", "accessToken", "licenceToken", "license_token"]) ) return root;
  for (const key of ["data", "license", "licence", "result"]) {
    const nested = asRecord(root[key]);
    if (nested) return nested;
  }
  return root;
}

export function readLicense(json: string | null | undefined): LicenseVerifyResponse {
  if (!json || !json.trim()) {
    return fail("Empty response from license server.");
  }
  try {
    const parsed = unwrap(asRecord(JSON.parse(json)) ?? {});
    const reasonCode = str(parsed, ["reasonCode", "reason_code", "code"]);
    const reasonText = str(parsed, ["reasonText", "reason_text", "message"]);
    const error = str(parsed, ["error"]) ?? reasonText;
    return {
      success: bool(parsed, ["success"]) === true,
      error,
      reasonCode,
      reasonText: reasonText ?? error,
      authenticated: bool(parsed, ["authenticated"]) === true,
      licenseValid: bool(parsed, ["licenseValid", "license_valid"]) === true,
      planCode: str(parsed, ["planCode", "plan_code", "plan"]) ?? "trial",
      planExpiresAtUtc: time(parsed, ["planExpiresAtUtc", "planExpiresAt", "plan_expires_at", "ent_ends", "entEnds"]),
      trialStartedAtUtc: time(parsed, ["trialStartedAtUtc", "trialStartedAt", "trial_started_at"]),
      email: str(parsed, ["email"]),
      displayName: str(parsed, ["displayName", "display_name", "full_name"]),
      userId: str(parsed, ["userId", "user_id", "sub"]),
      licenceToken: str(parsed, ["licenceToken", "licence_token", "licenseToken", "license_token", "token"]),
      serverTimeUtc: time(parsed, ["serverTimeUtc", "server_time", "serverTime"]),
      tokenExpiresAtUtc: time(parsed, ["tokenExpiresAtUtc", "token_expires_at", "exp"]),
      sessionId: str(parsed, ["sessionId", "session_id", "sess"]),
      kid: str(parsed, ["kid"]),
      isTransientNetworkError: false,
    };
  } catch (err) {
    return fail(`Could not read license server response. ${err instanceof Error ? err.message : "invalid json"}`);
  }
}

export function readLogin(json: string | null | undefined): LoginResponse {
  const license = readLicense(json);
  let accessToken = license.licenceToken;
  let refreshToken: string | null = null;
  if (json && json.trim()) {
    try {
      const root = unwrap(asRecord(JSON.parse(json)) ?? {});
      accessToken = str(root, ["accessToken", "access_token"]) ?? license.licenceToken;
      refreshToken = str(root, ["refreshToken", "refresh_token"]);
    } catch {
      /* readLicense already captured the parse error */
    }
  }
  return {
    success: license.success,
    error: license.reasonText ?? license.error,
    accessToken,
    refreshToken,
    userId: license.userId,
    email: license.email,
    displayName: license.displayName,
    planCode: license.planCode,
    planExpiresAtUtc: license.planExpiresAtUtc,
    trialStartedAtUtc: license.trialStartedAtUtc,
  };
}

function displayFromUser(user: Record<string, unknown>): string | null {
  const direct = str(user, ["display_name", "displayName", "full_name", "name"]);
  if (direct) return direct;
  const meta = asRecord(user.user_metadata);
  return meta ? str(meta, ["full_name", "name", "display_name", "displayName"]) : null;
}

export function readSupabaseAuth(json: string | null | undefined, httpSuccess: boolean): LoginResponse {
  if (!json || !json.trim()) {
    return loginFail(httpSuccess ? "Empty response from Supabase Auth." : "Sign in failed.");
  }
  try {
    const root = asRecord(JSON.parse(json)) ?? {};
    const accessToken = str(root, ["access_token", "accessToken"]);
    const refreshToken = str(root, ["refresh_token", "refreshToken"]);
    const user = asRecord(root.user);
    const userId = (user && str(user, ["id", "user_id", "sub"])) || str(root, ["user_id", "userId", "sub"]);
    const email = (user && str(user, ["email"])) || str(root, ["email"]);
    const displayName = (user && displayFromUser(user)) || str(root, ["display_name", "displayName", "full_name"]);
    const error = str(root, ["msg", "error_description", "message", "error"]) ?? str(root, ["error_code", "errorCode"]);
    const success = httpSuccess && Boolean(accessToken);
    return {
      success,
      error: success ? null : error,
      accessToken,
      refreshToken,
      userId,
      email,
      displayName,
      planCode: null,
      planExpiresAtUtc: null,
      trialStartedAtUtc: null,
    };
  } catch (err) {
    return loginFail(`Could not read Supabase Auth response. ${err instanceof Error ? err.message : "invalid json"}`);
  }
}

function fail(error: string): LicenseVerifyResponse {
  return {
    success: false,
    error,
    reasonCode: null,
    reasonText: error,
    authenticated: false,
    licenseValid: false,
    planCode: "trial",
    planExpiresAtUtc: null,
    trialStartedAtUtc: null,
    email: null,
    displayName: null,
    userId: null,
    licenceToken: null,
    serverTimeUtc: null,
    tokenExpiresAtUtc: null,
    sessionId: null,
    kid: null,
    isTransientNetworkError: false,
  };
}

function loginFail(error: string): LoginResponse {
  return {
    success: false,
    error,
    accessToken: null,
    refreshToken: null,
    userId: null,
    email: null,
    displayName: null,
    planCode: null,
    planExpiresAtUtc: null,
    trialStartedAtUtc: null,
  };
}
