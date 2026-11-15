"""Land check sources: one entry per fact, with its status from docs/land-check/DATA.md.

Only `hazard` is built in v1. REN and fixed broadband are listed with the reason they are blocked,
so the app and the docs read the same record; flipping one on needs a source entry here and a build
script (the app shows only the facts in web/data/landcheck.meta.json).

This module is also the source list of the Raspberry Pi source watcher (ops/pi/source_watcher.py):
HAZARD's URLs and pinned SHA-256 for the live dataset, BLOCKED[...].watch for the blocked ones. It
imports only the standard library, so the Pi can read it without the pipeline's dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data/external/landcheck"  # gitignored (data/external/)
CAOP_GPKG = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"

# The land check files are served by Cloudflare Pages from web/public/landcheck/ (gitignored,
# content-hashed directory names, so they can be cached as immutable). The bundled meta names them.
PUBLIC_DIR = ROOT / "web/public/landcheck"
META_JSON = ROOT / "web/data/landcheck.meta.json"
# Cloudflare Pages refuses files over 25 MiB; the build fails before that, with margin.
MAX_FILE_BYTES = 24 * 1024 * 1024


@dataclass(frozen=True)
class HazardClass:
    value: int  # raster value, and the palette index in the PNG tiles
    color: str  # ICNF's palette (the QML in the download)
    en: str
    pt: str  # ICNF's own class name


@dataclass(frozen=True)
class RasterSource:
    id: str
    url: str  # catalogue page (cited)
    metadata_url: str
    download_url: str
    sha256: str
    zip_member: str
    nodata: int
    reference_date: str  # the dataset's own date (ISO), from the metadata record
    provider: str
    title_en: str
    title_pt: str
    licence_en: str
    licence_pt: str
    licence_url: str
    classes: tuple[HazardClass, ...]

    def cache_dir(self) -> Path:
        return CACHE / self.id

    def zip_path(self) -> Path:
        return self.cache_dir() / Path(self.download_url).name

    def tif_path(self) -> Path:
        return self.cache_dir() / "src" / self.zip_member


HAZARD = RasterSource(
    id="hazard",
    url="https://geocatalogo.icnf.pt/catalogo_tema5.html",
    metadata_url="https://geocatalogo.icnf.pt/metadados/perigosidade_estrutural_20_30.html",
    download_url="https://geocatalogo.icnf.pt/dados/perigosidade_estrutural_2020_2030.zip",
    sha256="4bb7f921ba0da7a8f47b8426ea8ec5001f78dd32ce3e9bab2a746d24780a8011",
    zip_member="perigosidade_estrutural_2020_2030.tif",
    nodata=15,
    reference_date="2022-03-28",
    provider="ICNF",
    title_en="Structural rural fire hazard map 2020–2030",
    title_pt="Carta de perigosidade de incêndio rural (cariz estrutural) 2020–2030",
    # geoCATÁLOGO "Condições de utilização": open data, free reuse, cite "ICNF, layer, URL, date".
    licence_en="ICNF open data, attribution required",
    licence_pt="Dados abertos ICNF, com citação da fonte",
    licence_url="https://geocatalogo.icnf.pt/",
    classes=(
        HazardClass(1, "#45b345", "Very low", "Muito baixa"),
        HazardClass(2, "#ebff2f", "Low", "Baixa"),
        HazardClass(3, "#ee9b00", "Medium", "Média"),
        HazardClass(4, "#dc0f0f", "High", "Alta"),
        HazardClass(5, "#902003", "Very high", "Muito alta"),
    ),
)

@dataclass(frozen=True)
class Watch:
    """An endpoint the Pi source watcher (ops/pi/source_watcher.py) probes to see if a blocked fact can be unblocked.

    kind: "wfs" (GetCapabilities, then a one-feature GetFeature), "wms" (GetCapabilities), "dados_gov"
    (a dados.gov.pt API dataset: licence and resources), "snig_licence" (the use constraints of a SNIG
    record) or "arcgis" (an ArcGIS REST service's capabilities).
    """

    id: str
    kind: str
    url: str
    label: str


@dataclass(frozen=True)
class BlockedFact:
    label: str  # the fact's short name in alerts
    reason: str
    watch: tuple[Watch, ...]


DGT_SERVICES = "https://servicos.dgterritorio.pt"
DADOS_GOV_API = "https://dados.gov.pt/api/1/datasets"
REN_REGIONS = ("NORTE", "CENTRO", "LVT", "ALENTEJO", "ALGARVE", "PT1")

# Facts not built in v1, with the reason (docs/land-check/DATA.md) and what the Pi watcher probes.
BLOCKED: dict[str, BlockedFact] = {
    "ren": BlockedFact(
        label="REN",
        reason="DGT SRUP REN WFS down (database error, 2026-11-15) and licence conflict (dados.gov.pt cc-by vs SNIT consultation-only)",
        watch=(
            *(Watch(f"ren-wfs-{r.lower()}", "wfs", f"{DGT_SERVICES}/SDISNITWFSSRUP_REN_{r}/WFService.aspx", f"DGT SRUP WFS {r}") for r in REN_REGIONS),
            Watch("ren-wms", "wms", f"{DGT_SERVICES}/SDISNITWMSSRUP_REN_PT1/WMService.aspx", "DGT SRUP WMS PT1"),
            Watch("ren-dados", "dados_gov", f"{DADOS_GOV_API}/srup-reserva-ecologica-nacional/", "dados.gov.pt REN dataset"),
            Watch(
                "ren-snig",
                "snig_licence",
                "https://snig.dgterritorio.gov.pt/rndg/srv/api/records/ad95b02a-fbd2-4b8e-89b6-f699a9ff3c0d/formatters/xml",
                "SNIG REN record (use constraints)",
            ),
        ),
    ),
    "broadband": BlockedFact(
        label="fixed broadband (ANACOM)",
        reason="ANACOM publishes only a WMS view service (no query, no download, no licence)",
        watch=(
            Watch("anacom-dados", "dados_gov", f"{DADOS_GOV_API}/cobertura-da-rede-fixa-de-comunicacoes-eletronicas/", "dados.gov.pt ANACOM fixed coverage"),
            Watch("anacom-dados-2023", "dados_gov", f"{DADOS_GOV_API}/cobertura-das-redes-fixas-servicos-de-voz-e-internet/", "dados.gov.pt ANACOM fixed coverage (2023)"),
            Watch("anacom-arcgis", "arcgis", "https://geo.anacom.pt/server/rest/services/publico/Rede_Fixa/MapServer", "ANACOM Rede_Fixa ArcGIS service"),
        ),
    ),
}

# Overlay (display only): static 512 px tiles, z5–z11 (z11 pixels are ~29 m at 40°N; MapLibre
# overzooms past it).
TILE_SIZE = 512
MIN_ZOOM = 5
MAX_ZOOM = 11
# Point lookup: the native 25 m grid in CHUNK × CHUNK-cell zlib files (6.4 km; ~6 KB per lookup).
CHUNK = 256
