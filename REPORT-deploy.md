# Deploy: pnct.singledev.eu on Cloudflare Pages

**Live:** https://pnct.singledev.eu. The same build is also at https://pnct-map.pages.dev.

**Checks on production:**
- HTTPS works with a Google Trust Services certificate, and HTTP redirects with a 301.
- Both hosts serve byte-identical HTML.
- e2e: 8 of 8 passed.
- No CSP violations or console errors.
- The link snapshot is still at 0 differences.
- The apex singledev.eu still serves your CV from GitHub Pages.

## 1. Repo hygiene

- **Merge:** `perf/initial-load` was fast-forwarded into `main` after the full suite passed (pytest 34, Vitest 21, Playwright 8). The deploy work went through `deploy/cloudflare-pages` and was also fast-forwarded. `main` is clean.
- **No longer tracked** (still on disk; now in `.gitignore`):
  - `data/raw/territorios-pnct-2026-02-04.pdf`, the source PDF. The README records its IEFP URL and SHA-256.
  - `data/processed/parishes_all.geojson` (4.9 MB) and `data/processed/concelhos.geojson` (1.6 MB), pipeline intermediates rebuilt by `make`.
- **Added to `.gitignore`:** `.env`, `.env.*`, `*.local`, `.wrangler/`. Already ignored: `node_modules/`, `dist/`, `data/external/` (CAOP downloads), the 142 MB interim GeoJSON, `.kiro-logs/`, `.DS_Store`.
- **Kept:** the built site data (`web/data/pnct.topo.json`, `web/data/shapes.json`), so deploys never need the Python pipeline or source data.
- **Scan:**
  - No tracked file and no commit contains `/Users/`, your username or a token-like string.
  - Your email appears only as the commit author.
  - External hosts are all public: DGT, IEFP, OpenFreeMap, Idealista, package registries and press links in the research notes. There are no internal URLs.
  - The "token" matches were code identifiers in the search and panel code.
- **Left as is:**
  - The PDF and the two GeoJSONs are still in earlier commits. That only matters if you push this repo publicly; I didn't rewrite history.
  - `docs/perf/screenshots` adds about 20 MB of PNGs.
- **Incident:** fast-forwarding `main` over the "stop tracking" commit made git delete the working copies of those three files.
  - The first `npm run deploy` failed at pytest because of it, so nothing was deployed.
  - I restored them from history, byte-identical, and the PDF matches IEFP's SHA-256. I also reset their timestamps so `make` doesn't rebuild.
  - The deploy then passed.

## 2. Production changes

**Files changed:**
- `web/vite.config.ts`: default base `/` (`BASE_PATH` still overrides it).
- `web/data/` (moved from `web/public/data/`, same bytes): `main.ts` and `links.ts` import both files with `?url`.
  - Vite content-hashes them into `/assets/`, and `index.html` preloads the same hashed file.
  - **I chose content hashing over a short TTL.** Data is cached immutable, and a rebuild shows up as soon as the new `index.html` is fetched, never stale for an hour.
- `web/index.html`:
  - PT+EN title and description, canonical URL, `theme-color`, icon links.
  - Open Graph and Twitter `summary_large_image` tags with absolute URLs.
  - The About text below.
- `web/public/`: `_headers`, `og-image.png` (1200×630, country view), `favicon.svg`, `apple-touch-icon.png` (180×180), `robots.txt`, `sitemap.xml`.
- Scripts and config:
  - `web/scripts/og_image.mjs` regenerates the share image and icon.
  - `web/playwright.config.ts` takes `E2E_BASE_URL` to test a deployed site.
  - `web/package.json` adds `test:py`, `test:all`, `test:e2e:remote`, `deploy` and `deploy:preview`.
- Pipeline paths and tests updated for `web/data/`. README gained a Deploy section.

**About panel (final text):**

