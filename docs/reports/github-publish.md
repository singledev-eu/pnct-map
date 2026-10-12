# Publish: repo cleanup and push to GitHub

**Pushed:** https://github.com/singledev-eu/pnct-map. It's public, the default branch is `main`, and it has 23 commits.

- History was rewritten once before the first push. `.git` went from 36 MB to 9.9 MB.
- Every test passes, and the link snapshot is at 0 differences.
- A fresh clone builds the site with the same asset hashes as the deployed build.
- Nothing was deployed. https://pnct.singledev.eu is untouched.

## Backup

| Backup | What it holds | Check |
|---|---|---|
| `~/backups/pnct-map-2026-10-12.bundle` (28 MB) | All refs before any change | `git bundle verify`: complete history |
| `~/backups/pnct-map-2026-10-12-pre-rewrite.bundle` (36 MB) | All refs after the cleanup commit, just before the rewrite | `git bundle verify`: complete history |
| `~/backups/pnct-map-2026-10-12-local/` (6.4 MB) | The ignored files that were once tracked: the PNCT PDF and `data/processed/{parishes_all,concelhos}.geojson`. Also `MANIFEST.sha256` and `MTIMES.txt` for all 10 local data files. | |

The CAOP downloads (851 MB) and the interim GeoJSON (136 MB) are recorded by checksum only. They were never tracked, and `make` can rebuild them.

After the rewrite, all 10 files still matched `MANIFEST.sha256`. Nothing needed restoring, timestamps were untouched, and `make -n all` only wants to run pytest.

## Working tree cleanup

**e2e screenshots:**
- They now go to `web/test-results/screenshots/`, which is ignored and cleared by Playwright on each run.
- `docs/screenshots/*.png` (3 files) stay tracked as hand-picked copies, because the reports reference them.
- I ran e2e twice, and `git status` stayed clean both times. `npm run deploy` no longer leaves the tree dirty.

**Perf screenshots:**
- Dropped the 12 individual before/after PNGs and kept the 6 comparison sheets.
- Optimized every remaining PNG losslessly with oxipng (via `pyoxipng`, level 6). All 9 are pixel-identical to the originals.

| Folder | Before | After |
|---|---|---|
| `docs/perf/screenshots/` | 22.6 MB | 6.6 MB |
| `docs/screenshots/` | 1.8 MB | 1.4 MB |

**Other changes:**
- **Reports:** the five phase reports moved from the root to `docs/reports/`:
  - `phase1-pipeline.md`
  - `phase2-map.md`
  - `phase3-idealista-links.md`
  - `perf-initial-load.md`
  - `deploy-cloudflare.md`

  Their kiro-cli sections and the commits' Claude co-author trailers are kept, as you chose.
- **Stray files:** there was no junk to remove. `.kiro-logs/`, `.wrangler/`, `web/test-results/` and `.DS_Store` were already ignored and never pushed.
- **Makefile:** `make download` now also fetches the PNCT PDF from IEFP and checks it against its SHA-256. A fresh clone can run the whole pipeline, which was impossible before because the PDF wasn't tracked.
- **README:** rewritten for newcomers by kiro-cli; I reviewed it and fixed three details. It covers:
  - quick start for the map only (`cd web && npm ci && npm run dev`)
  - prerequisites
  - the pipeline (`uv sync && uv run make all`, and which downloads it needs)
  - tests, deploy
  - Data and attribution, matching the About panel
  - licence and project docs

  The deep-dive sections are kept under Reference.
- **LICENSE:** MIT for the code, © 2026 Mike Kostenko. GitHub detects it as MIT. The README says the data keeps its own licences:
  - IEFP PNCT list
  - CAOP 2025 © DGT, CC BY 4.0
  - OpenFreeMap / OpenMapTiles / © OpenStreetMap contributors (ODbL)

## Identity

- History had exactly one author and committer: **Mike Kostenko <vopros.m@gmail.com>**, a personal Gmail address, not a work one.
- You chose to keep it. It's now set in this repo only (`git config user.name/user.email`; your global config is unchanged).
- No mailmap was needed, since mapping it to itself would change nothing.

