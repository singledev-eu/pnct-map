# Automatic dark theme

Branch `feature/dark-theme`, committed locally. **Waiting for your screenshot review.** Nothing is merged, pushed, deployed or tagged.

The theme follows the OS or browser setting (`prefers-color-scheme`) only. There is no manual toggle. Switching the OS theme while the page is open updates the UI and the map live, with no reload.

## What I found

- **Map library:** MapLibre GL JS 6.11.2.
- **Basemap:** an OpenFreeMap vector style URL (`https://tiles.openfreemap.org/styles/positron`). The app loads it with `map.setStyle(url, { transformStyle })`, and the transform patches the labels to Latin-only. Not raster tiles.
- **Where colours lived:**
  - **CSS:** `web/src/style.css` already had a few tokens on `:root` (`--panel-bg`, `--text`, `--muted`, `--accent`, `--hover`, `--border`). About 20 colours were still hard-coded: the body background, focus ring, toggle, badges, segmented control, link note, legend background, swatches, tooltip, status error, dialog backdrop and the sheet handle. `color-scheme` was `light`.
  - **`web/src/search.css`:** tokens with hard-coded fallbacks, plus its own shadow.
  - **JS:** the `COLORS` constant in `web/src/layers.ts` (paint properties), and the hatch image's RGBA values hard-coded in `hatchImage()`.
  - **MapLibre controls:** MapLibre's own CSS (white backgrounds, dark SVG icons).
- **Dark basemap:** I used OpenFreeMap's own **`dark`** style, its build of CARTO's Dark Matter, instead of CARTO's servers. It uses the same tiles (OpenMapTiles), sprite and glyphs as positron, so:
  - the attribution is unchanged and complete in both modes;
  - the CSP needs no change: `tiles.openfreemap.org` only;
  - the Latin-only label patch applies as it is;
  - MapLibre can *diff* one style into the other on a live switch, instead of rebuilding.

## What I changed

