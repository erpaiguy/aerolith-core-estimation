import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LegalId } from "../legal";
import type { ThemeName } from "../theme";
import { LegalDialog } from "./LegalDocs";
import { SplashShell } from "./SplashShell";

export function LoginView({
  busy,
  error,
  onSubmit,
  onSignup,
  onPricing,
  onRequestReset,
  onResetPassword,
  theme,
  onTheme,
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
  theme?: ThemeName;
  onTheme?: (theme: ThemeName) => void;
}) {
  const [mode, setMode] = useState<"sign-in" | "reset">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  function submit(e: FormEvent) {
    e.preventDefault();
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
    <SplashShell theme={theme} onTheme={onTheme}>
      {mode === "reset" ? (
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (proof.trim()) void updatePassword();
            else void sendReset();
          }}
        >
          <h2>Reset password</h2>
          <p className="lede">
            Enter the email on the Aerolith account. We send a reset link to that inbox. Paste the link
            here and choose a new password.
          </p>
          {problem ? (
            <div className="login-error" role="alert" tabIndex={-1} ref={errorRef}>
              <h3>There is a problem</h3>
              <p>{problem}</p>
            </div>
          ) : null}
          {notice ? <p className="login-hint">{notice}</p> : null}
          <label className="field" htmlFor="reset-email">
            Email
            <input
              id="reset-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              disabled={busy}
            />
          </label>
          <button className="primary login-go" type="button" disabled={busy} onClick={() => void sendReset()}>
            {action === "send" ? "Sending…" : sent ? "Send the email again" : "Send reset email"}
          </button>
          <label className="field" htmlFor="reset-proof">
            Reset link from the email
            <textarea
              id="reset-proof"
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              rows={3}
              autoComplete="one-time-code"
              disabled={busy}
              placeholder="Paste the link, or the code"
            />
          </label>
          <label className="field" htmlFor="reset-password">
            New password
            <input
              id="reset-password"
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <label className="field" htmlFor="reset-confirm">
            Confirm new password
            <input
              id="reset-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type="password"
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <button className="primary login-go" type="submit" disabled={busy}>
            {action === "update" ? "Updating…" : "Update password"}
          </button>
          <div className="login-links">
            <button
              type="button"
              onClick={() => {
                setMode("sign-in");
                setResetError("");
              }}
            >
              Back to sign in
            </button>
          </div>
        </form>
      ) : (
      <form className="login-form" onSubmit={submit}>
        <h2>Sign in</h2>
        <p className="lede">
          Sign in with your Aerolith account. Bid Craft is one seat on this device. A new account
          starts a 30-day trial for this app.
        </p>
        {notice ? <p className="login-hint">{notice}</p> : null}
        {problem ? (
          <div className="login-error" role="alert" tabIndex={-1} ref={errorRef}>
            <h3 id="login-error-title">There is a problem</h3>
            <p>{problem}</p>
          </div>
        ) : null}
        <label className="field" htmlFor="login-email">
          Email
          <input
            id="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            disabled={busy}
          />
        </label>
        <label className="field" htmlFor="login-password">
          Password
          <input
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </label>
        <div className="login-inline">
          <button type="button" onClick={() => setMode("reset")}>
            Forgot password?
          </button>
        </div>
        <button className="primary login-go" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="login-hint">
          No account yet? Start a trial on the Aerolith website, then return here to sign in. Trial
          length is 30 days for Bid Craft. Paid plans open from the website later.
        </p>
        <div className="login-links">
          <button type="button" onClick={onSignup}>
            Start trial
          </button>
          <button type="button" onClick={onPricing}>
            Buy license
          </button>
        </div>
        <div className="legal-links">
          <button type="button" onClick={() => setLegal("privacy")}>
            Privacy policy
          </button>
          <button type="button" onClick={() => setLegal("terms-of-service")}>
            Terms of service
          </button>
          <button type="button" onClick={() => setLegal("terms-and-conditions")}>
            Terms and conditions
          </button>
          <button type="button" onClick={() => setLegal("license")}>
            License terms
          </button>
        </div>
      </form>
      )}
      {legal ? <LegalDialog id={legal} onClose={() => setLegal(null)} /> : null}
    </SplashShell>
  );
}
