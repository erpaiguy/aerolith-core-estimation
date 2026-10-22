export type ThemeName = "light" | "dark";

export const THEME_STYLES = [
  { id: "minimal", label: "Clean minimal" },
  { id: "spreadsheet", label: "Dense spreadsheet" },
  { id: "modern", label: "Dark-first modern" },
  { id: "cards", label: "Soft cards" },
  { id: "enterprise", label: "Classic enterprise" },
] as const;

export type ThemeStyle = (typeof THEME_STYLES)[number]["id"];

/** Centre-panel arrangements. Each one works with every theme style and with light or dark. */
export const LAYOUTS = [
  { id: "standard", label: "1.4.0 standard" },
  { id: "folio", label: "Tender folio" },
  { id: "desk", label: "Split desk" },
  { id: "board", label: "Section board" },
] as const;

export type LayoutId = (typeof LAYOUTS)[number]["id"];

const KEY = "bidcraft.theme";
const STYLE_KEY = "bidcraft.themeStyle";
const LAYOUT_KEY = "bidcraft.layout";

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

export function parseThemeStyle(value: string | null | undefined): ThemeStyle {
  return THEME_STYLES.some((style) => style.id === value) ? (value as ThemeStyle) : "minimal";
}

export function readThemeStyle(): ThemeStyle {
  try {
    return parseThemeStyle(localStorage.getItem(STYLE_KEY));
  } catch {
    return "minimal";
  }
}

export function applyThemeStyle(style: ThemeStyle): ThemeStyle {
  const next = parseThemeStyle(style);
  if (typeof document !== "undefined") document.documentElement.dataset.style = next;
  try {
    localStorage.setItem(STYLE_KEY, next);
  } catch {
    /* private mode */
  }
  return next;
}

export function bootThemeStyle(): ThemeStyle {
  const style = readThemeStyle();
  if (typeof document !== "undefined") document.documentElement.dataset.style = style;
  return style;
}

export function parseLayout(value: string | null | undefined): LayoutId {
  return LAYOUTS.some((layout) => layout.id === value) ? (value as LayoutId) : "standard";
}

export function readLayout(): LayoutId {
  try {
    return parseLayout(localStorage.getItem(LAYOUT_KEY));
  } catch {
    return "standard";
  }
}

export function applyLayout(layout: LayoutId): LayoutId {
  const next = parseLayout(layout);
  if (typeof document !== "undefined") document.documentElement.dataset.layout = next;
  try {
    localStorage.setItem(LAYOUT_KEY, next);
  } catch {
    /* private mode */
  }
  return next;
}

export function bootLayout(): LayoutId {
  const layout = readLayout();
  if (typeof document !== "undefined") document.documentElement.dataset.layout = layout;
  return layout;
}
