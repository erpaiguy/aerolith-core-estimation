import type { ReactNode } from "react";
import { BrandLockup } from "./Brand";

export function SplashShell({
  status,
  children,
}: {
  status?: string;
  children?: ReactNode;
}) {
  return (
    <div className="app login">
      <div className="login-hero">
        <BrandLockup size="lg" tone="dark" />
        <div className="login-side-copy">
          <h1>Several bills. One job.</h1>
          <p>Estimating for issued BOQs. One resource catalogue. Totals you can seal.</p>
        </div>
        <div className="login-side-foot">Core Estimation · QAR</div>
      </div>
      <div className="login-panel">
        {status ? <p className="login-status">{status}</p> : <div className="login-card">{children}</div>}
      </div>
    </div>
  );
}
