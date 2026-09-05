import { confirm } from "@tauri-apps/plugin-dialog";
import { isTauri } from "../nativeAero";

/** Native Ok/Cancel that uses the dialog `message` command (allowed). Never call `window.confirm` in Tauri. */
export async function askConfirm(text: string, title = "Confirm"): Promise<boolean> {
  if (isTauri()) {
    return confirm(text, { title, kind: "warning" });
  }
  return Promise.resolve(window.confirm(text));
}
