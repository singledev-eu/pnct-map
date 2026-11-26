"""Nearby services: sources, categories, the OSM tag rules and the car speed table (docs/nearby-services/DATA.md).

Pipeline: services_config -> fetch_services (Geofabrik extract + SNS emergency list, SHA-256 pinned)
-> build_services (facilities, the car graph, one multi-source Dijkstra per category, the parish
points and the 1 km land check grid).

Facilities come from OpenStreetMap (ODbL, "© OpenStreetMap contributors"), except the hospital
emergency departments: the official SNS list (ACSS/DE-SNS, CC BY 4.0 on dados.gov.pt) says which
services exist, and data/services/sns_urgencias.csv (hand-checked) places each one on its OSM building,
because the SNS coordinates are sometimes geocoded to the town (DATA.md).

The tag rules are plain functions over an OSM tag dict, so tests/test_services.py can pin them.
Imports only the standard library.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data/external/services"  # gitignored (data/external/)
CAOP_GPKG = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
URGENCIAS_CSV = ROOT / "data/services/sns_urgencias.csv"  # tracked, hand-checked
OUT_WEB = ROOT / "web/data/services.json"  # lazy-loaded by the app, content-hashed by Vite
META_JSON = ROOT / "web/data/services.meta.json"  # bundled: grid parameters, sources, dates
PUBLIC_DIR = ROOT / "web/public/services"  # gitignored: the land check grid chunks
REPORT_JSON = ROOT / "data/services/build_report.json"  # tracked: counts, snaps, validation, timings
FACILITIES_CSV = ROOT / "data/services/facilities.csv"  # tracked: every facility with its OSM id, for review
POINTS_CSV = ROOT / "data/services/parish_points.csv"  # tracked: where each parish is measured from
MAX_FILE_BYTES = 24 * 1024 * 1024  # Pages refuses files over 25 MiB

# ---- sources -----------------------------------------------------------------------------------

# Geofabrik keeps dated daily extracts for a few months; a dated file keeps the pin reproducible
# while it exists. A new extract: change the date, the URL and the SHA-256 together.
OSM_DATE = "2026-11-25"
OSM_URL = "https://download.geofabrik.de/europe/portugal/portugal-261125.osm.pbf"
OSM_SHA256 = "ad86a158145908bf1634d00c6633e01f0dbf3723cef1551b3b35b2294ff81952"
OSM_MD5 = "1ebc30a1157376ca3b7674b64328a169"  # Geofabrik's own .md5, checked too
OSM_LICENCE = "ODbL 1.0"
OSM_LICENCE_URL = "https://www.openstreetmap.org/copyright"

SNS_URGENCIAS_URL = (
    "https://transparencia.sns.gov.pt/api/explore/v2.1/catalog/datasets/caracterizacao-das-valencias-de-urgencia/exports/json"
)
SNS_URGENCIAS_PAGE = "https://transparencia.sns.gov.pt/explore/dataset/caracterizacao-das-valencias-de-urgencia/"
SNS_URGENCIAS_DADOS = "https://dados.gov.pt/pt/datasets/caracterizacao-das-valencias-de-urgencia-1/"
SNS_LICENCE = "CC BY 4.0"
SNS_LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/"
SNS_PERIOD = "2023-05"  # the portal's dcat temporal: "maio 2023"

# Mainland bounds (lon/lat) for a first cut; the CAOP districts decide what is mainland.
LON_MIN, LAT_MIN, LON_MAX, LAT_MAX = -9.6, 36.9, -6.1, 42.2
# Facilities and roads are kept this far (m) past the mainland border, so a parish near Spain can
# reach a road that dips across it. The Geofabrik extract itself stops a little past the border.
BORDER_BUFFER_M = 3000

# ---- categories ---------------------------------------------------------------------------------


@dataclass(frozen=True)
class Category:
    id: str
    en: str
    pt: str
    source: str  # "osm" or "sns"


CATEGORIES: tuple[Category, ...] = (
    Category("health", "Health centre", "Centro de saúde", "osm"),
    Category("emergency", "Hospital emergency", "Urgência hospitalar", "sns"),
    Category("supermarket", "Supermarket", "Supermercado", "osm"),
    Category("school1", "Primary school", "Escola do 1.º ciclo", "osm"),
    Category("school3", "Secondary school", "Escola secundária", "osm"),
    Category("pharmacy", "Pharmacy", "Farmácia", "osm"),
    Category("station", "Train station", "Estação de comboio", "osm"),
)
CATEGORY_IDS = tuple(c.id for c in CATEGORIES)

# ---- OSM tag rules ------------------------------------------------------------------------------


def fold(s: str | None) -> str:
    """Lowercase, accents stripped, whitespace collapsed: 'Escola Básica n.º 1' -> 'escola basica n.o 1'."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).replace("º", "o").replace("°", "o").replace("ª", "a")
    return " ".join(s.lower().split())


