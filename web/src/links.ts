import type { Concelho, Parish } from "./data";
import { municipalityUrl, polygonUrl, type SearchOptions } from "./idealista";
import SHAPES_URL from "../data/shapes.json?url"; // content-hashed by Vite

export interface PropertyLink {
  label: string;
  url: string;
  description?: string;
  /** Caveat shown under the link, e.g. that the area is approximate. */
  note?: string;
}

export interface ParishShape {
  shape: string; // Encoded Polyline, closed ring, no (( )) wrapper, not URL-encoded
  points: number;
  approx: boolean;
  method: "single" | "largest" | "hull";
}

export type Shapes = Record<string, ParishShape>;

let shapesPromise: Promise<Shapes> | null = null;

/** Fetches shapes.json once (on first use) and caches it; a failed fetch is retried next time. */
export function loadShapes(): Promise<Shapes> {
  shapesPromise ??= fetch(SHAPES_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${SHAPES_URL}: ${r.status}`);
      return r.json() as Promise<Shapes>;
    })
    .catch((err: unknown) => {
      shapesPromise = null;
      throw err;
    });
  return shapesPromise;
}

const isWholeConcelhoPnct = (c: Concelho) => c.parishCount > 0 && c.pnctCount === c.parishCount;

function municipalityLink(c: Concelho, opts: SearchOptions): PropertyLink {
  return {
    label: `List view for all of ${c.name}`,
    url: municipalityUrl(c.name, opts),
    description: "The whole concelho is PNCT, so its Idealista municipality page matches it.",
  };
}

/**
 * Property-search links for a parish. Non-PNCT parishes get none. PNCT parishes
 * get a polygon search; if the whole concelho is PNCT, also its municipality page.
 */
export async function getLinks(parish: Parish, concelho: Concelho, opts: SearchOptions): Promise<PropertyLink[]> {
  if (!parish.pnct) return [];
  const shape = (await loadShapes())[parish.dicofre];
  const links: PropertyLink[] = [];
  if (shape) {
    links.push({
      label: "Search this parish on Idealista",
      url: polygonUrl(shape.shape, opts),
      description: "Map search limited to the parish outline.",
      note: shape.approx ? "Approximate area: this parish has detached parts." : undefined,
    });
  }
  if (isWholeConcelhoPnct(concelho)) links.push(municipalityLink(concelho, opts));
  return links;
}

/** Concelho-level links: only when every parish of the concelho is PNCT. */
export function getConcelhoLinks(concelho: Concelho, opts: SearchOptions): PropertyLink[] {
  return isWholeConcelhoPnct(concelho) ? [municipalityLink(concelho, opts)] : [];
}
