import {
  accessLabel,
  describeLicense,
  licenseBanner,
  resolveAccess,
  trialDaysRemaining,
  type LicenseSession,
} from "../auth/licenseState";
import { planDisplayName, planSummary } from "../auth/subscriptionPlans";

export function LicensePanel({
  session,
  busy = false,
  onRefresh,
  onAccount,
  onPricing,
  onSignOut,
}: {
  session: LicenseSession;
  busy?: boolean;
  onRefresh?: () => void;
  onAccount: () => void;
  onPricing: () => void;
  onSignOut?: () => void;
}) {
  const now = new Date();
  const state = resolveAccess(session, now);
  const expiry = session.planExpiresAtUtc ? new Date(session.planExpiresAtUtc) : null;
  const expiryLabel = expiry
    ? expiry.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Not set";
  const days = trialDaysRemaining(session, now);
  const who = session.displayName || session.email || "Signed in";

  return (
    <section className="license-panel" aria-label="Account and license">
      <div className="note">
        <p className="license-kicker">Your account</p>
        <h2>{who}</h2>
        <p className="hint">{session.email ?? "Signed in"}</p>
        <p>
          <span className="license-kicker">License status</span>
          <br />
          {session.statusMessage ?? describeLicense(session, now)}
        </p>
        <div className="license-actions">
          <button type="button" onClick={onAccount}>
            Account
          </button>
          {onSignOut ? (
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </div>
      <div className="note">
        <p className="license-kicker">License</p>
        <h2>{planDisplayName(session.planCode)}</h2>
        <p className="hint">{planSummary(session.planCode)}</p>
        <p>
          {accessLabel(state)}
          {days != null ? ` · ${days} day${days === 1 ? "" : "s"} left` : ""}
          {" · "}
          expires {expiryLabel}
        </p>
        {licenseBanner(session, now) ? <p className="hint">{licenseBanner(session, now)}</p> : null}
        <div className="license-actions">
          {onRefresh ? (
            <button type="button" onClick={onRefresh} disabled={busy}>
              Refresh license
            </button>
          ) : null}
          <button type="button" className="primary" onClick={onPricing}>
            Buy or renew
          </button>
        </div>
      </div>
    </section>
  );
}
