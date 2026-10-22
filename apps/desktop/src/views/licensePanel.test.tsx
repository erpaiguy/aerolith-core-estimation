import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptySession } from "../auth/licenseState";
import { TRIAL_DAYS } from "../auth/subscriptionPlans";
import { LicensePanel } from "./LicensePanel";
import { LoginView } from "./LoginView";

describe("license UI", () => {
  it("shows the Aerolith trial, expiry, and account actions", () => {
    const session = {
      ...emptySession(),
      isAuthenticated: true,
      licenseVerified: true,
      email: "ada@example.com",
      displayName: "Ada Lovelace",
      planCode: "trial",
      trialStartedAtUtc: "2026-09-01T00:00:00.000Z",
      planExpiresAtUtc: "2026-10-01T00:00:00.000Z",
      statusMessage: "Trial · 30 days left",
    };
    const html = renderToStaticMarkup(
      createElement(LicensePanel, {
        session,
        onAccount: () => undefined,
        onPricing: () => undefined,
        onRefresh: () => undefined,
        onSignOut: () => undefined,
      }),
    );
    expect(TRIAL_DAYS).toBe(30);
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("ada@example.com");
    expect(html).toContain("Trial");
    expect(html).toContain("30 days left");
    expect(html).toContain("Buy or renew");
    expect(html).toContain("Refresh license");
    expect(html).toContain("Account");
  });

  it("asks for an Aerolith email instead of a workspace PIN", () => {
    const html = renderToStaticMarkup(
      createElement(LoginView, {
        busy: false,
        error: "",
        onSubmit: () => undefined,
        onSignup: () => undefined,
        onPricing: () => undefined,
        onRequestReset: async () => ({ ok: true, error: null }),
        onResetPassword: async () => ({ ok: true, error: null }),
      }),
    );
    expect(html).toContain("Sign in with your Aerolith account");
    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("Start trial");
    expect(html).toContain("Forgot password?");
    expect(html).not.toContain("PIN");
    expect(html).not.toContain("Workspace");
  });
});
