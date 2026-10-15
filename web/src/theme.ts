/**
 * Light/dark theme, from the OS/browser setting only (prefers-color-scheme; no manual toggle).
 * The UI follows through CSS custom properties (style.css); the map through the basemap style URL
 * and the data-layer palette below. Keep the palette in step with the --map-* tokens in style.css
 * (theme.test.ts checks it).
 */
export type Theme = "light" | "dark";

export const DARK_QUERY = "(prefers-color-scheme: dark)";

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
}

export const PALETTES: Record<Theme, MapPalette> = {
  light: {
    pnct: "#0f8a7e",
    other: "#64748b",
    selected: "#0b3d39",
    highlight: "#0b3d39",
    parishLine: "#5b6b73",
    concelhoLine: "#2f3b42",
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
  },
};

export const themeOf = (query: { matches: boolean }): Theme => (query.matches ? "dark" : "light");
