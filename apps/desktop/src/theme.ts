export type ThemeName = "light" | "dark";

const KEY = "bidcraft.theme";

export function readTheme(): ThemeName {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode */
  }
}

export function bootTheme(): ThemeName {
  const theme = readTheme();
  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
  return theme;
}
