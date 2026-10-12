# Changelog

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
