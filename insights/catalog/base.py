"""The insight result, the registry, the prepared-data loader and EN/PT number formatting."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path

import pandas as pd

from insights import config as cfg

NBSP = " "


# --- Result and registry -------------------------------------------------------------------------


@dataclass
class Insight:
    id: str
    title: str  # EN
    title_pt: str
    numbers: dict  # the key numbers, raw values
    caption_en: str
    caption_pt: str
    source: str  # "Fonte: …" (PT, as posted)
    source_en: str  # "Source: …"
    chart_spec: dict  # read by insights.render
    evergreen: bool
    assumptions: list[dict] = field(default_factory=list)  # [{"en", "pt"}]: every choice behind the numbers
    footnote: dict | None = None  # {"en", "pt"}: printed on the image when it changes the reading

    def to_dict(self) -> dict:
        return asdict(self)


class Blocked(Exception):
    """The insight can't be computed: missing data (named), never an estimate in its place."""

    def __init__(self, reason: str, missing: list[str] | None = None):
        super().__init__(reason)
        self.reason = reason
        self.missing = missing or []


@dataclass(frozen=True)
class Entry:
    id: str
    evergreen: bool
    fn: Callable[["Data"], Insight]


REGISTRY: dict[str, Entry] = {}


def insight(id: str, evergreen: bool = True):
    def wrap(fn):
        if id in REGISTRY:
            raise ValueError(f"duplicate insight id {id}")
        REGISTRY[id] = Entry(id, evergreen, fn)
        return fn

    return wrap


# --- Sources -------------------------------------------------------------------------------------

SOURCES = {
    "census": ("INE, Censos 2011 e 2021", "INE, Census 2011 and 2021"),
    "census21": ("INE, Censos 2021", "INE, Census 2021"),
    "caop": ("DGT, CAOP 2025", "DGT, CAOP 2025"),
    "pnct": ("IEFP, lista PNCT 2026", "IEFP, PNCT list 2026"),
    "osm": ("© OpenStreetMap", "© OpenStreetMap"),
    "sale": ("INE, valor mediano das vendas €/m² ({period})", "INE, median dwelling sale value €/m² ({period})"),
}


def sources(d: "Data", *keys: str) -> tuple[str, str]:
    period = d.national["sale_m2"]["period"]
    pt = "; ".join(SOURCES[k][0].format(period=period) for k in ("pnct", *keys))
    en = "; ".join(SOURCES[k][1].format(period=period) for k in ("pnct", *keys))
    return f"Fonte: {pt}", f"Source: {en}"


# --- Formatting ----------------------------------------------------------------------------------


def num(x: float, lang: str, nd: int = 0) -> str:
    s = f"{x:,.{nd}f}"
    if lang == "pt":
        s = s.replace(",", NBSP).replace(".", ",")
    return s


def pct(share: float, lang: str, nd: int = 0) -> str:
    """A share (0–1) as a percentage: "77%", "1.5%" / "1,5%". Never rounds to a false 100% or 0%:
    adds decimals until the printed value is honest (99.96% stays "99.96%", not "100%")."""
    while nd < 4 and ((0 < share < 1 and round(share * 100, nd) in (0, 100))):
        nd += 1
    return num(share * 100, lang, nd) + "%"


def signed_pct(share: float, lang: str, nd: int = 1) -> str:
    s = pct(abs(share), lang, nd)
    return ("+" if share > 0 else "−" if share < 0 else "") + s


def place(row) -> str:
    """'Parish (Concelho)', or 'Parish, Concelho' when the parish name already has parentheses."""
    return f"{row['name']}, {row['concelho']}" if "(" in row["name"] else f"{row['name']} ({row['concelho']})"


def km(x: float, lang: str) -> str:
    return f"{num(x, lang, 0 if x >= 10 else 1)}{NBSP}km"


def eur_m2(x: float, lang: str) -> str:
    return f"{num(x, lang)}{NBSP}€/m²"


# Place names that take an article in Portuguese ("distrito do Porto", "na Guarda"); the rest take none.
ARTICLE_PT = {"Porto": "o", "Guarda": "a"}


def de_pt(name: str) -> str:
    return {"o": "do ", "a": "da "}.get(ARTICLE_PT.get(name, ""), "de ") + name