> **About this map**
> Shaded parishes are territories covered by the **Programa Nacional para a Coesão Territorial (PNCT)**.
> **Unofficial tool.** Always confirm eligibility with the official sources.
>
> **Data sources**
> - **PNCT territories:** [official list](https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf) dated 4 February 2026, published by IEFP.
> - **Boundaries:** [CAOP 2025](https://www.dgterritorio.gov.pt/cartografia/cartografia-tematica/caop) © Direção-Geral do Território, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). "Informação geográfica cedida pela Direção-Geral do Território." Simplified for the web.
> - **Basemap:** [OpenFreeMap](https://openfreemap.org), © [OpenMapTiles](https://openmaptiles.org), © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
>
> Property-search links open idealista.pt. This site is not affiliated with Idealista.

The PNCT source is the IEFP PDF. Your local file is byte-identical to it (SHA-256 `c286ef77…e7cffc`).

**`web/public/_headers`:**

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self' blob:; connect-src 'self' https://tiles.openfreemap.org; img-src 'self' data: blob: https://tiles.openfreemap.org; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

**CSP:** I included it after checking it in three places: locally with `wrangler pages dev`, on the preview and on production. There were zero CSP violations, console errors or warnings on desktop and mobile while panning, zooming, opening a parish and opening About, and e2e passed 8 of 8 each time.

## 3–5. Cloudflare setup, URLs and checks

- **Pages project:** `pnct-map`, production branch `main`, direct upload. Wrangler 4.149.0 runs through `npx`.
  - Wrangler now delegates new Pages projects to Workers by default, and that path failed.
  - Following Wrangler's own notice, I created the project once with `--force`, on classic Pages as you specified. Later commands don't need it.
- **Production:** https://pnct.singledev.eu, plus https://pnct-map.pages.dev. Deployment `274788fe`, commit `26faff2`.
- **Preview:** https://preview.pnct-map.pages.dev. Deployment `a1a3b03d`.

**Tests:**
- Before each upload: pytest 34, Vitest 21 (link snapshot at 0 differences), local e2e 8.
- After: remote e2e passed 8 of 8 on both the preview and the custom domain.
- A cold load of `#f=170810` opens and frames Vilarinho dos Freires on both.

**Header check on https://pnct.singledev.eu:**

```
/                               cache-control: public, max-age=0, must-revalidate     content-encoding: br
/assets/index-DSW3RBUi.js       cache-control: public, max-age=31536000, immutable    content-encoding: br
/assets/pnct.topo-BHDbcw4T.json cache-control: public, max-age=31536000, immutable    content-encoding: br (gzip for gzip-only clients)
/og-image.png, /robots.txt      cache-control: public, max-age=14400, must-revalidate
+ nosniff, strict-origin-when-cross-origin, Permissions-Policy, X-Frame-Options DENY, CSP on every response
```

- **Static files outside `_headers`:** on the custom domain, the singledev.eu zone's Browser Cache TTL (4 h) applies to files that `_headers` doesn't cover, such as `og-image.png` and `robots.txt`. On pages.dev they get `max-age=0`. That's harmless.
- **Preview indexing:** the preview carries Cloudflare's automatic `x-robots-tag: noindex`; production doesn't.
- **OG tags:** fetched from the live page, they resolve to absolute `https://pnct.singledev.eu/...` URLs. The image returns 200 at 1200×630.

**Throttled perf:** Pixel 7, Fast 3G, 4× CPU, cold cache, median of 3 runs.

| Host | Parish polygons drawn | Full map idle |
|---|---|---|
| Local `vite preview` (gzip) | 7,222 ms | 12,007 ms |
| Cloudflare preview | 7,671 ms | 12,483 ms |
| pnct.singledev.eu | 7,603 ms | 12,401 ms |

The real host is about 0.4 s slower: real network latency adds to the emulated latency, and Cloudflare's on-the-fly brotli is weak. The data file goes out at 532 KB as brotli, against 505 KB as gzip and 428 KB at maximum brotli quality. Pages can't serve pre-compressed files. Raw numbers are in `docs/perf/cloudflare-preview.json` and `docs/perf/production.json`.

## DNS and dashboard steps (record)

- **DNS host:** singledev.eu's nameservers are Cloudflare (`imani.ns.cloudflare.com`, `derek.ns.cloudflare.com`).
- **Your actions:**
  1. Ran `npx -y wrangler@4.149.0 login` (OAuth in the browser).
  2. In the dashboard: **Workers & Pages → pnct-map → Custom domains → Set up a custom domain** → `pnct.singledev.eu` → activate. The `pnct` record is proxied, so public DNS answers with Cloudflare IPs (104.21.81.126, 172.67.160.228) and I can't see its target from outside. If you want it on record, check that it's a CNAME to `pnct-map.pages.dev` under **singledev.eu → DNS → Records**.
- **Unchanged:** the apex `A` records (185.199.108–111.153, GitHub Pages) and `www` → `vopros21.github.io`. https://singledev.eu still returns 200 from `server: GitHub.com`.
- **Also installed at your request:** the Cloudflare plugin for Claude Code (skills + MCP, user scope). Run `/reload-plugins` to load it. I skipped the optional `cf` CLI.

## Redeploy

```
cd web && npm run deploy
```

It runs pytest, Vitest and e2e, builds, and deploys `dist/` to production. `npm run deploy:preview` deploys to the preview alias instead.

- **Fresh clone:** the pytest step needs the local pipeline outputs, so run `make` first.
- **Dirty tree after deploy:** e2e rewrites `docs/screenshots/*.png` on every run. Discard them with `git checkout -- docs/screenshots` afterwards.

## Please check on your phone

1. Open https://pnct.singledev.eu on mobile data. The parishes should appear before the labels, and the "Loading map…" message should go away when they do.
2. Share the link in WhatsApp, Telegram or iMessage. The preview should show the title, description and the map image.
3. Open a parish link such as https://pnct.singledev.eu/#f=170810 from a message. It should open the panel on Vilarinho dos Freires.
4. Add the site to your home screen. The icon should be the teal square.
5. Open About and check the wording, then tap an Idealista link. It should open idealista.pt in a new tab.
