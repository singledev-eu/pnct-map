import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl, type LngLatBoundsLike, type MapLayerMouseEvent } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { concelhoCode, featureId, loadData, type Bounds, type MapData } from "./data";
import { MAP_HASH_KEY, readHash, writeHash } from "./hash";
import { addLayers, applyFilter, PARISH_FILL, PARISH_SOURCE, type FilterState } from "./layers";
import { h, Panel } from "./panel";
import { createSearchIndex, mountSearch, type SearchItem } from "./search";

setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const DATA_URL = `${import.meta.env.BASE_URL}data/pnct.topo.json`;
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
map.addControl(
  new AttributionControl({
    compact: true,
    customAttribution: "Boundaries: CAOP 2025 © DGT (CC BY 4.0)",
  }),
  "bottom-right",
);

type Selection = { kind: "parish"; dicofre: string } | { kind: "concelho"; code: string } | null;

function start(data: MapData): void {
  const filter: FilterState = { district: null, onlyPnct: initial.onlyPnct };
  if (initial.district && data.districtBounds.has(initial.district)) filter.district = initial.district;

  addLayers(map, data, filter);

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

  const panel = new Panel($("panel"), {
    onClose: () => select(null),
    onSelectParish: (dicofre) => select({ kind: "parish", dicofre }, { fly: true }),
    onSelectConcelho: (code) => select({ kind: "concelho", code }, { fly: true }),
  });

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
      setSelectedIds([], c.parishes.map((p) => featureId(p.dicofre)));
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
    if (!p) return;
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
    if (dicofre) select({ kind: "parish", dicofre });
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
  const search = mountSearch({
    input: $("search-input"),
    list: $("search-list"),
    index: createSearchIndex(items),
    onSelect: (item) => {
      $<HTMLInputElement>("search-input").blur();
      select(item.kind === "parish" ? { kind: "parish", dicofre: item.id } : { kind: "concelho", code: item.id }, { fly: true });
    },
  });

  // ---- filters ----------------------------------------------------------------
  districtSelect.append(...data.districts.map((d) => h("option", { value: d }, d)));
  districtSelect.value = filter.district ?? "";
  onlyPnctInput.checked = filter.onlyPnct;

  districtSelect.addEventListener("change", () => {
    filter.district = districtSelect.value || null;
    applyFilter(map, filter);
    writeHash({ d: filter.district });
    fit(filter.district ? data.districtBounds.get(filter.district) : MAINLAND, 10);
  });
  onlyPnctInput.addEventListener("change", () => {
    filter.onlyPnct = onlyPnctInput.checked;
    applyFilter(map, filter);
    writeHash({ pnct: filter.onlyPnct ? "1" : null });
  });

  // ---- about ------------------------------------------------------------------
  $("about-open").addEventListener("click", () => aboutDialog.showModal());

  // ---- restore from hash ----------------------------------------------------------
  const restore = (fly: boolean) => {
    const s = readHash();
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
    const current = selection?.kind === "parish" ? selection.dicofre : selection?.kind === "concelho" ? selection.code : null;
    if ((s.parish ?? s.concelho) !== current) restore(true);
  });

  // data-ready / data-map-idle let the e2e tests wait for a settled map.
  map.on("movestart", () => (document.body.dataset.mapIdle = "false"));
  map.on("idle", () => (document.body.dataset.mapIdle = "true"));
  map.once("idle", () => {
    status.hidden = true;
    document.body.dataset.ready = "true";
  });
}

Promise.all([loadData(DATA_URL), new Promise<void>((resolve) => map.once("load", () => resolve()))])
  .then(([data]) => start(data))
  .catch((err: unknown) => {
    console.error(err);
    status.textContent = "Could not load the map data. Please reload the page.";
    status.classList.add("status-error");
  });
