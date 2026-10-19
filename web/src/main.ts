import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { AttributionControl, LngLat, Map as MapLibreMap, NavigationControl, setWorkerUrl, type LngLatBoundsLike, type MapMouseEvent, type MapSourceDataEvent, type StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { renderAbout } from "./about";
import { basemapStyle, setLabelLanguage } from "./basemap";
import { BOUNDS_MARGIN, cameraLimits, protectedFade, constrainView, fitCenter, fitZoom, MAINLAND, OUTLINE_MERC, paddingOffset, type CameraLimits } from "./camera";
import { concelhoCode, featureId, loadData, type Bounds, type MapData } from "./data";
import { MAP_HASH_KEY, readHash, writeHash, type HashState } from "./hash";
import { addLayers, addOverlays, appLayers, applyFilter, CONCELHO_FILL, CONCELHO_SOURCE, overlaySource, PARISH_FILL, PARISH_SOURCE, patternImages, setOverlayVisibility, setPatternImages, withAppLayers, type FilterState, type OverlayState } from "./layers";
import { mountSettings } from "./controls";
import { applyStatic, initialLang, rememberLang } from "./i18n";
import { mountLegend, mountOverlayToggles } from "./legend";
import { h, Panel } from "./panel";
import { loadOptions, saveOptions } from "./prefs";
import { attributionHtml, CATEGORY_IDS, loadOverlay, type OverlayData } from "./protected";
import { createSearchIndex, mountSearch, type SearchItem } from "./search";
import { lang, setLang, t, ui, type Lang } from "./strings";
import { applyPageTheme, DARK_QUERY, loadThemePref, nextThemePref, PALETTES, resolveTheme, saveThemePref, STYLE_URLS, themeOf, type Theme, type ThemePref } from "./theme";
// ?url makes Vite emit the file content-hashed under assets/; index.html preloads the same file.
import DATA_URL from "../data/pnct.topo.json?url";

setWorkerUrl(workerUrl);

// The language (i18n.ts): every string below is read from the active table, so it is set first.
setLang(initialLang());
applyStatic();

// The theme: the viewer's choice (Auto follows the OS/browser setting; theme.ts). index.html's boot
// script has already applied it to the page; it is read again here before the map is created, so
// the basemap starts in it and never switches after load.
const darkQuery = window.matchMedia(DARK_QUERY);
let themePref: ThemePref = loadThemePref();
let theme: Theme = resolveTheme(themePref, darkQuery.matches);
applyPageTheme(theme, themePref);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $<HTMLDivElement>("status");
const tooltip = $<HTMLDivElement>("tooltip");
const districtSelect = $<HTMLSelectElement>("district-select");
const onlyPnctInput = $<HTMLInputElement>("only-pnct");

const isNarrow = () => window.matchMedia("(max-width: 640px)").matches;

/** Padding that keeps fitted features clear of the toolbar and the panel/sheet. */
function fitPadding(withPanel: boolean) {
  if (isNarrow()) {
    return { top: 120, left: 24, right: 24, bottom: withPanel ? Math.round(window.innerHeight * 0.5) : 60 };
  }
  return { top: 80, left: 40, bottom: 40, right: withPanel ? 400 : 40 };
}

/** Camera limits for the current map size: mainland just fits at minZoom (see camera.ts). */
const limitsFor = (el: HTMLElement): CameraLimits => cameraLimits({ width: el.clientWidth, height: el.clientHeight }, fitPadding(false));

const initial = readHash();
let limits = limitsFor($("map"));
const map = new MapLibreMap({
  container: "map",
  hash: MAP_HASH_KEY,
  bounds: initial.hasMapView ? undefined : (MAINLAND as LngLatBoundsLike),
  fitBoundsOptions: { padding: fitPadding(false) },
  minZoom: limits.minZoom,
  maxBounds: limits.maxBounds as LngLatBoundsLike,
  maxZoom: 15,
  attributionControl: false,
  dragRotate: false,
  pitchWithRotate: false,
});
// OpenFreeMap's dark style uses a "wood-pattern" that its sprite doesn't have. A missing basemap image gets a
// 1×1 transparent stand-in, so nothing is drawn and MapLibre logs no warning. (A `styleimagemissing` listener
// can't prevent that warning in MapLibre 6: the event fires just before it, and only this resolver runs earlier.)
// The app's hatches, missing only for a moment after a full style rebuild, are drawn in the current palette.
// Every style the map loads, theme switches included, uses this resolver.
map.setMissingStyleImageResolver((id) => {
  if (map.hasImage(id)) return;
  const pattern = patternImages(PALETTES[theme])[id];
  if (pattern) map.addImage(id, pattern, { pixelRatio: 2 });
  else map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
});
// Set here rather than as the `style` option so the label patch (basemap.ts) applies before any tile is parsed.
map.setStyle(STYLE_URLS[theme], { transformStyle: basemapStyle(theme, lang) });

// A theme switch (the theme button, or the OS under Auto) swaps the basemap. Once the app has added
// its layers (start), the switch carries them over with the new palette (themeStyle, set in start),
// and style.load restores the rest.
let themeStyle = (previous: StyleSpecification | undefined, next: StyleSpecification) => basemapStyle(theme, lang)(previous, next);
const applyTheme = () => {
  const next = resolveTheme(themePref, darkQuery.matches);
  applyPageTheme(next, themePref);
  if (next === theme) return;
  theme = next;
  document.body.dataset.mapTheme = "pending"; // set to the theme on the new style's first frame (start)
  map.setStyle(STYLE_URLS[theme], { transformStyle: (previous, next) => themeStyle(previous, next) });
};
// Light and Dark ignore the system; Auto follows it live.
darkQuery.addEventListener("change", () => {
  if (themePref === "auto" && themeOf(darkQuery) !== theme) applyTheme();
});
// Keep the centre of the visible area over mainland at every zoom, not just the viewport inside
// maxBounds (camera.ts: constrainView, OUTLINE). MapLibre runs this on every camera change (drag,
// pinch, inertia, easeTo, the hash), so a pan stops smoothly at the edge instead of bouncing back. It
// reads the limits set below (setMinZoom/setMaxBounds), so min zoom and the country view are
// unchanged, and the fit padding, so a selection fit next to the border is never moved.
let panelOpen = false;
const constrain = (center: [number, number], zoom: number) => {
  const container = map.getContainer();
  return constrainView(center, zoom, {
    size: { width: container.clientWidth, height: container.clientHeight },
    minZoom: map.getMinZoom(),
    maxZoom: map.getMaxZoom(),
    maxBounds: (map.getMaxBounds()?.toArray().flat() ?? limits.maxBounds) as Bounds,
    boundsMargin: BOUNDS_MARGIN,
    outline: OUTLINE_MERC,
    offset: paddingOffset(fitPadding(panelOpen)),
  });
};
map.setTransformConstrain((lngLat, zoom) => {
  const view = constrain([lngLat.lng, lngLat.lat], zoom ?? map.getZoom());
  return { center: new LngLat(...view.center), zoom: view.zoom };
});
/** Opening or closing the panel moves the visible area; ease the camera back inside the limits if needed. */
const setPanelOpen = (open: boolean) => {
  if (open === panelOpen) return;
  panelOpen = open;
  const { lng, lat } = map.getCenter();
  const view = constrain([lng, lat], map.getZoom());
  if (Math.abs(view.center[0] - lng) > 1e-9 || Math.abs(view.center[1] - lat) > 1e-9) map.easeTo({ center: view.center, duration: 300 });
};
map.touchZoomRotate.disableRotation();
map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
// No `compact` option: MapLibre shows the full line on wide maps and the compact ⓘ button at
// ≤ 640 px. It opens the compact view on load, so start it collapsed; the text is one tap away.
// A language switch replaces the control (its custom lines are fixed at creation).
let attributionControl: AttributionControl | null = null;
let attribution!: HTMLElement;
const isCompact = () => attribution.classList.contains("maplibregl-compact");
const collapseAttribution = () => attribution.classList.remove("maplibregl-compact-show"); // as MapLibre does on drag
const addAttribution = () => {
  if (attributionControl) map.removeControl(attributionControl);
  attributionControl = new AttributionControl({ customAttribution: [ui.attributionBoundaries, attributionHtml()] });
  // Before the zoom buttons, where it was first added (bottom-right stacks controls in order).
  map.addControl(attributionControl, "bottom-right");
  attribution = map.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-attrib")!;
  collapseAttribution();
};
addAttribution();
let wasCompact = isCompact();
map.on("resize", () => {
  // Rotating or resizing into the compact layout re-opens it; keep it collapsed.
  if (isCompact() && !wasCompact) collapseAttribution();
  wasCompact = isCompact();
});

// Recompute the camera limits for the new size (window resize, phone rotation). A map that showed
// the whole country keeps showing it; otherwise MapLibre clamps the view into the new limits.
map.on("resize", () => {
  const atCountryView = map.getZoom() <= limits.minZoom + 0.01;
  limits = limitsFor(map.getContainer());
  map.setMaxBounds(limits.maxBounds as LngLatBoundsLike);
  map.setMinZoom(limits.minZoom);
  if (atCountryView) map.jumpTo({ center: fitCenter(MAINLAND, limits.minZoom, fitPadding(false)), zoom: limits.minZoom });
  onLimits();
});
let onLimits = () => {};

// The attribution shares the bottom edge with the legend. style.css limits its width to the
// space right of the legend, so the expanded text wraps upwards instead of covering it.
const legendEl = document.querySelector<HTMLElement>(".legend")!;
mountLegend(legendEl, window.matchMedia("(max-width: 640px)"));
const trackLegend = () => document.documentElement.style.setProperty("--legend-right", `${Math.ceil(legendEl.getBoundingClientRect().right)}px`);
new ResizeObserver(trackLegend).observe(legendEl);
window.addEventListener("resize", trackLegend);

// ---- language and theme controls (legend header) ---------------------------------
// Usable from the first paint, before the map data is in. A language switch re-renders in place
// (no reload): the static page, the controls, the attribution and About here, the rest through
// onLangChange (set in start).
const aboutDialog = $<HTMLDialogElement>("about");
renderAbout(aboutDialog);
$("about-open").addEventListener("click", () => aboutDialog.showModal());
let onLangChange = () => {};
const settings = mountSettings(
  $("settings"),
  { lang: () => lang, theme: () => themePref },
  {
    lang: (next: Lang) => {
      setLang(next);
      rememberLang(next);
      applyStatic();
      settings.render();
      addAttribution();
      wasCompact = isCompact();
      if (map.isStyleLoaded()) setLabelLanguage(map, next); // otherwise the pending style gets it from basemapStyle
      renderAbout(aboutDialog);
      onLangChange();
    },
    cycleTheme: () => {
      themePref = nextThemePref(themePref);
      saveThemePref(themePref);
      settings.render();
      applyTheme();
    },
  },
);

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

  addLayers(map, data, filter, limits.levelZoom, PALETTES[theme]);
  // Protected-areas overlays: off unless the hash names them; the data loads on the first switch-on.
  const overlays: OverlayState & { visible: Set<string> } = {
    categories: CATEGORY_IDS,
    loaded: false,
    visible: new Set(initial.overlays.filter((c) => CATEGORY_IDS.includes(c))),
  };
  let overlayData: OverlayData | null = null;
  // Lets the e2e tests inspect layer filters and rendered features.
  (window as unknown as { pnctMap: MapLibreMap }).pnctMap = map;

  // ---- selection --------------------------------------------------------------
  let selection: Selection = null;
  let selectedIds: number[] = [];
  let groupIds: number[] = [];
  let selectedConcelhoId: number | null = null;

  const setSelectedIds = (ids: number[], group: number[] = [], concelhoId: number | null = null) => {
    if (selectedConcelhoId !== null) map.setFeatureState({ source: CONCELHO_SOURCE, id: selectedConcelhoId }, { selected: false });
    if (concelhoId !== null) map.setFeatureState({ source: CONCELHO_SOURCE, id: concelhoId }, { selected: true });
    selectedConcelhoId = concelhoId;
    for (const id of selectedIds) map.setFeatureState({ source: PARISH_SOURCE, id }, { selected: false });
    for (const id of groupIds) map.setFeatureState({ source: PARISH_SOURCE, id }, { group: false });
    for (const id of ids) map.setFeatureState({ source: PARISH_SOURCE, id }, { selected: true });
    for (const id of group) map.setFeatureState({ source: PARISH_SOURCE, id }, { group: true });
    selectedIds = ids;
    groupIds = group;
  };

  /** Fits `b` into the padded view, no further in than `maxZoom` and no further out than `minZoom`. */
  const fit = (b: Bounds | undefined, maxZoom: number, animate = true, minZoom = 0) => {
    if (!b) return;
    const padding = fitPadding(selection !== null);
    const canvas = map.getCanvas();
    const fitted = fitZoom(b, { width: canvas.clientWidth, height: canvas.clientHeight }, padding);
    const zoom = Math.min(maxZoom, Math.max(minZoom, fitted));
    map.easeTo({ center: fitCenter(b, zoom, padding), zoom, duration: animate ? 900 : 0 });
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
    setPanelOpen(next !== null);
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
      setSelectedIds([], c.parishes.filter((p) => p.pnct || !filter.focus).map((p) => featureId(p.dicofre)), featureId(c.code));
      panel.showConcelho(c);
      writeHash({ c: c.code, f: null });
      // Always past the concelho level (and its fade), so the parishes inside become clickable.
      if (opts.fly) fit(data.concelhoBounds.get(c.code), 11, opts.animate, limits.levelZoom + 0.5);
    } else {
      setSelectedIds([]);
      panel.close();
      writeHash({ f: null, c: null });
    }
  }

  // ---- zoom level -------------------------------------------------------------
  // Below limits.levelZoom the map is at concelho level: concelhos are drawn and hit-tested, and a
  // click zooms into one. Above it, parishes are (layers.ts cross-fades the fills around the threshold).
  type Level = "concelho" | "parish";
  const levelOf = (): Level => (map.getZoom() < limits.levelZoom ? "concelho" : "parish");
  let level = levelOf();
  const updateLevel = () => {
    const next = levelOf();
    document.body.dataset.level = next;
    if (next === level) return;
    level = next;
    clearHover();
  };
  document.body.dataset.level = level;
  map.on("zoom", updateLevel);
  onLimits = () => {
    applyFilter(map, filter, limits.levelZoom, PALETTES[theme], CATEGORY_IDS);
    updateLevel();
    updateZoomHint();
  };

  /** The PNCT parish or concelho under `point` at the current level; hidden features don't count. */
  const hit = (point: { x: number; y: number }) => {
    if (level === "concelho") {
      const code = map.queryRenderedFeatures([point.x, point.y], { layers: [CONCELHO_FILL] })[0]?.properties.code as string | undefined;
      const c = code ? data.concelhos.get(code) : undefined;
      // The layer filter already drops PNCT-less concelhos in focus mode; this also covers
      // the moment between toggling and the filtered tiles being drawn.
      return c && !(filter.focus && c.pnctCount === 0) ? ({ kind: "concelho", c } as const) : null;
    }
    const dicofre = map.queryRenderedFeatures([point.x, point.y], { layers: [PARISH_FILL] })[0]?.properties.dicofre as string | undefined;
    const p = dicofre ? data.parishes.get(dicofre) : undefined;
    return p && !(filter.focus && !p.pnct) ? ({ kind: "parish", p } as const) : null;
  };

  // ---- hover + tooltip ----------------------------------------------------------
  let hover: { source: string; id: number } | null = null;
  const setHover = (next: { source: string; id: number } | null) => {
    if (next?.source === hover?.source && next?.id === hover?.id) return;
    if (hover) map.setFeatureState(hover, { hover: false });
    if (next) map.setFeatureState(next, { hover: true });
    hover = next;
  };

  map.on("mousemove", (e: MapMouseEvent) => {
    const target = hit(e.point);
    if (!target) return clearHover();
    map.getCanvas().style.cursor = "pointer";
    if (target.kind === "concelho") {
      const { c } = target;
      setHover({ source: CONCELHO_SOURCE, id: featureId(c.code) });
      const coverage = c.pnctCount === 0 ? ui.pnctNo : c.pnctCount === c.parishCount ? ui.pnctAll : ui.pnctSome(c.pnctCount, c.parishCount);
      tooltip.replaceChildren(
        h("strong", {}, c.name),
        h("span", {}, ui.concelhoSub(c.distrito)),
        h("span", { class: c.pnctCount ? "tt-pnct" : "tt-other" }, coverage),
      );
    } else {
      const { p } = target;
      setHover({ source: PARISH_SOURCE, id: featureId(p.dicofre) });
      tooltip.replaceChildren(
        h("strong", {}, p.freguesia),
        h("span", {}, p.concelho),
        h("span", { class: p.pnct ? "tt-pnct" : "tt-other" }, p.pnct ? ui.pnctYes : ui.pnctNo),
      );
    }
    tooltip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
    tooltip.hidden = false;
  });
  function clearHover(): void {
    setHover(null);
    map.getCanvas().style.cursor = "";
    tooltip.hidden = true;
  }
  // The map's mousemove does not fire when the pointer moves onto a DOM overlay.
  map.on("mouseout", clearHover);

  // At concelho level a click (or tap) selects the concelho and zooms into it; parishes are not
  // hit-tested there, so a tap on a country-wide view never selects a tiny parish by accident.
  map.on("click", (e) => {
    const target = hit(e.point);
    if (target?.kind === "concelho") select({ kind: "concelho", code: target.c.code }, { fly: true });
    else if (target?.kind === "parish") select({ kind: "parish", dicofre: target.p.dicofre });
    else select(null);
  });

  // ---- search -----------------------------------------------------------------
  // Built in the active language (the concelho sublabel); a language switch rebuilds them.
  const buildIndexes = () => {
    const items: SearchItem[] = [
      ...[...data.concelhos.values()].map<SearchItem>((c) => ({
        kind: "concelho",
        id: c.code,
        label: c.name,
        sublabel: ui.concelhoSub(c.distrito),
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
    // concelhos in pnctIndex: at least one PNCT parish
    return { allIndex: createSearchIndex(items), pnctIndex: createSearchIndex(items.filter((item) => item.pnct)) };
  };
  let { allIndex, pnctIndex } = buildIndexes();
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
    applyFilter(map, filter, limits.levelZoom, PALETTES[theme], CATEGORY_IDS);
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
      applyFilter(map, filter, limits.levelZoom, PALETTES[theme], CATEGORY_IDS);
    }
    writeHash({ focus: on ? "1" : null, pnct: null });
    if (on) clearHover(); // the next mousemove restores it if the feature is still shown
    if (on && selection?.kind === "parish" && !data.parishes.get(selection.dicofre)?.pnct) select(null);
    else if (on && selection?.kind === "concelho" && !data.concelhos.get(selection.code)?.pnctCount) select(null);
    else if (selection?.kind === "concelho") select(selection); // refresh which parishes are highlighted
  }
  setFocus(filter.focus);

  // ---- protected areas ----------------------------------------------------------
  // body data-overlays lists the categories shown once their layers are in the style (e2e waits on it).
  const markOverlays = () => {
    document.body.dataset.overlays = overlays.loaded ? [...overlays.visible].sort().join(",") : "";
    updateZoomHint();
  };
  // An overlay can be on but faded out (layers.ts protectedLevel): below the start of the fade, the
  // legend says to zoom in.
  const updateZoomHint = () => toggles.setZoomHint(overlays.visible.size > 0 && map.getZoom() < protectedFade(limits.levelZoom)[0]);
  map.on("zoom", () => updateZoomHint());
  /** Applies overlays.visible: loads and adds the overlay on first use, then shows/hides the layers. */
  async function syncOverlays(): Promise<void> {
    writeHash({ pa: CATEGORY_IDS.filter((c) => overlays.visible.has(c)).join(",") || null });
    syncToggles();
    if (!overlays.loaded && overlays.visible.size) {
      toggles.setLoading(overlays.visible);
      try {
        overlayData = await loadOverlay();
      } catch (err) {
        toggles.setLoading(new Set());
        console.error(err);
        overlays.visible.clear();
        writeHash({ pa: null });
        syncToggles();
        status.textContent = t.overlayError;
        status.hidden = false;
        setTimeout(() => (status.hidden = true), 4000);
        return;
      }
      if (!overlays.loaded) {
        overlays.loaded = true;
        addOverlays(map, overlayData, overlays, filter, limits.levelZoom, PALETTES[theme]);
      }
      toggles.setLoading(new Set());
    }
    document.body.dataset.mapIdle = "false";
    setOverlayVisibility(map, overlays);
    markOverlays();
  }
  const toggles = mountOverlayToggles($("legend-protected"), (cat) => overlays.visible.has(cat), (cat, on) => {
    if (on) overlays.visible.add(cat);
    else overlays.visible.delete(cat);
    void syncOverlays();
  });
  const syncToggles = toggles.sync;
  if (overlays.visible.size) void syncOverlays();
  else markOverlays();

  // ---- theme ------------------------------------------------------------------
  // A theme switch diffs the new basemap with the app's layers (rebuilt in the new palette) into the
  // current style, which keeps the sources, their feature state, the filters and the camera. If
  // MapLibre has to rebuild the style from scratch instead, the sources come back without feature
  // state or the hatch image, so both are restored here either way.
  themeStyle = (previous, next) => withAppLayers(previous, basemapStyle(theme, lang)(previous, next), appLayers(filter, limits.levelZoom, PALETTES[theme], overlays));
  map.on("style.load", () => {
    if (!map.getSource(PARISH_SOURCE)) addLayers(map, data, filter, limits.levelZoom, PALETTES[theme]);
    if (overlayData && overlays.loaded && !map.getSource(overlaySource(CATEGORY_IDS[0]))) addOverlays(map, overlayData, overlays, filter, limits.levelZoom, PALETTES[theme]);
    setPatternImages(map, PALETTES[theme]);
    clearHover();
    setSelectedIds(selectedIds, groupIds, selectedConcelhoId);
    document.body.dataset.mapIdle = "false";
    const shown = theme;
    map.once("render", () => (document.body.dataset.mapTheme = shown));
  });
  document.body.dataset.mapTheme = theme;

  // ---- language switch ------------------------------------------------------------
  // Everything start() rendered: the legend toggles, the search indexes and an open search list,
  // the tooltip, and the panel (re-rendered for the same selection, without moving the camera).
  onLangChange = () => {
    toggles.relabel();
    ({ allIndex, pnctIndex } = buildIndexes());
    search.close();
    clearHover();
    if (selection) select(selection);
  };

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
    const visible = CATEGORY_IDS.filter((c) => s.overlays.includes(c));
    if (visible.join() !== CATEGORY_IDS.filter((c) => overlays.visible.has(c)).join()) {
      overlays.visible = new Set(visible);
      void syncOverlays();
    }
    const current = selection?.kind === "parish" ? selection.dicofre : selection?.kind === "concelho" ? selection.code : null;
    if ((s.parish ?? s.concelho) !== current) restore(true, s);
  });

  // The map is usable once the parishes and concelhos are drawn; basemap labels may still be loading.
  // data-parishes-loaded marks that frame (used by scripts/perf.mjs and the e2e waits).
  const onParishData = (e: MapSourceDataEvent) => {
    if (e.sourceId !== PARISH_SOURCE && e.sourceId !== CONCELHO_SOURCE) return;
    if (!map.isSourceLoaded(PARISH_SOURCE) || !map.isSourceLoaded(CONCELHO_SOURCE)) return;
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
    status.textContent = ui.basemapError;
    status.classList.add("status-error");
  }
});

// Add the parish layers as soon as the style (layers + sprite) is in. The "load" event would also
// wait for every basemap tile and label glyph, which on a slow connection is seconds later.
Promise.all([loadData(DATA_URL), new Promise<void>((resolve) => map.once("style.load", () => resolve()))])
  .then(([data]) => start(data))
  .catch((err: unknown) => {
    console.error(err);
    status.textContent = ui.dataError;
    status.classList.add("status-error");
  });