def em_pt(name: str) -> str:
    return {"o": "no ", "a": "na "}.get(ARTICLE_PT.get(name, ""), "em ") + name


def both(f: Callable[[str], str]) -> dict:
    return {"en": f("en"), "pt": f("pt")}


def caption(insight_id: str, en: tuple[str, str], pt: tuple[str, str]) -> tuple[str, str]:
    """hook → context → link: at most three short sentences."""
    url = cfg.link(insight_id)
    return f"{en[0]} {en[1]}\n\nExplore the map: {url}", f"{pt[0]} {pt[1]}\n\nExplore o mapa: {url}"


# --- Common assumptions --------------------------------------------------------------------------

def a_area(d: "Data") -> dict:
    caop = d.national["mainland_area_km2_caop"]
    return {
        "en": f"Areas are computed from CAOP 2025 polygons in EPSG:3763 (PT-TM06); the mainland total matches CAOP's official {num(caop, 'en')} km².",
        "pt": f"Áreas calculadas a partir dos polígonos da CAOP 2025 em EPSG:3763 (PT-TM06); o total do continente coincide com o valor oficial da CAOP ({num(caop, 'pt')} km²).",
    }


def a_census(d: "Data") -> dict:
    cw = d.national["crosswalk"]
    n, split = cw["census_2021_parishes"], cw["split_census_parishes"]
    odd_en = "".join(
        f" {u['name']} ({pct(1 - u['pnct_share'], 'en')} non-PNCT after the 2025 boundary changes) counts as non-PNCT."
        if u["pnct_share"] < 0.5 else f" {u['name']} ({pct(u['pnct_share'], 'en')} PNCT after the 2025 boundary changes) counts as PNCT."
        for u in cw["not_clean"])
    odd_pt = "".join(
        f" {u['name']} ({pct(1 - u['pnct_share'], 'pt')} não PNCT após as alterações de limites de 2025) conta como não PNCT."
        if u["pnct_share"] < 0.5 else f" {u['name']} ({pct(u['pnct_share'], 'pt')} PNCT após as alterações de limites de 2025) conta como PNCT."
        for u in cw["not_clean"])
    return {
        "en": f"Population is counted on the {num(n, 'en')} Censos 2021 parishes (INE publishes 2011 on the same boundaries). "
              f"{split} of them were split in 2025; each is wholly PNCT or wholly non-PNCT, so it is assigned whole.{odd_en}",
        "pt": f"População contada nas {num(n, 'pt')} freguesias dos Censos 2021 (o INE publica 2011 nos mesmos limites). "
              f"{split} foram desagregadas em 2025; cada uma é PNCT ou não PNCT por inteiro e é atribuída por inteiro.{odd_pt}",
    }


def a_same(d: "Data") -> dict:
    k, n = len(d.same), len(d.parishes)
    return {
        "en": f"Only parishes whose 2025 boundaries equal a Censos 2021 parish are ranked ({num(k, 'en')} of {num(n, 'en')}); parishes created or redrawn in 2025 have no Census figure of their own.",
        "pt": f"Só entram freguesias cujos limites de 2025 coincidem com uma freguesia dos Censos 2021 ({num(k, 'pt')} de {num(n, 'pt')}); as criadas ou redesenhadas em 2025 não têm valor próprio nos Censos.",
    }


def f_same(d: "Data") -> dict:
    k, n = len(d.same), len(d.parishes)
    return {
        "en": f"Only parishes unchanged since the 2021 Census ({num(k, 'en')} of {num(n, 'en')}).",
        "pt": f"Só freguesias sem alterações desde os Censos 2021 ({num(k, 'pt')} de {num(n, 'pt')}).",
    }


def a_full(d: "Data") -> dict:
    k = len(d.full)
    return {
        "en": f"Housing values are per concelho, so only the {k} concelhos where every parish is PNCT are used. "
              f"The national reference is INE's value for Portugal ({d.national['sale_m2']['period']}).",
        "pt": f"Os valores da habitação são por concelho, por isso só entram os {k} concelhos com todas as freguesias no PNCT. "
              f"A referência nacional é o valor do INE para Portugal ({d.national['sale_m2']['period']}).",
    }