## History rewrite

Run with git-filter-repo via `uvx`, after deleting the four merged branches (`perf/initial-load`, `deploy/cloudflare-pages`, `docs/deploy-report`, `chore/repo-cleanup`):

```
git-filter-repo --force --invert-paths \
  --path data/processed/parishes_all.geojson --path data/processed/concelhos.geojson \
  --path data/raw/territorios-pnct-2026-02-04.pdf \
  --path docs/perf/screenshots/before/ --path docs/perf/screenshots/after/ \
  --strip-blobs-with-ids <11 superseded versions of docs/screenshots/*.png and compare/*.png>
```

- **Size:** `.git` went from 36 MB to **9.9 MB** after `git gc --prune=now --aggressive`. There are still 22 commits, and HEAD's tree is byte-identical (`1388df64…`).
- **Purged:** the source PDF, the two processed GeoJSONs (6.5 MB), the 12 before/after PNGs, and the pre-optimization versions of the screenshots and sheets. Commits before the cleanup no longer contain those PNGs.
- **Kept on purpose:** renamed paths (the old `REPORT*.md` and `web/public/data/*.json`). Purging them saves almost nothing and would leave older commits without their data. I tested that variant on a throwaway clone: still 20 MB, and two commits became empty.

**Scan of the rewritten history (all commits):**
- gitleaks 8.30.1: 22 commits, **no leaks**.
- No `/Users/` paths or usernames. The only match was the report sentence saying there are none.
- Your email appears only in commit metadata.
- None of the purged paths remain anywhere.
- The reports mention `vopros21.github.io`, the target of your `www` record, which is already public in DNS.

## Tests after the rewrite

- pytest: 34 passed
- Vitest: 21 passed, link snapshot at 0 differences
- Playwright e2e: 8 passed
- Working tree clean afterwards

## Push

- **Before the push:** `gh` 2.102 was installed with Homebrew. It was already logged in as `vopros21`, with the token in the keychain, so no auth step was needed. `gh repo view` showed the repo **public**, **empty** (no branches or tags), with admin access for you. I didn't change visibility.
- **Pushed:** `git remote add origin https://github.com/singledev-eu/pnct-map.git` and `git push -u origin main`, then one follow-up commit to make LICENSE plain MIT text so GitHub detects it.
  - Only `main` was pushed; there are no tags. The merged branches were deleted locally.
  - Remote `main` equals local HEAD, and `main` tracks `origin/main`.
- **Verified:**
  - The GitHub tree matches HEAD blob for blob (78 files).
  - The README renders with all its sections and the screenshot.
  - The licence shows as MIT.
- **Fresh clone** into a temp folder, with no pipeline outputs (`data/raw/` and the GeoJSONs absent):
  - `npm ci && npm run build` works, and `npm test` passes 21 of 21.
  - The built asset hashes (`index-DSW3RBUi.js`, `pnct.topo-BHDbcw4T.json`) are identical to the live site's.

**What a fresh clone needs for the full suite:**
- **pytest:** `uv sync && uv run make all` first. That downloads CAOP 2025 (106 MB zip) and the IEFP PDF, both checksum-verified, and rebuilds the GeoJSONs the tests read.
- **e2e:** `cd web && PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium` once, because `npm ci` doesn't install the browser.
- **Vitest and the build:** nothing extra.

## On GitHub, by hand

In **singledev-eu/pnct-map → About (gear icon)**:
- **Description:** "Map of the PNCT (Programa Nacional para a Coesão Territorial) parishes in mainland Portugal, with Idealista property-search links. Unofficial."
- **Website:** https://pnct.singledev.eu
- **Topics:** `portugal`, `maplibre`, `map`, `gis`, `topojson`, `vite`, `typescript`, `cloudflare-pages`, `open-data`

Optional:
- Turn off Wiki and Projects if you won't use them.
- Turn on Dependabot alerts under Settings → Code security.
- Protect `main` against force pushes now that history is final.

I can apply the About fields with `gh repo edit` if you prefer.
