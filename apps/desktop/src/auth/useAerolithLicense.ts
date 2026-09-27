import { useEffect, useState } from "react";
import { LicenseService, openHttps } from "./licenseService";
import { emptySession, type LicenseSession } from "./licenseState";
import { releaseConfig } from "./releaseConfig";

const service = new LicenseService();

export function useAerolithLicense() {
  const [session, setSession] = useState<LicenseSession>(service.session);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stop = service.subscribe(() => setSession({ ...service.session }));
    void service.tryRestore().finally(() => setReady(true));
    const hours = Math.max(1, releaseConfig.refreshIntervalHours);
    const timer = window.setInterval(() => {
      if (service.session.accessToken) void service.refresh();
    }, hours * 3600000);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, []);

  return {
    ready,
    busy,
    error,
    session: session ?? emptySession(),
    async login(email: string, password: string) {
      setBusy(true);
      setError("");
      const result = await service.login(email, password);
      setBusy(false);
      if (!result.ok) setError(result.error ?? "Sign in failed.");
      setSession({ ...service.session });
      return result.ok;
    },
    async logout() {
      setBusy(true);
      await service.logout();
      setBusy(false);
      setSession({ ...service.session });
    },
    async refresh() {
      setBusy(true);
      await service.refresh();
      setBusy(false);
      setSession({ ...service.session });
    },
    openSignup() {
      openHttps(releaseConfig.signupUrl);
    },
    openAccount() {
      openHttps(releaseConfig.accountUrl);
    },
    openPricing() {
      openHttps(releaseConfig.pricingUrl);
    },
  };
}
