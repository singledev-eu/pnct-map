/**
 * Light/dark theme. The viewer picks Auto (the default: follows prefers-color-scheme, live), Light
 * or Dark (both ignore the system). The choice is kept in localStorage; index.html's inline boot
 * script reads it before the CSS and sets <html data-theme> to the resolved theme, so the page and
 * the basemap start in it (the boot script mirrors resolveTheme/loadThemePref; theme.test.ts runs
 * both). The UI follows through CSS custom properties (style.css, keyed on data-theme); the map
 * through the basemap style URL and the data-layer palette below. Keep the palette in step with
 * the --map-* tokens in style.css (theme.test.ts checks it).
 */
export type Theme = "light" | "dark";
export type ThemePref = "auto" | Theme;

export const DARK_QUERY = "(prefers-color-scheme: dark)";
export const THEME_STORAGE_KEY = "pnct-map:theme";
const PREFS: readonly ThemePref[] = ["auto", "light", "dark"];

/** The theme button's cycle: Auto → Light → Dark → Auto. */
export const nextThemePref = (pref: ThemePref): ThemePref => PREFS[(PREFS.indexOf(pref) + 1) % PREFS.length];

export const resolveTheme = (pref: ThemePref, systemDark: boolean): Theme => (pref === "auto" ? (systemDark ? "dark" : "light") : pref);

/** The saved choice; Auto when there is none, it isn't valid, or storage is unavailable. */
export function loadThemePref(storage: () => Storage = () => window.localStorage): ThemePref {
  try {
    const v = storage().getItem(THEME_STORAGE_KEY);
    return PREFS.includes(v as ThemePref) ? (v as ThemePref) : "auto";
  } catch {
    return "auto";
  }
}

/** Saves the choice (Auto removes it). Without storage the choice lasts for this page only. */
export function saveThemePref(pref: ThemePref, storage: () => Storage = () => window.localStorage): void {
  try {
    if (pref === "auto") storage().removeItem(THEME_STORAGE_KEY);
    else storage().setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage may be unavailable (private mode, blocked).
  }
}

/** Browser UI colour per theme (<meta name="theme-color">, also in index.html). */
export const THEME_COLORS: Record<Theme, string> = { light: "#0f8a7e", dark: "#0c0c0c" };

/**
 * OpenFreeMap styles. "dark" is OpenFreeMap's build of Dark Matter: same tiles (OpenMapTiles
 * schema), sprite and glyphs as positron, so the attribution, the CSP and the label patch
 * (basemap.ts) are the same in both themes, and a theme switch can diff one style into the other.
 */
export const STYLE_URLS: Record<Theme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

export interface MapPalette {
  /** PNCT parishes and concelhos (fill, hatch). */
  pnct: string;
  /** Non-PNCT parishes and concelhos (fill, mostly near-transparent). */
  other: string;
  /** Fill of the selected parish or concelho. */
  selected: string;
  /** Outline of the selected/hovered feature and of the selected concelho's parishes. */
  highlight: string;
  parishLine: string;
  concelhoLine: string;
  /** Protected-areas overlay (layers.ts overlayLayers): RNAP tint and outline, Natura 2000 hatch and dashed outline. */
  rnap: string;
  /** Fill opacity of the RNAP tint (the outline carries it; in light mode a stronger tint muddies the PNCT teal). */
  rnapTint: number;
  natura: string;
}

export const PALETTES: Record<Theme, MapPalette> = {
  light: {
    pnct: "#0f8a7e",
    other: "#64748b",
    selected: "#0b3d39",
    highlight: "#0b3d39",
    parishLine: "#5b6b73",
    concelhoLine: "#2f3b42",
    // Warm orange and violet: apart from the PNCT teal and from each other, and from the basemap's
    // blue water and green parks.
    rnap: "#c2410c",
    rnapTint: 0.08,
    natura: "#7c3aed",
  },
  // On Dark Matter (background #0c0c0c): a brighter teal so PNCT stands out from the near-black
  // land, the selection lighter than PNCT (the light theme makes it darker), and grey lines kept
  // well below white so the boundaries don't glare.
  dark: {
    pnct: "#22b8a7",
    other: "#94a3b8",
    selected: "#7ee8d8",
    highlight: "#c9f5ee",
    parishLine: "#7d8b95",
    concelhoLine: "#a9b5be",
    rnap: "#fb923c",
    rnapTint: 0.16,
    natura: "#b79cff",
  },
};

export const themeOf = (query: { matches: boolean }): Theme => (query.matches ? "dark" : "light");

/**
 * Applies the resolved theme to the page: <html data-theme> (style.css) and the browser UI colour.
 * Under Auto the two media-keyed theme-color metas keep following the system; a forced theme sets
 * both to its colour.
 */
export function applyPageTheme(theme: Theme, pref: ThemePref, doc: Document = document): void {
  doc.documentElement.dataset.theme = theme;
  doc.documentElement.dataset.themePref = pref;
  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.media.includes("dark") ? "dark" : "light";
    meta.content = THEME_COLORS[pref === "auto" ? own : theme];
  }
}
