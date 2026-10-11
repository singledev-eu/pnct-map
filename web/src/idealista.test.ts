import { describe, it, expect } from "vitest";
import {
  DEFAULT_OPTIONS,
  LAND_FILTERS,
  concelhoSlug,
  decodePolyline,
  encodePolyline,
  escapeComponent,
  filterSegment,
  municipalityUrl,
  parseShapeParam,
  polygonUrl,
  shapeParam,
  type LatLng,
} from "./idealista";

const F1 =
  "%28%28kbrfFjbgo%40%7DhYslCwv%40a%7Eg%40%7El%5ExtAikBzui%40%29%29";
const F1_POINTS: LatLng[] = [
  [37.94486, -7.90582],
  [38.07957, -7.88316],
  [38.08849, -7.67339],
  [37.92753, -7.68712],
  [37.94486, -7.90582],
];
const F2 =
  "%28%28w%7BvxFl%7Der%40qpFiCypCquEgB_%7BKlnA%7BfGnZwmIzCojC%7EoAg%7BA%7CtAeA%7CgAj_Ad%5ChyBwHdhBeO%7EtB_%7B%40jp%40%7Be%40zrBtUxtAyPd%7D%40%3FlnAhy%40eP%7EvB%7DkK%7De%40daKzuCu%7BOpfEn%60G%7DdE%60xGev%40%60kFluBl%7BBub%40%7ElEw%7CDl%7BB%29%29";

describe("polyline", () => {
  it("decodes fixture 1", () => {
    expect(parseShapeParam(F1)).toEqual(F1_POINTS);
  });

  it("encodes fixture 1 byte for byte", () => {
    expect(shapeParam(encodePolyline(F1_POINTS))).toBe(F1);
  });

  it("round-trips fixture 2 (28 points, closed ring)", () => {
    const pts = parseShapeParam(F2);
    expect(pts).toHaveLength(28);
    expect(pts[0]).toEqual(pts[pts.length - 1]);
    expect(shapeParam(encodePolyline(pts))).toBe(F2);
  });

  it("round-trips negative coordinates and large deltas", () => {
    const pts: LatLng[] = [
      [-33.86785, 151.20732],
      [89.99999, -179.99999],
      [-89.99999, 179.99999],
      [0, 0],
      [-0.00001, -0.00001],
      [41.14961, -8.61099],
    ];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
  });

  it("rounds half-up like floor(x + 0.5)", () => {
    // 0.000005 * 1e5 = 0.5 -> 1; -0.000005 * 1e5 = -0.5 -> 0 (JS Math.round)
    expect(decodePolyline(encodePolyline([[1.000005, 2]]))[0]![0]).toBe(1.00001);
  });

  it("matches the Google reference example", () => {
    expect(
      encodePolyline([
        [38.5, -120.2],
        [40.7, -120.95],
        [43.252, -126.453],
      ]),
    ).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  it("encodes the empty list as an empty string", () => {
    expect(encodePolyline([])).toBe("");
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("escapeComponent / shape param", () => {
  it("escapes ( ) ~ ! * ' with uppercase hex", () => {
    expect(escapeComponent("()~!*'")).toBe("%28%29%7E%21%2A%27");
  });

  it("leaves _ - . unescaped", () => {
    expect(escapeComponent("a_b-c.d")).toBe("a_b-c.d");
  });

  it("throws without the (( )) wrapper", () => {
    expect(() => parseShapeParam("abc")).toThrow();
    expect(() => parseShapeParam(escapeComponent("(abc)"))).toThrow();
    expect(() => parseShapeParam(escapeComponent("((abc"))).toThrow();
    expect(() => parseShapeParam(escapeComponent("abc))"))).toThrow();
  });
});

describe("polygonUrl", () => {
  const enc = encodePolyline(F1_POINTS);
  const base = "https://www.idealista.pt/areas";

  it("single land filter", () => {
    expect(
      polygonUrl(enc, {
        op: "comprar",
        type: "terrenos",
        land: ["terreno-urbanizavel"],
      }),
    ).toBe(`${base}/comprar-terrenos/com-terreno-urbanizavel/mapa-google?shape=${F1}`);
  });

  it("orders multiple filters canonically", () => {
    expect(
      polygonUrl(enc, {
        op: "comprar",
        type: "terrenos",
        land: ["terreno-urbanizavel", "terreno-urbano"],
      }),
    ).toBe(
      `${base}/comprar-terrenos/com-terreno-urbano,terreno-urbanizavel/mapa-google?shape=${F1}`,
    );
  });

  it("dedupes filters", () => {
    expect(
      filterSegment({
        op: "comprar",
        type: "terrenos",
        land: ["terreno-urbano", "terreno-urbano"],
      }),
    ).toBe("/com-terreno-urbano");
  });

  it("works for arrendar casas, comprar casas, comprar predios", () => {
    expect(polygonUrl(enc, { op: "arrendar", type: "casas", land: [] })).toBe(
      `${base}/arrendar-casas/mapa-google?shape=${F1}`,
    );
    expect(polygonUrl(enc, { op: "comprar", type: "casas", land: [] })).toBe(
      `${base}/comprar-casas/mapa-google?shape=${F1}`,
    );
    expect(polygonUrl(enc, { op: "comprar", type: "predios", land: [] })).toBe(
      `${base}/comprar-predios/mapa-google?shape=${F1}`,
    );
  });

  it("ignores land filters when type !== terrenos", () => {
    expect(
      polygonUrl(enc, {
        op: "comprar",
        type: "casas",
        land: ["terreno-urbano"],
      }),
    ).toBe(`${base}/comprar-casas/mapa-google?shape=${F1}`);
  });

  it("exposes canonical filter order and defaults", () => {
    expect(LAND_FILTERS).toEqual([
      "terreno-urbano",
      "terreno-urbanizavel",
      "terreno-nao-urbanizavel",
    ]);
    expect(DEFAULT_OPTIONS).toEqual({ op: "comprar", type: "terrenos", land: [] });
  });
});

describe("municipality", () => {
  it("slugs concelho names", () => {
    expect(concelhoSlug("Castanheira de Pêra")).toBe("castanheira-de-pera");
    expect(concelhoSlug("São João da Pesqueira")).toBe("sao-joao-da-pesqueira");
    expect(concelhoSlug("Arouca")).toBe("arouca");
    expect(concelhoSlug("Vila Nova de Cerveira")).toBe("vila-nova-de-cerveira");
    expect(concelhoSlug("  Sant'Ana -- d’Oeste ")).toBe("santana-doeste");
  });

  it("builds the municipality URL", () => {
    expect(municipalityUrl("Arouca", DEFAULT_OPTIONS)).toBe(
      "https://www.idealista.pt/comprar-terrenos/arouca/mapa-google",
    );
  });
});
