/**
 * Colour contrast for the 3D selection: the colour a slab top actually renders in, and WCAG 2.x
 * contrast against the basemap labels drawn over it. theme.test.ts / contrast.test.ts use it so the
 * slab palette can't drift below AA again (docs/reports/night/01-dark-slab-labels.md).
 */
export type RGB = [number, number, number];

/** "#rrggbb" or "#rgb" → 0–1 sRGB channels. */
export function parseHex(hex: string): RGB {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
}

export const toHex = (c: RGB): string => `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;

/** WCAG relative luminance. */
export function luminance(c: RGB): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** WCAG contrast ratio (1–21). */
export function contrast(a: RGB | string, b: RGB | string): number {
  const la = luminance(typeof a === "string" ? parseHex(a) : a);
  const lb = luminance(typeof b === "string" ? parseHex(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Alpha-composites `top` (opacity `a`) over `under`. */
export const over = (top: RGB, a: number, under: RGB): RGB => top.map((v, i) => v * a + under[i] * (1 - a)) as RGB;

/**
 * The colour MapLibre (6.x, fill_extrusion.vertex.glsl) renders the TOP face of a fill-extrusion
 * in, under the default light (anchor viewport, position [1.15, 210°, 30°], white, intensity 0.5):
 *
 *   colorvalue  = 0.2126 r + 0.7152 g + 0.0722 b         (of the paint colour, gamma-encoded)
 *   color      += 0.03                                    (ambient)
 *   directional = mix(1 − i, max(1 − colorvalue + i, 1), dot(normal, lightpos))
 *   out         = clamp(color · directional, 0, 1)
 *
 * The top's normal is straight up, so dot = 1.15 · cos 30°, clamped to 1. A dark top is brightened
 * by up to 1.5×, which is why the paint colours below are darker than the colour seen on screen.
 */
export function extrusionTop(paint: RGB | string, intensity = 0.5): RGB {
  const c = typeof paint === "string" ? parseHex(paint) : paint;
  const colorvalue = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  const dot = Math.min(1, Math.max(0, 1.15 * Math.cos(Math.PI / 6)));
  const lit = Math.max(1 - colorvalue + intensity, 1);
  const directional = 1 - intensity + (lit - (1 - intensity)) * dot;
  return c.map((v) => Math.min(1, Math.max(0, (v + 0.03) * directional))) as RGB;
}

/** WCAG AA for normal text. */
export const AA = 4.5;
