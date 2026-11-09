import type { LayerSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { contrast, over, parseHex } from "./contrast";
import { appLayers, DIM, PARISH_LINE_WIDTH, SELECTED_WIDTH, type FilterState } from "./layers";
import { PALETTES } from "./theme";

const LEVEL = 9;
const base: FilterState = { district: null, focus: false };
const paint = (filter: FilterState, id: string, theme: "light" | "dark" = "light") =>
  (appLayers(filter, LEVEL, PALETTES[theme]).find((l) => l.id === id) as LayerSpecification & { paint: Record<string, unknown> }).paint;
/** The value of a ["interpolate", …, zoom, low, zoom, high] expression at its last stop. */
const atLastStop = (expr: unknown) => (expr as unknown[]).at(-1);

describe("parish boundaries", () => {
  it("grow with the zoom", () => {
    const stops = (PARISH_LINE_WIDTH as unknown[]).slice(3) as number[]; // zoom, width, zoom, width…
    const widths = stops.filter((_, i) => i % 2 === 1);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(widths.at(-1)! / widths[0]).toBeGreaterThan(4);
  });

  it("stand out from the dark PNCT fill at close zoom (3:1 at full opacity, 2:1 as drawn)", () => {
    const dark = PALETTES.dark;
    const fill = over(parseHex(dark.pnct), 0.5, parseHex("#0c0c0c"));
    expect(contrast(parseHex(dark.parishLine), fill)).toBeGreaterThan(3);
    expect(contrast(over(parseHex(dark.parishLine), dark.parishLineOpacity, fill), fill)).toBeGreaterThan(2);
    expect(atLastStop(paint(base, "parish-line", "dark")["line-opacity"])).toEqual(["case", ["literal", true], dark.parishLineOpacity, dark.parishLineOpacity / 3]);
  });
});

describe("selection highlight", () => {
  it("outlines the selection with a solid line of 2–3 px in the highlight colour, in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const id of ["parish-highlight", "concelho-highlight"]) {
        const p = paint(base, id, theme);
        expect(p["line-color"]).toBe(PALETTES[theme].highlight);
        expect(p["line-dasharray"]).toBeUndefined();
        expect((p["line-width"] as unknown[])[2]).toBe(SELECTED_WIDTH); // ["case", selected, width, …]
      }
    }
    expect(SELECTED_WIDTH).toBeGreaterThanOrEqual(2);
    expect(SELECTED_WIDTH).toBeLessThanOrEqual(3);
  });

  it("keeps the selected concelho's outline past the concelho level only while the selection is flat", () => {
    const past = (filter: FilterState) => JSON.stringify(atLastStop(paint(filter, "concelho-highlight")["line-opacity"]));
    expect(past({ ...base, dim: true })).toBe(JSON.stringify(["case", ["boolean", ["feature-state", "selected"], false], 1, 0]));
    expect(past(base)).toBe(JSON.stringify(["case", ["boolean", ["feature-state", "selected"], false], 0, 0]));
  });

  it("dims everything but the selection, its concelho's parishes and the hovered feature", () => {
    const rest = (filter: FilterState, theme: "light" | "dark") => atLastStop(paint(filter, "parish-fill", theme)["fill-opacity"]) as unknown[];
    for (const theme of ["light", "dark"] as const) {
      const [plain, dimmed] = [rest(base, theme), rest({ ...base, dim: true }, theme)];
      // ["case", selected, v, outside district, v, hovered, v, grouped, v, isPnct, v, other]
      expect(dimmed[2]).toBe(plain[2]); // selected
      expect(dimmed[6]).toEqual(plain[6]); // hovered
      expect(dimmed[8]).toEqual(plain[8]); // grouped
      expect(dimmed[10]).toBeCloseTo((plain[10] as number) * DIM);
      expect(dimmed[11]).toBeCloseTo(PALETTES[theme].otherOpacity * DIM);
    }
  });
});
