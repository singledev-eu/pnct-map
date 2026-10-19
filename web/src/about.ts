/**
 * The About dialog (index.html #about), rendered in the active language: what the map shows, the
 * data sources with their full, linked attribution (the protected-area credits from
 * protected.meta.json), and the Idealista note. Re-rendered on a language switch.
 */
import { fill, rich } from "./i18n";
import { h } from "./panel";
import { credits } from "./protected";
import { t, ui } from "./strings";

const IEFP_LIST = "https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf";
const CAOP = "https://www.dgterritorio.gov.pt/cartografia/cartografia-tematica/caop";
const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

const link = (href: string, text: string) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);

export function renderAbout(dialog: HTMLDialogElement): void {
  const a = ui.about;
  const protectedCredits = h(
    "li",
    { id: "about-protected", "data-testid": "about-protected" },
    h("strong", {}, `${t.aboutHeading}:`),
    " ",
    ...credits().flatMap((c, i) => [i ? "; " : "", link(c.url, c.label), ` (${c.asOf}, `, c.licenceUrl ? link(c.licenceUrl, c.licence) : c.licence, ")"]),
    `. ${t.aboutBody}`,
  );
  dialog.replaceChildren(
    h(
      "form",
      { method: "dialog" },
      h("h2", { id: "about-title" }, a.title),
      h("p", {}, ...rich(a.intro)),
      h("p", {}, ...rich(a.unofficial)),
      h("h3", {}, a.sourcesHeading),
      h(
        "ul",
        {},
        h("li", {}, h("strong", {}, a.pnctLabel), " ", ...fill(a.pnct, { list: link(IEFP_LIST, a.listLink) })),
        h("li", {}, h("strong", {}, a.boundariesLabel), " ", ...fill(a.boundaries, { caop: link(CAOP, "CAOP 2025"), licence: link(CC_BY, "CC BY 4.0") })),
        h(
          "li",
          {},
          h("strong", {}, a.basemapLabel),
          " ",
          ...fill(a.basemap, {
            openfreemap: link("https://openfreemap.org", "OpenFreeMap"),
            openmaptiles: link("https://openmaptiles.org", "OpenMapTiles"),
            osm: link("https://www.openstreetmap.org/copyright", "OpenStreetMap"),
          }),
        ),
        protectedCredits,
      ),
      h("p", { class: "muted" }, a.notAffiliated),
      h("button", { type: "submit", class: "button" }, a.close),
    ),
  );
}
