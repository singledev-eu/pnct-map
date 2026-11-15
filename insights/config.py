"""PNCT Insights: paths, sources and the fixed choices every insight depends on.

Standard library only, so the runtime (catalog, render, CLI) never needs the pipeline's
geospatial dependencies. The data sources and their versions are documented in data/README.md.
"""

from __future__ import annotations

import os
from pathlib import Path

PKG = Path(__file__).resolve().parent
ROOT = PKG.parent

RAW = PKG / "data/raw"  # downloads (gitignored, except README.md)
PREPARED = PKG / "data/prepared"  # built by `python -m insights prepare` (committed: the Pi reads it)
OUT = Path(os.environ.get("INSIGHTS_OUT_DIR") or PKG / "out")
STATE_DIR = Path(os.environ.get("INSIGHTS_STATE_DIR") or PKG / "state")
ENV_FILE = ROOT / ".env"

SITE = "https://pnct.singledev.eu/"
SITE_LABEL = "pnct.singledev.eu"
# Each insight has its own landing path, /i/<id> (web/public/_redirects: a rewrite to the map, so the path
# stays in the address bar). Cloudflare Web Analytics records paths but not query strings, so the path
# is what tells the insights apart there; the UTM parameters are for any tool that does read them.
UTM = "utm_source=facebook&utm_medium=social&utm_campaign=insights"


def link(insight_id: str) -> str:
    if not insight_id.replace("_", "").isalnum():
        raise ValueError(f"insight id {insight_id!r} is not URL-safe")
    return f"{SITE}i/{insight_id}?{UTM}"


# --- Sources -------------------------------------------------------------------------------------

# CAOP 2025 (DGT, CC BY 4.0): current parishes, the ones the PNCT list is matched to. Downloaded and
# SHA-256 checked by the main pipeline (Makefile: CAOP_URL, CAOP_SHA256).
CAOP_2025 = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
CAOP_2025_URL = "https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2025-gpkg.zip"

# CAOP 2024 (regular edition, approved 2025-01-03): the last edition before the 2025 parish split
# (Lei n.º 25-A/2025), with the same 2,882 mainland parishes as Censos 2021. Used only to map the
# CAOP 2025 parishes onto the Census parishes (docs/caop_research.md).
CAOP_2024_URL = "https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2024-gpkg.zip"
CAOP_2024_SHA256 = "a51b2458f703799f89224ac5f3521133f7b3f1495cf8af091d7e8920183858c5"
CAOP_2024_ZIP = ROOT / "data/external/CAOP_Continente_2024-gpkg.zip"
CAOP_2024 = ROOT / "data/external/CAOP_Continente_2024-gpkg/Continente_CAOP2024.gpkg"

# The PNCT parish list: IEFP "Territórios PNCT" of 2026-02-04 (Makefile: PNCT_URL, PNCT_SHA256),
# parsed and matched to CAOP 2025 by scripts/parse_pdf.py and scripts/build_parishes.py.
PNCT_CSV = ROOT / "data/processed/pnct_parishes.csv"
PNCT_URL = "https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf"

# Municipal seats (OSM admin_centre, ODbL), committed by scripts/build_cities.py: Porto and Lisboa
# reference points, and each concelho's seat for the coast distance of its housing value.
CITIES_JSON = ROOT / "web/data/cities.json"

# INE JSON API (CC BY 4.0).
INE_API = "https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT"
INE_META_API = "https://www.ine.pt/ine/json_indicador/pindicaMeta.jsp?lang=PT&varcd="
INE_QUERIES = {
    # Resident population at the Census, by place of residence on the Censos 2021 geography: 2011 is
    # INE's own re-tabulation onto the 2021 parishes, so 2011 and 2021 compare parish by parish.
    "census_2011": ("0011609", "2011", "&Dim3=T&Dim4=T"),
    "census_2021": ("0011609", "2021", "&Dim3=T&Dim4=T"),
    # Median value of dwelling sales, €/m² (Metodologia 2022), all dwellings; latest annual period.
    "sale_m2": ("0012255", "latest", "&Dim3=H1"),
}

OVERPASS = "https://overpass-api.de/api/interpreter"
AIRPORTS = {"OPO": ("Porto", "Porto"), "LIS": ("Lisbon", "Lisboa"), "FAO": ("Faro", "Faro")}  # IATA: (EN, PT)
AIRPORTS_QUERY = (
    '[out:json][timeout:60];area["ISO3166-1"="PT"][admin_level=2]->.pt;'
    'nwr["aeroway"="aerodrome"]["iata"~"^(OPO|LIS|FAO)$"](area.pt);out center tags;'
)
UA = {"User-Agent": "pnct-map insights pipeline (+https://pnct.singledev.eu)"}

# --- Fixed choices (stated in each insight's assumptions) ----------------------------------------

COAST_KM = 30  # "near the coast": municipal seat within 30 km of the CAOP coastline, straight line
# A Census parish counts as PNCT / non-PNCT when at least this share of its area is / isn't PNCT
# today; prepare.py fails if any parish falls in between. Not 1.0: the 2025 CAOP redrew some
# boundaries (Castelo de Paiva: 5.5% of Santa Maria de Sardoura now lies in PNCT neighbours). Every
# Census parish that is not 100%/0% is listed in national.json (crosswalk.not_clean).
CLEAN_SHARE = 0.90
# Sanity tolerance: area summed from the geometry vs the official CAOP figure.
AREA_TOLERANCE = 0.001
