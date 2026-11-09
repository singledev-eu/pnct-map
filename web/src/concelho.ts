/**
 * The concelho card: population and housing/income stat tiles (INE) and câmara contacts, from web/data/concelhos.json
 * (scripts/build_concelhos.py). One component in two places: the concelho panel shows it directly,
 * the parish panel in a collapsed <details> that renders it on first open. The data file is fetched
 * on the first card that renders, never on the initial load.
 */
import type { Concelho } from "./data";
import { h } from "./panel";
import { cachedJson } from "./protected";
import { formatNumber, ISSUE, tc, ui } from "./strings";
// Content-hashed by Vite, fetched on first use.
import DATA_URL from "../data/concelhos.json?url";

export interface Contacts {
  website: string;
  email: string;
  phone: string;
  urbanism_url: string | null;
  /** null where the câmara publishes no PDM page at all; the card then points to SNIT. */
  pdm_url: string | null;
  /** From the curation review: the link shows the PDM in force, or PDM documents whose version isn't stated. null without a pdm_url. */
  pdm_status: "in_force" | "unclear" | null;
  as_of: string;
}

export interface ConcelhoFacts {
  population: number | null;
  population_2011: number | null;
  population_2021: number | null;
  census_change: number | null;
  density: number | null;
  ageing_index: number | null;
  /** Housing and income (INE; card v2). Optional: data files from before v2 lack them. */
  sale_price_m2?: number | null;
  income_per_taxpayer?: number | null;
  monthly_earnings?: number | null;
  contacts: Contacts | null;
}

export interface ConcelhoData {
  estimate_year: number;
  national: { ageing_index: number; population: number; sale_price_m2?: number | null; income_per_taxpayer?: number | null; monthly_earnings?: number | null };
  /** The period of each housing/income field ("2025"). */
  periods?: Record<"sale_price_m2" | "income_per_taxpayer" | "monthly_earnings", string>;
  snit_url: string;
  issues_url: string;
  concelhos: Record<string, ConcelhoFacts>;
}

export const loadConcelhos = cachedJson<ConcelhoData>(DATA_URL);

