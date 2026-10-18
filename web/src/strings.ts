/**
 * UI strings for the protected-areas overlay, kept together for the planned PT/EN toggle: a
 * Portuguese table with the same shape can replace `en` without touching the code that uses it.
 * (The older UI strings still live next to their code: index.html, panel.ts, main.ts.)
 */
export interface ProtectedStrings {
  legendHeading: string;
  /** Legend toggle label per category id (protected.meta.json); unknown ids fall back to the source title. */
  toggle: Record<string, string>;
  /** Short category name inside the panel summary. */
  short: Record<string, string>;
  legendSources: string;
  disclaimer: string;
  panelHeading: string;
  /** "Under protection: 12.3% (RNAP 4.1%, Natura 10%)". */
  summary: (any: string, parts: string[]) => string;
  areasLabel: string;
  /** Designation of a Natura 2000 name listed as both a ZPE and a ZEC/SIC (merged into one line). */
  naturaBoth: string;
  /** Legend hint while the overlays are faded out (below camera.ts protectedFade). */
  zoomHint: string;
  /** The "?" explainer next to the legend heading. Lead and body may contain *emphasis*. */
  explainer: {
    button: string;
    title: string;
    items: { lead: string; body: string }[];
    footnote: string;
    close: string;
  };
  /** Toggle row while the overlay file loads (first switch-on). */
  toggleLoading: string;
  loading: string;
  loadError: string;
  overlayError: string;
  /** Map attribution and the phone sheet credit: lead-in before the linked providers. */
  creditLead: string;
  aboutHeading: string;
  aboutBody: string;
  licenceUnconfirmed: string;
}

export const en: ProtectedStrings = {
  legendHeading: "Nature protection",
  toggle: { rnap: "Protected areas (RNAP)", natura: "Natura 2000" },
  short: { rnap: "RNAP", natura: "Natura" },
  legendSources: "Sources",
  disclaimer: "Indicator, not a verdict — check the municipal PDM.",
  panelHeading: "Nature protection",
  summary: (any, parts) => `Under protection: ${any}${parts.length > 1 ? ` (${parts.join(", ")})` : ""}`,
  areasLabel: "Areas",
  naturaBoth: "ZPE + ZEC",
  zoomHint: "Zoom in to see protected areas",
  explainer: {
    button: "What does protection mean?",
    title: "What does “protected” mean for buying land?",
    items: [
      {
        lead: "You can still buy and own it.",
        body: "Protection limits what you can do on the land (building, clearing, some farming), not who can own it.",
      },
      {
        lead: "Natural parks and reserves (RNAP)",
        body: "have zones with different rules. Core areas are the strictest; complementary areas and villages allow more, under the park’s management plan.",
      },
      {
        lead: "Natura 2000",
        body: "isn’t a building ban. It usually means an extra environmental assessment for new projects.",
      },
      {
        lead: "What usually decides whether you can build:",
        body: "the municipal plan (PDM) classification — *urbano* vs *rústico* — and whether the plot is in REN or RAN reserves.",
      },
      {
        lead: "Before you buy, ask the câmara for a PIP",
        body: "(*Pedido de Informação Prévia*). It’s a formal answer about what can be built on that specific plot.",
      },
      {
        lead: "Ruins registered as *artigo urbano*",
        body: "are a common way to build in rural areas, but rebuilding still depends on the PDM and any protection rules.",
      },
    ],
    footnote: "This map is an indicator, not a verdict. Always check the municipal PDM.",
    close: "Close",
  },
  toggleLoading: "Loading…",
  loading: "Loading protection data…",
  loadError: "Could not load the protection data. Please try again.",
  overlayError: "Could not load the protected areas. Please try again.",
  creditLead: "Protected areas",
  aboutHeading: "Protected areas",
  aboutBody:
    "The overlays and the share of each parish or concelho under protection come from the sources below. They are an indicator of where building is likely restricted, not a verdict: the municipal PDM decides.",
  licenceUnconfirmed: "reuse terms not confirmed",
};

/** The active language. */
export const t: ProtectedStrings = en;

/** Shares below this (but above 0) are mostly boundary mismatches; they show as "<0.5%". The data keeps the exact value. */
export const SMALL_SHARE = 0.5;

/** "0%", "<0.5%", "12.3%", "100%": one decimal, none for whole numbers. */
export function formatPct(value: number): string {
  if (value > 0 && value < SMALL_SHARE) return `<${SMALL_SHARE}%`;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}
