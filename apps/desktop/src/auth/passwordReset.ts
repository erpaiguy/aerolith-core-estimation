export type RecoveryProof =
  | { kind: "otp"; token: string }
  | { kind: "hash"; tokenHash: string }
  | { kind: "session"; accessToken: string };

const MIN_PASSWORD = 8;

export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}

/** Read a recovery code, a Supabase verify link, or a redirected session link. */
export function readRecoveryProof(raw: string): RecoveryProof | null {
  const text = raw.trim();
  if (!text || text.length > 4000) return null;
  if (/^https?:\/\//i.test(text)) return proofFromUrl(text);
  if (/^\d{6,10}$/.test(text)) return { kind: "otp", token: text };
  if (/^[A-Za-z0-9_-]{20,}$/.test(text)) return { kind: "hash", tokenHash: text };
  return null;
}

function proofFromUrl(text: string): RecoveryProof | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const access = hash.get("access_token");
  const hashType = (hash.get("type") ?? "").toLowerCase();
  if (access && (hashType === "" || hashType === "recovery")) {
    return { kind: "session", accessToken: access };
  }
  const token = url.searchParams.get("token") || url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "").toLowerCase();
  if (token && (type === "" || type === "recovery")) {
    return { kind: "hash", tokenHash: token };
  }
  return null;
}
