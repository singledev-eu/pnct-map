// Everything the promo shows, in one place. record.mjs drives the live site from it, captions.mjs
// renders the caption band and end card, encode.mjs composes and encodes. Edit here, then:
//   npm run promo          record + captions + encode (both formats, ~4 min per format)
//   npm run promo:encode   captions + encode only (after editing CAPTIONS / END_CARD; seconds)

export const SITE = "https://pnct.singledev.eu/";
export const FPS = 30;

/**
 * Output formats. The app is captured below a caption band, so captions never cover the action
 * (the toolbar fills the top of the phone layout and the bottom sheet half of it).
 * app = CSS viewport (≤ 640 px wide: the app's phone layout), captured at `scale` = DSF.
 */
export const FORMATS = {
  "4x5": { width: 1080, height: 1350, band: 180, scale: 2 }, // X feed
  "1x1": { width: 1080, height: 1080, band: 150, scale: 2 },
};
export const appSize = (f) => ({ width: f.width / f.scale, height: (f.height - f.band) / f.scale });

/** The concelho tapped at country zoom, and the parish tapped inside it. */
export const CONCELHO = { code: "0402", name: "Bragança" }; // Trás-os-Montes, all 39 parishes PNCT
export const PARISH = { dicofre: "040216", name: "Gimonde" };

/** Shot timings in seconds. record.mjs writes the resulting marker times to work/<format>/timeline.json. */
export const TIMING = {
  intro: 2.2, // country view, focus off
  toggleLead: 0.2, // pause, then tap "Only PNCT"
  toggleDissolve: 0.8, // non-PNCT areas fade out
  toggleHold: 1.2,
  concelhoLead: 0.3,
  sheetDissolve: 0.35, // the bottom sheet appears
  zoomIn: 2.6, // ease from the country view down to the concelho
  zoomInHold: 0.6,
  parishLead: 0.3,
  panelDissolve: 0.3, // the sheet switches to the parish
  scrollLead: 0.4,
  scroll: 1.1, // scroll the sheet to the Idealista links
  linksHold: 1.3,
  closeLead: 0.2,
  closeDissolve: 0.35, // the sheet closes
  zoomOut: 1.9, // ease back out to the country view
  outroHold: 0.3,
  endCard: 2.8, // end card (fades in over END_CARD.fadeIn)
};

/** Tap indicator: a soft ripple drawn over the page while recording (CSS px). */
export const RIPPLE = { duration: 0.6, dot: 13, ring: 34, color: "15, 138, 126" };

/**
 * Captions in the band above the app. start/end: [marker, offset seconds]. Markers: intro, toggle,
 * concelho, parish, links, close, end (see record.mjs).
 */
export const CAPTIONS = [
  { text: "Moving to Portugal's interior?\nFind PNCT territories.", start: ["intro", 0.15], end: ["toggle", 0.1] },
  { text: "“Only PNCT” hides everything else", start: ["toggle", 0.35], end: ["concelho", 0.1] },
  { text: "Tap a concelho to see its parishes", start: ["concelho", 0.35], end: ["parish", 0.1] },
  { text: "Each PNCT parish links to\nIdealista property searches", start: ["parish", 0.35], end: ["close", 0.1] },
  { text: "1,861 PNCT parishes\nacross mainland Portugal", start: ["close", 0.35], end: ["end", 0] },
];
export const CAPTION_FADE = 0.25;

export const END_CARD = {
  fadeIn: 0.5,
  title: "pnct.singledev.eu",
  subtitle: "free · open source",
  note: "Unofficial map of Portugal's PNCT territories",
  credits: "PNCT list: IEFP (Feb 2026) · Boundaries: CAOP 2025 © DGT (CC BY 4.0)\nMap: OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors",
};

/** The app's palette (web/src/style.css, layers.ts). */
export const COLORS = { teal: "#0f8a7e", accent: "#0f766e", deep: "#0b3d39", tint: "#e6f2f0", text: "#1f2328" };
