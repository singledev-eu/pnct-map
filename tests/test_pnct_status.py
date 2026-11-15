"""The three-state classification (scripts/pnct_status.py, data/pnct_status.csv,
data/sources/pnct-legal-status.md)."""

import json
import sys
from pathlib import Path

import pandas as pd
import pyogrio
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import pnct_status  # noqa: E402

CAOP = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
IEFP = ROOT / "data/processed/pnct_parishes.csv"


@pytest.fixture(scope="module")
def codes():
    gdf = pyogrio.read_dataframe(CAOP, layer="cont_freguesias", columns=["dtmnfr"], read_geometry=False)
    return set(gdf.dtmnfr), set(pd.read_csv(IEFP, dtype=str).dicofre)


@pytest.fixture(scope="module")
def status(codes):
    return pnct_status.classify(*codes)


def test_every_parish_has_exactly_one_status(codes, status):
    all_codes, _ = codes
    assert set(status) == all_codes and len(status) == 3049
    for s in status.values():
        assert s["status"] in pnct_status.STATUSES
        assert s["legal_status"] in ("pnct", "not_pnct") and s["iefp_status"] in ("pnct", "not_pnct")
        assert (s["status"] == "disputed") == (s["legal_status"] != s["iefp_status"])


def test_disputed_rows_have_a_reason_and_two_sources():
    rows = pnct_status.load_overrides()
    assert rows, "the status file is empty"
    for r in rows:
        assert r["reason"].strip(), r
        if r["status"] == "disputed":
            assert len(r["sources"]) >= 2, r
        assert r["checked"]


def test_the_known_disputes(status):
    expected = {"160209": "pnct", "101610": "pnct", "010613": "not_pnct", "010614": "not_pnct", "010615": "not_pnct"}
    assert {c for c, s in status.items() if s["status"] == "disputed"} == set(expected)
    for code, legal in expected.items():
        assert status[code]["legal_status"] == legal


def test_counts(status):
    values = list(status.values())
    assert sum(s["status"] == "pnct" for s in values) == 1858
    assert sum(s["legal_status"] == "pnct" for s in values) == 1860  # 1,861 − 3 + 2
    assert sum(s["iefp_status"] == "pnct" for s in values) == 1861


def test_validation_catches_mistakes(codes):
    all_codes, iefp = codes
    good = pnct_status.load_overrides()

    def bad(**change):
        rows = [dict(r) for r in good]
        rows[0].update(change)
        with pytest.raises(ValueError):
            pnct_status.validate(rows, all_codes, iefp)

    bad(sources=["https://only.one"])
    bad(reason=" ")
    bad(iefp_status="pnct")  # Dem isn't on the IEFP list
    bad(status="pnct")  # legal and IEFP differ, so it must be disputed
    bad(dicofre="999999")
    with pytest.raises(ValueError):
        pnct_status.validate(good + [dict(good[0])], all_codes, iefp)


def test_web_status_file_matches(status):
    web = json.loads((ROOT / "web/data/pnct-status.json").read_text(encoding="utf-8"))
    assert set(web["disputed"]) == {c for c, s in status.items() if s["status"] == "disputed"}
    for code, d in web["disputed"].items():
        assert d["legal"] == status[code]["legal_status"] and d["iefp"] == status[code]["iefp_status"]
        assert len(d["sources"]) >= 2 and all(s["en"] and s["pt"] and s["url"].startswith("https://") for s in d["sources"])
    assert web["checked"] == pnct_status.checked_date()


def test_legal_record_names_every_disputed_parish():
    text = (ROOT / "data/sources/pnct-legal-status.md").read_text(encoding="utf-8")
    for r in pnct_status.load_overrides():
        assert r["dicofre"] in text and r["freguesia"] in text
