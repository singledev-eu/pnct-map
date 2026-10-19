import { afterEach, describe, expect, it } from "vitest";
import html from "../index.html?raw";
import headers from "../public/_headers?raw";
import { detectLang, fill } from "./i18n";
import { formatNumber, formatPct, lang, setLang, STRINGS, t, tc, ui } from "./strings";
import { loadThemePref, nextThemePref, resolveTheme, saveThemePref, THEME_STORAGE_KEY, type ThemePref } from "./theme";

/** Every key path of `value`: nested objects by key, arrays by index, functions and strings as leaves. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
  return [`${prefix}:${typeof value}`];
}

afterEach(() => setLang("en"));

describe("strings", () => {
  it("has the same keys (and value kinds) in PT and EN", () => {
    // The Strings type already makes a missing key a compile error; this also covers the explainer
    // items (an array) and the per-category maps (Record<string, string>).
    expect(keyPaths(STRINGS.pt).sort()).toEqual(keyPaths(STRINGS.en).sort());
  });

  it("has no empty strings", () => {
    for (const l of ["pt", "en"] as const) {
      const empty = keyPaths(STRINGS[l]).filter((p) => p.endsWith(":string")).filter((p) => {
        const path = p.slice(0, -":string".length).split(/\.|\[(\d+)\]/).filter(Boolean);
        return path.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], STRINGS[l]) === "";
      });
      expect(empty, l).toEqual([]);
    }
  });

  it("switches every table with setLang", () => {
    setLang("pt");
    expect([lang, ui.legend, t.legendHeading, tc.populationHeading]).toEqual(["pt", "Legenda", "Proteção da natureza", "População"]);
    setLang("en");
    expect([lang, ui.legend, t.legendHeading, tc.populationHeading]).toEqual(["en", "Legend", "Nature protection", "Population"]);
  });

  it("formats numbers in the active locale", () => {
    expect([formatNumber(8360), formatNumber(4.2, 1), formatPct(12.3), formatPct(0.2)]).toEqual(["8,360", "4.2", "12.3%", "<0.5%"]);
    setLang("pt");
    // pt-PT groups with a (narrow) no-break space, from four digits here as in EN.
    expect(formatNumber(8360).replace(/\s/g, " ")).toBe("8 360");
    expect([formatNumber(4.2, 1), formatPct(12.3), formatPct(0.2), formatPct(100)]).toEqual(["4,2", "12,3%", "<0,5%", "100%"]);
  });
});

describe("detectLang", () => {
  const none = { param: null, stored: null, languages: [] as string[] };

  it("takes ?lang= first, then the saved choice, then the browser languages, then English", () => {
    expect(detectLang({ param: "en", stored: "pt", languages: ["pt-PT"] })).toBe("en");
    expect(detectLang({ param: "pt", stored: "en", languages: ["en-GB"] })).toBe("pt");
    expect(detectLang({ ...none, stored: "pt", languages: ["en-GB"] })).toBe("pt");
    expect(detectLang({ ...none, stored: "en", languages: ["pt-BR"] })).toBe("en");
    expect(detectLang({ ...none, languages: ["en-US", "pt-BR"] })).toBe("pt"); // any pt* in the list
    expect(detectLang({ ...none, languages: ["PT"] })).toBe("pt");
    expect(detectLang({ ...none, languages: ["es-ES", "en"] })).toBe("en");
    expect(detectLang(none)).toBe("en");
  });

  it("ignores invalid values at each step", () => {
    expect(detectLang({ param: "fr", stored: "xx", languages: ["pt"] })).toBe("pt");
    expect(detectLang({ param: "", stored: "PT", languages: [] })).toBe("en"); // values are lowercase
  });
});

describe("fill", () => {
  it("replaces {placeholders} in order and keeps the text around them", () => {
    expect(fill("© {osm} contributors.", { osm: "OSM" })).toEqual(["© ", "OSM", " contributors."]);
    expect(() => fill("{missing}", {})).toThrow(/missing/);
  });

  it("fills every About template in both languages", () => {
    const parts = { list: "L", caop: "C", licence: "B", openfreemap: "F", openmaptiles: "T", osm: "O" };
    for (const l of ["pt", "en"] as const) {
      const a = STRINGS[l].ui.about;
      for (const template of [a.pnct, a.boundaries, a.basemap]) expect(fill(template, parts).join("")).not.toMatch(/[{}]/);
    }
  });
});

describe("index.html", () => {
  const keys = [...html.matchAll(/data-i18n="(\w+)"/g), ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(",").map((p) => /:(\w+)/.exec(p)!))].map((m) => m[1]);

  it("names only plain-text ui keys in data-i18n", () => {
    expect(keys.length).toBeGreaterThan(15);
    for (const l of ["pt", "en"] as const) for (const k of keys) expect(typeof (STRINGS[l].ui as unknown as Record<string, unknown>)[k], `${l}: ${k}`).toBe("string");
  });

  it("has the inline boot script's hash in the CSP (public/_headers)", async () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts).toHaveLength(1);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scripts[0]));
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
    expect(headers).toContain(`script-src 'self' 'sha256-${hash}'`);
  });
});

/** A Storage stand-in; `broken` throws on every call, like a blocked localStorage. */
function storage(initial: Record<string, string> = {}, broken = false): Storage {
  const data = new Map(Object.entries(initial));
  const guard = <T>(f: () => T) => {
    if (broken) throw new DOMException("blocked", "SecurityError");
    return f();
  };
  return {
    getItem: (k: string) => guard(() => data.get(k) ?? null),
    setItem: (k: string, v: string) => guard(() => void data.set(k, v)),
    removeItem: (k: string) => guard(() => void data.delete(k)),
    clear: () => guard(() => data.clear()),
    key: (i: number) => guard(() => [...data.keys()][i] ?? null),
    get length() {
      return data.size;
    },
  };
}

