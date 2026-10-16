import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LegalId } from "../legal";
import { LegalDialog } from "./LegalDocs";
import { SplashShell } from "./SplashShell";

export function LoginView({
  busy,
  error,
  onSubmit,
  onSignup,
  onPricing,
}: {
  busy: boolean;
  error: string;
  onSubmit: (email: string, password: string) => void;
  onSignup: () => void;
  onPricing: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legal, setLegal] = useState<LegalId | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    onSubmit(email, password);
  }

  return (
    <SplashShell>
      <form className="login-form" onSubmit={submit}>
        <h2>Sign in</h2>
        <p className="lede">
          Sign in with your Aerolith account. Bid Craft is one seat on this device. A new account
          starts a 30-day trial for this app.
        </p>
        {error ? (
          <div className="login-error" role="alert" tabIndex={-1} ref={errorRef}>
            <h3 id="login-error-title">There is a problem</h3>
            <p>{error}</p>
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
      {legal ? <LegalDialog id={legal} onClose={() => setLegal(null)} /> : null}
    </SplashShell>
  );
}
