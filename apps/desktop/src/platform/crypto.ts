import { DECISIONS } from "@aerolith/shared";

export async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 120000, hash: "SHA-256" },
    key,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPin(pin: string, salt: string, pinHash: string): Promise<boolean> {
  const got = await hashPin(pin, salt);
  if (got.length !== pinHash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i += 1) diff |= got.charCodeAt(i) ^ pinHash.charCodeAt(i);
  return diff === 0;
}

export function licenseStatus(trialStartedAt: string, expiresAt: string | null, now = Date.now()) {
  const trialEnd = new Date(trialStartedAt).getTime() + DECISIONS.licenseGraceDays * 86400000;
  const paidEnd = expiresAt ? new Date(expiresAt).getTime() : 0;
  const end = Math.max(trialEnd, paidEnd);
  const ms = end - now;
  const daysLeft = Math.ceil(ms / 86400000);
  const readOnly = ms < 0;
  return { end, daysLeft, readOnly, trialEnd, paid: paidEnd > now };
}

export type { PlatformState, TenantRecord, TenantUser, Role, AuditEvent, ConflictItem } from "./types";
export {
  MODULES,
  ALL_ACTIONS,
  fullAllow,
  viewAllow,
  type ModuleId,
  type ActionId,
  type PromotionPolicy,
} from "./types";
