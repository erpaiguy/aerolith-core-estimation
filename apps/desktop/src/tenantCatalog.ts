import unitsJson from "@fixtures/units.json";
import categoriesJson from "@fixtures/resource_categories.json";
import type { CategoryRow, LoadedProject, UnitRow, VendorRow } from "./model";
import type { PromotionRequest, TenantRecord } from "./platform/types";

export type CatalogSource = "app" | "tenant";

export interface TenantCatalog {
  version: number;
  units: UnitRow[];
  categories: CategoryRow[];
  vendors: VendorRow[];
}

const APP_VENDORS: VendorRow[] = [
  { id: "v1", name: "Vendor 1" },
  { id: "v2", name: "Vendor 2" },
  { id: "v3", name: "Vendor 3" },
];

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Bundled starter pack — the app global master until a workspace saves its own. */
export function appGlobalCatalog(): TenantCatalog {
  return {
    version: 1,
    units: (unitsJson as Array<{ code: string; description: string; symbol: string }>).map((u) => ({
      code: u.code,
      description: u.description,
      symbol: u.symbol,
    })),
    categories: (categoriesJson as Array<{ code: string; description: string }>).map((c) => ({
      code: c.code,
      description: c.description,
    })),
    vendors: APP_VENDORS.map((v) => ({ ...v })),
  };
}

export function cloneCatalog(catalog: TenantCatalog): TenantCatalog {
  return {
    version: catalog.version,
    units: catalog.units.map((u) => ({ ...u })),
    categories: catalog.categories.map((c) => ({ ...c })),
    vendors: catalog.vendors.map((v) => ({ ...v })),
  };
}

export function normalizeCatalog(raw: unknown, fallback = appGlobalCatalog()): TenantCatalog {
  if (!raw || typeof raw !== "object") return cloneCatalog(fallback);
  const rec = raw as Record<string, unknown>;
  const version = Math.max(1, Math.floor(Number(rec.version) || fallback.version || 1));
  const units = Array.isArray(rec.units)
    ? rec.units
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const r = row as Record<string, unknown>;
          const code = asText(r.code).trim();
          if (!code) return null;
          return { code, description: asText(r.description), symbol: asText(r.symbol) };
        })
        .filter((u): u is UnitRow => Boolean(u))
    : fallback.units.map((u) => ({ ...u }));
  const categories = Array.isArray(rec.categories)
    ? rec.categories
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const r = row as Record<string, unknown>;
          const code = asText(r.code).trim();
          if (!code) return null;
          return { code, description: asText(r.description) };
        })
        .filter((c): c is CategoryRow => Boolean(c))
    : fallback.categories.map((c) => ({ ...c }));
  const vendors = Array.isArray(rec.vendors)
    ? rec.vendors
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const r = row as Record<string, unknown>;
          const id = asText(r.id).trim();
          const name = asText(r.name).trim();
          if (!id || !name) return null;
          return { id, name };
        })
        .filter((v): v is VendorRow => Boolean(v))
    : fallback.vendors.map((v) => ({ ...v }));
  return { version, units, categories, vendors };
}

export function catalogSource(tenant?: Pick<TenantRecord, "catalog"> | null): CatalogSource {
  return tenant?.catalog ? "tenant" : "app";
}

/** Tenant-saved catalog when present, otherwise the app starter pack. */
export function effectiveCatalog(tenant?: Pick<TenantRecord, "catalog" | "catalogVersion"> | null): TenantCatalog {
  if (tenant?.catalog) {
    const catalog = cloneCatalog(normalizeCatalog(tenant.catalog));
    catalog.version = Math.max(catalog.version, tenant.catalogVersion ?? catalog.version);
    return catalog;
  }
  const app = appGlobalCatalog();
  if (tenant?.catalogVersion) app.version = Math.max(app.version, tenant.catalogVersion);
  return app;
}

export function bumpCatalog(catalog: TenantCatalog, next: Omit<TenantCatalog, "version">): TenantCatalog {
  return {
    version: catalog.version + 1,
    units: next.units.map((u) => ({ ...u })),
    categories: next.categories.map((c) => ({ ...c })),
    vendors: next.vendors.map((v) => ({ ...v })),
  };
}

function upsertByCode<T extends { code: string }>(rows: T[], row: T): T[] {
  const code = row.code.trim().toLowerCase();
  const idx = rows.findIndex((r) => r.code.trim().toLowerCase() === code);
  if (idx < 0) return [...rows, row];
  return rows.map((r, i) => (i === idx ? row : r));
}

function upsertVendor(rows: VendorRow[], row: VendorRow): VendorRow[] {
  const id = row.id.trim().toLowerCase();
  const name = row.name.trim().toLowerCase();
  const idx = rows.findIndex((r) => r.id.trim().toLowerCase() === id || r.name.trim().toLowerCase() === name);
  if (idx < 0) return [...rows, row];
  return rows.map((r, i) => (i === idx ? row : r));
}

export function applyPromotion(catalog: TenantCatalog, req: PromotionRequest): TenantCatalog {
  const next = cloneCatalog(catalog);
  if (req.kind === "unit") {
    next.units = upsertByCode(next.units, req.unit ?? { code: req.code, description: req.label, symbol: "" });
  } else if (req.kind === "category") {
    next.categories = upsertByCode(next.categories, req.category ?? { code: req.code, description: req.label });
  } else if (req.kind === "vendor") {
    next.vendors = upsertVendor(next.vendors, req.vendor ?? { id: req.code, name: req.label || req.code });
  }
  next.version += 1;
  return next;
}

export function applyCatalogToProject(project: LoadedProject, catalog: TenantCatalog): LoadedProject {
  const live = cloneCatalog(catalog);
  return {
    ...project,
    units: live.units,
    categories: live.categories,
    vendors: live.vendors,
    catalogVersion: live.version,
  };
}

export function snapshotFromCatalog(catalog: TenantCatalog): Pick<
  LoadedProject,
  "units" | "categories" | "vendors" | "catalogVersion"
> {
  const live = cloneCatalog(catalog);
  return {
    units: live.units,
    categories: live.categories,
    vendors: live.vendors,
    catalogVersion: live.version,
  };
}

export function promotionFromProject(
  project: LoadedProject,
  kind: PromotionRequest["kind"],
  code: string,
  label: string,
): Pick<PromotionRequest, "kind" | "code" | "label" | "unit" | "category" | "vendor"> {
  if (kind === "unit") {
    const unit = project.units.find((u) => u.code === code) ?? { code, description: label, symbol: "" };
    return { kind, code: unit.code, label: unit.description || unit.code, unit };
  }
  if (kind === "category") {
    const category = project.categories.find((c) => c.code === code) ?? { code, description: label };
    return { kind, code: category.code, label: category.description || category.code, category };
  }
  const vendor = project.vendors.find((v) => v.id === code) ?? { id: code, name: label || code };
  return { kind: "vendor", code: vendor.id, label: vendor.name, vendor };
}
