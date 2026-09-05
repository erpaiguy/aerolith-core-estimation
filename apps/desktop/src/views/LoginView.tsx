import { useEffect, useMemo, useState, type FormEvent } from "react";
import { verifyPin } from "../platform/crypto";
import type { PlatformState, Session } from "../platform/store";
import { isSoloTenant } from "../platform/tenant";
import type { TenantRecord } from "../platform/types";
import { SplashShell } from "./SplashShell";

export function LoginView({
  platform,
  onTenant,
  onOwner,
}: {
  platform: PlatformState;
  onTenant: (session: Session) => void;
  onOwner: () => void;
}) {
  const [mode, setMode] = useState<"tenant" | "owner">("tenant");
  const [tenantId, setTenantId] = useState(platform.tenants[0]?.id ?? "");
  const [login, setLogin] = useState("admin");
  const [pin, setPin] = useState("admin");
  const [err, setErr] = useState("");

  const tenant = useMemo(
    () => platform.tenants.find((t) => t.id === tenantId) as TenantRecord | undefined,
    [platform.tenants, tenantId],
  );
  const solo = Boolean(tenant && isSoloTenant(tenant));

  useEffect(() => {
    if (mode !== "tenant" || !tenant) return;
    if (solo) {
      const only = tenant.users[0];
      if (only) setLogin(only.login);
      setPin(tenant.id === "t-solo" ? "admin" : "");
      return;
    }
    setLogin(tenant.id === "t-demo" ? "admin" : "");
    setPin(tenant.id === "t-demo" ? "admin" : "");
  }, [mode, solo, tenant]);

  async function submit() {
    setErr("");
    if (mode === "owner") {
      const ok = await verifyPin(pin, platform.owner.salt, platform.owner.pinHash);
      if (!ok || login.trim().toLowerCase() !== platform.owner.login) {
        setErr("Owner login failed.");
        return;
      }
      onOwner();
      return;
    }
    if (!tenant) {
      setErr("Choose a workspace.");
      return;
    }
    const user = solo
      ? tenant.users[0]
      : tenant.users.find((u) => u.login.toLowerCase() === login.trim().toLowerCase());
    if (!user || !(await verifyPin(pin, user.salt, user.pinHash))) {
      setErr(solo ? "PIN is wrong." : "Login or PIN is wrong.");
      return;
    }
    const role = tenant.roles.find((r) => r.id === user.roleId);
    if (!role) {
      setErr("This user has no role.");
      return;
    }
    onTenant({ kind: "tenant", tenant, userId: user.id, role });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  const hint = (() => {
    if (mode === "owner") return "owner / owner";
    if (solo) return "This workspace is just you — enter your PIN. Jobs are stored once for this workspace.";
    if (tenant?.id === "t-demo") return "admin / admin · estimator / estimator · viewer / viewer · owner / owner";
    return "Everyone in this workspace shares the same job database.";
  })();

  return (
    <SplashShell>
      <form className="login-form" onSubmit={onSubmit}>
        <h2>Sign in</h2>
        <p className="lede">Demo company · admin / admin</p>
        <div className="seg login-mode">
          <button type="button" className={mode === "tenant" ? "primary" : ""} onClick={() => setMode("tenant")}>
            Workspace
          </button>
          <button
            type="button"
            className={mode === "owner" ? "primary" : ""}
            onClick={() => {
              setMode("owner");
              setLogin("owner");
              setPin("owner");
            }}
          >
            Owner
          </button>
        </div>
        {mode === "tenant" ? (
          <label className="field">
            Workspace
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              {platform.tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.edition === "solo" ? " · Solo" : " · Company"}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {mode === "owner" || !solo ? (
          <label className="field">
            User
            <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
          </label>
        ) : null}
        <label className="field">
          PIN
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" autoComplete="current-password" />
        </label>
        {err ? <p className="warn">{err}</p> : null}
        <button className="primary login-go" type="submit">
          Continue
        </button>
        <p className="login-hint">{hint}</p>
      </form>
    </SplashShell>
  );
}