const number = (value: number, digits = 0) => formatNumber(value, digits);
/** "−14.0%", "+3.1%", "0.0%" ("−14,0%" in PT): one decimal, a real minus sign. */
export const signedPct = (value: number) => `${formatNumber(value, 1, { signDisplay: "exceptZero" }).replace("-", "−")}%`;
/** The ageing index as a ratio, one decimal: 417.9 → "4.2" (older people per child). */
export const ageingRatio = (index: number) => number(index / 100, 1);
/** The ⓘ text with the index itself, rounded ("Ageing index 418 (Portugal: 189): …"). */
export const ageingHelpText = (index: number, national: number) => tc.ageingHelp(number(index), number(national));
/** How far `value` is from Portugal's, as a whole signed percentage of the national figure: "−80%", "+121%", "0%". */
export const deltaPct = (value: number, national: number) => `${formatNumber((value / national - 1) * 100, 0, { signDisplay: "exceptZero" }).replace("-", "−")}%`;
/** One decimal below 100 people/km², none above. */
const densityText = (value: number) => number(value, value < 100 ? 1 : 0);
/** "October 2026" ("outubro de 2026") from "2026-10-18". */
const monthYear = (iso: string) => new Intl.DateTimeFormat(ui.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** A new-tab link; `hidden` is read before the text by screen readers only ("Website: cm-x.pt"). */
const external = (href: string, text: string, attrs: Record<string, string> = {}, hidden = "") =>
  h("a", { href, target: "_blank", rel: "noopener noreferrer", ...attrs }, hidden ? h("span", { class: "visually-hidden" }, hidden) : null, text, h("span", { "aria-hidden": "true" }, " ↗"), h("span", { class: "visually-hidden" }, ` (${tc.newTab})`));
/** "cm-idanhanova.pt" from "https://www.cm-idanhanova.pt/". */
export const domainOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/**
 * One figure as a stat tile: the number large, what it counts, its year, and, where Portugal has
 * the same figure, the difference from it (deltaPct) with Portugal's value. A missing value is "—"
 * with a note, never a made-up number, and has no difference. `extra` goes after the label (the ⓘ).
 */
function tile(
  id: string,
  v: number | null,
  render: (v: number) => string,
  label: string,
  year: string,
  national: number | null = null,
  extra: Node | null = null,
): HTMLElement {
  const parts: (Node | string)[] =
    v === null
      ? [h("span", { class: "stat-value" }, tc.missing), " ", h("span", { class: "stat-label" }, label), " ", h("span", { class: "stat-meta" }, `(${tc.missingNote})`)]
      : [h("span", { class: "stat-value" }, render(v)), " ", h("span", { class: "stat-label" }, label, extra ? " " : null, extra), " ", h("span", { class: "stat-meta" }, year)];
  if (v !== null && national !== null && national !== 0) {
    const [pct, ...rest] = tc.vsPortugal(deltaPct(v, national), render(national)).split(" ");
    parts.push(" ", h("span", { class: "stat-delta", "data-testid": `${id}-delta` }, h("strong", {}, pct), ` ${rest.join(" ")}`));
  }
  return h("li", { class: "stat-tile", "data-testid": id }, ...parts);
}

/** A missing value in the issue body (tc.missing is the same in the UI). */
const MISSING = "—";

/** The pre-filled "Report outdated info" issue: title, body (DICO, current values, as_of) and the data label. English in both languages. */
export function issueUrl(base: string, c: Pick<Concelho, "code" | "name">, f: ConcelhoFacts | undefined, year: number): string {
  const k = f?.contacts;
  const current = [
    `${ISSUE.fields.website}: ${k?.website ?? MISSING}`,
    `${ISSUE.fields.email}: ${k?.email ?? MISSING}`,
    `${ISSUE.fields.phone}: ${k?.phone ?? MISSING}`,
    `${ISSUE.fields.urbanism}: ${k?.urbanism_url ?? MISSING}`,
    `${ISSUE.fields.pdm}: ${k?.pdm_url ?? MISSING}`,
    `${ISSUE.fields.pdmStatus}: ${k?.pdm_status ?? MISSING}`,
    `${ISSUE.fields.population(year)}: ${f?.population ?? MISSING}`,
  ];
  const params = new URLSearchParams({ title: ISSUE.title(c.name, c.code), body: ISSUE.body(c.name, c.code, current, k?.as_of ?? MISSING), labels: "data" });
  return `${base}?${params}`;
}

function populationBlock(data: ConcelhoData, f: ConcelhoFacts | undefined, partly: boolean): HTMLElement {
  const n = (key: keyof ConcelhoFacts) => (f?.[key] ?? null) as number | null;
  const ageing = n("ageing_index");
  const nationalAgeing = data.national.ageing_index;
  const year = String(data.estimate_year);
  const help = ageing === null ? null : h("details", { class: "concelho-help" }, h("summary", { "aria-label": tc.ageingHelpLabel, title: tc.ageingHelpLabel }, "ⓘ"), h("p", {}, ageingHelpText(ageing, nationalAgeing)));
  return h(
    "section",
    { class: "concelho-population", "data-testid": "concelho-population" },
    h("h3", {}, tc.populationHeading),
    h(
      "ul",
      { class: "stat-tiles" },
      tile("concelho-people", n("population"), (v) => number(v), tc.peopleLabel, year),
      tile("concelho-change", n("census_change"), signedPct, tc.censusChangeLabel, tc.censusPeriod),
      tile("concelho-density", n("density"), densityText, tc.densityLabel, year),
      tile("concelho-ageing", ageing, ageingRatio, tc.ageingLabel, year, nationalAgeing, help),
    ),
    partly ? h("p", { class: "muted concelho-note", "data-testid": "concelho-whole" }, tc.wholeConcelho) : null,
    h("p", { class: "disclaimer" }, tc.populationSource(data.estimate_year)),
  );
}

/** "1 042 €" / "€1,042": whole euros in the active locale. */
const euros = (v: number) => formatNumber(Math.round(v), 0, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Housing and income (card v2): median sale price per m², declared income per taxpayer, average earnings; each against Portugal's value. */
function moneyBlock(data: ConcelhoData, f: ConcelhoFacts | undefined): HTMLElement | null {
  const p = data.periods;
  if (!p) return null;
  type Key = "sale_price_m2" | "income_per_taxpayer" | "monthly_earnings";
  const money = (key: Key, label: string, render: (v: number) => string = euros) => tile(`concelho-${key.replace(/_/g, "-")}`, f?.[key] ?? null, render, label, p[key], data.national[key] ?? null);
  return h(
    "section",
    { class: "concelho-money", "data-testid": "concelho-money" },
    h("h3", {}, tc.moneyHeading),
    h(
      "ul",
      { class: "stat-tiles" },
      money("sale_price_m2", tc.salePriceLabel, (v) => `${euros(v)}/m²`),
      money("income_per_taxpayer", tc.incomeLabel),
      money("monthly_earnings", tc.earningsLabel),
    ),
    h("p", { class: "disclaimer" }, tc.moneySource(p.sale_price_m2, p.income_per_taxpayer, p.monthly_earnings)),
  );
}

function contactsBlock(data: ConcelhoData, c: Concelho, f: ConcelhoFacts | undefined): HTMLElement {
  const k = f?.contacts ?? null;
  const report = external(issueUrl(data.issues_url, c, f, data.estimate_year), tc.report, { "data-testid": "concelho-report" });
  const snit = h("p", { class: "concelho-snit" }, external(data.snit_url, tc.snit, { "data-testid": "concelho-snit" }));
  if (!k) {
    return h(
      "section",
      { class: "concelho-contacts", "data-testid": "concelho-contacts", "data-state": "missing" },
      h("h3", {}, tc.contactsHeading),
      h("p", { class: "muted", "data-testid": "concelho-not-yet" }, tc.notYet),
      snit,
      h("p", { class: "disclaimer" }, report),
    );
  }
  return h(
    "section",
    { class: "concelho-contacts", "data-testid": "concelho-contacts", "data-state": "curated" },
    h("h3", {}, tc.contactsHeading),
    h(
      "ul",
      { class: "concelho-links" },
      h("li", {}, external(k.website, domainOf(k.website), { "data-testid": "concelho-website" }, `${tc.website}: `)),
      h("li", {}, h("a", { href: `mailto:${k.email}` }, k.email)),
      h("li", {}, h("a", { href: `tel:${k.phone.replace(/\s/g, "")}` }, k.phone)),
      h("li", {}, k.urbanism_url ? external(k.urbanism_url, tc.urbanism) : h("span", { class: "muted" }, `${tc.missing} ${tc.noUrbanism}`)),
      h("li", {}, ...pdmItem(k)),
    ),
    snit,
    h("p", { class: "disclaimer" }, `${tc.contactsSource(monthYear(k.as_of))} · `, report),
  );
}

/** The PDM link: "PDM in force", or "PDM documents" with a note when the review couldn't tell which version is in force. */
function pdmItem(k: Contacts): Node[] {
  if (!k.pdm_url) return [h("span", { class: "muted", "data-testid": "concelho-no-pdm" }, `${tc.missing} ${tc.noPdm}`)];
  if (k.pdm_status === "in_force") return [external(k.pdm_url, tc.pdm, { "data-testid": "concelho-pdm", "data-status": "in_force" })];
  return [
    external(k.pdm_url, tc.pdmDocuments, { "data-testid": "concelho-pdm", "data-status": "unclear" }),
    h("span", { class: "muted concelho-pdm-note", "data-testid": "concelho-pdm-unclear" }, tc.pdmUnclear),
  ];
}

/** The card for `c`: "Loading…" until the data arrives, then the population and contacts blocks. */
export function concelhoCard(c: Concelho): HTMLElement {
  const card = h("div", { class: "concelho-card", "data-testid": "concelho-card", "aria-busy": "true" }, h("p", { class: "muted" }, tc.loading));
  loadConcelhos()
    .then((data) => {
      if (!card.isConnected) return; // the panel moved on
      const f = data.concelhos[c.code];
      const money = moneyBlock(data, f);
      card.replaceChildren(populationBlock(data, f, c.pnctCount > 0 && c.pnctCount < c.parishCount), ...(money ? [money] : []), contactsBlock(data, c, f));
      card.removeAttribute("aria-busy");
    })
    .catch((err: unknown) => {
      if (!card.isConnected) return;
      console.error(err);
      card.replaceChildren(h("p", { class: "muted" }, tc.loadError));
      card.removeAttribute("aria-busy");
    });
  return card;
}

/** The parish panel's collapsed "Concelho: <name>" section; the card (and the data) load on first open. */
export function concelhoDetails(c: Concelho): HTMLElement {
  const details = h("details", { class: "concelho-details", "data-testid": "concelho-details" }, h("summary", {}, tc.parishSummary(c.name)));
  details.addEventListener("toggle", () => {
    if (details.open && !details.querySelector(".concelho-card")) details.append(concelhoCard(c));
  });
  return h("section", {}, details);
}
