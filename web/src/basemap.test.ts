import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { latinLabels } from "./basemap";

// The positron label expression (OpenFreeMap, 2026-10).
const POSITRON_LABEL = [
  "case",
  ["has", "name:nonlatin"],
  ["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
  ["coalesce", ["get", "name_en"], ["get", "name"]],
];

const style = (layers: unknown[]) => ({ version: 8, sources: {}, layers }) as unknown as StyleSpecification;

describe("latinLabels", () => {
  it("drops name:nonlatin from label text and keeps the fallback", () => {
    const out = latinLabels(undefined, style([{ id: "label_city", type: "symbol", source: "x", layout: { "text-field": POSITRON_LABEL, "text-size": 12 } }]));
    const layer = out.layers[0] as { layout: Record<string, unknown> };
    expect(layer.layout["text-field"]).toEqual(["case", ["has", "name:nonlatin"], ["get", "name:latin"], ["coalesce", ["get", "name_en"], ["get", "name"]]]);
    expect(layer.layout["text-size"]).toBe(12);
    expect(JSON.stringify(layer.layout["text-field"])).not.toContain('["get","name:nonlatin"]');
  });

  it("handles legacy token strings and leaves other layers alone", () => {
    const fill = { id: "water", type: "fill", source: "x", paint: { "fill-color": "#ccc" } };
    const shield = { id: "shield", type: "symbol", source: "x", layout: { "text-field": ["to-string", ["get", "ref"]] } };
    const legacy = { id: "old", type: "symbol", source: "x", layout: { "text-field": "{name:latin}\n{name:nonlatin}" } };
    const out = latinLabels(undefined, style([fill, shield, legacy]));
    expect(out.layers[0]).toBe(fill);
    expect((out.layers[1] as typeof shield).layout["text-field"]).toEqual(["to-string", ["get", "ref"]]);
    expect((out.layers[2] as typeof legacy).layout["text-field"]).toBe("{name:latin}");
  });
});
