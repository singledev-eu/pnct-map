# Changelog

## Unreleased

### For users

- **The camera stays over Portugal:** at any zoom, the map centre stays within mainland Portugal plus about 0.25° (~25 km), so panning or flying can no longer drift to Tangier or deep into Spain. Sagres, the Minho and the border parishes can still be centred. Edges stop smoothly, with no bounce-back. Zooming out and the country view are unchanged.

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
