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

/**
 * UI strings for the concelho card (concelho.ts), with the same PT/EN plan as `en` above. Numbers
 * and dates are formatted with `locale`.
 */
export interface ConcelhoStrings {
  locale: string;
  /** Summary of the collapsed section in the parish panel. */
  parishSummary: (name: string) => string;
  loading: string;
  loadError: string;
  populationHeading: string;
  population: (people: string, year: number) => string;
  /** The Census-to-Census change, e.g. "−14.0% from 2011 to 2021 (Censuses)". */
  censusChange: (pct: string) => string;
  density: (value: string) => string;
  /** The ageing index as a ratio (index / 100): "4.2 older people (65+) per child (Portugal: 1.9)". */
  ageing: (ratio: string, national: string) => string;
  /** The ⓘ text: the index itself, its definition and the source. */
  ageingHelp: (index: string, national: string) => string;
  ageingHelpLabel: string;
  /** Under the population block of a partly-PNCT concelho. */
  wholeConcelho: string;
  /** A missing value: "—" and why. */
  missing: string;
  missingNote: string;
  populationSource: (year: number) => string;
  contactsHeading: string;
  website: string;
  urbanism: string;
  noUrbanism: string;
  pdm: string;
  noPdm: string;
  contactsSource: (checked: string) => string;
  notYet: string;
  report: string;
  snit: string;
  newTab: string;
  issueTitle: (name: string, dico: string) => string;
  issueBody: (name: string, dico: string, current: string[], asOf: string) => string;
}

export const concelhoEn: ConcelhoStrings = {
  locale: "en-GB",
  parishSummary: (name) => `Concelho: ${name}`,
  loading: "Loading concelho data…",
  loadError: "Could not load the concelho data. Please try again.",
  populationHeading: "Population",
  population: (people, year) => `${people} people (${year})`,
  censusChange: (pct) => `${pct} from 2011 to 2021 (Censuses)`,
  density: (value) => `${value} people/km²`,
  // Reads the same below 1 ("0.8 older people (65+) per child"): no singular/plural switch needed.
  ageing: (ratio, national) => `${ratio} older people (65+) per child (Portugal: ${national})`,
  ageingHelp: (index, national) => `Ageing index ${index} (Portugal: ${national}): people aged 65 and over per 100 children under 15. Source: INE.`,
  ageingHelpLabel: "About this figure (ageing index)",
  wholeConcelho: "Figures for the whole concelho",
  missing: "—",
  missingNote: "not available",
  populationSource: (year) => `Source: INE, population estimates ${year}, Censuses 2011/2021 · CC BY 4.0`,
  contactsHeading: "Câmara Municipal",
  website: "Website",
  urbanism: "Urbanism",
  noUrbanism: "No urbanism page found on the câmara's site",
  pdm: "PDM in force",
  noPdm: "No PDM page found on the câmara's site",
  contactsSource: (checked) => `Source: câmara website, checked ${checked}`,
  notYet: "Câmara contacts: not yet available",
  report: "Report outdated info",
  snit: "Official PDM maps: SNIT (DGT)",
  newTab: "opens in a new tab",
  issueTitle: (name, dico) => `Outdated info: ${name} (${dico})`,
  issueBody: (name, dico, current, asOf) =>
    [`Concelho: ${name} (DICO ${dico})`, "", `Current data (checked ${asOf}):`, ...current.map((l) => `- ${l}`), "", "What changed?", "", ""].join("\n"),
};

/** The active language for the concelho card. */
export const tc: ConcelhoStrings = concelhoEn;

/** The phone bottom sheet (sheet.ts, panel.ts). */
export const sheet = {
  expand: "Expand panel",
  collapse: "Collapse panel",
  credits: "Map credits",
};

/** Shares below this (but above 0) are mostly boundary mismatches; they show as "<0.5%". The data keeps the exact value. */
export const SMALL_SHARE = 0.5;

/** "0%", "<0.5%", "12.3%", "100%": one decimal, none for whole numbers. */
export function formatPct(value: number): string {
  if (value > 0 && value < SMALL_SHARE) return `<${SMALL_SHARE}%`;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}
