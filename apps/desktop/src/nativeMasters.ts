import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./nativeAero";
import { normalizeCatalog, type TenantCatalog } from "./tenantCatalog";

export async function persistTenantCatalog(tenantId: string, catalog: TenantCatalog): Promise<void> {
  if (!tenantId.trim() || !isTauri()) return;
  await invoke<string>("write_tenant_catalog", {
    tenantId,
    json: JSON.stringify(catalog),
  });
}

export async function tryReadTenantCatalog(tenantId: string): Promise<TenantCatalog | null> {
  if (!tenantId.trim() || !isTauri()) return null;
  try {
    const raw = await invoke<string | null>("read_tenant_catalog", { tenantId });
    if (!raw) return null;
    return normalizeCatalog(JSON.parse(raw));
  } catch {
    return null;
  }
}
