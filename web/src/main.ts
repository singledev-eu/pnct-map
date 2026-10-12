import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl, type LngLatBoundsLike, type MapLayerMouseEvent, type MapSourceDataEvent } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { concelhoCode, featureId, loadData, type Bounds, type MapData } from "./data";
import { MAP_HASH_KEY, readHash, writeHash, type HashState } from "./hash";
import { addLayers, applyFilter, PARISH_FILL, PARISH_SOURCE, type FilterState } from "./layers";
import { h, Panel } from "./panel";
import { loadOptions, saveOptions } from "./prefs";
import { createSearchIndex, mountSearch, type SearchItem } from "./search";
// ?url makes Vite emit the file content-hashed under assets/; index.html preloads the same file.
import DATA_URL from "../data/pnct.topo.json?url";

setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const MAINLAND: Bounds = [-9.53, 36.95, -6.18, 42.16];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $<HTMLDivElement>("status");
const tooltip = $<HTMLDivElement>("tooltip");
const districtSelect = $<HTMLSelectElement>("district-select");
const onlyPnctInput = $<HTMLInputElement>("only-pnct");
const aboutDialog = $<HTMLDialogElement>("about");

const isNarrow = () => window.matchMedia("(max-width: 640px)").matches;

/** Padding that keeps fitted features clear of the toolbar and the panel/sheet. */
function fitPadding(withPanel: boolean) {
  if (isNarrow()) {
    return { top: 120, left: 24, right: 24, bottom: withPanel ? Math.round(window.innerHeight * 0.5) : 60 };
  }
  return { top: 80, left: 40, bottom: 40, right: withPanel ? 400 : 40 };
}

const initial = readHash();
const map = new MapLibreMap({
  container: "map",
  style: STYLE_URL,
  hash: MAP_HASH_KEY,
  bounds: initial.hasMapView ? undefined : (MAINLAND as LngLatBoundsLike),
  fitBoundsOptions: { padding: fitPadding(false) },
  minZoom: 4,
  maxZoom: 15,
  attributionControl: false,
  dragRotate: false,
  pitchWithRotate: false,
});
map.touchZoomRotate.disableRotation();
map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
// No `compact` option: MapLibre shows the full line on wide maps and the compact ⓘ button at
// ≤ 640 px. It opens the compact view on load, so start it collapsed; the text is one tap away.
map.addControl(new AttributionControl({ customAttribution: "Boundaries: CAOP 2025 © DGT (CC BY 4.0)" }), "bottom-right");
const attribution = map.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-attrib")!;
const isCompact = () => attribution.classList.contains("maplibregl-compact");
const collapseAttribution = () => attribution.classList.remove("maplibregl-compact-show"); // as MapLibre does on drag
collapseAttribution();
let wasCompact = isCompact();
map.on("resize", () => {
  // Rotating or resizing into the compact layout re-opens it; keep it collapsed.
  if (isCompact() && !wasCompact) collapseAttribution();
  wasCompact = isCompact();
});

// The attribution shares the bottom edge with the legend. style.css limits its width to the
// space right of the legend, so the expanded text wraps upwards instead of covering it.
const legendEl = document.querySelector<HTMLElement>(".legend")!;
const trackLegend = () => document.documentElement.style.setProperty("--legend-right", `${Math.ceil(legendEl.getBoundingClientRect().right)}px`);
new ResizeObserver(trackLegend).observe(legendEl);
window.addEventListener("resize", trackLegend);

type Selection = { kind: "parish"; dicofre: string } | { kind: "concelho"; code: string } | null;