| File | Change |
|---|---|
| `web/src/theme.ts` (new) | `DARK_QUERY`, `STYLE_URLS` (positron / dark), `PALETTES` (light / dark map colours), `themeOf()`. |
| `web/src/main.ts` | Reads the theme before the map is created, so a dark visitor never fetches positron. Listens for the `change` event and calls `setStyle(url, { transformStyle })`. On `style.load` it restores the hatch colour, the selection feature state and the hover; the camera and filters are kept. Sets `html[data-theme]` and `body[data-map-theme]` (`pending` while switching), which the tests wait on. |
| `web/src/layers.ts` | `appLayers(filter, level, palette)` builds the layer specs, used for both the first add and a theme switch. `withAppLayers()` is the theme-switch transform: it carries the GeoJSON sources over and inserts the layers rebuilt in the new palette. `hatchImage(color)` and `setHatchColor()`. `appLayerIndex()`: see the layer order below. |
| `web/src/basemap.ts` | `basemapStyle(theme)`: Latin-only labels, plus brighter place names in dark (`#a3a3a3` instead of Dark Matter's `rgb(101,101,101)`). |
| `web/src/style.css` | All UI colours are tokens on `:root`, with a dark override in `@media (prefers-color-scheme: dark)`. `color-scheme: light dark`. Tints use `color-mix()` on the tokens. Legend swatches use the `--map-*` tokens. MapLibre controls: zoom group, attribution, compact ⓘ (light icon in dark mode), hover. |
| `web/src/search.css` | Fallback colours removed; it uses the tokens and `--shadow`. |
| `web/index.html` | `<meta name="color-scheme" content="light dark">`, and two `theme-color` tags: light `#0f8a7e` (unchanged), dark `#0c0c0c`. |
| `web/src/theme.test.ts` (new), `web/src/basemap.test.ts` | The palette matches the CSS `--map-*` tokens. The hatch colour in light equals the former hard-coded value. Layer placement and source carry-over. Dark place labels. |
| `web/vitest.config.ts` | `css.include` for `style.css`, so `?raw` returns the file instead of an empty string. |
| `web/tests/e2e/theme.spec.ts` (new) | 5 e2e tests, below. |
| `web/scripts/theme_shots.mjs` (new) | Review screenshots for desktop and phone, light and dark. |

**Layer order (found in the screenshots):** the app used to insert its layers before the basemap's *first* label layer. Positron draws all its labels last, but Dark Matter has a water label 8th in its list, before buildings, roads and rails. In dark mode, the near-black roads were drawn over the PNCT fill. The layers now go above the basemap's *last* non-label layer (`appLayerIndex`). That gives the same position as before in positron, and puts the roads under the fill in dark mode.

**Live switch:** `setStyle` diffs the new style, with the app's sources carried over and its layers rebuilt in the new palette, against the current one. MapLibre then:
- keeps the GeoJSON sources, their feature state (selection) and the hatch image;
- changes only paint values and basemap layers.

The camera, focus filter, district filter, level zoom (concelho/parish cross-fade), min zoom and the shape-aware `transformConstrain` are untouched. If MapLibre ever falls back to a full rebuild, the `style.load` handler re-adds whatever is missing. A light → dark switch measured about **95 ms** on desktop, from the OS change to the new style loaded, including fetching the style JSON.

## Dark palette

**UI (CSS tokens)**

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#f6f6f4` | `#0c0c0c` |
| `--panel-bg` | `#ffffff` | `#1c2024` |
| `--legend-bg` | `rgba(255,255,255,.94)` | `rgba(28,32,36,.94)` |
| `--text` | `#1f2328` | `#e6e8ea` |
| `--muted` | `#626976` (was `#6b7280`) | `#a0a9b2` |
| `--accent` | `#0f766e` | `#3cc7b4` |
| `--accent-strong` | `#0b5e56` | `#8ae6d8` |
| `--accent-soft` | `#e6f2f0` | `#163c38` |
| `--hover` | `#f1f5f4` | `#272d32` |
| `--border` | `#e3e6e8` | `#353c43` |
| `--badge-other-bg` | `#eef0f2` | `#2a3036` |
| `--warning` | `#8a5a00` | `#e3b45a` |
| `--error` | `#9b1c1c` | `#f59b9b` |
| `--handle` | `#d4d8db` | `#4b535b` |
| `--backdrop` | `rgba(20,30,35,.35)` | `rgba(0,0,0,.6)` |
| `--shadow` | `0 4px 18px rgba(15,30,40,.12)` | `0 4px 18px rgba(0,0,0,.55)` |

**Map (`PALETTES` in `theme.ts`, mirrored as `--map-*`)**

| Role | Light | Dark |
|---|---|---|
| PNCT fill / hatch | `#0f8a7e` | `#22b8a7` |
| Not PNCT | `#64748b` | `#94a3b8` |
| Selected fill | `#0b3d39` | `#7ee8d8` |
| Selected / hover outline | `#0b3d39` | `#c9f5ee` |
| Parish line | `#5b6b73` | `#7d8b95` |
| Concelho line | `#2f3b42` | `#a9b5be` |
| Basemap place labels | positron default | `#a3a3a3` |

The opacities are the same in both themes. Over Dark Matter, a 50 % PNCT fill comes out around `rgb(23,98,90)`, 2.7:1 against the land, so PNCT stays clearly separate from non-PNCT. Light mode makes the selection darker than PNCT; dark mode makes it lighter. The grey lines stay well below white so they don't glare.

**Contrast (WCAG AA, 4.5:1 for text)**
- **Dark, on `--panel-bg`:**

  | Token | Ratio |
  |---|---|
  | `--text` | 13.3 |
  | `--muted` | 6.9 |
  | `--accent` | 7.8 |
  | `--accent-strong` | 11.2 |
  | `--warning` | 8.5 |
  | `--error` | 7.8 |

  The lowest pair is `--muted` on `--hover`, at 5.9. The toggle (accent on accent-soft) is 5.8.
- **Light:** two existing pairs were under AA: `--muted` on the grey "Not PNCT" badge (4.23) and on the highlighted search row (4.40). `--muted` is now `#626976`, so those are 4.84 and 5.03, and 5.5 on white.

## Tests

| Suite | Result |
|---|---|
| pytest | 37 passed |
| Vitest | 66 passed (5 new). Link snapshot: **0 differences**. |
| e2e (full, `npm run test:all`) | **51 passed**, 46 existing + 5 new; no flaky tests |
| `theme.spec.ts` with `E2E_SLOW_BASEMAP_MS=4000`, `--repeat-each 3` | 15 passed |

The new e2e tests wait on `data-map-theme`, `waitForParishes` / `waitForParishView` and map state, never on timeouts:
1. **Light default:** positron requested, dark not; light palette; body background; `color-scheme` meta.
2. **Dark** (`colorScheme: 'dark'`): the *first* style request is the dark one and positron is never requested (no light flash); all 7 app layers; dark palette; basemap background `rgb(12,12,12)`; dark body and legend.
3. **Dark:** selection (`#f=170810`) and focus mode work.
4. **Live switch light → dark → light:** camera centre and zoom unchanged (< 1e-6); selection feature state, focus filter, the 7 layers, panel and hash kept; palette swapped both ways.
5. **Live switch at country view:** zoom, min zoom and the concelho level are kept.

The dark style logs a console **warning** (not an error) about a missing `wood-pattern` image. It comes from OpenFreeMap's style itself.

## Screenshots

`.artifacts/dark-theme/` (gitignored), from `node web/scripts/theme_shots.mjs ../.artifacts/dark-theme` against the preview build:

| Device | Views |
|---|---|
| Desktop 1440×900 @2x | `desktop-{light,dark}-{country,parish-selected,concelho-selected,focus,about}.png` |
| Phone 390×844 @3x | `phone-{light,dark}-{country,parish-selected,concelho-selected,focus,legend-open,attribution-open}.png` |

## Things I was unsure about

- **OpenFreeMap dark instead of CARTO Dark Matter:** this is the "dark equivalent of what we already use" option. CARTO would need a CSP change (`basemaps.cartocdn.com`), a CARTO attribution line, and its own glyphs and sprite, and it would rule out the diffed switch. It is easy to swap if you prefer CARTO.
- **Dark place labels:** I made Dark Matter's dim place names brighter (`#a3a3a3`) so they read on the teal fill. This is a deliberate change to the basemap. Roads and other labels are as OpenFreeMap ships them.
- **Fill strength in dark:** at parish zoom inside an all-PNCT area the whole view is teal, as in light mode. I kept the same opacities as light. If it feels heavy on your phone, a palette-level opacity factor for dark is a small change.
- **Light-mode changes:**
  - `--muted` is slightly darker (AA fix);
  - the search dropdown now uses the shared `--shadow` (0 4px 18px, 12 %) instead of its own (0 6px 20px, 12 %);
  - the attribution link colour is `--text` at 75 % instead of black at 75 %.

  In practice the light theme looks identical; the `desktop-light-*` shots show it.
- **Dark `theme-color`:** `#0c0c0c`, the Dark Matter background, so the phone browser bar blends into the map rather than the panel grey.
- **Performance of a switch:** on the diff path, MapLibre deep-compares and clones the inline GeoJSON (about 95 ms in total on desktop). On a slow phone it could be a few hundred ms. That is acceptable for a rare OS event, but I haven't measured it with `perf.mjs` throttling. Initial-load performance is unchanged in light; dark loads the same tiles.
- **Not done (out of scope):** the OG image and the docs screenshots stay light.

## Proposed version

**0.3.0 (minor):** a new user-visible feature (dark theme, live switching), with no breaking changes and no link changes. A patch number would undersell it.

## Delegation

kiro-cli (`claude-sonnet-5.5`) wrote `web/tests/e2e/theme.spec.ts` and `web/scripts/theme_shots.mjs` from the spec in `.kiro-logs/dark-theme-spec.md` (log: `.kiro-logs/dark-theme.log`), with a two-file allowlist. It stayed within the list. I reviewed both files:
- the waits are map and attribute based, with no timeouts;
- the asserts match the spec;
- the script uses a fresh context per view, so the legend's `localStorage` doesn't leak into the next shot.

Its visual note on the first screenshots ("roads drawn very heavily black over the teal") led to the layer-order fix above. The theme core (`theme.ts`, `layers.ts`, `main.ts`, the CSS) is mine.