def _disused(tags: dict) -> bool:
    return any(tags.get(k) in ("yes", "true") for k in ("disused", "abandoned")) or "construction" in tags


HEALTH_AMENITIES = {"clinic", "doctors", "hospital"}
HEALTH_CARE = {"centre", "clinic", "doctor"}
_HEALTH_NAME = re.compile(
    r"^(centro de saude|c\.? ?s\.? |usf\b|ucsp\b|u\.s\.f|unidade de saude familiar|"
    r"unidade de cuidados de saude personalizados|unidade de cuidados de saude primarios|"
    r"extensao (de|do centro de) saude|polo (de|do centro de) saude|posto de saude)"
)
# Not primary-care consultations: community care, shared resources, public health.
_HEALTH_NOT = re.compile(r"^(ucc\b|urap\b|usp\b|unidade de cuidados na comunidade|unidade de saude publica)")
_SNS_OPERATOR = re.compile(r"(servico nacional de saude|\bsns\b|\bars\b|\buls\b|\baces\b|unidade local de saude|ministerio da saude)")


def is_health_centre(tags: dict) -> bool:
    """SNS primary care: centro de saúde, USF, UCSP, extensão. By name, since OSM has no SNS tag."""
    if _disused(tags) or not (tags.get("amenity") in HEALTH_AMENITIES or tags.get("healthcare") in HEALTH_CARE):
        return False
    name = fold(tags.get("name"))
    if not name or _HEALTH_NOT.search(name):
        return False
    if _HEALTH_NAME.search(name):
        return True
    # A generic "Unidade de Saúde X" only with an SNS operator.
    return name.startswith("unidade de saude") and bool(_SNS_OPERATOR.search(fold(tags.get("operator"))))


_SHOP_NOT = re.compile(r"^(mini ?-?mercado|minimercado|mercearia|centro comercial|frutaria|talho)\b")


def is_supermarket(tags: dict) -> bool:
    """shop=supermarket (OSM: self-service grocery), without mis-tagged mini-markets and malls."""
    if _disused(tags) or tags.get("shop") not in ("supermarket", "hypermarket"):
        return False
    return not _SHOP_NOT.search(fold(tags.get("name")))


def isced_levels(tags: dict) -> set[int]:
    """'0;1', '2-3', '1;2;3' -> {0, 1}, {2, 3}, {1, 2, 3}."""
    out: set[int] = set()
    for part in re.split(r"[;,]", tags.get("isced:level", "")):
        part = part.strip()
        if m := re.fullmatch(r"(\d)\s*-\s*(\d)", part):
            out |= set(range(int(m[1]), int(m[2]) + 1))
        elif part.isdigit():
            out.add(int(part))
    return out


# Not a school for children, or not running: driving, music, dance, languages, sport, adult, closed.
_SCHOOL_NOT = re.compile(
    r"(\bantiga\b|\bantigo\b|\bex-|desativad|encerrad|extint|conducao|musica|danca|surf|linguas|idiomas|"
    r"universidade|senior|academia|formacao|ballet|natacao|equitacao|futebol|artes marciais|yoga|"
    r"catequese|seminario|^jardim|^creche|^infantario|^centro de (formacao|estudos|explicacoes|reabilitacao|recuperacao))"
)
# Former primary schools that kept the old name are usually closed (the 2005–2012 closures).
_PRIMARY_OLD = re.compile(r"^escola primaria\b")
_SECONDARY = re.compile(
    r"(secundari|\bliceu\b|\bebs\b|\be\.b\.s\b|\bes\b|\be\.s\.|\beb ?2,? ?3 ?/ ?s\b|\beb ?2,? ?3 ?e ?s\b|"
    r"escola profissional|escola tecnologica|escola tecnica)"
)
_BASIC_23 = re.compile(r"(\b2\.?o? ?[,./e] ?3\.?o?\b|\b2\.?o? e 3\.?o?\b|\beb ?2\b|\beb ?23\b|\b2\.?o ciclo|\b3\.?o ciclo)")
# Names that say 1.º ciclo outright (EB1, EB1/JI, Centro Escolar, Escola Básica Integrada: years 1–9).
_PRIMARY_EXPLICIT = re.compile(r"(\beb ?1\b|\be\.b\.? ?1\b|\beb1|\b1\.?o (e 2\.?o (e 3\.?o )?)?ciclo|escola do 1|\bebi\b|basica integrada|centro escolar)")
# "Escola Básica X": since the 2010s mergers this is usually a former EB1, but a school group's seat
# can also be a 2.º/3.º-ciclo "Escola Básica"; DATA.md measures this against INE's count.
_PRIMARY_GENERIC = re.compile(r"(escola basica|ensino basico|\beb\b|complexo escolar)")


