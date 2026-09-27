export const TRIAL = "trial";
export const ANNUAL = "annual";
export const LIFETIME = "lifetime";
export const EXPIRED = "expired";

export const TRIAL_DAYS = 30;

export function normalizePlan(planCode: string | null | undefined): string {
  switch ((planCode ?? "trial").trim().toLowerCase()) {
    case "lifetime":
    case "life":
    case "paid":
    case "license":
    case "perpetual":
    case "pro_plus":
    case "pro+":
    case "proplus":
    case "max":
    case "pro":
      return LIFETIME;
    case "term":
    case "annual":
    case "yearly":
      return ANNUAL;
    case "free":
    case "expired":
    case "expired_trial":
      return EXPIRED;
    case "demo":
    case "trial":
      return TRIAL;
    default:
      return TRIAL;
  }
}

export function planDisplayName(planCode: string | null | undefined): string {
  switch (normalizePlan(planCode)) {
    case LIFETIME:
      return "Lifetime";
    case ANNUAL:
      return "Active";
    case TRIAL:
      return "Trial";
    default:
      return "Expired";
  }
}

export function planSummary(planCode: string | null | undefined): string {
  switch (normalizePlan(planCode)) {
    case EXPIRED:
      return "Trial or term ended · buy or renew to continue";
    case TRIAL:
      return "Trial · full features until the server-set trial end";
    case ANNUAL:
      return "Active · 1-year term · one seat · this device";
    default:
      return "Active · single seat · this device";
  }
}
