import { useEffect, useRef, useState, type FormEvent } from "react";
import { APP_VERSION } from "../auth/releaseConfig";
import "../v3/theme.css";

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
  const [keep, setKeep] = useState(true);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    onSubmit(email, password);
  }

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
      <form style={{ flex: 1, padding: "44px 56px", display: "flex", flexDirection: "column", gap: 14, background: "#e4eef3" }} onSubmit={submit}>
        <div>
          <h1>Sign in</h1>
          <div style={{ color: "#2c4558" }}>Sign in with your Aerolith account. Bid Craft {APP_VERSION}.</div>
        </div>
        {error ? (
          <div className="banner" role="alert" tabIndex={-1} ref={errorRef}>
            <strong>There is a problem</strong>
            <div>{error}</div>
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
          <button className="b s" type="button" onClick={onPricing}>Buy license</button>
        </div>
        <button className="b p" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <button className="b" type="button" disabled={busy} onClick={() => submit()}>Work offline with the last licence</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="b" type="button" onClick={onSignup}>Start trial</button>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ color: "#2c4558", fontSize: 13 }}>A new account starts a 30-day trial for this app. {keep ? "This device will keep the session." : ""}</div>
      </form>
    </div>
  );
}