def school_kind(tags: dict) -> set[str]:
    """{'school1'} (has 1.º ciclo), {'school3'} (has secondary), both, or none.

    The Portuguese naming conventions decide first: EB1 / Centro Escolar / "1.º ciclo" -> 1.º ciclo;
    Secundária / EBS / EB 2,3/S / Profissional -> secondary (INE counts vocational schools under
    "ensino secundário"); EB 2,3 -> neither. A bare "Escola Básica X" counts as 1.º ciclo. isced:level
    (1 primary, 3 upper secondary) decides only for names that say nothing, because some imported
    tags are wrong (an "EB 2/3" with isced:level=3, DATA.md).
    """
    if _disused(tags) or tags.get("amenity") != "school":
        return set()
    name = fold(tags.get("name"))
    if name and (_SCHOOL_NOT.search(name) or _PRIMARY_OLD.search(name)):
        return set()
    secondary = bool(_SECONDARY.search(name))
    explicit1 = bool(_PRIMARY_EXPLICIT.search(name))
    basic23 = bool(_BASIC_23.search(name))
    generic = bool(_PRIMARY_GENERIC.search(name))
    if secondary or explicit1 or basic23:
        return ({"school1"} if explicit1 else set()) | ({"school3"} if secondary else set())
    levels = isced_levels(tags)
    if levels:
        return ({"school1"} if 1 in levels else set()) | ({"school3"} if 3 in levels else set())
    return {"school1"} if generic else set()


def is_pharmacy(tags: dict) -> bool:
    """amenity=pharmacy, without parapharmacies (dispensing=no)."""
    return not _disused(tags) and tags.get("amenity") == "pharmacy" and tags.get("dispensing") != "no"


_RAIL_NOT_STATION = {"subway", "light_rail", "funicular", "monorail", "tram", "miniature"}
_RAIL_OPERATORS = re.compile(r"(infraestruturas de portugal|comboios de portugal|\bcp\b|fertagus|adif|renfe)")


def is_train_station(tags: dict) -> bool:
    """Heavy-rail passenger stations and halts (CP, Fertagus), not metro, light rail, funiculars or tourist trains."""
    if _disused(tags) or tags.get("railway") not in ("station", "halt"):
        return False
    if tags.get("station") in _RAIL_NOT_STATION or tags.get("usage") == "tourism" or tags.get("railway:historic"):
        return False
    if tags.get("train") == "yes":
        return True
    return bool(_RAIL_OPERATORS.search(fold(tags.get("operator")) + " " + fold(tags.get("network"))))


def osm_categories(tags: dict) -> set[str]:
    """Every OSM-sourced category an object belongs to."""
    out: set[str] = set()
    if is_health_centre(tags):
        out.add("health")
    if is_supermarket(tags):
        out.add("supermarket")
    out |= school_kind(tags)
    if is_pharmacy(tags):
        out.add("pharmacy")
    if is_train_station(tags):
        out.add("station")
    return out


# Paediatric and maternity emergencies are left out of "hospital emergency" (they don't take every patient).
SNS_SPECIALISED = re.compile(r"(maternidade|pediatric|estefania|materno infantil)")

# Parish points: the parish's main settlement, from OSM place nodes (DATA.md, "Parish points").
PLACE_RANK = {"city": 0, "town": 1, "village": 2, "suburb": 3, "hamlet": 4, "quarter": 5, "neighbourhood": 6, "locality": 7, "isolated_dwelling": 8}

