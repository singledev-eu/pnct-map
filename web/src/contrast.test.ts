import { describe, expect, it } from "vitest";
import { DARK_PLACE_LABEL } from "./basemap";
import { AA, contrast, extrusionTop, over, parseHex, toHex } from "./contrast";
import { PALETTES, type Theme } from "./theme";

/**
 * Place-name colours of the basemap styles, drawn over the slabs (only basemap labels are above the
 * extrusions). Positron (light): label_village/town/city/country #000, label_other/label_state
 * #333. Dark Matter: rgb(101,101,101), lifted to DARK_PLACE_LABEL by basemap.ts. Road and water
 * names are left out: they are dim on purpose in both styles and miss 4.5:1 on the basemap itself
 * (docs/reports/night/01-dark-slab-labels.md).
 */
const PLACE_LABELS: Record<Theme, string[]> = { light: ["#000000", "#333333"], dark: [DARK_PLACE_LABEL] };
/** Basemap land (background) per theme. */
const LAND: Record<Theme, string> = { light: "#f2f3f0", dark: "#0c0c0c" };
/** Fill opacity of a PNCT parish next to the selection, in its concelho (layers.ts parishFillOpacity "grouped"). */
const NEIGHBOUR_FILL = 0.68;
/** Translucent slab opacity while an overlay is on (drill.ts GLASS). */
const GLASS = 0.55;

const tops = (theme: Theme) => {
  const p = PALETTES[theme];
  return { slab: p.slab, slabNeutral: p.slabNeutral, pop: p.pop, popNeutral: p.popNeutral };
};

/** The map around a raised slab: land, or a PNCT neighbour, under the veil. */
function veiled(theme: Theme, pnct: boolean) {
  const p = PALETTES[theme];
  const land = parseHex(LAND[theme]);
  const ground = pnct ? over(parseHex(p.pnct), NEIGHBOUR_FILL, land) : land;
  return over(parseHex(p.veil), p.veilOpacity, ground);
}

describe("extrusionTop (MapLibre's fill-extrusion lighting)", () => {
  it("matches colours read back from the rendered canvas", () => {
    // scripts/slab_contrast_shots.mjs, MapLibre 6.11.2, before the night-01 palette change.
    expect(toHex(extrusionTop("#0f8a7e"))).toBe("#189b8e");
    expect(toHex(extrusionTop("#a3adb7"))).toBe("#aab4be");
    expect(toHex(extrusionTop("#22b8a7"))).toBe("#2abfae");
    expect(toHex(extrusionTop("#5a6571"))).toBe("#6c7886");
  });
});

describe.each(["light", "dark"] as const)("slab tops, %s theme", (theme) => {
  it.each(Object.entries(tops(theme)))("place labels reach WCAG AA on the %s top", (_, paint) => {
    const top = extrusionTop(paint);
    for (const label of PLACE_LABELS[theme]) expect(contrast(label, top)).toBeGreaterThanOrEqual(AA);
  });

  it("place labels reach AA on the translucent slab (overlay on) over the veiled land", () => {
    for (const paint of [PALETTES[theme].slab, PALETTES[theme].slabNeutral]) {
      const top = over(extrusionTop(paint), GLASS, veiled(theme, false));
      for (const label of PLACE_LABELS[theme]) expect(contrast(label, top)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("the slab stands out from the veiled map around it", () => {
    const p = PALETTES[theme];
    // PNCT slab against veiled PNCT neighbours, neutral slab against veiled land. In dark both are
    // deep (the labels need it), so the fill alone separates them only a little: the rim carries
    // the edge, at ≥ 7:1 against the top.
    expect(contrast(extrusionTop(p.slab), veiled(theme, true))).toBeGreaterThanOrEqual(1.1);
    expect(contrast(extrusionTop(p.slabNeutral), veiled(theme, false))).toBeGreaterThanOrEqual(1.1);
    if (theme === "dark") {
      expect(contrast(extrusionTop(p.rim), extrusionTop(p.slab))).toBeGreaterThanOrEqual(7);
      expect(contrast(extrusionTop(p.rimNeutral), extrusionTop(p.slabNeutral))).toBeGreaterThanOrEqual(7);
    }
  });

  it("the hover pop-up is lighter than the slab it rises from", () => {
    const p = PALETTES[theme];
    expect(contrast(extrusionTop(p.pop), "#000")).toBeGreaterThan(contrast(extrusionTop(p.slab), "#000"));
    expect(contrast(extrusionTop(p.popNeutral), "#000")).toBeGreaterThan(contrast(extrusionTop(p.slabNeutral), "#000"));
  });
});

it("prints the contrast table (for the report)", () => {
  const rows: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    for (const [name, paint] of Object.entries(tops(theme))) {
      const top = extrusionTop(paint);
      const labels = PLACE_LABELS[theme].map((l) => `${l} ${contrast(l, top).toFixed(2)}`).join(", ");
      const around = name.endsWith("Neutral") ? veiled(theme, false) : veiled(theme, true);
      rows.push(`${theme} ${name} paint ${paint} → top ${toHex(top)}: ${labels}; vs veiled map ${toHex(around)} ${contrast(top, around).toFixed(2)}`);
    }
  }
  if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CONTRAST_TABLE) console.log(rows.join("\n"));
  expect(rows).toHaveLength(8);
});