def a_centroid(d: "Data") -> dict:
    k = int((~d.parishes.centroid_inside.astype(bool)).sum())
    return {
        "en": f"Distances are in a straight line from the parish centroid (EPSG:3763), not by road. For the {k} parishes whose centroid falls outside their own boundary, an interior point is used instead.",
        "pt": f"Distâncias em linha reta a partir do centroide da freguesia (EPSG:3763), não por estrada. Nas {k} freguesias cujo centroide fica fora dos próprios limites, usa-se um ponto interior.",
    }


F_CENTROID = {
    "en": "Distance in a straight line from the parish centre, not by road.",
    "pt": "Distância em linha reta a partir do centro da freguesia, não por estrada.",
}
A_COAST = {
    "en": "The coast is the CAOP 2025 coastline (boundary segments 'Limite e Linha de Costa', 1,217 km), which includes estuary and lagoon shores.",
    "pt": "A costa é a linha de costa da CAOP 2025 (troços 'Limite e Linha de Costa', 1217 km), incluindo margens de estuários e rias.",
}
F_FULL = {
    "en": "Concelhos where every parish is PNCT.",
    "pt": "Concelhos com todas as freguesias no PNCT.",
}


# --- Data ----------------------------------------------------------------------------------------


class Data:
    """The prepared tables, checked on load."""

    def __init__(self, directory: Path = cfg.PREPARED, check: bool = True):
        self.dir = Path(directory)
        dtype = {"dicofre": str, "dtmn": str, "dt": str, "census_code": str}
        self.parishes = pd.read_csv(self.dir / "parishes.csv", dtype=dtype)
        self.units = pd.read_csv(self.dir / "census_units.csv", dtype=dtype)
        self.municipalities = pd.read_csv(self.dir / "municipalities.csv", dtype=dtype)
        self.districts = pd.read_csv(self.dir / "districts.csv", dtype=dtype)
        self.national = json.loads((self.dir / "national.json").read_text(encoding="utf-8"))
        for df in (self.parishes, self.units):
            df["pnct"] = df["pnct"].astype(bool)
        self._map = None
        if check:
            self.check()

    @property
    def map(self) -> dict:
        if self._map is None:
            self._map = json.loads((self.dir / "map.json").read_text())
        return self._map

    def check(self) -> None:
        """Loud failures if the tables disagree with each other or with the official totals."""
        n = self.national
        for year in ("2011", "2021"):
            total = n["census_mainland"][year]
            got = int(self.units[f"pop{year}"].sum())
            assert got == total, f"Census {year} parishes sum to {got}, INE mainland total is {total}"
            got = int(self.municipalities[f"pop{year}"].sum())
            assert got == total, f"Census {year} concelhos sum to {got}, INE mainland total is {total}"
        area = self.parishes.area_km2.sum()
        assert abs(area / n["mainland_area_km2_caop"] - 1) < cfg.AREA_TOLERANCE, f"area {area} vs CAOP {n['mainland_area_km2_caop']}"
        assert self.parishes.dicofre.is_unique and self.units.census_code.is_unique
        assert set(self.parishes.census_code) <= set(self.units.census_code), "parish → Census parish mapping broken"
        same = self.parishes[self.parishes.census_same.astype(bool)]
        assert same.pop2021.notna().all(), "a 1:1 parish lacks its Census population"
        assert self.parishes.loc[~self.parishes.census_same.astype(bool), "pop2021"].isna().all(), "population on a non-1:1 parish"

    # Convenience views
    @property
    def pnct(self) -> pd.DataFrame:
        return self.parishes[self.parishes.pnct]

    @property
    def same(self) -> pd.DataFrame:
        """Parishes whose 2025 boundaries are a Censos 2021 parish (the only ones with a population)."""
        return self.parishes[self.parishes.census_same.astype(bool)]

    @property
    def full(self) -> pd.DataFrame:
        return self.municipalities[self.municipalities.status == "full"]

    def label(self, row) -> str:
        return place(row)


def bar(label: str | dict, value: float, value_label: dict, highlight: bool = False, note: dict | None = None) -> dict:
    return {"label": label, "value": float(value), "value_label": value_label, "highlight": highlight, "note": note}
