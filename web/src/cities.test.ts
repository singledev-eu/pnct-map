import { describe, expect, it } from "vitest";
import CITIES from "../data/cities.json";
import type { SymbolLayerSpecification } from "maplibre-gl";
import { cityLayers, contextTowns, distanceKm, edgeSpot, seatFilter, SEAT_PADDING, type CitiesData } from "./cities";
import { PALETTES } from "./theme";

const data = CITIES as unknown as CitiesData;
const ERRA_CENTRE: [number, number] = [-8.55, 38.86];

describe("cities", () => {
  it("has 278 seats and the 18 district capitals", () => {
    expect(data.features).toHaveLength(278);
    expect(data.features.filter((f) => f.properties.capital)).toHaveLength(18);
  });

  it("points Erra at Coruche (its seat) and Santarém (the nearest capital)", () => {
    expect(contextTowns(data, "1409", ERRA_CENTRE).map((t) => t.name)).toEqual(["Coruche", "Santarém"]);
    // A capital's own concelho: the seat is the capital, listed once.
    expect(contextTowns(data, "1416", [-8.69, 39.24]).map((t) => t.name)).toEqual(["Santarém"]);
  });

  it("measures great-circle distance", () => {
    expect(distanceKm([-9.14, 38.72], [-8.61, 41.15])).toBeCloseTo(274, -1); // Lisboa–Porto
  });

  it("puts a pointer on the edge towards an off-screen point, and none for a point in view", () => {
    const box = { x0: 0, y0: 0, x1: 200, y1: 100 };
    expect(edgeSpot([50, 50], box, 10)).toBeNull();
    expect(edgeSpot([400, 50], box, 10)).toEqual({ x: 190, y: 50, angle: 0 });
    const up = edgeSpot([100, -300], box, 10)!;
    expect(up.y).toBeCloseTo(10);
    expect(up.angle).toBeCloseTo(-90);
  });

  it("shows capitals from the country view and seats from before the parish level", () => {
    const [seats, selected, capitals] = cityLayers(PALETTES.light, 9, true);
    expect(capitals.minzoom).toBe(0);
    expect(selected.minzoom).toBe(0);
    expect(seats.minzoom).toBe(7.5);
    expect(cityLayers(PALETTES.dark, 9, false)[0].layout?.visibility).toBe("none");
  });

  it("hides colliding seat labels, and always draws the capitals and the selection's seat", () => {
    for (const theme of ["light", "dark"] as const) {
      const [seats, selected, capitals] = cityLayers(PALETTES[theme], 9, true, "1409") as SymbolLayerSpecification[];
      // A seat is drawn whole or not at all, with clearance around its name.
      expect(seats.layout).toMatchObject({ "icon-allow-overlap": false, "text-optional": false, "icon-padding": SEAT_PADDING });
      expect(seats.layout?.["text-allow-overlap"]).toBeUndefined();
      // Later layers are placed first: capitals, then the selection's seat, then the rest.
      expect([seats.id, selected.id, capitals.id]).toEqual(["city-seats", "city-selected", "city-capitals"]);
      for (const l of [selected, capitals]) expect(l.layout).toMatchObject({ "icon-allow-overlap": true, "text-optional": true });
      // Coruche (1409) is in the selected layer only.
      expect(JSON.stringify(selected.filter)).toContain("1409");
      expect(seats.filter).toEqual(seatFilter("1409"));
    }
  });
});
