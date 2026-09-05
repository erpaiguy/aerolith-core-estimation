import { describe, expect, it } from "vitest";
import { emptyProject } from "./loadReference";
import type { PromotionRequest } from "./platform/types";
import {
  appGlobalCatalog,
  applyCatalogToProject,
  applyPromotion,
  bumpCatalog,
  catalogSource,
  cloneCatalog,
  effectiveCatalog,
  promotionFromProject,
} from "./tenantCatalog";

describe("tenant catalog", () => {
  it("falls back to the app starter pack when the tenant has not saved masters", () => {
    const app = appGlobalCatalog();
    const live = effectiveCatalog({ catalogVersion: 1 });
    expect(catalogSource({})).toBe("app");
    expect(live.units.length).toBe(app.units.length);
    expect(live.categories.length).toBe(app.categories.length);
    expect(live.vendors.map((v) => v.name)).toEqual(["Vendor 1", "Vendor 2", "Vendor 3"]);
    expect(live.units.some((u) => u.code === "m2" || u.code === "m²" || u.symbol.toLowerCase().includes("m"))).toBe(
      true,
    );
  });

  it("uses the tenant-saved catalog for new jobs after a promote", () => {
    const app = appGlobalCatalog();
    const req: PromotionRequest = {
      id: "pr-1",
      kind: "unit",
      code: "BAG",
      label: "Cement bag",
      requestedBy: "admin",
      status: "approved",
      unit: { code: "BAG", description: "Cement bag", symbol: "bag" },
    };
    const saved = applyPromotion(app, req);
    expect(saved.version).toBe(app.version + 1);
    expect(saved.units.find((u) => u.code === "BAG")?.description).toBe("Cement bag");

    const tenant = { catalog: saved, catalogVersion: saved.version };
    expect(catalogSource(tenant)).toBe("tenant");
    const job = emptyProject("Tenant job", "QAR", effectiveCatalog(tenant));
    expect(job.units.find((u) => u.code === "BAG")?.symbol).toBe("bag");
    expect(job.catalogVersion).toBe(saved.version);
    expect(job.vendors).toEqual(saved.vendors);
  });

  it("copies a project row into the tenant catalog and refreshes the job snapshot", () => {
    const job = emptyProject("Promote from job");
    const extra = {
      ...job,
      units: [...job.units, { code: "TKT", description: "Ticket", symbol: "tkt" }],
      categories: [...job.categories, { code: "SITE", description: "Site establishment" }],
      vendors: [...job.vendors, { id: "v-local", name: "Lusail Interiors" }],
    };
    let catalog = appGlobalCatalog();
    catalog = applyPromotion(catalog, {
      id: "a",
      status: "approved",
      requestedBy: "est",
      ...promotionFromProject(extra, "unit", "TKT", "Ticket"),
    });
    catalog = applyPromotion(catalog, {
      id: "b",
      status: "approved",
      requestedBy: "est",
      ...promotionFromProject(extra, "category", "SITE", "Site establishment"),
    });
    catalog = applyPromotion(catalog, {
      id: "c",
      status: "approved",
      requestedBy: "est",
      ...promotionFromProject(extra, "vendor", "v-local", "Lusail Interiors"),
    });
    const refreshed = applyCatalogToProject(extra, catalog);
    expect(refreshed.units.find((u) => u.code === "TKT")).toBeTruthy();
    expect(refreshed.categories.find((c) => c.code === "SITE")?.description).toBe("Site establishment");
    expect(refreshed.vendors.find((v) => v.name === "Lusail Interiors")).toBeTruthy();
    expect(refreshed.catalogVersion).toBe(catalog.version);
  });

  it("admin edits replace the tenant catalog without dropping the starter pack", () => {
    const start = cloneCatalog(appGlobalCatalog());
    const edited = bumpCatalog(start, {
      units: [...start.units, { code: "LS", description: "Lump sum", symbol: "L/s" }],
      categories: start.categories,
      vendors: start.vendors.map((v) => (v.id === "v1" ? { ...v, name: "Qatar Building Materials" } : v)),
    });
    expect(edited.units.length).toBe(start.units.length + 1);
    expect(edited.vendors.find((v) => v.id === "v1")?.name).toBe("Qatar Building Materials");
    expect(edited.units.some((u) => u.code === start.units[0]?.code)).toBe(true);
    const nextJob = emptyProject("Next", "QAR", edited);
    expect(nextJob.vendors.find((v) => v.id === "v1")?.name).toBe("Qatar Building Materials");
    expect(nextJob.units.find((u) => u.code === "LS")).toBeTruthy();
  });
});
