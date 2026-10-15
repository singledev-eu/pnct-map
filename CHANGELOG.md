# Changelog

## 0.3.1 (2026-10-15)

### Infrastructure

- **No console warnings on a light load:** positron's three road-shield layers filter on `["<=", ["get", "ref_length"], 6]`. Roads without a ref have no `ref_length`, and MapLibre warned for each layer. `basemapStyle()` now wraps the value as `["coalesce", ["get", "ref_length"], 1000]`, in those filters only. A road without a ref still fails the filter, as before; a fallback of 0 would have matched every such road. Nothing on the map changes.
- Tests:
  - Vitest checks the patched filter;
  - the light-load e2e test loads at z12, waits for full idle and asserts no console warnings, like the dark one.

## 0.3.0 (2026-10-15)

### For users

- **Dark theme:** the map follows your device's light or dark setting automatically. In dark mode, the basemap is OpenFreeMap's dark style (Dark Matter), and the panel, search, legend, buttons, attribution and About dialog are dark too. PNCT parishes are a brighter teal that stands out on the dark map, and place names are brighter so they read over it. Switching the device theme while the page is open updates everything at once and keeps your view, selection and "Only PNCT" filter. The phone's browser bar matches the theme. There is no manual toggle.
- **Light theme:** unchanged, except that the grey secondary text is a little darker, to meet the WCAG AA contrast minimum on badges and highlighted search results.

### Infrastructure

- `web/src/theme.ts`: style URLs and the map palette per theme. All UI colours are CSS custom properties with a dark override; the legend swatches read the same `--map-*` tokens, and a Vitest check keeps them in step with the palette.
- A theme switch diffs the new basemap into the current style with the app layers rebuilt in the new palette, so the sources, feature state, camera and filters stay.
- The app layers now go above every non-label basemap layer (`appLayerIndex`). In positron that's the same place as before; in Dark Matter it keeps the near-black roads under the PNCT fill.
- A missing-image resolver gives sprite images missing from the basemap a 1×1 transparent stand-in, so the dark style's missing `wood-pattern` no longer logs a warning.
- Tests:
  - e2e `theme.spec.ts`: light load, dark load (the dark style is the first request and there are no console warnings), selection and focus in dark, and live switches that keep the camera, selection, focus, layers and level;
  - `web/scripts/theme_shots.mjs`: review screenshots in light and dark, desktop and phone.

## 0.2.3 (2026-10-15)

### For users

- **The camera follows the shape of Portugal:** the 0.2.2 limit was a rectangle around mainland, whose corners still let the map centre sit over Andalusia (Cádiz, Seville) or Galicia (Vigo, Ourense). Now the centre of the visible map stays over mainland Portugal: up to about 2 km past the Spanish border and about 20 km out to sea. Spanish towns just over the border, such as Badajoz, can no longer be centred, while Elvas, Miranda do Douro, Vila Real de Santo António, Caminha, Sagres and Cabo da Roca still can. Drags and flings stop smoothly at the edge, with no jitter.
- **Border selections stay framed:** the limit applies to the part of the map not covered by the side panel or the bottom sheet. A concelho or parish on the border still lands clear of the panel. When the panel closes, the map eases back over Portugal if needed.

### Infrastructure

- New pipeline step `scripts/build_outline.py` (`make outline`), run by `make all`. From CAOP 2025, it builds the mainland outline:
  - a 2 km buffer along the Spanish border (CAOP `cont_trocos`, `Portugal#Espanha`) and a 20 km buffer at sea;
  - simplified to 175 vertices: `web/data/outline.json`, 3.3 KB, bundled into the JS (+1.4 KB brotli).
- `constrainView` (`web/src/camera.ts`) keeps the viewport rule and replaces the per-axis centre box: it clips the outline to the viewport rule's box and projects onto it. That makes it a fixed point, so a camera it has constrained never creeps.
- Tests:
  - pytest `test_outline.py`;
  - Vitest: the outline, the clipping, the fixed point over a grid of zooms and panel states, and the edge towns and Spanish cities;
  - e2e `camera-outline.spec.ts`: the Spanish cities at country and parish zoom, the edge towns at z12 and z14, a shared Badajoz link, a mouse drag with inertia, a touch fling, and a border concelho with the panel open and closed.

## 0.2.2 (2026-10-14)

### For users

- **The camera stays over Portugal at every zoom:** the map centre stays within mainland Portugal plus about 0.25° (~25 km), so panning, flinging or flying can no longer drift off to Morocco (Tangier) or deep into Spain. Sagres, the Minho and the border parishes can still be centred, and edges stop smoothly with no bounce-back.
- **Zooming out always ends at the exact country view, on every screen shape:** desktop, phone, landscape phone and ultra-wide. Before, a zoom-out anchored away from the centre could stop short: about 1.2° south on desktop, with the north of the Minho cut off, or about 1.1° to the side on phones. Selecting a concelho or parish near the coast or the border still frames it clear of the side panel or the bottom sheet.

