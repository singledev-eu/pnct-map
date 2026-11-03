"""Sources for the concelho data card (population block and câmara contacts).

Population (INE, CC BY 4.0), all through INE's JSON API (https://www.ine.pt/ine/json_indicador/):
  population      0012917  resident population at 31 Dec (annual estimates, administrative-based
                           series from 2021), the latest year
  ageing_index    0012909  ageing index (65+ per 100 aged 0-14), same estimates and year
  population_2011 0011609  resident population at the Census, 2011 and 2021 (published with
  population_2021          Census 2021). census_change compares these two, never an estimate
                           with a Census: the 2021+ estimates and the Census differ by up to ±20%
                           per municipality in the same year (docs/reports/concelho-card-phase1.md).
Density is computed from the population and the CAOP 2025 municipal area (area_ha).

Housing and income (INE, CC BY 4.0; card v2, night task 07). Each at its own latest annual period
("latest": the indicator's UltimoPeriodo), all with a value for every mainland municipality:
  sale_price_m2        0012255  median value of dwelling sales, €/m² (Metodologia 2022), all
                                dwellings (Dim3=H1 "Total": new and existing)
  income_per_taxpayer  0012748  gross income declared per taxpayer (IRS), €
  monthly_earnings     0012656  average monthly earnings of employees (MTSSS/GEP Quadros de
                                Pessoal: full-time employees with full pay), €
Left out on purpose (no value for every municipality, see docs/reports/night/07-concelho-card-v2.md):
rents of new leases (0012600: 200 of 278; 0014698, the 2026 series: 233 of 278) and the
quarterly 12-month sale value (0012234: 277 of 278).

ESTIMATE_YEAR is the single switch for a yearly refresh: None takes the latest period INE
publishes (recorded in the fetch metadata), or pin a year. Estimates before 2021 belong to the
previous series and are refused.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data/external/ine"  # gitignored (data/external/)
CAOP_GPKG = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
CONTACTS_CSV = ROOT / "data/contacts/camaras.csv"
OUT_DATA = ROOT / "data/concelhos.json"
OUT_WEB = ROOT / "web/data/concelhos.json"

API = "https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT"
META_API = "https://www.ine.pt/ine/json_indicador/pindicaMeta.jsp?lang=PT&varcd="
INFO_URL = "https://www.ine.pt/bddXplorer/htdocs/minfo.jsp?var_cd={code}&lingua=PT"
LICENCE = "CC BY 4.0"
LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/"

ESTIMATE_YEAR: int | None = None
FIRST_ESTIMATE_YEAR = 2021  # start of the current (administrative-based) estimates series
CENSUS_YEARS = (2011, 2021)
NATIONAL = "PT"  # the reference geography for the ageing index ("Portugal: 189")
MAINLAND = "1"  # Continente: the 278 municipal values must sum to it

# The SNIT portal has no per-municipality URL (phase 1), so the card links its home page.
SNIT_URL = "https://snit-mais.dgterritorio.gov.pt/portalsnit/"
ISSUES_URL = "https://github.com/singledev-eu/pnct-map/issues/new"


@dataclass(frozen=True)
class Query:
    """One INE request: an indicator for one period, with fixed values for the other dimensions."""

    name: str
    code: str
    period: str  # "estimate" (ESTIMATE_YEAR, resolved), "latest" (the indicator's own) or a census year
    dims: str = ""  # extra Dim params, e.g. "&Dim3=T&Dim4=T"


QUERIES = [
    Query("population", "0012917", "estimate", "&Dim3=T&Dim4=T"),
    Query("ageing_index", "0012909", "estimate"),
    Query("population_2011", "0011609", "2011", "&Dim3=T&Dim4=T"),
    Query("population_2021", "0011609", "2021", "&Dim3=T&Dim4=T"),
    Query("sale_price_m2", "0012255", "latest", "&Dim3=H1"),
    Query("income_per_taxpayer", "0012748", "latest"),
    Query("monthly_earnings", "0012656", "latest"),
]
# The estimate indicators must keep this note in their metadata (INE's flag for the 2021 series
# break); if it changes, the series may have been revised and the build stops for a human look.
SERIES_NOTE = "A partir de 2021, as Estimativas Anuais de População Residente são de base administrativa"
