import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

export type Bounds = [number, number, number, number];

export interface Parish {
  dicofre: string;
  freguesia: string;
  concelho: string;
  distrito: string;
  pnct: boolean;
}

export interface Concelho {
  code: string;
  name: string;
  distrito: string;
  pnctCount: number;
  parishCount: number;
  parishes: Parish[];
}

type Area = Polygon | MultiPolygon;
type ParishFeature = Feature<Area, Parish>;
type ConcelhoProps = { name: string; distrito: string; pnct_count: number; parish_count: number; code: string };
type ConcelhoFeature = Feature<Area, ConcelhoProps>;

export interface MapData {
  parishGeoJSON: FeatureCollection<Area, Parish>;
  concelhoGeoJSON: FeatureCollection<Area, ConcelhoProps>;
  parishes: Map<string, Parish>;
  concelhos: Map<string, Concelho>;
  districts: string[];
  parishBounds: Map<string, Bounds>;
  concelhoBounds: Map<string, Bounds>;
  districtBounds: Map<string, Bounds>;
}

/** Numeric feature id used for feature-state (dicofre / concelho code as int). */
export const featureId = (code: string): number => Number.parseInt(code, 10);

export const concelhoCode = (dicofre: string): string => dicofre.slice(0, 4);

function extend(b: Bounds, coords: Position[]): void {
  for (const [x, y] of coords) {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
}

function geometryBounds(geom: Area): Bounds {
  const b: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const polygon of polygons) extend(b, polygon[0]);
  return b;
}

function union(a: Bounds | undefined, b: Bounds): Bounds {
  if (!a) return [...b];
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

export async function loadData(url: string): Promise<MapData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  const topo = (await response.json()) as Topology<{
    parishes: GeometryCollection<Parish>;
    concelhos: GeometryCollection<Omit<ConcelhoProps, "code">>;
  }>;

  const parishGeoJSON = feature(topo, topo.objects.parishes) as FeatureCollection<Area, Parish>;
  const rawConcelhos = feature(topo, topo.objects.concelhos) as FeatureCollection<Area, ConcelhoProps>;

  const parishes = new Map<string, Parish>();
  const concelhos = new Map<string, Concelho>();
  const parishBounds = new Map<string, Bounds>();
  const concelhoBounds = new Map<string, Bounds>();
  const districtBounds = new Map<string, Bounds>();
  const codeByName = new Map<string, string>();

  for (const f of parishGeoJSON.features as ParishFeature[]) {
    const p = f.properties;
    const code = concelhoCode(p.dicofre);
    f.id = featureId(p.dicofre);
    parishes.set(p.dicofre, p);
    const bounds = geometryBounds(f.geometry);
    parishBounds.set(p.dicofre, bounds);
    concelhoBounds.set(code, union(concelhoBounds.get(code), bounds));
    districtBounds.set(p.distrito, union(districtBounds.get(p.distrito), bounds));
    codeByName.set(`${p.distrito}|${p.concelho}`, code);
    let c = concelhos.get(code);
    if (!c) {
      c = { code, name: p.concelho, distrito: p.distrito, pnctCount: 0, parishCount: 0, parishes: [] };
      concelhos.set(code, c);
    }
    c.parishes.push(p);
    c.parishCount += 1;
    if (p.pnct) c.pnctCount += 1;
  }

  for (const f of rawConcelhos.features as ConcelhoFeature[]) {
    const code = codeByName.get(`${f.properties.distrito}|${f.properties.name}`);
    if (!code) throw new Error(`No parishes for concelho ${f.properties.name}`);
    f.properties.code = code;
    f.id = featureId(code);
  }

  for (const c of concelhos.values()) {
    c.parishes.sort((a, b) => a.freguesia.localeCompare(b.freguesia, "pt"));
  }

  const districts = [...districtBounds.keys()].sort((a, b) => a.localeCompare(b, "pt"));
  return {
    parishGeoJSON,
    concelhoGeoJSON: rawConcelhos,
    parishes,
    concelhos,
    districts,
    parishBounds,
    concelhoBounds,
    districtBounds,
  };
}
