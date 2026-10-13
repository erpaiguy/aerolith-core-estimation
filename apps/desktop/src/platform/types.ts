import type { DisplayFormat } from "@aerolith/shared";
import type { CategoryRow, UnitRow, VendorRow } from "../model";
import type { ResourceMasterRow } from "../resourceMaster";

export type ModuleId =
  | "source"
  | "takeoff"
  | "estimate"
  | "buy"
  | "submit"
  | "masters"
  | "dashboard"
  | "settings"
  | "import"
  | "export";

export type ActionId = "view" | "edit" | "delete" | "approve" | "promote" | "import" | "export";

export type PromotionPolicy = "auto" | "approval_required" | "disabled";

/** Workspace product mode. Solo is still a tenant with one shared database. */
export type TenantEdition = "solo" | "team";

export interface Role {
  id: string;
  name: string;
  system: boolean;
  allow: Record<ModuleId, ActionId[]>;
}

export interface TenantUser {
  id: string;
  name: string;
  login: string;
  salt: string;
  pinHash: string;
  roleId: string;
}

export interface PromotionRequest {
  id: string;
  kind: "resource" | "unit" | "category" | "vendor";
  code: string;
  label: string;
  requestedBy: string;
  status: "pending" | "approved" | "rejected";
  unit?: UnitRow;
  category?: CategoryRow;
  vendor?: VendorRow;
}

export interface TenantRecord {
  id: string;
  name: string;
  /** Explicit product mode — never inferred from `users.length` after first migrate. */
  edition: TenantEdition;
  /** Max users in this tenant. Solo is always 1. All users share one tenant database. */
  seatLimit: number;
  promotionPolicy: PromotionPolicy;
  users: TenantUser[];
  roles: Role[];
  audit: AuditEvent[];
  licenseExpiresAt: string | null;
  trialStartedAt: string;
  catalogVersion: number;
  /** Saved tenant global masters. Missing means the app starter pack is still in force. */
  catalog?: {
    version: number;
    units: UnitRow[];
    categories: CategoryRow[];
    vendors: VendorRow[];
  };
  promotions: PromotionRequest[];
  reportFormat?: Record<string, unknown>;
  reportTemplates?: Array<{ id: string; name: string; format: Record<string, unknown> }>;
  activeReportTemplateId?: string | null;
  displayFormat?: Partial<DisplayFormat>;
  resourceMaster?: ResourceMasterRow[];
  resourceMasterSeedVersion?: number;
}

export interface AuditEvent {
  id: string;
  ts: string;
  actor: string;
  action: string;
  detail: string;
}

export interface OwnerAccount {
  login: string;
  salt: string;
  pinHash: string;
}

export interface LicenseKey {
  key: string;
  tenantId: string;
  expiresAt: string;
  issuedAt: string;
  seatLimit?: number;
  term?: { amount: number; unit: "day" | "month" | "year" };
}

export interface ConflictItem {
  id: string;
  field: string;
  boqCode: string;
  local: string;
  replica: string;
}

export interface PlatformState {
  tenants: TenantRecord[];
  owner: OwnerAccount;
  keys: LicenseKey[];
}

export const MODULES: { id: ModuleId; label: string }[] = [
  { id: "source", label: "Client BOQ" },
  { id: "takeoff", label: "Take-off" },
  { id: "estimate", label: "Working BOQ" },
  { id: "buy", label: "Resource Prices" },
  { id: "submit", label: "Submission BOQ" },
  { id: "masters", label: "Masters" },
  { id: "dashboard", label: "Dashboard" },
  { id: "settings", label: "Settings" },
  { id: "import", label: "Import" },
  { id: "export", label: "Export" },
];

export const ALL_ACTIONS: ActionId[] = ["view", "edit", "delete", "approve", "promote", "import", "export"];

export function fullAllow(): Record<ModuleId, ActionId[]> {
  const allow = {} as Record<ModuleId, ActionId[]>;
  for (const m of MODULES) allow[m.id] = [...ALL_ACTIONS];
  return allow;
}

export function viewAllow(): Record<ModuleId, ActionId[]> {
  const allow = {} as Record<ModuleId, ActionId[]>;
  for (const m of MODULES) allow[m.id] = m.id === "settings" ? [] : ["view"];
  return allow;
}
