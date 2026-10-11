import json
import re
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/interim/pnct_raw.csv"
PNCT = ROOT / "data/processed/pnct_parishes.csv"
UNMATCHED = ROOT / "data/processed/unmatched.csv"
PARISHES_GEOJSON = ROOT / "data/processed/parishes_all.geojson"
CONCELHOS_GEOJSON = ROOT / "data/processed/concelhos.geojson"

WILDCARD_DISTRICTS = ["Beja", "Bragança", "Castelo Branco", "Évora", "Guarda", "Portalegre", "Vila Real"]


@pytest.fixture(scope="module")
def raw():
    return pd.read_csv(RAW)


@pytest.fixture(scope="module")
def pnct():
    return pd.read_csv(PNCT, dtype={"dicofre": str})


@pytest.fixture(scope="module")
def parishes():
    with PARISHES_GEOJSON.open(encoding="utf-8") as f:
        features = json.load(f)["features"]
    return pd.DataFrame([feat["properties"] for feat in features])


def is_wildcard(df):
    return (df.concelho == "TODOS OS CONCELHOS") | (df.freguesia == "TODAS AS FREGUESIAS DO CONCELHO")


def test_pdf_rows_deduped(raw):
    assert len(raw) == 161
    assert not raw.duplicated(["distrito", "concelho", "freguesia"]).any()
    assert (raw.concelho == "SÃO PEDRO DO SUL").sum() == 1


def test_every_explicit_row_maps_to_a_parish(raw, pnct):
    explicit = raw[~is_wildcard(raw)]
    missing = set(explicit.source_row) - set(pnct.source_row)
    assert not missing, raw[raw.source_row.isin(missing)].to_string()


def test_every_wildcard_row_maps_to_a_parish(raw, pnct):
    wildcard = raw[is_wildcard(raw)]
    assert set(wildcard.source_row) <= set(pnct.source_row)


def test_nothing_unmatched():
    unmatched = pd.read_csv(UNMATCHED)
    assert unmatched.empty, unmatched.to_string()


def test_no_duplicate_dicofre(pnct, parishes):
    assert pnct.dicofre.is_unique
    assert parishes.dicofre.is_unique
    assert pnct.dicofre.str.fullmatch(r"\d{6}").all()


def test_csv_and_geojson_agree(pnct, parishes):
    assert set(parishes[parishes.pnct].dicofre) == set(pnct.dicofre)


def test_all_mainland_parishes_present(parishes):
    assert len(parishes) == 3049
    assert parishes.distrito.nunique() == 18


@pytest.mark.parametrize("distrito", WILDCARD_DISTRICTS)
def test_wildcard_districts_fully_pnct(parishes, distrito):
    sub = parishes[parishes.distrito == distrito]
    assert len(sub) > 0
    assert sub.pnct.all()


def test_loule_spot_check(parishes):
    loule = parishes[parishes.concelho == "Loulé"]
    assert set(loule[loule.pnct].freguesia) == {"Alte", "Ameixial", "Salir", "Querença", "Tôr", "Benafim"}
    assert (~loule.pnct).sum() > 0


def test_porto_district_spot_check(parishes):
    porto = parishes[parishes.distrito == "Porto"]
    flagged = porto[porto.pnct]
    assert set(flagged.concelho) == {"Amarante", "Baião", "Marco de Canaveses"}
    assert porto[porto.concelho == "Baião"].pnct.all()
    assert set(flagged[flagged.concelho == "Marco de Canaveses"].freguesia) == {"Várzea, Aliviada e Folhada"}
    assert set(flagged[flagged.concelho == "Amarante"].freguesia) == {
        "Ansiães",
        "Candemil",
        "Gouveia (São Simão)",
        "Jazente",
        "Rebordelo",
        "Salvador do Monte",
        "União das freguesias de Aboadela, Sanche e Várzea",
        "União das freguesias de Bustelo, Carneiro e Carvalho de Rei",
        "União das freguesias de Olo e Canadelo",
        "Vila Chã do Marão",
    }


def test_geojson_size_and_precision():
    assert PARISHES_GEOJSON.stat().st_size < 5 * 1024 * 1024
    text = PARISHES_GEOJSON.read_text(encoding="utf-8")
    decimals = max(len(m) for m in re.findall(r"-?\d+\.(\d+)", text[:200_000]))
    assert decimals <= 5


def test_geojson_is_wgs84_mainland():
    with PARISHES_GEOJSON.open(encoding="utf-8") as f:
        data = json.load(f)
    coords = []

    def walk(c):
        if isinstance(c[0], (int, float)):
            coords.append(c)
        else:
            for x in c:
                walk(x)

    for feat in data["features"][:200]:
        walk(feat["geometry"]["coordinates"])
    lons, lats = zip(*coords)
    assert -9.6 < min(lons) and max(lons) < -6.1
    assert 36.9 < min(lats) and max(lats) < 42.2


def test_concelhos_layer():
    with CONCELHOS_GEOJSON.open(encoding="utf-8") as f:
        features = json.load(f)["features"]
    assert len(features) == 278
    assert {"concelho", "distrito"} <= set(features[0]["properties"])
