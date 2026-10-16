import { ask, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./nativeAero";
import { askConfirm } from "./ui/askConfirm";

function asBlob(bytes: Uint8Array, mime: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: mime });
}

async function openSaved(path: string, bytes: Uint8Array, mime: string): Promise<void> {
  if (isTauri()) {
    const yes = await ask("Open the file now?", { title: "BidCraft", kind: "info" });
    if (yes) await invoke("open_user_file", { path });
    return;
  }
  if (await askConfirm("Open the file now?", "BidCraft")) {
    const url = URL.createObjectURL(asBlob(bytes, mime));
    window.open(url, "_blank", "noopener");
  }
}

/** Native Save dialog in the desktop app. Browser falls back to the file picker or a download. */
export async function saveUserBytes(
  name: string,
  bytes: Uint8Array,
  filter: { name: string; extensions: string[]; mime: string },
): Promise<string | null> {
  if (!isTauri()) {
    const blob = asBlob(bytes, filter.mime);
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: filter.name, accept: { [filter.mime]: filter.extensions.map((ext) => `.${ext}`) } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      await openSaved(name, bytes, filter.mime);
      return name;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    await openSaved(name, bytes, filter.mime);
    return name;
  }
  const picked = await save({
    title: `Save ${filter.name}`,
    defaultPath: name,
    filters: [{ name: filter.name, extensions: filter.extensions }],
    canCreateDirectories: true,
  });
  const path = typeof picked === "string" ? picked : null;
  if (!path) return null;
  const saved = await invoke<string>("write_user_file", { path, data: Array.from(bytes) });
  await openSaved(saved, bytes, filter.mime);
  return saved;
}
