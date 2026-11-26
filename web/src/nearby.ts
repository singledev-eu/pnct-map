/**
 * The "Nearby services" block (services.ts data) for the parish and concelho panels and the land check:
 * one stat tile per category with the drive time large, the road distance small, then the nearest
 * facility (a button that shows it on the map) and an OpenStreetMap link. A straight-line row (land
 * check, no road near the spot) shows the distance large and says "in a straight line"; a row without a
 * value shows "—" and "not available". The data loads on the first block that renders.
 */
import { h } from "./panel";
import { categoryLabel, type CheckServices, type Facility, facilityName, formatDuration, formatKm, loadServices, type Nearest, osmUrl, resultsFor, rowSummary, SOURCES } from "./services";
import { formatDate, tn } from "./strings";

export interface NearbyContext {
  /** The concelho's name for a DICO (data.ts), shown after the facility's name. */
  concelhoName: (code: string) => string | undefined;
  /** Flies to the facility and marks it (main.ts). */
  onShow?: (f: Facility) => void;
}

/** "25 November 2026" for the OSM extract; "May 2023" for the SNS period. */
const monthYear = (ym: string) => formatDate(`${ym}-01`).replace(/^1 (de )?/, "");

function tile(n: Nearest, ctx: NearbyContext): HTMLElement {
  const label = h("span", { class: "service-label" }, categoryLabel(n.cat));
  const attrs = { class: "stat-tile service-tile", "data-testid": `service-${n.cat}`, "data-cat": n.cat, "data-mode": n.facility ? n.mode : "none" };
  if (!n.facility || n.metres === null) {
    return h("li", attrs, label, h("span", { class: "stat-value" }, tn.missing), h("span", { class: "stat-meta" }, tn.notAvailable));
  }
  const f = n.facility;
  const name = facilityName(f);
  const big = n.mode === "road" && n.seconds !== null ? formatDuration(n.seconds) : formatKm(n.metres);
  const small = n.mode === "road" && n.seconds !== null ? tn.byRoad(formatKm(n.metres)) : n.mode === "line" ? tn.straightLabel : "";
  const show = h("button", { type: "button", class: "link-button service-name", "aria-label": tn.showOnMap(name), "data-testid": `service-show-${n.cat}` }, name);
  show.addEventListener("click", () => ctx.onShow?.(f));
  const where = ctx.concelhoName(f.concelho);
  const osm = h(
    "a",
    { href: osmUrl(f), target: "_blank", rel: "noopener noreferrer", class: "service-osm", "aria-label": tn.openOsmLabel(name), title: tn.openOsmLabel(name) },
    tn.openOsm,
    h("span", { "aria-hidden": "true" }, " ↗"),
  );
  const li = h(
    "li",
    { ...attrs, "data-facility": String(f.index), "data-seconds": n.seconds === null ? "" : String(n.seconds), "data-metres": String(Math.round(n.metres)) },
    label,
    h("span", { class: "stat-value" }, big),
    small ? h("span", { class: "stat-meta" }, small) : null,
    h("span", { class: "service-where" }, show, where ? h("span", { class: "muted" }, ` · ${where}`) : null, " ", osm),
  );
  li.setAttribute("title", rowSummary(n, where));
  return li;
}

function list(rows: Nearest[], ctx: NearbyContext): HTMLElement {
  return h("ul", { class: "stat-tiles service-tiles", "data-testid": "service-tiles" }, ...rows.map((n) => tile(n, ctx)));
}

const sourceLine = () => h("p", { class: "disclaimer" }, tn.source(formatDate(SOURCES.osm.date), monthYear(SOURCES.sns.period)), " ", tn.disclaimer);

function section(from: HTMLElement, body: HTMLElement): HTMLElement {
  return h("section", { class: "nearby", "data-testid": "nearby" }, h("h3", {}, tn.heading), from, body, sourceLine());
}

/** The block for a parish (from its main settlement) or a concelho (from its seat). */
export function nearbySection(level: "parishes" | "concelhos", code: string, ctx: NearbyContext): HTMLElement {
  const from = h("p", { class: "muted nearby-from", "data-testid": "nearby-from" });
  const body = h("div", { "aria-busy": "true" }, h("p", { class: "muted" }, tn.loading));
  const el = section(from, body);
  loadServices()
    .then((data) => {
      if (!el.isConnected) return; // the panel moved on
      const r = resultsFor(data, level, code);
      body.removeAttribute("aria-busy");
      if (!r) {
        body.replaceChildren(h("p", { class: "muted", "data-testid": "nearby-missing" }, `${tn.missing} (${tn.notAvailable})`));
        return;
      }
      from.textContent = r.from ? (level === "parishes" ? tn.fromPlace(r.from) : tn.fromSeat(r.from)) : tn.fromParishCentre;
      body.replaceChildren(list(r.rows, ctx));
    })
    .catch((err: unknown) => {
      if (!el.isConnected) return;
      console.error(err);
      body.removeAttribute("aria-busy");
      body.replaceChildren(h("p", { class: "muted", "data-testid": "nearby-error" }, tn.loadError));
    });
  return el;
}

/** The land check rows for a point: the 1 km grid cell, or straight lines where it has no value. */
export function nearbyCheckSection(result: Promise<CheckServices>, ctx: NearbyContext): HTMLElement {
  const from = h("p", { class: "muted nearby-from", "data-testid": "nearby-from" }, tn.fromCell);
  const body = h("div", { "aria-busy": "true" }, h("p", { class: "muted" }, tn.loading));
  const el = section(from, body);
  el.dataset.testid = "check-nearby";
  void result.then((r) => {
    if (!el.isConnected) return;
    body.removeAttribute("aria-busy");
    if (r.status === "error") {
      body.replaceChildren(h("p", { class: "muted", "data-testid": "nearby-error" }, tn.loadError));
      return;
    }
    const straight = r.rows.some((n) => n.mode === "line" && n.facility);
    body.replaceChildren(list(r.rows, ctx), ...(straight ? [h("p", { class: "muted nearby-straight", "data-testid": "nearby-straight" }, tn.straightNote)] : []));
  });
  return el;
}