### Infrastructure

- The camera rules are one tested function (`constrainView` in `web/src/camera.ts`), plugged into MapLibre's `transformConstrain` hook. A data-driven unit test (`camera.fits.test.ts`) checks that no concelho or parish selection is ever moved by them, on two phone and two desktop sizes.
- New e2e spec `camera-center.spec.ts`: panning toward Tangier and Madrid, every frame of a drag with inertia, an Algarve concelho selected with the bottom sheet open, and a zoom-out from Sagres on desktop and phone.

## 0.2.1 (2026-10-14)

### For users

- **Collapsible legend on phones:** on screens up to 640 px wide, the legend starts as a small "Legend" chip, so it no longer covers the Algarve at the country view. A tap (or Enter/Space) expands it, and the choice is remembered on this device; the page also works without storage. Desktop keeps the full legend.
- **No more non-Latin glyph downloads:** basemap labels now show only the Latin name of places that also have a non-Latin one, such as northern Morocco at the map's southern edge ("Tanger"). The Arabic (`1536-1791`, `65024-65279`) and Tifinagh (`11520-11775`) glyph ranges are no longer requested, at any camera position.
- **Faster on phones:** on the throttled phone profile (Pixel 7, Fast 3G, 4× CPU), the map is fully idle after **10.1 s instead of 12.0 s**, and cross-origin bytes drop from **593 KB to 261 KB**. Parishes still appear after about 7.3 s.

### Infrastructure

- e2e: `basemap-glyphs.spec.ts` asserts that no Arabic/Tifinagh glyph range is requested on a phone viewport, with a tile containing Tangier loaded. `legend.spec.ts` covers the collapsed default, tap, keyboard, persistence, blocked storage, desktop, and overlap with the controls and attribution.
- `scripts/perf.mjs` prints the glyph ranges requested per run.

## 0.2.0 (2026-10-14)

### For users

- **Zoom levels:** at country zoom the map shows concelhos, shaded as whole PNCT, partly PNCT (light, hatched) or not PNCT. A click or tap on a concelho selects it and zooms in to its parishes. Inside, parishes behave as before, with concelho outlines kept for context. The two levels cross-fade at the threshold, and focus mode hides not-PNCT concelhos at concelho level.
- **Camera limits:** you can't zoom out past the view where mainland Portugal just fits. That limit follows the window size and phone rotation. Panning is kept to mainland plus about 1.5°.

## 0.1.0 (2026-10-12)

First public release, live at https://pnct.singledev.eu.

### For users

- **Map of the PNCT territories:**
  - All 3,049 mainland parishes from CAOP 2025, with the 1,861 parishes on the official PNCT list (IEFP, 4 February 2026) shaded.
  - Concelho boundaries.
  - A hover tooltip, and a parish or concelho panel: side panel on desktop, bottom sheet on phones.
- **Search** across parishes and concelhos, and a **district filter**.
- **Idealista property-search links** for every PNCT parish: a polygon search (buy or rent; land, houses or buildings; land filters). When the whole concelho is PNCT, the municipality page is linked too. The links are only generated; the site never contacts Idealista.
- **Focus mode ("Only PNCT"):**
  - It hides everything outside PNCT territory: parishes, outlines, and concelhos without PNCT parishes.
  - Those parishes ignore hover and clicks, and search only finds PNCT places.
  - Districts without PNCT parishes (Lisboa) are disabled.
- **Shareable links:** the map view, the selection, the filters, focus mode (`focus=1`) and the search options are all kept in the URL.
- **Faster first view:** on a throttled phone profile, parishes appear after about 7.2 s instead of 12.8 s, ahead of the basemap labels.
- **Phones:**
  - The map credits sit behind a compact ⓘ button that never covers the legend.
  - The bottom sheet carries the full linked credits.
  - Header controls have 44 px tap targets.
- **About panel:** the data sources and licences, and a clear note that this is unofficial and not affiliated with Idealista.

### Infrastructure

- **Data pipeline** (`uv run make all`): it downloads CAOP 2025 and the IEFP PNCT list, both checksum-verified, matches the list to parishes, and builds:
  - simplified display geometry (TopoJSON, quantization 1.2e5);
  - full-resolution Idealista search shapes.
- **Hosting:** Cloudflare Pages (direct upload).
  - The data files are content-hashed and cached as immutable.
  - `_headers` adds the security headers and a verified CSP.
  - Open Graph image, robots.txt and sitemap.xml.
- **Tests:**
  - pytest for the pipeline.
  - Vitest for the URL codec, the shapes, and a snapshot of every Idealista link.
  - Playwright e2e, including focus mode and the phone layout.
- **Deploys:** `npm run deploy` runs every suite before uploading. Flaky e2e tests (passing only on a retry) warn with a trace instead of blocking.
- **Repo:** published on GitHub under the MIT licence; the data keeps its own licences. History was cleaned once before publishing, `main` is protected, and Dependabot alerts are on.
