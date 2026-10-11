import { DEFAULT_OPTIONS, LAND_FILTERS, type LandFilter, type Operation, type PropertyType, type SearchOptions } from "./idealista";
import { writeHash } from "./hash";

/**
 * Property-search selector state. Source of truth on load: URL hash, then
 * localStorage, then defaults. Changes are written to both. In the hash, only
 * non-default values appear: op=arrendar, t=casas|predios, land=urbano,urbanizavel.
 */
const STORAGE_KEY = "pnct-map:search-options";
const OPS: readonly Operation[] = ["comprar", "arrendar"];
const TYPES: readonly PropertyType[] = ["terrenos", "casas", "predios"];
const short = (f: LandFilter) => f.replace(/^terreno-/, "");

function sanitize(raw: Partial<Record<"op" | "type", unknown>> & { land?: unknown }): SearchOptions {
  const op = OPS.includes(raw.op as Operation) ? (raw.op as Operation) : DEFAULT_OPTIONS.op;
  const type = TYPES.includes(raw.type as PropertyType) ? (raw.type as PropertyType) : DEFAULT_OPTIONS.type;
  const wanted = Array.isArray(raw.land) ? raw.land.map(String) : [];
  const land = LAND_FILTERS.filter((f) => wanted.includes(f) || wanted.includes(short(f)));
  return { op, type, land };
}

function fromHash(): SearchOptions | null {
  const p = new URLSearchParams(window.location.hash.slice(1));
  if (!p.has("op") && !p.has("t") && !p.has("land")) return null;
  return sanitize({ op: p.get("op") ?? undefined, type: p.get("t") ?? undefined, land: (p.get("land") ?? "").split(",").filter(Boolean) });
}

function fromStorage(): SearchOptions | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function loadOptions(): SearchOptions {
  return fromHash() ?? fromStorage() ?? { ...DEFAULT_OPTIONS, land: [] };
}

export function saveOptions(opts: SearchOptions): void {
  writeHash({
    op: opts.op === DEFAULT_OPTIONS.op ? null : opts.op,
    t: opts.type === DEFAULT_OPTIONS.type ? null : opts.type,
    land: opts.land.length ? opts.land.map(short).join(",") : null,
  });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
  } catch {
    // Storage may be unavailable (private mode, blocked); the hash still carries the state.
  }
}
