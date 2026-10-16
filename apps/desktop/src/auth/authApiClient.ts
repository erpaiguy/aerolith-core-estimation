import type { RecoveryProof } from "./passwordReset";
import type { ReleaseConfig } from "./releaseConfig";
import { readLicense, readSupabaseAuth, type LicenseVerifyResponse, type LoginResponse } from "./payload";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ActivateBody = {
  accessToken: string;
  appId: string;
  deviceHash: string;
  appVersion: string;
  dbChoice: string;
};

function networkLicense(error: string): LicenseVerifyResponse {
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
    isTransientNetworkError: true,
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

export class AuthApiClient {
  constructor(
    private readonly config: ReleaseConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  login(email: string, password: string): Promise<LoginResponse> {
    return this.postToken("password", { email, password });
  }

  refreshSession(refreshToken: string): Promise<LoginResponse> {
    if (!refreshToken.trim()) return Promise.resolve(loginFail("Supabase session refresh is not configured."));
    return this.postToken("refresh_token", { refresh_token: refreshToken });
  }

  activate(request: ActivateBody): Promise<LicenseVerifyResponse> {
    return this.postLicence("license-activate", request);
  }

  refreshLicense(request: ActivateBody): Promise<LicenseVerifyResponse> {
    return this.postLicence("license-refresh", request);
  }

  async requestPasswordReset(email: string): Promise<{ ok: boolean; error: string | null }> {
    try {
      const response = await this.fetchImpl(`${this.config.supabaseUrl}/auth/v1/recover`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: this.config.supabaseAnonKey,
        },
        body: JSON.stringify({ email }),
      });
      const message = await errorMessage(response);
      if (response.status === 429) {
        return { ok: false, error: "Too many reset emails. Wait a few minutes and try again." };
      }
      if (response.ok || looksLikeUnknownUser(message)) return { ok: true, error: null };
      if (response.status >= 500) return { ok: false, error: "Could not send the reset email. Try again in a moment." };
      return { ok: false, error: message || "Could not send the reset email." };
    } catch (err) {
      return { ok: false, error: `Could not reach the account service. ${err instanceof Error ? err.message : "network"}` };
    }
  }

  async resetPassword(email: string, proof: RecoveryProof, password: string): Promise<{ ok: boolean; error: string | null }> {
    try {
      const accessToken = proof.kind === "session" ? proof.accessToken : await this.recoveryAccessToken(email, proof);
      if (!accessToken) return { ok: false, error: "That reset link has expired or was already used. Send a new email." };
      const response = await this.fetchImpl(`${this.config.supabaseUrl}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          apikey: this.config.supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ password }),
      });
      if (response.ok) return { ok: true, error: null };
      const message = await errorMessage(response);
      return { ok: false, error: message || "Could not update the password." };
    } catch (err) {
      return { ok: false, error: `Could not reach the account service. ${err instanceof Error ? err.message : "network"}` };
    }
  }

  private async recoveryAccessToken(email: string, proof: Exclude<RecoveryProof, { kind: "session" }>): Promise<string | null> {
    const body =
      proof.kind === "otp"
        ? { type: "recovery", token: proof.token, email }
        : { type: "recovery", token_hash: proof.tokenHash };
    const response = await this.fetchImpl(`${this.config.supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: this.config.supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });
    const login = readSupabaseAuth(await response.text(), response.ok);
    return login.success ? login.accessToken : null;
  }

  async logout(accessToken: string | null): Promise<void> {
    if (!accessToken) return;
    try {
      await this.fetchImpl(`${this.config.supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: this.config.supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      /* sign-out still clears the local session */
    }
  }

  private async postToken(grantType: string, body: Record<string, string>): Promise<LoginResponse> {
    try {
      const response = await this.fetchImpl(
        `${this.config.supabaseUrl}/auth/v1/token?grant_type=${grantType}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: this.config.supabaseAnonKey,
          },
          body: JSON.stringify(body),
        },
      );
      const login = readSupabaseAuth(await response.text(), response.ok);
      if (!response.ok && !login.error) {
        return { ...login, success: false, error: `Login failed (${response.status}).` };
      }
      if (!login.success && !login.error) return { ...login, error: "Sign in failed." };
      return login;
    } catch (err) {
      return loginFail(`Could not reach license server: ${err instanceof Error ? err.message : "network"}`);
    }
  }

  private async postLicence(path: string, request: ActivateBody): Promise<LicenseVerifyResponse> {
    try {
      const response = await this.fetchImpl(`${this.config.licenseApiUrl}/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: this.config.supabaseAnonKey,
          Authorization: `Bearer ${request.accessToken}`,
        },
        body: JSON.stringify({
          app_id: request.appId,
          device_hash: request.deviceHash,
          app_version: request.appVersion,
          db_choice: request.dbChoice,
        }),
      });
      if (response.status === 404) return this.verify(request.accessToken);
      return normalizeStatus(response.status, readLicense(await response.text()));
    } catch (err) {
      return networkLicense(`Could not verify license: ${err instanceof Error ? err.message : "network"}`);
    }
  }

  private async verify(accessToken: string): Promise<LicenseVerifyResponse> {
    try {
      const response = await this.fetchImpl(`${this.config.licenseApiUrl}/api/license/verify`, {
        method: "POST",
        headers: {
          apikey: this.config.supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return normalizeStatus(response.status, readLicense(await response.text()));
    } catch (err) {
      return networkLicense(`Could not verify license: ${err instanceof Error ? err.message : "network"}`);
    }
  }
}

async function errorMessage(response: Response): Promise<string | null> {
  try {
    const login = readSupabaseAuth(await response.text(), false);
    return login.error;
  } catch {
    return null;
  }
}

function looksLikeUnknownUser(message: string | null): boolean {
  const text = (message ?? "").toLowerCase();
  return text.includes("not found") || text.includes("user does not exist") || text.includes("no user");
}

function normalizeStatus(status: number, payload: LicenseVerifyResponse): LicenseVerifyResponse {
  if (status === 401 || status === 403) {
    return {
      ...payload,
      success: false,
      authenticated: false,
      licenseValid: false,
      isTransientNetworkError: false,
      error: payload.error ?? payload.reasonText ?? "Session expired or revoked.",
      reasonCode: payload.reasonCode ?? (status === 403 ? "revoked" : null),
    };
  }
  if (status >= 500) {
    return { ...payload, isTransientNetworkError: true, error: payload.error ?? `License server error (${status}).` };
  }
  if (status < 200 || status >= 300) {
    if (!payload.error) {
      return { ...payload, success: false, error: payload.reasonText ?? `License request failed (${status}).` };
    }
  }
  return payload;
}
