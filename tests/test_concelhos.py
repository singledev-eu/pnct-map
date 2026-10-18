import csv
import gzip
import json
import sys
from pathlib import Path

import pyogrio
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_concelhos as bc  # noqa: E402
import concelhos_config as cfg  # noqa: E402
import validate_contacts as vc  # noqa: E402

DATA = ROOT / "data/concelhos.json"
WEB = ROOT / "web/data/concelhos.json"
TOPO = ROOT / "web/data/pnct.topo.json"
INE_FIELDS = ["population", "population_2011", "population_2021", "census_change", "density", "ageing_index"]


@pytest.fixture(scope="module")
def data():
    return json.loads(DATA.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def web():
    return json.loads(WEB.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def caop():
    df = pyogrio.read_dataframe(cfg.CAOP_GPKG, layer="cont_municipios", read_geometry=False)
    return dict(zip(df.dtmn, df.municipio))


@pytest.fixture(scope="module")
def pnct_dicos():
    """Concelhos with at least one PNCT parish (from the committed display data)."""
    topo = json.loads(TOPO.read_text(encoding="utf-8"))
    return {g["properties"]["dicofre"][:4] for g in topo["objects"]["parishes"]["geometries"] if g["properties"]["pnct"]}


@pytest.fixture(scope="module")
def contact_rows():
    with cfg.CONTACTS_CSV.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ---- coverage ----------------------------------------------------------------------------------


def test_every_mainland_concelho_has_every_ine_field(data, caop):
    assert set(data["concelhos"]) == set(caop)
    missing = [(d, f) for d, c in data["concelhos"].items() for f in INE_FIELDS if c[f] is None]
    assert missing == []


def test_pnct_concelho_count(pnct_dicos):
    assert len(pnct_dicos) == 185


def test_contacts_in_the_data_match_the_csv(data, contact_rows):
    curated = {r["dico"] for r in contact_rows}
    assert {d for d, c in data["concelhos"].items() if c["contacts"]} == curated


def test_every_pnct_concelho_is_curated(pnct_dicos, contact_rows):
    missing = sorted(pnct_dicos - {r["dico"] for r in contact_rows})
    assert missing == [], f"{len(missing)} PNCT concelhos without contacts"


# ---- sanity ranges and sums ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "field, lo, hi",
    [
        ("population", 1_000, 700_000),
        ("population_2011", 1_000, 700_000),
        ("population_2021", 1_000, 700_000),
        ("density", 1, 10_000),
        ("ageing_index", 50, 1_000),
        ("census_change", -40, 80),
    ],
)
def test_values_in_range(data, field, lo, hi):
    out = {d: c[field] for d, c in data["concelhos"].items() if not lo <= c[field] <= hi}
    assert out == {}


def test_municipalities_sum_to_the_mainland(data):
    for field in ["population", "population_2011", "population_2021"]:
        assert sum(c[field] for c in data["concelhos"].values()) == data["mainland"][field], field


def test_census_change_is_census_to_census(data):
    for c in data["concelhos"].values():
        assert c["census_change"] == round(100 * (c["population_2021"] - c["population_2011"]) / c["population_2011"], 1)
    assert data["concelhos"]["0505"]["census_change"] == -14.0  # Idanha-a-Nova, the phase 1 example


def test_national_ageing_index_is_portugal(data):
    assert data["national"]["ageing_index"] == pytest.approx(188.8, abs=15)  # PT, not Continente (190.2 in 2025)
    assert data["fields"]["ageing_index"]["as_of"] == str(data["estimate_year"])


def test_density_uses_the_caop_area(data):
    area = pyogrio.read_dataframe(cfg.CAOP_GPKG, layer="cont_municipios", read_geometry=False).set_index("dtmn").area_ha / 100
    for d, c in data["concelhos"].items():
        assert c["density"] == round(c["population"] / area[d], 1)


# ---- series guard --------------------------------------------------------------------------------


def test_estimates_come_from_the_current_series(data):
    year = data["estimate_year"]
    assert year >= cfg.FIRST_ESTIMATE_YEAR
    f = data["fields"]
    assert f["population"]["as_of"] == f["ageing_index"]["as_of"] == f["density"]["as_of"] == str(year)
    assert (f["population_2011"]["as_of"], f["population_2021"]["as_of"]) == ("2011", "2021")
    fetched = json.loads((cfg.CACHE / "fetch.json").read_text(encoding="utf-8")) if (cfg.CACHE / "fetch.json").exists() else None
    if fetched:  # the cache is gitignored: on a fresh clone only the committed output is checked
        assert {k: v["period"] for k, v in fetched["queries"].items()} == {
            "population": str(year),
            "ageing_index": str(year),
            "population_2011": "2011",
            "population_2021": "2021",
        }


def test_every_field_has_meta(data):
    for name in [*INE_FIELDS, "contacts"]:
        meta = data["fields"][name]
        assert meta["source"] and meta["url"].startswith("https://") and meta["as_of"]
        if name != "contacts":
            assert meta["licence"] == "CC BY 4.0"


def test_estimate_year_before_the_series_is_refused(monkeypatch):
    import fetch_ine

    metas = {code: {"UltimoPeriodo": "2025", "note": cfg.SERIES_NOTE} for code in ["0012917", "0012909"]}
    monkeypatch.setattr(cfg, "ESTIMATE_YEAR", 2020)
    with pytest.raises(SystemExit, match="before the current series"):
        fetch_ine.estimate_year(metas)
    monkeypatch.setattr(cfg, "ESTIMATE_YEAR", None)
    assert fetch_ine.estimate_year(metas) == 2025
    metas["0012909"] = {"UltimoPeriodo": "2025"}  # the series note disappeared
    with pytest.raises(SystemExit, match="series note"):
        fetch_ine.estimate_year(metas)


# ---- parsing (synthetic) ---------------------------------------------------------------------------


def test_municipal_values_maps_both_code_styles():
    response = [{"Dados": {"2025": [
        {"geocod": "PT", "valor": "100"},
        {"geocod": "1", "valor": "90"},
        {"geocod": "1950505", "valor": "8360"},  # NUTS 2024: NUTS3 + DICO
        {"geocod": "2004901", "valor": "434"},  # Azores: not mainland
        {"geocod": "0505", "valor": "9716"},  # Census table: bare DICO
        {"geocod": "3101", "valor": "1"},  # Madeira municipality (Census table)
        {"geocod": "050501", "valor": "5"},  # a parish
        {"geocod": "1210", "valor": ""},  # no value
    ]}}]
    mun, other = bc.municipal_values(response)
    assert mun == {"0505": 9716.0}  # the later bare-DICO row wins over the NUTS one; both map to 0505
    assert other["PT"] == 100 and "2004901" in other and "3101" in other and "1210" not in mun


def test_pct_change():
    assert bc.pct_change(8355, 9716) == -14.0
    assert bc.pct_change(None, 9716) is None and bc.pct_change(1, 0) is None


# ---- contacts --------------------------------------------------------------------------------------


def test_contacts_csv_passes_the_offline_checks(contact_rows, caop):
    with cfg.CONTACTS_CSV.open(newline="", encoding="utf-8") as f:
        assert csv.DictReader(f).fieldnames == vc.COLUMNS
    problems = [f"{r['dico']}: {p}" for r in contact_rows for p in vc.check_row(r, caop) if not p.startswith(vc.WARNING)]
    assert problems == []
    dicos = [r["dico"] for r in contact_rows]
    assert len(dicos) == len(set(dicos))


def test_pdm_status_from_the_review(data, contact_rows):
    statuses = {r["dico"]: r["pdm_status"] for r in contact_rows}
    assert sum(s == "unclear" for s in statuses.values()) == 24  # the review's "PDM unclear" list (phase 2 report)
    assert statuses["1210"] == "unclear" and statuses["0505"] == "in_force"  # Marvão, Idanha-a-Nova
    assert {d for d, s in statuses.items() if not s} == {"0708", "0901", "1803"}  # no PDM page: Mourão, Aguiar da Beira, Castro Daire
    for d, s in statuses.items():
        assert data["concelhos"][d]["contacts"]["pdm_status"] == (s or None)


def test_no_personal_emails(contact_rows):
    assert [r["email"] for r in contact_rows if vc.looks_personal(r["email"])] == []


@pytest.mark.parametrize(
    "change, expect",
    [
        ({}, None),
        ({"email": "joao.silva@cm-x.pt"}, "personal"),
        ({"email": "geral@gmail.com"}, "free-mail"),
        ({"email": "geral@municipio-agueda.pt"}, "warning: email domain"),
        ({"email": "cm.agueda@cm-agueda.pt"}, None),  # institutional prefix, not a person
        ({"email": "secretaria.gap@cm-agueda.pt"}, None),  # Penamacor's "Geral" style
        ({"phone": "234 610 070"}, "phone malformed"),
        ({"name": "Agueda"}, "!= CAOP"),
        ({"pdm_url": "http://www.cm-agueda.pt/pages/81"}, "not an https URL"),
        ({"urbanism_url": ""}, None),  # optional
        ({"pdm_url": "", "pdm_status": ""}, "warning: pdm_url is empty"),  # allowed, but flagged
        ({"pdm_status": "unclear"}, None),
        ({"pdm_status": ""}, "pdm_status must be one of"),  # required with a pdm_url
        ({"pdm_status": "maybe"}, "pdm_status must be one of"),
        ({"pdm_url": "", "pdm_status": "in_force"}, "without a pdm_url"),
        ({"website": ""}, "website is empty"),
        ({"pdm_url": "https://geo.cm-agueda.com/pdm"}, "warning: pdm_url is off"),
    ],
)
def test_check_row(caop, change, expect):
    row = {"dico": "0101", "name": "Águeda", "website": "https://www.cm-agueda.pt/", "email": "geral@cm-agueda.pt", "phone": "+351 234 610 070",
           "urbanism_url": "https://www.cm-agueda.pt/u", "pdm_url": "https://www.cm-agueda.pt/pages/81", "pdm_status": "in_force", "source_url": "https://www.cm-agueda.pt/",
           "as_of": "2026-10-18", "notes": ""} | change
    problems = vc.check_row(row, caop)
    if expect is None:
        assert problems == []
    else:
        assert any(expect in p for p in problems), problems


# ---- web file --------------------------------------------------------------------------------------


def test_web_file_drops_the_notes_and_keeps_the_rest(data, web):
    assert web["fields"] == data["fields"] and web["national"] == data["national"]
    assert "mainland" not in web
    for d, c in web["concelhos"].items():
        if c["contacts"]:
            assert "notes" not in c["contacts"]
            assert c["contacts"] == {k: v for k, v in data["concelhos"][d]["contacts"].items() if k != "notes"}


def test_web_file_size_budget():
    raw = WEB.read_bytes()
    assert len(raw) < 120_000 and len(gzip.compress(raw)) < 30_000
