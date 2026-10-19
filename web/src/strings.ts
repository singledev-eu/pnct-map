/**
 * Every user-visible UI string, per language: strings.en.ts and strings.pt.ts each export one
 * `Strings` object, so a key missing from either is a compile error. Place names (parishes,
 * concelhos, districts) come from the data and are never translated. Data-derived labels (the
 * protected-area sources) carry both languages in their data meta (protected.ts).
 *
 * `t`, `tc`, `sheet` and `ui` are live bindings: setLang swaps them, and the importing modules
 * read them at render time, so main.ts re-renders after a switch (applyLanguage).
 * Index.html has no text of its own: its elements name a `ui` key in data-i18n (i18n.ts applyStatic).
 */
import type { LandFilter, Operation, PropertyType } from "./idealista";
import type { ThemePref } from "./theme";
import { en } from "./strings.en";
import { pt } from "./strings.pt";

export type Lang = "pt" | "en";
export const LANGS: readonly Lang[] = ["pt", "en"];

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

/** The concelho card (concelho.ts). Numbers and dates are formatted with `ui.locale`. */
export interface ConcelhoStrings {
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
  /** The PDM link when the version in force isn't stated (pdm_status "unclear"), with pdmUnclear under it. */
  pdmDocuments: string;
  pdmUnclear: string;
  noPdm: string;
  contactsSource: (checked: string) => string;
  notYet: string;
  /** Link label; the issue it opens is in English in both languages (ISSUE, below: it's for the maintainers). */
  report: string;
  snit: string;
  newTab: string;
}

/** The phone bottom sheet (sheet.ts, panel.ts). */
export interface SheetStrings {
  expand: string;
  collapse: string;
  credits: string;
}

/**
 * Everything else: the static page (index.html, by data-i18n key), the toolbar, legend, tooltip,
 * search, panel, property links, credits, About, the language/theme controls and error states.
 * Strings with {name} placeholders are filled with links by i18n.ts fill().
 */
export interface UiStrings {
  /** BCP 47 tag for Intl and <html lang>. */
  locale: string;
  /** Document title and meta description. */
  title: string;
  description: string;
  // index.html (data-i18n keys)
  mapLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  districtLabel: string;
  allDistricts: string;
  onlyPnct: string;
  onlyPnctTitle: string;
  onlyPnctLabel: string;
  legend: string;
  legendWhole: string;
  legendPartial: string;
  legendNotPnct: string;
  legendPnctParish: string;
  legendOtherParish: string;
  legendBoundary: string;
  overlaysLabel: string;
  aboutButton: string;
  loadingMap: string;
  // error states (status line)
  basemapError: string;
  dataError: string;
  // language and theme controls (controls.ts)
  settingsLabel: string;
  langLabel: string;
  /** Accessible name per language button; contains the visible "PT"/"EN" (WCAG 2.5.3). */
  langNames: Record<Lang, string>;
  /** Theme button: accessible name and tooltip stating the current state. */
  theme: Record<ThemePref, string>;
  // tooltip and search
  concelhoSub: (distrito: string) => string;
  pnctYes: string;
  pnctNo: string;
  pnctAll: string;
  pnctSome: (pnct: number, total: number) => string;
  kind: { concelho: string; parish: string };
  noMatches: string;
  /** Screen-reader suffix of a PNCT search result. */
  pnctMark: string;
  // panel
  parishes: (n: number) => string;
  coverageWhole: (n: number) => string;
  coverageNone: (name: string, n: number) => string;
  coveragePartial: (name: string, pnct: number, n: number) => string;
  badgePnct: string;
  badgeOther: string;
  factConcelho: string;
  factDistrito: string;
  factDicofre: string;
  factParishes: string;
  closePanel: string;
  kickerParish: string;
  kickerConcelho: string;
  concelhoCoverage: string;
  pnctCoverage: string;
  showConcelho: (name: string) => string;
  showAll: string;
  pnctParishes: string;
  propertySearch: string;
  searchOptions: string;
  operation: string;
  propertyType: string;
  landType: string;
  operations: Record<Operation, string>;
  types: Record<PropertyType, string>;
  land: Record<LandFilter, string>;
  linksLoading: string;
  linksNone: string;
  linksError: string;
  linksDisclaimer: string;
  notPnctParish: string;
  // property links (links.ts)
  linkParish: string;
  linkParishDescription: string;
  linkApprox: string;
  linkMunicipality: (name: string) => string;
  linkMunicipalityDescription: string;
  // credits: map attribution and the phone sheet
  attributionBoundaries: string;
  sheetBoundaries: string;
  // About dialog. **bold**; {placeholders} are links.
  about: {
    title: string;
    intro: string;
    unofficial: string;
    sourcesHeading: string;
    pnctLabel: string;
    /** {list}: the IEFP list link (listLink). */
    pnct: string;
    listLink: string;
    boundariesLabel: string;
    /** {caop}, {licence}. */
    boundaries: string;
    basemapLabel: string;
    /** {openfreemap}, {openmaptiles}, {osm}. */
    basemap: string;
    notAffiliated: string;
    close: string;
  };
}

export interface Strings {
  ui: UiStrings;
  protected: ProtectedStrings;
  concelho: ConcelhoStrings;
  sheet: SheetStrings;
}

export const STRINGS: Record<Lang, Strings> = { en, pt };

/** The active language and its tables (live bindings, see the header). English until setLang. */
export let lang: Lang = "en";
export let ui: UiStrings = en.ui;
export let t: ProtectedStrings = en.protected;
export let tc: ConcelhoStrings = en.concelho;
export let sheet: SheetStrings = en.sheet;

export function setLang(next: Lang): void {
  lang = next;
  ({ ui, protected: t, concelho: tc, sheet } = STRINGS[next]);
}

/**
 * The "Report outdated info" GitHub issue, in English in both languages: it's read by the
 * maintainers, not shown in the UI.
 */
export const ISSUE = {
  title: (name: string, dico: string) => `Outdated info: ${name} (${dico})`,
  body: (name: string, dico: string, current: string[], asOf: string) =>
    [`Concelho: ${name} (DICO ${dico})`, "", `Current data (checked ${asOf}):`, ...current.map((l) => `- ${l}`), "", "What changed?", "", ""].join("\n"),
  fields: {
    website: "Website",
    email: "Email",
    phone: "Phone",
    urbanism: "Urbanism page",
    pdm: "PDM page",
    pdmStatus: "PDM status",
    population: (year: number) => `Population ${year}`,
  },
};

/** Shares below this (but above 0) are mostly boundary mismatches; they show as "<0.5%". The data keeps the exact value. */
export const SMALL_SHARE = 0.5;

/**
 * `value` in the active locale: "8,360" / "8 360" (grouped from four digits in both, unlike
 * pt-PT's default, which starts at five), "4.2" / "4,2".
 */
export function formatNumber(value: number, digits = 0, extra: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(ui.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: "always", ...extra }).format(value);
}

/** "0%", "<0.5%", "12.3%", "100%" ("12,3%" in PT): one decimal, none for whole numbers. */
export function formatPct(value: number): string {
  if (value > 0 && value < SMALL_SHARE) return `<${formatNumber(SMALL_SHARE, 1)}%`;
  return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)}%`;
}