describe("theme preference", () => {
  it("cycles Auto → Light → Dark → Auto", () => {
    const seen: ThemePref[] = ["auto"];
    for (let i = 0; i < 3; i++) seen.push(nextThemePref(seen[seen.length - 1]));
    expect(seen).toEqual(["auto", "light", "dark", "auto"]);
  });

  it("resolves Auto from the system and ignores it otherwise", () => {
    expect([resolveTheme("auto", false), resolveTheme("auto", true)]).toEqual(["light", "dark"]);
    expect([resolveTheme("light", true), resolveTheme("dark", false)]).toEqual(["light", "dark"]);
  });

  it("saves Light/Dark, forgets Auto, and reads invalid values as Auto", () => {
    const s = storage();
    saveThemePref("dark", () => s);
    expect([s.getItem(THEME_STORAGE_KEY), loadThemePref(() => s)]).toEqual(["dark", "dark"]);
    saveThemePref("auto", () => s);
    expect([s.getItem(THEME_STORAGE_KEY), loadThemePref(() => s)]).toEqual([null, "auto"]);
    expect(loadThemePref(() => storage({ [THEME_STORAGE_KEY]: "sepia" }))).toBe("auto");
  });

  it("falls back to Auto silently when storage is unavailable", () => {
    const broken = storage({}, true);
    expect(loadThemePref(() => broken)).toBe("auto");
    expect(() => saveThemePref("dark", () => broken)).not.toThrow();
    expect(
      loadThemePref(() => {
        throw new DOMException("no localStorage", "SecurityError"); // the accessor itself throws
      }),
    ).toBe("auto");
  });
});

describe("index.html theme boot script", () => {
  const boot = /<script>([\s\S]*?)<\/script>/.exec(html)![1];

  /** Runs the boot script against stubs and returns what it set on <html>. */
  function runBoot(store: Storage | null, systemDark: boolean): Record<string, string> {
    const attrs: Record<string, string> = {};
    const localStorage = new Proxy({} as Storage, {
      get: (_, prop) => {
        if (!store) throw new DOMException("blocked", "SecurityError");
        const v = Reflect.get(store, prop);
        return typeof v === "function" ? v.bind(store) : v;
      },
    });
    const document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
    const matchMedia = (q: string) => ({ matches: q === "(prefers-color-scheme: dark)" && systemDark });
    new Function("localStorage", "document", "matchMedia", boot)(localStorage, document, matchMedia);
    return attrs;
  }

  it("matches theme.ts for every stored value, system scheme and broken storage", () => {
    for (const stored of [null, "auto", "light", "dark", "bogus"]) {
      for (const systemDark of [false, true]) {
        for (const broken of [false, true]) {
          const store = broken ? null : storage(stored === null ? {} : { [THEME_STORAGE_KEY]: stored });
          const pref = broken ? "auto" : loadThemePref(() => store!);
          expect(runBoot(store, systemDark), `${stored} ${systemDark} ${broken}`).toEqual({ "data-theme": resolveTheme(pref, systemDark), "data-theme-pref": pref });
        }
      }
    }
  });
});
