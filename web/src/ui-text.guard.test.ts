import { describe, expect, it } from "vitest";
import html from "../index.html?raw";

/**
 * Guard: no UI text outside the strings module (strings.ts, strings.en.ts, strings.pt.ts).
 *
 * A heuristic, not a parser. It reads every non-test module in src/ and flags a string literal
 * (quotes or template text, with ${…} removed) that
 *   - reads like prose: a capitalised word followed by another word ("Close panel"), three
 *     lowercase words in a row ("opens in a"), or an ellipsis ("Loading…"); or
 *   - is a single capitalised word given as UI text: an h(tag, {…}, "Word") child, or assigned to
 *     textContent / title / placeholder / aria-label.
 * Literals on lines that log or throw (console.*, new Error, throw) are skipped: they're for
 * developers. Limits: a lowercase single word ("close"), text built by concatenation, or text in
 * a variable assigned elsewhere isn't caught; proper names given as link text ("OpenFreeMap",
 * "CAOP 2025") pass on purpose. index.html is checked separately: no text nodes or text attributes
 * in <body> except through data-i18n / data-i18n-attr.
 */

const SOURCES = import.meta.glob<string>(["./*.ts", "!./*.test.ts", "!./strings.ts", "!./strings.*.ts"], { query: "?raw", import: "default", eager: true });

interface Literal {
  text: string;
  line: number;
}

/** String literals of `src` (quotes and template text), skipping comments and regex literals roughly. */
function literals(src: string): Literal[] {
  const out: Literal[] = [];
  let line = 1;
  let i = 0;
  const lineAt = () => line;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "\n") line++;
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      line += (src.slice(i, end).match(/\n/g) ?? []).length;
      i = end + 2;
      continue;
    }
    if (ch === "/" && /[(,=:[!&|?{};]\s*$/.test(src.slice(Math.max(0, i - 20), i))) {
      // a regex literal: skip to its closing slash
      i++;
      let inClass = false;
      while (i < src.length && (src[i] !== "/" || inClass)) {
        if (src[i] === "\\") i++;
        else if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        i++;
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const start = lineAt();
      let text = "";
      i++;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === "\\") {
          text += src[i + 1];
          i += 2;
          continue;
        }
        if (ch === "`" && src[i] === "$" && src[i + 1] === "{") {
          let depth = 1;
          i += 2;
          while (i < src.length && depth) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            else if (src[i] === "\n") line++;
            i++;
          }
          text += " ";
          continue;
        }
        if (src[i] === "\n") line++;
        text += src[i];
        i++;
      }
      i++;
      out.push({ text, line: start });
      continue;
    }
    i++;
  }
  return out;
}

const PROSE = [/\p{Lu}\p{Ll}+[  ]+\p{L}{2,}/u, /(?:^|[  ])\p{Ll}{2,}[  ]+\p{Ll}{2,}[  ]+\p{Ll}{2,}(?:[  ]|$)/u, /…/];
const DEV_LINE = /console\.|new Error\(|throw /;
const SINGLE_WORD_UI = [
  /\bh\(\s*"\w+",\s*\{[^}]*\},\s*"(\p{Lu}\p{Ll}+)"/gu,
  /\.(?:textContent|title|placeholder)\s*=\s*"(\p{Lu}\p{Ll}+)"/gu,
  /"aria-label":\s*"(\p{Lu}\p{Ll}+)"/gu,
];

/** UI-looking text in one module: "line: text" per finding. */
export function findUiText(src: string): string[] {
  const lines = src.split("\n");
  const found = literals(src)
    .filter((l) => !DEV_LINE.test(lines[l.line - 1] ?? ""))
    .filter((l) => PROSE.some((re) => re.test(l.text)))
    .map((l) => `${l.line}: ${l.text}`);
  for (const re of SINGLE_WORD_UI) {
    for (const m of src.matchAll(re)) found.push(`${src.slice(0, m.index).split("\n").length}: ${m[1]}`);
  }
  return found;
}

describe("UI text guard", () => {
  it("finds no UI text outside the strings module", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(15);
    const findings = Object.entries(SOURCES).flatMap(([file, src]) => findUiText(src).map((f) => `${file}:${f}`));
    expect(findings).toEqual([]);
  });

  it("catches the kinds of text it is meant to catch", () => {
    const sample = [
      'h("h3", {}, "Property search");',
      'const close = h("button", { "aria-label": "Close panel" }, "×");',
      'status.textContent = "Loading links…";',
      'h("summary", {}, "Show all");',
      "el.title = `Show all of ${name}`;",
      'li.textContent = "Freguesia";',
    ].join("\n");
    expect(findUiText(sample)).toHaveLength(6);
  });

  it("leaves code strings, URLs, comments and developer messages alone", () => {
    const sample = [
      '// A comment with Several Words in it…',
      'h("p", { class: "muted links-status", "data-testid": "property-links" });',
      'const q = window.matchMedia("(prefers-color-scheme: dark)");',
      'fetch("https://www.iefp.pt/documents/Territorios+PNCT.pdf");',
      'console.error("Could not load the thing");',
      'if (!r.ok) throw new Error(`Failed to load ${url}`);',
      'const re = /Some Words here/;',
      'link(OSM, "OpenStreetMap"); link(CAOP, "CAOP 2025");',
    ].join("\n");
    expect(findUiText(sample)).toEqual([]);
  });
});

describe("index.html", () => {
  const body = html.slice(html.indexOf("<body>"), html.indexOf("</body>")).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");

  it("has no text of its own in <body>", () => {
    const text = body.replace(/<[^>]+>/g, " ").trim();
    expect(text).toBe("");
  });

  it("sets text attributes only through data-i18n-attr", () => {
    expect([...body.matchAll(/\s(aria-label|title|placeholder|alt)="[^"]*"/g)].map((m) => m[0].trim())).toEqual([]);
  });
});