# ---- the car graph --------------------------------------------------------------------------------

# OSRM-car-like default speeds (km/h) per highway class, used when a way has no usable maxspeed.
# With a maxspeed, the speed is 80% of it, capped by the class default + 20% (OSRM's car profile
# also scales maxspeed down). Path, footway, cycleway, steps, bridleway, pedestrian, construction
# and proposed ways are not drivable here.
SPEEDS_KMH: dict[str, float] = {
    "motorway": 90,
    "motorway_link": 45,
    "trunk": 85,
    "trunk_link": 40,
    "primary": 65,
    "primary_link": 30,
    "secondary": 55,
    "secondary_link": 25,
    "tertiary": 40,
    "tertiary_link": 20,
    "unclassified": 25,
    "residential": 25,
    "living_street": 10,
    "service": 15,
    "road": 20,
    "track": 10,
}
# Tracks: rural plots in Portugal are often reached only by a dirt road, so tracks are drivable here,
# slowly (OSRM's car profile leaves them out). Paved tracks (grade1) at 15 km/h; grade4/grade5 (soft,
# 4x4 only) are left out.
TRACK_GRADE_KMH = {"grade1": 15, "grade2": 10, "grade3": 10}
MAXSPEED_FACTOR = 0.8
# Portuguese implicit limits (Código da Estrada) as OSM writes them.
MAXSPEED_ZONES = {"pt:urban": 50, "pt:rural": 90, "pt:trunk": 100, "pt:motorway": 120}
ACCESS_NO = {"no", "private", "agricultural", "forestry", "delivery", "emergency", "military"}
ACCESS_KEYS = ("access", "vehicle", "motor_vehicle", "motorcar")
ACCESS_YES = {"yes", "designated", "destination", "permissive", "customers"}
# Snaps further than this from the graph are discarded and reported.
SNAP_MAX_M = 1000

# The land check grid: 1 km cells in EPSG:3763, CHUNK × CHUNK cells per file.
GRID_CELL_M = 1000
GRID_CHUNK = 16
NO_VALUE = 0xFFFF  # uint16 sentinel: no road near the cell, or no facility reachable


def parse_maxspeed(value: str | None) -> float | None:
    """'50', '50 km/h', 'PT:urban', '30 mph' -> km/h; None when absent or unusable ('signals', 'none', '50;70')."""
    if not value:
        return None
    v = value.strip().lower()
    if v in MAXSPEED_ZONES:
        return float(MAXSPEED_ZONES[v])
    if m := re.fullmatch(r"(\d+(?:\.\d+)?)\s*(km/h|kmh|kph)?", v):
        n = float(m[1])
        return n if 5 <= n <= 150 else None
    if m := re.fullmatch(r"(\d+(?:\.\d+)?)\s*mph", v):
        return float(m[1]) * 1.609344
    return None


def way_speed(tags: dict) -> float | None:
    """km/h for a drivable way, None if cars can't use it."""
    hw = tags.get("highway")
    if hw not in SPEEDS_KMH or tags.get("area") == "yes":
        return None
    for key in ACCESS_KEYS[::-1]:  # the most specific key wins
        if key in tags:
            if tags[key] in ACCESS_NO:
                return None
            if tags[key] in ACCESS_YES:
                break
    if hw == "service" and tags.get("service") in ("parking_aisle", "drive-through", "emergency_access"):
        return None
    if hw == "track":
        grade = tags.get("tracktype")
        if grade in ("grade4", "grade5") or tags.get("motor_vehicle") == "no":
            return None
        return float(TRACK_GRADE_KMH.get(grade, SPEEDS_KMH["track"]))
    default = SPEEDS_KMH[hw]
    limit = parse_maxspeed(tags.get("maxspeed"))
    if limit is None:
        return default
    return min(limit * MAXSPEED_FACTOR, default * 1.2)


def way_direction(tags: dict) -> int:
    """1 forward only, -1 backward only, 0 both ways."""
    ow = tags.get("oneway")
    if ow in ("yes", "true", "1"):
        return 1
    if ow in ("-1", "reverse"):
        return -1
    if ow in ("no", "false", "0", "reversible", "alternating"):
        return 0
    if tags.get("junction") in ("roundabout", "circular") or tags.get("highway") in ("motorway",):
        return 1
    return 0
