# PNCT Insights: report

Branch `feat/insights`. A new `insights/` sub-product next to the land check. It drafts twice-weekly Facebook data posts (number + 1080×1080 card + EN/PT caption + UTM link) and sends them to Telegram. Posting stays manual.

## What was built

- **Data layer** (`insights/data/`). `fetch` downloads INE Census 2011/2021 by freguesia (indicator 0011609), INE median €/m² by concelho (0012255, latest = 2025) and the OPO/LIS/FAO airports from OSM. `prepare` builds committed tables (`prepared/`). Areas are computed in EPSG:3763. A **CAOP 2025 ↔ Censos 2021 crosswalk** goes through CAOP 2024, the last pre-split edition, whose 2,882 parishes are the Census parishes code for code. Every source, period and fetch date is in `prepared/national.json`. Nothing is hand-edited, and every download succeeded, so nothing is waiting on a manual file.
- **Sanity checks that fail loudly.** They run in `prepare` and again on every load. The Census parishes *and* municipalities each sum **exactly** to INE's mainland total (10,047,621 in 2011, 9,855,909 in 2021). The computed area matches CAOP's official 89,102.14 km². All 1,861 PNCT codes match CAOP 2025 (0 unmatched). The 2,882 CAOP 2024 codes equal the 2,882 Census codes. No Census parish is mixed PNCT/non-PNCT (threshold 90%).
- **Catalog**: 26 insights in 6 modules. **25 ready, 1 blocked.** Each returns `id, title, numbers, caption_en, caption_pt, source, chart_spec, evergreen, assumptions, footnote`.
- **Renderer**: 1080×1080 PNG in EN and PT. There are three chart types: bars, two-number contrast, and a map of Portugal. Each card has a footer with the source and pnct.singledev.eu, and a footnote whenever an assumption changes the reading. It uses the map's teal.
- **CLI**: `python -m insights fetch|prepare|list|render --all|--id|next [--dry-run]`, plus `make insights`.
- **Telegram**: env only (`INSIGHTS_TELEGRAM_BOT_TOKEN`, `INSIGHTS_TELEGRAM_CHAT_ID`), python-dotenv for `.env`, `.env.example` committed. Only `sendPhoto` (EN card + EN caption) and `sendMessage` (PT caption) are called. Other methods are refused in code, and no `getUpdates` or webhook is ever used. The token is masked as `bot***` and never printed. `next` fails with a clear message if a variable is missing. `render` works offline.
- **Pi**: `insights/deploy/` has a systemd service + timer (`Tue,Fri 09:00 Europe/Lisbon`, `Persistent=true`), runtime-only `requirements.txt` (pandas, matplotlib, python-dotenv; verified on Python 3.13 without geopandas), `insights.env.example`, and copy-paste install steps. Prepared, not deployed.
- **Tests**: 33 in `insights/tests/`. Every insight is tested on a 7-parish fixture with hand-computed answers, along with selection order, state, token masking, the allowed methods, dry run and the 1080×1080 output. The full suite (214) passes.

## Ready insights (headline numbers)

