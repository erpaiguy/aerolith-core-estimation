/** Bid Craft 2.0.2 locks a single estima-style appearance: light canvas, dark rail, orange accents. */

export type ThemeName = "light";

const KEY = "bidcraft.theme";

export function readTheme(): ThemeName {
  return "light";
}

export function applyTheme(_theme?: ThemeName): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = "light";
  try {
    localStorage.setItem(KEY, "light");
  } catch {
    /* private mode */
  }
}

export function bootTheme(): ThemeName {
  applyTheme("light");
  return "light";
}
