import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { lang, t } from "./strings";
// Bundled (< 1 KB): which categories exist, with source, version and licence. Built by scripts/build_protected.py,
// which leaves a category out when protected_config.py disables it; the legend, panel and credits follow.
import META from "../data/protected.meta.json";
// Content-hashed by Vite, fetched on first use: the overlay when a toggle is first switched on, the
// shares when the panel first opens. Neither is on the initial-load path.
import TOPO_URL from "../data/protected.topo.json?url";
import STATS_URL from "../data/protection.json?url";

export interface CategoryMeta {
  id: string;
  source: string;
  url: string;
  as_of: string;
  fetched_at: string;
  licence: string;
  licence_url: string | null;
  licence_confirmed: boolean;
  /** The display labels in Portuguese (scripts/protected_config.py PtLabels); `types` maps area designations. */
  pt: { source: string; as_of: string; licence: string; types: Record<string, string> };
}

export const CATEGORIES = META.categories as CategoryMeta[];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

/** Per parish (DICOFRE) or concelho (DICO): `<category>_pct`, `any_pct` (0–100) and indexes into `areas`. */
export type Protection = Record<`${string}_pct`, number> & { any_pct: number; areas: number[] };

export interface ProtectedArea {
  cat: string;
  code: string;
  name: string;
  type: string;
}

export interface ProtectionData {
  categories: string[];
  areas: ProtectedArea[];
  freguesias: Record<string, { protection: Protection }>;
  concelhos: Record<string, { protection: Protection }>;
}

export type OverlayData = Record<string, FeatureCollection<Polygon | MultiPolygon, { pnct: boolean }>>;

/** Fetches `url` once as JSON and caches the promise; a failed fetch is retried next time. */
export function cachedJson<T>(url: string, convert: (json: unknown) => T = (json) => json as T): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    promise ??= fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
        return r.json();
      })
      .then(convert)
      .catch((err: unknown) => {
        promise = null;
        throw err;
      });
    return promise;
  };
}

export const loadProtection = cachedJson<ProtectionData>(STATS_URL);

export const loadOverlay = cachedJson<OverlayData>(TOPO_URL, (json) => {
  const topo = json as Topology<Record<string, GeometryCollection<{ pnct: boolean }>>>;
  return Object.fromEntries(CATEGORY_IDS.map((id) => [id, feature(topo, topo.objects[id]) as OverlayData[string]]));
});

/** A category's display labels in the active language (the data meta carries both). */
const labels = (c: CategoryMeta) => (lang === "pt" ? c.pt : c);

export const categoryLabel = (c: CategoryMeta) => t.toggle[c.id] ?? labels(c).source;

/** An area's designation in the active language ("ZPE (Birds Directive)" → "ZPE (Diretiva Aves)"); RNAP's are Portuguese already. */
const typeLabel = (cat: string, type: string) => {
  const c = CATEGORIES.find((m) => m.id === cat);
  return (lang === "pt" && c?.pt.types[type]) || type;
};

/**
 * The areas as listed in the panel, in the given order. A Natura 2000 name designated under both
 * Directives appears twice in the data (a ZPE and a ZEC/SIC, two site codes); it becomes one line,
 * "<name> · ZPE + ZEC", at the position of its first entry.
 */
export function panelAreas(areas: ProtectedArea[]): { name: string; type: string }[] {
  const out: { name: string; type: string }[] = [];
  const natura = new Map<string, { name: string; type: string }>();
  for (const a of areas) {
    if (a.cat !== "natura") {
      out.push({ name: a.name, type: typeLabel(a.cat, a.type) });
      continue;
    }
    const seen = natura.get(a.name);
    if (seen) {
      seen.type = t.naturaBoth;
      continue;
    }
    const row = { name: a.name, type: typeLabel(a.cat, a.type) };
    natura.set(a.name, row);
    out.push(row);
  }
  return out;
}

const provider = (c: CategoryMeta) => c.source.split(":")[0];

/** "ICNF, 2026-10-17" / "EEA, end 2024". */
export const sourceLabel = (c: CategoryMeta) => `${provider(c)}, ${labels(c).as_of}`;

const licenceText = (c: CategoryMeta) => (c.licence_confirmed ? labels(c).licence : t.licenceUnconfirmed);

const escape = (s: string) => s.replace(/[&<>"]/g, (ch) => `&${({ "&": "amp", "<": "lt", ">": "gt", '"': "quot" })[ch]};`);

/** HTML for the map attribution control: "Protected areas: <ICNF RNAP> · <Natura 2000 © EEA> (CC BY 4.0)". */
export function attributionHtml(): string {
  const parts = CATEGORIES.map((c) => {
    const link = `<a href="${escape(c.url)}" target="_blank" rel="noopener noreferrer">${escape(`${t.short[c.id] ?? c.id} © ${provider(c)}`)}</a>`;
    return c.licence_confirmed ? `${link} (${escape(labels(c).licence)})` : link;
  });
  return `${escape(t.creditLead)}: ${parts.join(" · ")}`;
}

/** The categories as credit entries (phone sheet credit, About panel). */
export function credits(): { label: string; url: string; licence: string; licenceUrl: string | null; asOf: string }[] {
  return CATEGORIES.map((c) => ({ label: `${t.short[c.id] ?? c.id} © ${provider(c)}`, url: c.url, licence: licenceText(c), licenceUrl: c.licence_url, asOf: labels(c).as_of }));
}