| id | kind | headline | caption (EN) |
|---|---|---|---|
| `area_vs_population` | evergreen | **77% / 20%** | The PNCT covers 77% of mainland Portugal, but only 20% of its people live there (1,968,418 residents, Census 2021, on 68,780 km²). |
| `parish_count` | evergreen | **1,861 / 3,049** | 61% of mainland parishes are PNCT. |
| `concelhos_split` | evergreen | **20** | 165 concelhos are PNCT in full, 93 not at all, 20 split (e.g. Tomar 6 of 12, Ponte de Lima 20 of 41). |
| `districts_area_share` | evergreen | **7 / 18** | Beja, Bragança, Castelo Branco, Évora, Guarda, Portalegre and Vila Real are 100% PNCT; Lisboa 0%, Porto 15%. |
| `districts_population_share` | evergreen | **7 / 18** | In 7 districts every resident lives in a PNCT parish; Porto district 1%, Lisboa 0%. |
| `density_contrast` | evergreen | **29 vs 388** | Residents per km² in PNCT parishes vs the rest (about 14×). |
| `closest_to_porto` | evergreen | **24 km** | Pedorido (Castelo de Paiva), in a straight line from central Porto. |
| `closest_to_lisbon` | evergreen | **48 km** | Landeira (Vendas Novas), in a straight line from central Lisbon. |
| `closest_to_airports` | evergreen | **21 km** | FAO → Tôr (Loulé) 21 km; OPO → Pedorido 35 km; LIS → Biscainho 47 km. |
| `closest_to_coast` | evergreen | **0.4 km** | The centre of Carvalhal (Grândola) is 0.4 km from the coastline. |
| `coastal_pnct_parishes` | evergreen | **15 / 160** | 15 PNCT parishes touch the coastline, in 6 concelhos. |
| `least_populated_pnct` | evergreen | **99** | União das freguesias de Paradela e Granjinha (Tabuaço), 180 in 2011. |
| `most_populous_pnct` | evergreen | **34,455** | Castelo Branco parish. |
| `largest_pnct_area` | evergreen | **444 km²** | União das freguesias de Serpa (28× the median parish). |
| `smallest_pnct_area` | evergreen | **0.2 km²** | Borba (São Bartolomeu). |
| `emptiest_pnct_density` | evergreen | **1.5/km²** | Malpica do Tejo (Castelo Branco): 381 people on 246 km². |
| `densest_pnct_vs_emptiest_other` | evergreen | **3,812 vs 7.4** | The Évora city-centre union (PNCT) vs Canha (Montijo, not PNCT). |
| `population_change` | evergreen | **−9.2%** | PNCT parishes lost 198,705 residents between 2011 and 2021; the rest of the mainland +0.1%. |
| `shrinking_parishes` | evergreen | **93%** | 93% of PNCT parishes shrank vs 69% elsewhere. |
| `concelhos_biggest_loss` | evergreen | **−21.6%** | Barrancos; 161 of 165 fully PNCT concelhos shrank. |
| `concelhos_that_grew` | evergreen | **4 / 165** | Odemira, Vila do Bispo, Aljezur, Sernancelhe. |
| `cheapest_coastal_pnct` | fresh | **769 €/m²** | Sever do Vouga (seat 29 km from the coast); Portugal 2,076 €/m² (2025). |
| `below_national_median` | fresh | **−88%** | Sernancelhe 245 €/m² vs Portugal 2,076 €/m² (2025). |
| `housing_median_contrast` | fresh | **717 €/m²** | Median of the fully PNCT concelhos vs Portugal's 2,076 €/m² (2025). |
| `under_1000_m2` | fresh | **133 / 165** | Fully PNCT concelhos with a median under 1,000 €/m² (2025). |

The housing numbers match the hand-checked [facebook-post.md](facebook-post.md) figures (717, 2,076, 133/165, 161/165). The population share differs on purpose: 20% here is Census 2021 counted on all PNCT parishes, while the post's 18% is the 2025 estimate for the whole-PNCT concelhos only.

The `next` order is the catalog order for evergreen insights, with a fresh one after every two. The first two weeks: area_vs_population, parish_count, cheapest_coastal_pnct, concelhos_split.

## Blocked

- `most_viewed_parishes`: the repo has no analytics (no page-view tracking in the web app). It needs `insights/data/raw/usage_parish_views.csv` (`dicofre,views,period_start,period_end`). Cloudflare's own dashboard analytics, if enabled, aren't in the repo.

## Assumptions and data caveats

- **2025 parish split.** Census figures exist for the 2,882 Census 2021 parishes. 134 of them were split into 301 current ones. Each split union is wholly PNCT or wholly non-PNCT, so totals assign it whole. One parish, Santa Maria de Sardoura (Castelo de Paiva), now has 4% of its area in PNCT neighbours after the 2025 boundary edits and counts as non-PNCT. **Per-parish population and density rankings use only the 2,736 parishes unchanged since the Census.** The captions and card footnotes say so.
- **2011 vs 2021** compare parish by parish, because INE publishes 2011 on the 2021 boundaries. No mapping between the two Censuses was needed.
- **Distances** are straight lines in EPSG:3763 from the parish centroid, labelled "in a straight line" in every caption and footnote. For the 21 parishes whose centroid falls outside their own boundary, an interior point is used. Without it, Carvalhal's centroid would sit 64 m from the shore. Porto and Lisboa = OSM admin centre. Airports = the centre of the OSM aerodrome.
- **Coast** = CAOP 2025 *Limite e Linha de Costa* (1,217 km), including estuary and lagoon shores. "Within 30 km of the coast" means the concelho's seat is within 30 km.
- **Housing** values are per concelho, so only the 165 concelhos where every parish is PNCT are used. The national reference is INE's value for Portugal. The "717" figure is the median of the concelho medians.
- **Sernancelhe at 245 €/m²** is INE's published 2025 value. It looks very low, but it is the source's number and is shown unchanged.
- Ties at the cut-off of a top 5 are broken by row order. For example, in `least_populated_pnct` Trindade and Vilar Seco both have 116 residents.

## Next steps for you

1. Look at the cards in `insights/out/` (`INDEX.md` has every caption) and pick next week's posts.
2. Add the token and chat ID to `.env` (copy `.env.example`), then try `uv run python -m insights next --dry-run`, then one real `next`.
3. Install on the Pi with [insights/deploy/README.md](../../insights/deploy/README.md).
4. Each summer, when INE publishes the next €/m² year: `uv run python -m insights fetch --refresh && uv run python -m insights prepare`, check, commit, pull on the Pi. The fresh housing insights will then show the new year. The state in `posted.json` keeps their ids, so remove them there if you want them re-sent.
