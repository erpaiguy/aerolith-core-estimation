import type { LicensePublicKey } from "./releaseConfig";

export type TokenInspection = {
  isJwt: boolean;
  signatureValid: boolean;
  kid: string | null;
  app: string | null;
  sessionId: string | null;
  plan: string | null;
  status: string | null;
  subject: string | null;
  deviceHash: string | null;
  expiresAtUtc: string | null;
  issuedAtUtc: string | null;
  entitlementEndsAtUtc: string | null;
  error: string | null;
  reasonCode: string | null;
};

function b64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  return b64url(body.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
}

function readString(obj: Record<string, unknown>, name: string): string | null {
  const value = obj[name];
  return typeof value === "string" && value ? value : null;
}

function readUnix(obj: Record<string, unknown>, name: string): string | null {
  const value = obj[name];
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  if (typeof value === "string" && /^\d+$/.test(value)) return new Date(Number(value) * 1000).toISOString();
  return null;
}

export function looksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export async function inspectLicenceToken(
  token: string | null | undefined,
  keys: LicensePublicKey[],
  expectedAppId: string,
  now = new Date(),
): Promise<TokenInspection> {
  if (!token || !looksLikeJwt(token)) {
    return blank(false);
  }
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(headerPart))) as Record<string, unknown>;
    payload = JSON.parse(new TextDecoder().decode(b64url(payloadPart))) as Record<string, unknown>;
  } catch (err) {
    return {
      ...blank(true),
      error: `Licence token could not be read. ${err instanceof Error ? err.message : "invalid"}`,
      reasonCode: "unknown_kid",
    };
  }
  const inspection: TokenInspection = {
    isJwt: true,
    signatureValid: false,
    kid: readString(header, "kid"),
    app: readString(payload, "app"),
    sessionId: readString(payload, "sess"),
    plan: readString(payload, "plan"),
    status: readString(payload, "status"),
    subject: readString(payload, "sub"),
    deviceHash: readString(payload, "dev"),
    expiresAtUtc: readUnix(payload, "exp"),
    issuedAtUtc: readUnix(payload, "iat"),
    entitlementEndsAtUtc: readUnix(payload, "ent_ends"),
    error: null,
    reasonCode: null,
  };
  if (readString(header, "alg") !== "ES256") {
    return { ...inspection, error: "Licence token must use ES256.", reasonCode: "unknown_kid" };
  }
  if (!inspection.kid) {
    return { ...inspection, error: "Licence token is missing a key id (kid).", reasonCode: "unknown_kid" };
  }
  const key = keys.find((item) => item.kid === inspection.kid);
  if (!key?.key) {
    return { ...inspection, error: `No licence public key is configured for kid '${inspection.kid}'.`, reasonCode: "unknown_kid" };
  }
  let valid = false;
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "spki",
      pemToDer(key.key).buffer as ArrayBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      b64url(signaturePart).buffer as ArrayBuffer,
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
  } catch (err) {
    return {
      ...inspection,
      error: `Licence signature check failed. ${err instanceof Error ? err.message : "rejected"}`,
      reasonCode: "unknown_kid",
    };
  }
  if (!valid) {
    return { ...inspection, error: `Licence signature does not match kid '${inspection.kid}'.`, reasonCode: "unknown_kid" };
  }
  if (inspection.app && inspection.app !== expectedAppId) {
    return {
      ...inspection,
      signatureValid: true,
      error: `Licence token is for app '${inspection.app}', not '${expectedAppId}'.`,
      reasonCode: "unknown_kid",
    };
  }
  if (inspection.expiresAtUtc && new Date(inspection.expiresAtUtc).getTime() <= now.getTime()) {
    return { ...inspection, signatureValid: true, error: "Licence token has expired.", reasonCode: "offline_lapse" };
  }
  return { ...inspection, signatureValid: true };
}

function blank(isJwt: boolean): TokenInspection {
  return {
    isJwt,
    signatureValid: false,
    kid: null,
    app: null,
    sessionId: null,
    plan: null,
    status: null,
    subject: null,
    deviceHash: null,
    expiresAtUtc: null,
    issuedAtUtc: null,
    entitlementEndsAtUtc: null,
    error: null,
    reasonCode: null,
  };
}
