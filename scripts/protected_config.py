"""Protected-area sources for the overlay and the per-parish protection shares.

Two categories, each fed by one pluggable source:
  rnap     Rede Nacional de Áreas Protegidas (ICNF)
  natura   Natura 2000 (EEA end-2024 release; ICNF BDG/RN2000 is a drop-in alternative)

CATEGORIES is the single switch: point a category at another key of SOURCES to swap its
source, or set it to None to drop the category from the pipeline, the stats and the web app
(the web app reads the categories from web/data/protected.meta.json).

Every source is normalised by build_protected.py to the same columns:
  code  site code (RNAP sigla, Natura SITECODE)
  name  site name
  type  designation (Parque Natural, Reserva Natural, ...; ZPE / ZEC for Natura)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data/external/protected"  # gitignored (data/external/)


@dataclass(frozen=True)
class PtLabels:
    """The Portuguese versions of a source's display labels, for the web app's PT/EN toggle.

    Empty fields fall back to the English (default) ones. `types` maps the `type` labels as built
    (type_labels values, or the source's own designations) to Portuguese; unlisted ones show as is.
    """

    title: str = ""
    release: str = ""
    licence: str = ""
    types: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ArcGisSource:
    """An ArcGIS REST MapServer, queried page by page (f=geojson, outSR=4326)."""

    id: str
    service: str  # .../MapServer, no trailing slash
    layers: dict[int, str | None]  # layer id -> fixed `type` for every feature of the layer (None: read type_field)
    code_field: str
    name_field: str
    type_field: str | None
    provider: str
    title: str
    licence: str
    licence_url: str | None
    licence_confirmed: bool
    release: str | None = None  # dataset version, if the source states one; else the fetch date stands for it
    page_size: int = 25  # well under maxRecordCount; RNAP parks are large polygons
    pt: PtLabels = field(default_factory=lambda: PtLabels())

    @property
    def url(self) -> str:
        return self.service

    def cache_dir(self) -> Path:
        return CACHE / self.id


@dataclass(frozen=True)
class FileSource:
    """A single downloadable dataset (GeoPackage), filtered to Portugal when read."""

    id: str
    url: str  # landing page / catalogue record (cited in the metadata)
    download_url: str
    download_auth: str | None  # "user:" for a public Nextcloud share (the share token is the user)
    filename: str
    sha256: str | None  # pinned after the first download; None accepts any file and prints its hash
    layer: str | None
    where: str  # OGR SQL filter applied when reading
    code_field: str
    name_field: str
    type_field: str
    type_labels: dict[str, str] = field(default_factory=dict)
    provider: str = ""
    title: str = ""
    licence: str = ""
    licence_url: str | None = None
    licence_confirmed: bool = False
    release: str | None = None
    pt: PtLabels = field(default_factory=lambda: PtLabels())

    def cache_dir(self) -> Path:
        return CACHE / self.id

    def path(self) -> Path:
        return self.cache_dir() / self.filename


# Natura 2000 site types: A = SPA (Birds Directive), B = SCI/SAC (Habitats Directive), C = both.
NATURA_TYPES = {"A": "ZPE (Birds Directive)", "B": "ZEC/SIC (Habitats Directive)", "C": "ZPE + ZEC (both Directives)"}
NATURA_TYPES_PT = {
    "ZPE (Birds Directive)": "ZPE (Diretiva Aves)",
    "ZEC/SIC (Habitats Directive)": "ZEC/SIC (Diretiva Habitats)",
    "ZPE + ZEC (both Directives)": "ZPE + ZEC (ambas as Diretivas)",
}
UNCONFIRMED_PT = "Condições de reutilização não confirmadas"

SOURCES: dict[str, ArcGisSource | FileSource] = {
    "rnap-icnf": ArcGisSource(
        id="rnap-icnf",
        service="https://sigservices.icnf.pt/server/rest/services/BDG/RNAP/MapServer",
        layers={0: None},  # "RNAP - Limites"
        code_field="sigla",
        name_field="nome_ap",
        type_field="classifica",
        provider="ICNF",
        title="Rede Nacional de Áreas Protegidas (RNAP)",
        licence="Reuse terms not confirmed",
        licence_url=None,
        licence_confirmed=False,
        pt=PtLabels(licence=UNCONFIRMED_PT),  # the RNAP designations are already Portuguese
    ),
    "natura-eea": FileSource(
        id="natura-eea",
        url="https://sdi.eea.europa.eu/catalogue/srv/api/records/91357f39-7866-41ce-b447-43905c364ec8",
        download_url="https://sdi.eea.europa.eu/datashare/public.php/webdav/Natura2000_end2024.gpkg",
        download_auth="mwzs9eNsJ9Sn4Q4:",
        filename="Natura2000_end2024.gpkg",
        sha256="fc947b015a71e87be1cec3d255ba6f0c41dc434649984476beed88e537964f42",
        layer="NaturaSite_polygon",
        where="MS = 'PT'",
        code_field="SITECODE",
        name_field="SITENAME",
        type_field="SITETYPE",
        type_labels=NATURA_TYPES,
        provider="EEA",
        title="Natura 2000 (vector), version end 2024",
        licence="CC BY 4.0",
        licence_url="https://creativecommons.org/licenses/by/4.0/",
        licence_confirmed=True,
        release="end 2024",
        pt=PtLabels(title="Natura 2000 (vetorial), versão de fim de 2024", release="fim de 2024", types=NATURA_TYPES_PT),
    ),
    # Drop-in alternative for "natura": ICNF's own Natura 2000 layers (ZPE, SIC). Same licence caveat as RNAP.
    "natura-icnf": ArcGisSource(
        id="natura-icnf",
        service="https://sigservices.icnf.pt/server/rest/services/BDG/RN2000/MapServer",
        layers={0: "ZPE (Birds Directive)", 1: "ZEC/SIC (Habitats Directive)"},
        code_field="site_code",
        name_field="site_name",
        type_field=None,
        provider="ICNF",
        title="Rede Natura 2000 (ICNF BDG/RN2000)",
        licence="Reuse terms not confirmed",
        licence_url=None,
        licence_confirmed=False,
        pt=PtLabels(licence=UNCONFIRMED_PT, types=NATURA_TYPES_PT),
    ),
}

# The single switch. Order is the legend and panel order.
CATEGORIES: dict[str, str | None] = {
    "rnap": "rnap-icnf",
    "natura": "natura-eea",
}


def enabled() -> dict[str, ArcGisSource | FileSource]:
    """Category -> source, for the enabled categories, in CATEGORIES order."""
    return {cat: SOURCES[src] for cat, src in CATEGORIES.items() if src}
