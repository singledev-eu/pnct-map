# PNCT Insights

Twice-weekly data posts for pnct.singledev.eu. Each draft is one striking number, a 1080×1080 card, a short caption in English and European Portuguese, and a link back to the map. The system only drafts: `next` sends the draft to Telegram, and you post by hand.

```sh
uv sync                                    # adds matplotlib and python-dotenv to the pipeline env
uv run python -m insights fetch            # INE + OSM sources -> insights/data/raw/ (CAOP comes from `make download`)
uv run python -m insights prepare          # -> insights/data/prepared/ (committed); stops on any failed sanity check
uv run python -m insights list             # every insight: ready/blocked, evergreen/fresh, posted, headline
uv run python -m insights render --all     # -> insights/out/<id>/{chart_en,chart_pt}.png, caption_{en,pt}.txt, insight.json; out/INDEX.md
uv run python -m insights render --id area_vs_population
uv run python -m insights next --dry-run   # what the next Telegram run would send; sends nothing, writes nothing
uv run python -m insights next             # render, send to Telegram, record in insights/state/posted.json
uv run pytest -q insights/tests            # the catalog on a hand-computed fixture, CLI, Telegram safety, rendering
```

`make insights` runs fetch + prepare + render.

## Layout

| Path | What |
|---|---|
| `config.py` | paths, sources, and the fixed choices (coast threshold, crosswalk threshold) |
| `data/fetch.py`, `data/prepare.py` | downloads and the build with sanity checks. Sources, versions and definitions: [data/README.md](data/README.md) |
| `catalog/` | one module per theme (`territory`, `distance`, `extremes`, `change`, `housing`, `usage`). Each insight is a function registered with `@insight(id, evergreen=…)` that returns an `Insight`: `id, title, title_pt, numbers, caption_en, caption_pt, source, source_en, chart_spec, evergreen, assumptions, footnote`. Missing data raises `Blocked(reason, missing_files)`, never an estimate |
| `render.py` | the 1080×1080 card: headline number (or a title, for contrast cards), subtitle, one chart (`bars`, `contrast` or `map`), a footnote when an assumption changes the reading, and a footer with the source and pnct.singledev.eu |
| `cli.py`, `state.py`, `telegram.py` | the commands, `posted.json`, and Telegram delivery |
| `deploy/` | systemd service + timer (Tue/Fri 09:00 Europe/Lisbon) and the [Pi install steps](deploy/README.md) |

## Links and the PNCT definition

- **Each caption links to its own landing path:** `https://pnct.singledev.eu/i/<insight_id>?utm_source=facebook&utm_medium=social&utm_campaign=insights`. `/i/*` serves the map (a rewrite in `web/public/_redirects`, not a redirect), so Cloudflare Web Analytics, which records paths but not query strings, counts visits per insight.
- **PNCT is the legal definition:** the annex of Portaria 208/2017, with no amendment found ([data/sources/pnct-legal-status.md](../data/sources/pnct-legal-status.md)). Five parishes are classified differently by the IEFP list; they are `disputed` in `data/pnct_status.csv`.
  - Totals and shares use the legal status, and their cards carry the footnote "5 parishes are classified differently by IEFP; see map".
  - Rankings, examples and top-5 lists skip disputed parishes entirely (`Data.rank_*`).
  - `prepare` fails if any insight output names one (`check_no_disputed`).

## Rules

- **Correctness over coverage.** Every number traces to a dataset in `prepared/national.json`. Every assumption is in the insight's `assumptions`, and on the card (`footnote`) when it changes how the number reads. Distances always say "in a straight line".
- **No invented figures.** A missing dataset blocks the insight (`list` shows what it needs), and it stays blocked until the data exists.
- **PT is European Portuguese**, following [docs/i18n-glossary.md](../docs/i18n-glossary.md): "você" register ("Explore o mapa"), Censos, concelho, freguesia. PT sentences never put "em/de" before a place name (some names take an article: *no* Sabugal, *na* Guarda), except through `de_pt()` for district names.
- **Numbers never round to a false 100% or 0%** (`pct()` adds decimals instead).

## Order of `next`

Evergreen insights (Census and geometry) go first, in catalog order (flagship first). After every 2 evergreen posts, a fresh one (yearly housing data) is interleaved while any remain. Sending counts as drafted. A failed send isn't recorded, so the next run retries it.

## Telegram

Env only: `INSIGHTS_TELEGRAM_BOT_TOKEN` (the existing dev bot) and `INSIGHTS_TELEGRAM_CHAT_ID`. They come from the environment (a session or CI secret, used as is) or from `.env` at the repo root (python-dotenv, never overriding variables already set; template `.env.example`). On the Pi they come from `/etc/pnct-insights/insights.env`. The code calls only `sendPhoto` (EN card + EN caption) and `sendMessage` (PT caption), never `getUpdates` or a webhook, because another app polls this bot. The token is never printed and shows as `bot***` in errors. `render` works offline without either variable.

## Adding an insight

Write a function in the right `catalog/` module, decorate it with `@insight("my_id")`, return an `Insight` (follow the existing ones: `caption()` builds hook → context → link, and `sources()` builds the source line), and add a test in `tests/test_catalog.py` with the value worked out by hand on the fixture.
