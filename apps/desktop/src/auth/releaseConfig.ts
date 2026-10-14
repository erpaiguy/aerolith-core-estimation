import raw from "../../appsettings.Release.json";

export type LicensePublicKey = {
  kid: string;
  key: string;
};

export type ReleaseConfig = {
  appId: string;
  tenancyMode: "individual";
  useMockAuth: false;
  licenseApiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  signupUrl: string;
  accountUrl: string;
  pricingUrl: string;
  licensePublicKeys: LicensePublicKey[];
  refreshIntervalHours: number;
  warnHoursBeforeLapse: number;
  appVersion: string;
};

type ReleaseFile = {
  APP_ID: string;
  TENANCY_MODE: string;
  LICENSE_API_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  LICENSE_PUBLIC_KEYS: Array<{ kid: string; key: string }>;
  REFRESH_INTERVAL_HOURS: number;
  WARN_HOURS_BEFORE_LAPSE: number;
  Licensing: {
    SignupUrl: string;
    AccountUrl: string;
    PricingUrl: string;
    UseMockAuth: boolean;
    AppId: string;
    TenancyMode: string;
  };
};

const file = raw as ReleaseFile;

export const APP_VERSION = "1.1.2";

export const releaseConfig: ReleaseConfig = {
  appId: file.APP_ID,
  tenancyMode: "individual",
  useMockAuth: false,
  licenseApiUrl: file.LICENSE_API_URL.replace(/\/$/, ""),
  supabaseUrl: file.SUPABASE_URL.replace(/\/$/, ""),
  supabaseAnonKey: file.SUPABASE_ANON_KEY,
  signupUrl: file.Licensing.SignupUrl,
  accountUrl: file.Licensing.AccountUrl,
  pricingUrl: file.Licensing.PricingUrl,
  licensePublicKeys: file.LICENSE_PUBLIC_KEYS.map((key) => ({ kid: key.kid, key: key.key })),
  refreshIntervalHours: file.REFRESH_INTERVAL_HOURS,
  warnHoursBeforeLapse: file.WARN_HOURS_BEFORE_LAPSE,
  appVersion: APP_VERSION,
};

const FORBIDDEN = [
  "service_role",
  "service-role",
  "SUPABASE_SERVICE_ROLE",
  "BEGIN PRIVATE KEY",
  "BEGIN EC PRIVATE KEY",
  "sk_live_",
];

export function assertReleaseConfig(config: ReleaseConfig = releaseConfig): void {
  if (config.useMockAuth !== false) {
    throw new Error("Release config must set UseMockAuth to false.");
  }
  if (config.appId !== "aerolith-estimation") {
    throw new Error(`APP_ID must be aerolith-estimation (configured: ${config.appId}).`);
  }
  if (config.tenancyMode !== "individual") {
    throw new Error("TENANCY_MODE must be individual.");
  }
  if (file.Licensing.UseMockAuth !== false || file.Licensing.AppId !== "aerolith-estimation") {
    throw new Error("Licensing release block must use aerolith-estimation with UseMockAuth false.");
  }
  if (file.TENANCY_MODE !== "individual") {
    throw new Error("TENANCY_MODE must be individual.");
  }
  const blob = JSON.stringify(file);
  if (FORBIDDEN.some((marker) => blob.toLowerCase().includes(marker.toLowerCase()))) {
    throw new Error("Release config contains a forbidden secret.");
  }
  for (const url of [config.licenseApiUrl, config.supabaseUrl, config.signupUrl, config.accountUrl, config.pricingUrl]) {
    if (!url.startsWith("https://")) {
      throw new Error(`Release URL must be https: ${url}`);
    }
  }
}

assertReleaseConfig();
