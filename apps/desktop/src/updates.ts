const AUTO_KEY = "bidcraft.autoUpdate";

/** Stable manifest URL. Installed 1.x and 2.x apps both read this file; publish a signed 2.0.0 manifest here. */
export const UPDATE_CHANNEL_URL =
  "https://github.com/erpaiguy/aerolith-core-releases/releases/download/v1.0.0/estimation-latest.json";

export type UpdateOffer = {
  version: string;
  notes: string;
  install: (onProgress?: (loaded: number, total: number | null) => void) => Promise<void>;
};

export function updatesAutoEnabled(): boolean {
  try {
    const value = localStorage.getItem(AUTO_KEY);
    return value == null || value === "1";
  } catch {
    return true;
  }
}

export function setUpdatesAutoEnabled(on: boolean): void {
  try {
    localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export async function checkForUpdate(): Promise<UpdateOffer | null> {
  const { isTauri } = await import("./nativeAero");
  if (!isTauri()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body?.trim() || "An update is ready to install.",
    async install(onProgress) {
      let loaded = 0;
      let total: number | null = null;
      await update.downloadAndInstall(
        (event) => {
          if (event.event === "Started") total = event.data.contentLength ?? null;
          if (event.event === "Progress") {
            loaded += event.data.chunkLength;
            onProgress?.(loaded, total);
          }
        },
        { restartAfterInstall: true },
      );
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  };
}
