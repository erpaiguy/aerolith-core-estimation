import { invoke, isTauri as tauriApiIsTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { isTauri?: boolean; __TAURI_INTERNALS__?: unknown };
  return Boolean(tauriApiIsTauri() || w.isTauri || w.__TAURI_INTERNALS__);
}

function suggestedName(projectName: string): string {
  const base = projectName.replace(/[<>:"/\\|?*]+/g, "-").trim() || "project";
  return base.toLowerCase().endsWith(".aero") ? base : `${base}.aero`;
}

function asFilePath(picked: unknown): string | null {
  if (typeof picked === "string" && picked.trim()) return picked.trim();
  if (picked && typeof picked === "object") {
    const rec = picked as Record<string, unknown>;
    if (typeof rec.path === "string" && rec.path.trim()) return rec.path.trim();
  }
  return null;
}

async function tenantProjectsDir(tenantId?: string | null): Promise<string> {
  return invoke<string>("default_projects_dir", { tenantId: tenantId || null });
}

async function defaultSavePath(projectName: string, tenantId?: string | null): Promise<string> {
  const name = suggestedName(projectName);
  const dir = await tenantProjectsDir(tenantId);
  return `${dir}\\${name}`;
}

export async function pickSaveAeroPath(
  projectName: string,
  existingPath?: string | null,
  tenantId?: string | null,
): Promise<string | null> {
  await tenantProjectsDir(tenantId);
  const picked = await save({
    title: "Save Aerolith project",
    defaultPath: existingPath || (await defaultSavePath(projectName, tenantId)),
    filters: [{ name: "Aerolith project", extensions: ["aero"] }],
    canCreateDirectories: true,
  });
  return asFilePath(picked);
}

export async function writeAeroBytes(path: string, bytes: Uint8Array): Promise<string> {
  return invoke<string>("write_aero", { path, data: Array.from(bytes) });
}

export async function openAeroFromDisk(
  tenantId?: string | null,
): Promise<{ path: string; bytes: Uint8Array } | null> {
  const dir = await tenantProjectsDir(tenantId);
  const picked = await open({
    title: "Open Aerolith project",
    multiple: false,
    defaultPath: dir,
    filters: [{ name: "Aerolith project", extensions: ["aero"] }],
  });
  const path = asFilePath(picked);
  if (!path) return null;
  const data = await invoke<number[]>("read_aero", { path });
  return { path, bytes: Uint8Array.from(data) };
}

export async function readAeroAtPath(path: string): Promise<{ path: string; bytes: Uint8Array }> {
  const data = await invoke<number[]>("read_aero", { path });
  return { path, bytes: Uint8Array.from(data) };
}

export async function pickAeroBytesInBrowser(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".aero,application/octet-stream";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve(new Uint8Array(await file.arrayBuffer()));
    };
    input.click();
  });
}

export async function saveAeroWithBrowserPicker(
  bytes: Uint8Array,
  projectName: string,
): Promise<string | null> {
  const picker = window.showSaveFilePicker;
  if (!picker) return null;
  const handle = await picker({
    suggestedName: suggestedName(projectName),
    types: [
      {
        description: "Aerolith project",
        accept: { "application/octet-stream": [".aero"] },
      },
    ],
  });
  const writable = await handle.createWritable();
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  await writable.write(ab);
  await writable.close();
  return handle.name;
}
