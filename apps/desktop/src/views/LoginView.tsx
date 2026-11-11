import { useEffect, useRef, useState, type FormEvent } from "react";
import { APP_VERSION } from "../auth/releaseConfig";
import type { LegalId } from "../legal";
import "../v3/theme.css";
import { LegalDialog, LegalLinks } from "./LegalDocs";

export function LoginView({
  busy,
  error,
  onSubmit,
  onSignup,
  onPricing,
  onRequestReset,
  onResetPassword,
  initialMode = "sign-in",
}: {
  busy: boolean;
  error: string;
  onSubmit: (email: string, password: string) => void;
  onSignup: () => void;
  onPricing: () => void;
  onRequestReset: (email: string) => Promise<{ ok: boolean; error: string | null }>;
  onResetPassword: (
    email: string,
    proof: string,
    password: string,
    confirm: string,
  ) => Promise<{ ok: boolean; error: string | null }>;
  initialMode?: "sign-in" | "reset";
}) {
  const [mode, setMode] = useState<"sign-in" | "reset">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keep, setKeep] = useState(true);
  const [proof, setProof] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const [action, setAction] = useState<"send" | "update" | null>(null);
  const [notice, setNotice] = useState("");
  const [resetError, setResetError] = useState("");
  const [legal, setLegal] = useState<LegalId | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error || resetError) errorRef.current?.focus();
  }, [error, resetError]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    onSubmit(email, password);
  }

  async function sendReset() {
    if (busy) return;
    setAction("send");
    setResetError("");
    setNotice("");
    const result = await onRequestReset(email);
    setAction(null);
    if (!result.ok) {
      setResetError(result.error ?? "Could not send the reset email.");
      return;
    }
    setSent(true);
    setNotice("If that email has an Aerolith account, a reset link is on its way. Copy the link into the box below. Opening it in a browser uses the link up.");
  }

  async function updatePassword() {
    if (busy) return;
    setAction("update");
    setResetError("");
    const result = await onResetPassword(email, proof, nextPassword, confirm);
    setAction(null);
    if (!result.ok) {
      setResetError(result.error ?? "Could not update the password.");
      return;
    }
    setMode("sign-in");
    setPassword("");
    setProof("");
    setNextPassword("");
    setConfirm("");
    setSent(false);
    setNotice("Password updated. Sign in with the new password.");
    setResetError("");
  }

  const problem = mode === "reset" ? resetError : error;

  return (
    <div className="v3" style={{ flexDirection: "row", minHeight: "100%" }}>
      <section style={{ width: 420, flex: "none", background: "#102433", color: "#fff", padding: "48px 40px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: 9, background: "#0e6b56", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>BC</span>
          <span style={{ fontSize: 24, fontWeight: 700 }}>Bid Craft</span>
        </div>
        <div style={{ marginTop: 48, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>Every tender, priced from the same source.</div>
        <p style={{ color: "#c5d4e0" }}><b style={{ color: "#fff" }}>Works offline.</b> Licence is checked on sign-in and stays valid for 14 days without a connection.</p>
        <p style={{ color: "#c5d4e0" }}><b style={{ color: "#fff" }}>Role-based access.</b> Estimators and viewers see only what their role allows.</p>
        <p style={{ color: "#c5d4e0" }}><b style={{ color: "#fff" }}>Sealed revisions.</b> A submitted bill cannot change. Every edit is logged.</p>
        <span style={{ flex: 1 }} />
        <div style={{ color: "#c5d4e0", fontSize: 13 }}>Only your email, device ID and licence status leave this computer. Drawings, quantities and rates never upload.</div>
      </section>
      {mode === "reset" ? (
        <form
          style={{ flex: 1, padding: "44px 56px", display: "flex", flexDirection: "column", gap: 14, background: "#e4eef3" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (proof.trim()) void updatePassword();
            else void sendReset();
          }}
        >
          <div>
            <h1>Reset password</h1>
            <div style={{ color: "#2c4558" }}>
              Enter the email on the Aerolith account. We send a reset link to that inbox. Paste the link here and choose a new password.
            </div>
          </div>
          {problem ? (
            <div className="banner" role="alert" tabIndex={-1} ref={errorRef}>
              <strong>There is a problem</strong>
              <div>{problem}</div>
            </div>
          ) : null}
          {notice ? <p style={{ color: "#2c4558", margin: 0 }}>{notice}</p> : null}
          <label className="l" htmlFor="reset-email">Email
            <input id="reset-email" className="i" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" inputMode="email" required disabled={busy} />
          </label>
          <button className="b p" type="button" disabled={busy} onClick={() => void sendReset()}>
            {action === "send" ? "Sending…" : sent ? "Send the email again" : "Send reset email"}
          </button>
          <label className="l" htmlFor="reset-proof">Reset link from the email
            <textarea id="reset-proof" className="i" value={proof} onChange={(e) => setProof(e.target.value)} rows={3} autoComplete="one-time-code" disabled={busy} placeholder="Paste the link, or the code" />
          </label>
          <label className="l" htmlFor="reset-password">New password
            <input id="reset-password" className="i" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} type="password" autoComplete="new-password" disabled={busy} />
          </label>
          <label className="l" htmlFor="reset-confirm">Confirm new password
            <input id="reset-confirm" className="i" value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" autoComplete="new-password" disabled={busy} />
          </label>
          <button className="b p" type="submit" disabled={busy}>{action === "update" ? "Updating…" : "Update password"}</button>
          <button className="b" type="button" onClick={() => { setMode("sign-in"); setResetError(""); }}>Back to sign in</button>
          <span style={{ flex: 1 }} />
          <LegalLinks onOpen={setLegal} />
        </form>
      ) : (
        <form style={{ flex: 1, padding: "44px 56px", display: "flex", flexDirection: "column", gap: 14, background: "#e4eef3" }} onSubmit={submit}>
          <div>
            <h1>Sign in</h1>
            <div style={{ color: "#2c4558" }}>Sign in with your Aerolith account. Bid Craft {APP_VERSION}.</div>
          </div>
          {notice ? <p style={{ color: "#2c4558", margin: 0 }}>{notice}</p> : null}
          {problem ? (
            <div className="banner" role="alert" tabIndex={-1} ref={errorRef}>
              <strong>There is a problem</strong>
              <div>{problem}</div>
            </div>
          ) : null}
          <label className="l" htmlFor="login-email">Work email
            <input id="login-email" className="i" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required disabled={busy} />
          </label>
          <label className="l" htmlFor="login-password">Password
            <input id="login-password" className="i" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required disabled={busy} />
          </label>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep me signed in on this device</label>
            <button className="b s" type="button" onClick={() => setMode("reset")}>Forgot password?</button>
          </div>
          <button className="b p" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <button className="b" type="button" disabled={busy} onClick={() => submit()}>Work offline with the last licence</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="b" type="button" onClick={onSignup}>Start trial</button>
            <button className="b" type="button" onClick={onPricing}>Buy license</button>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ color: "#2c4558", fontSize: 13 }}>A new account starts a 30-day trial for this app. {keep ? "This device will keep the session." : ""}</div>
          <LegalLinks onOpen={setLegal} />
        </form>
      )}
      {legal ? <LegalDialog id={legal} onClose={() => setLegal(null)} /> : null}
    </div>
  );
}