function start(data: MapData): void {
  const filter: FilterState = { district: null, focus: initial.focus };
  if (initial.district && data.districtBounds.has(initial.district)) filter.district = initial.district;

  // Focus mode hides everything outside PNCT territory. A link to something it would hide
  // (a non-PNCT parish, or a concelho without PNCT parishes) turns it off instead, so the
  // target stays visible and selectable. Hash writes use replaceState, so this cannot loop.
  const hiddenByFocus = (s: Pick<HashState, "parish" | "concelho">) =>
    (s.parish !== null && data.parishes.get(s.parish)?.pnct === false) ||
    (s.concelho !== null && data.concelhos.get(s.concelho)?.pnctCount === 0);
  if (filter.focus && hiddenByFocus(initial)) filter.focus = false;
  const districtsWithPnct = new Set([...data.parishes.values()].filter((p) => p.pnct).map((p) => p.distrito));
  if (filter.focus && filter.district && !districtsWithPnct.has(filter.district)) {
    filter.district = null;
    writeHash({ d: null });
  }

  addLayers(map, data, filter);
  // Lets the e2e tests inspect layer filters and rendered features.
  (window as unknown as { pnctMap: MapLibreMap }).pnctMap = map;

  // ---- selection --------------------------------------------------------------
  let selection: Selection = null;
  let selectedIds: number[] = [];

  let groupIds: number[] = [];

  const setSelectedIds = (ids: number[], group: number[] = []) => {
    for (const id of selectedIds) map.setFeatureState({ source: PARISH_SOURCE, id }, { selected: false });
    for (const id of groupIds) map.setFeatureState({ source: PARISH_SOURCE, id }, { group: false });
    for (const id of ids) map.setFeatureState({ source: PARISH_SOURCE, id }, { selected: true });
    for (const id of group) map.setFeatureState({ source: PARISH_SOURCE, id }, { group: true });
    selectedIds = ids;
    groupIds = group;
  };

  const fit = (b: Bounds | undefined, maxZoom: number, animate = true) => {
    if (!b) return;
    map.fitBounds(b as LngLatBoundsLike, { padding: fitPadding(selection !== null), maxZoom, duration: animate ? 900 : 0 });
  };

  // Property-search selector: hash > localStorage > defaults; written back so shared links carry it.
  const searchOptions = loadOptions();
  saveOptions(searchOptions);
  const panel = new Panel(
    $("panel"),
    {
      onClose: () => select(null),
      onSelectParish: (dicofre) => select({ kind: "parish", dicofre }, { fly: true }),
      onSelectConcelho: (code) => select({ kind: "concelho", code }, { fly: true }),
      onOptionsChange: saveOptions,
    },
    searchOptions,
  );

  function select(next: Selection, opts: { fly?: boolean; animate?: boolean } = {}): void {
    selection = next;
    if (next?.kind === "parish") {
      const p = data.parishes.get(next.dicofre);
      if (!p) return select(null);
      setSelectedIds([featureId(p.dicofre)]);
      panel.showParish(p, data.concelhos.get(concelhoCode(p.dicofre))!);
      writeHash({ f: p.dicofre, c: null });
      if (opts.fly) fit(data.parishBounds.get(p.dicofre), 12, opts.animate);
    } else if (next?.kind === "concelho") {
      const c = data.concelhos.get(next.code);
      if (!c) return select(null);
      // In focus mode a partly-PNCT concelho highlights only its PNCT parishes.
      setSelectedIds([], c.parishes.filter((p) => p.pnct || !filter.focus).map((p) => featureId(p.dicofre)));
      panel.showConcelho(c);
      writeHash({ c: c.code, f: null });
      if (opts.fly) fit(data.concelhoBounds.get(c.code), 11, opts.animate);
    } else {
      setSelectedIds([]);
      panel.close();
      writeHash({ f: null, c: null });
    }
  }

  // ---- hover + tooltip ----------------------------------------------------------
  let hoverId: number | null = null;
  const setHover = (id: number | null) => {
    if (id === hoverId) return;
    if (hoverId !== null) map.setFeatureState({ source: PARISH_SOURCE, id: hoverId }, { hover: false });
    if (id !== null) map.setFeatureState({ source: PARISH_SOURCE, id }, { hover: true });
    hoverId = id;
  };

  map.on("mousemove", PARISH_FILL, (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) return;
    const p = data.parishes.get(f.properties.dicofre as string);
    // The layer filter already drops non-PNCT parishes in focus mode; this also covers
    // the moment between toggling and the filtered tiles being drawn.
    if (!p || (filter.focus && !p.pnct)) return clearHover();
    setHover(featureId(p.dicofre));
    map.getCanvas().style.cursor = "pointer";
    tooltip.replaceChildren(
      h("strong", {}, p.freguesia),
      h("span", {}, p.concelho),
      h("span", { class: p.pnct ? "tt-pnct" : "tt-other" }, p.pnct ? "PNCT: yes" : "PNCT: no"),
    );
    tooltip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
    tooltip.hidden = false;
  });
  const clearHover = () => {
    setHover(null);
    map.getCanvas().style.cursor = "";
    tooltip.hidden = true;
  };
  map.on("mouseleave", PARISH_FILL, clearHover);
  // The layer's mouseleave does not fire when the pointer moves onto a DOM overlay.
  map.on("mouseout", clearHover);

  map.on("click", (e) => {
    const f = map.queryRenderedFeatures(e.point, { layers: [PARISH_FILL] })[0];
    const dicofre = f?.properties.dicofre as string | undefined;
    const hidden = dicofre !== undefined && filter.focus && !data.parishes.get(dicofre)?.pnct;
    if (dicofre && !hidden) select({ kind: "parish", dicofre });
    else select(null);
  });

  // ---- search -----------------------------------------------------------------
  const items: SearchItem[] = [
    ...[...data.concelhos.values()].map<SearchItem>((c) => ({
      kind: "concelho",
      id: c.code,
      label: c.name,
      sublabel: `Concelho · ${c.distrito}`,
      pnct: c.pnctCount > 0,
    })),
    ...[...data.parishes.values()].map<SearchItem>((p) => ({
      kind: "parish",
      id: p.dicofre,
      label: p.freguesia,
      sublabel: `${p.concelho} · ${p.distrito}`,
      pnct: p.pnct,
    })),
  ];
  const allIndex = createSearchIndex(items);
  const pnctIndex = createSearchIndex(items.filter((item) => item.pnct)); // concelhos: at least one PNCT parish
  const search = mountSearch({
    input: $("search-input"),
    list: $("search-list"),
    index: { query: (q, limit) => (filter.focus ? pnctIndex : allIndex).query(q, limit) },
    onSelect: (item) => {
      $<HTMLInputElement>("search-input").blur();
      select(item.kind === "parish" ? { kind: "parish", dicofre: item.id } : { kind: "concelho", code: item.id }, { fly: true });
    },
  });

  // ---- filters ----------------------------------------------------------------
  const districtOptions = data.districts.map((d) => h("option", { value: d }, d));
  districtSelect.append(...districtOptions);
  districtSelect.value = filter.district ?? "";

  districtSelect.addEventListener("change", () => {
    filter.district = districtSelect.value || null;
    applyFilter(map, filter);
    writeHash({ d: filter.district });
    fit(filter.district ? data.districtBounds.get(filter.district) : MAINLAND, 10);
  });
  onlyPnctInput.addEventListener("change", () => setFocus(onlyPnctInput.checked));

  /** Switches focus mode: layer filters only (no refetch, no layer rebuild), plus UI state. */
  function setFocus(on: boolean): void {
    filter.focus = on;
    onlyPnctInput.checked = on;
    document.body.classList.toggle("focus-mode", on);
    // Districts without PNCT parishes stay listed but cannot be picked in focus mode.
    for (const o of districtOptions) o.disabled = on && !districtsWithPnct.has(o.value);
    if (on && filter.district && !districtsWithPnct.has(filter.district)) {
      filter.district = null;
      districtSelect.value = "";
      writeHash({ d: null });
    }
    if (map.getLayer(PARISH_FILL)) {
      document.body.dataset.mapIdle = "false"; // the filter change re-renders; "idle" sets it back
      applyFilter(map, filter);
    }
    writeHash({ focus: on ? "1" : null, pnct: null });
    if (on && hoverId !== null && !data.parishes.get(String(hoverId).padStart(6, "0"))?.pnct) clearHover();
    if (on && selection?.kind === "parish" && !data.parishes.get(selection.dicofre)?.pnct) select(null);
    else if (on && selection?.kind === "concelho" && !data.concelhos.get(selection.code)?.pnctCount) select(null);
    else if (selection?.kind === "concelho") select(selection); // refresh which parishes are highlighted
  }
  setFocus(filter.focus);

  // ---- about ------------------------------------------------------------------
  $("about-open").addEventListener("click", () => aboutDialog.showModal());

  // ---- restore from hash ----------------------------------------------------------
  const restore = (fly: boolean, s: HashState = readHash()) => {
    if (s.parish) select({ kind: "parish", dicofre: s.parish }, { fly, animate: false });
    else if (s.concelho) select({ kind: "concelho", code: s.concelho }, { fly, animate: false });
    if (s.parish || s.concelho) {
      const label = s.parish ? data.parishes.get(s.parish)?.freguesia : data.concelhos.get(s.concelho!)?.name;
      if (label) search.setValue(label);
    }
  };
  restore(!initial.hasMapView);
  window.addEventListener("hashchange", () => {
    const s = readHash();
    const focus = s.focus && !hiddenByFocus(s);
    if (focus !== filter.focus || s.focus !== focus) setFocus(focus);
    const current = selection?.kind === "parish" ? selection.dicofre : selection?.kind === "concelho" ? selection.code : null;
    if ((s.parish ?? s.concelho) !== current) restore(true, s);
  });

  // The map is usable once the parishes are drawn; basemap labels may still be loading.
  // data-parishes-loaded marks that frame (used by scripts/perf.mjs).
  const onParishData = (e: MapSourceDataEvent) => {
    if (e.sourceId !== PARISH_SOURCE || !map.isSourceLoaded(PARISH_SOURCE)) return;
    map.off("sourcedata", onParishData);
    map.once("render", () => {
      status.hidden = true;
      document.body.dataset.parishesLoaded = "true";
    });
  };
  map.on("sourcedata", onParishData);

  // data-ready / data-map-idle let the e2e tests wait for a settled map.
  map.on("movestart", () => (document.body.dataset.mapIdle = "false"));
  map.on("idle", () => (document.body.dataset.mapIdle = "true"));
  map.once("idle", () => {
    status.hidden = true;
    document.body.dataset.ready = "true";
  });
}

// If the basemap style cannot be fetched, "style.load" never fires; say so instead of spinning.
map.on("error", (e) => {
  if (!map.isStyleLoaded() && document.body.dataset.parishesLoaded !== "true") {
    console.error(e.error);
    status.textContent = "Could not load the basemap. Please check your connection and reload.";
    status.classList.add("status-error");
  }
});

// Add the parish layers as soon as the style (layers + sprite) is in. The "load" event would also
// wait for every basemap tile and label glyph, which on a slow connection is seconds later.
Promise.all([loadData(DATA_URL), new Promise<void>((resolve) => map.once("style.load", () => resolve()))])
  .then(([data]) => start(data))
  .catch((err: unknown) => {
    console.error(err);
    status.textContent = "Could not load the map data. Please reload the page.";
    status.classList.add("status-error");
  });
