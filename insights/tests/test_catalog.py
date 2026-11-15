"""Every insight's computation on the fixture (conftest.py), with the expected values worked out by hand."""

import re

import pytest

from insights import config as cfg
from insights.catalog import REGISTRY, Blocked, compute, compute_all
from insights.catalog.base import Data, num, pct, signed_pct

approx = pytest.approx


def test_area_vs_population(data):
    n = compute("area_vs_population", data).numbers
    assert n["area_share"] == approx(205 / 255)  # Anta+Bouça+Cela+Dornas+Gralha
    assert n["pnct_population_2021"] == 100 + 250 + 1100 + 40  # Census units, the split one whole
    assert n["population_share"] == approx(1490 / 25690)


def test_parish_count(data):
    n = compute("parish_count", data).numbers
    assert (n["pnct_parishes"], n["parishes"]) == (5, 7)


def test_concelhos_split(data):
    n = compute("concelhos_split", data).numbers
    assert (n["full"], n["partial"], n["none"]) == (2, 1, 1)
    assert n["examples"][0]["concelho"] == "Ab"


def test_districts_area_share(data):
    n = compute("districts_area_share", data).numbers
    assert n["entirely_pnct"] == ["Gamma"] and n["no_pnct"] == ["Beta"]
    assert n["shares"]["Alpha"] == approx(200 / 210, abs=1e-4)


def test_districts_population_share(data):
    n = compute("districts_population_share", data).numbers
    assert n["shares"]["Alpha"] == approx(1450 / 6650, abs=1e-4)
    assert n["entirely_pnct"] == ["Gamma"] and n["no_pnct"] == ["Beta"]


def test_density_contrast(data):
    n = compute("density_contrast", data).numbers
    assert n["pnct_density"] == approx(1490 / 205)
    assert n["non_pnct_density"] == approx((5200 + 19000) / 50)


def test_closest_to_cities(data):
    assert compute("closest_to_porto", data).numbers["closest"] == "Anta"  # Eira (10 km) isn't PNCT, Bouça (25) is disputed
    assert compute("closest_to_lisbon", data).numbers["closest"] == "Gralha"


def test_closest_to_airports(data):
    n = compute("closest_to_airports", data).numbers
    assert n["opo"]["parish"] == "Anta" and n["lis"]["parish"] == "Gralha" and n["fao"]["parish"] == "Gralha"  # Bouça is disputed
    assert n["fao"]["km"] == 30.0


def test_coast(data):
    assert compute("closest_to_coast", data).numbers["top5"][0]["name"] == "Anta"
    n = compute("coastal_pnct_parishes", data).numbers
    assert (n["pnct_coastal"], n["coastal"]) == (1, 2)


def test_population_extremes_use_only_unchanged_parishes(data):
    least = compute("least_populated_pnct", data).numbers["top5"]
    assert [r["name"] for r in least] == ["Gralha", "Anta", "Dornas"]  # the split Bouça/Cela never appear
    assert compute("most_populous_pnct", data).numbers["top5"][0]["name"] == "Dornas"


def test_area_extremes(data):
    assert compute("largest_pnct_area", data).numbers["top5"][0]["name"] == "Anta"
    assert compute("smallest_pnct_area", data).numbers["top5"][0]["name"] == "Gralha"


def test_density_extremes(data):
    assert compute("emptiest_pnct_density", data).numbers["top5"][0]["name"] == "Anta"  # 1/km²
    n = compute("densest_pnct_vs_emptiest_other", data).numbers
    assert n["densest_pnct"]["name"] == "Dornas" and n["densest_pnct"]["density"] == 55.0
    assert n["emptiest_other"]["name"] == "Fonte" and n["emptiest_other"]["density"] == 475.0


def test_population_change(data):
    n = compute("population_change", data).numbers
    assert n["pnct_change"] == approx(1490 / 1470 - 1)
    assert n["other_change"] == approx(24200 / 25000 - 1)


def test_shrinking_parishes(data):
    n = compute("shrinking_parishes", data).numbers
    assert n["pnct_share_shrank"] == approx(3 / 4) and n["other_share_shrank"] == approx(1 / 2)


def test_concelho_change(data):
    n = compute("concelhos_biggest_loss", data).numbers
    assert n["top5"][0]["concelho"] == "Ga" and n["top5"][0]["change"] == approx(-0.2)
    assert n["shrank"] == 2
    with pytest.raises(Blocked):  # no fully PNCT concelho grew in the fixture
        compute("concelhos_that_grew", data)


def test_housing(data):
    assert compute("cheapest_coastal_pnct", data).numbers["top5"] == [{"concelho": "Aa", "sale_m2": 500.0, "seat_coast_km": 10.0}]
    below = compute("below_national_median", data).numbers
    assert below["top5"][0]["concelho"] == "Ga" and below["top5"][0]["below"] == approx(0.8)
    assert compute("housing_median_contrast", data).numbers["median_of_pnct_concelhos"] == 450.0
    n = compute("under_1000_m2", data).numbers
    assert (n["under_1000"], n["concelhos"]) == (2, 2)


def test_usage_is_blocked_not_guessed(data):
    with pytest.raises(Blocked) as e:
        compute("most_viewed_parishes", data)
    assert e.value.missing


def test_every_insight_is_complete(data):
    ready, blocked = compute_all(data)
    assert len(REGISTRY) >= 21 and set(ready) | set(blocked) == set(REGISTRY)
    for ins in ready.values():
        assert ins.source.startswith("Fonte: ") and ins.source_en.startswith("Source: ")
        assert ins.assumptions, f"{ins.id}: no assumptions stated"
        assert ins.chart_spec["type"] in {"bars", "contrast", "map"}
        for lang, cap in (("en", ins.caption_en), ("pt", ins.caption_pt)):
            assert cap.endswith(cfg.link(ins.id)), ins.id
            assert f"https://pnct.singledev.eu/i/{ins.id}?utm_source=facebook&utm_medium=social&utm_campaign=insights" in cap
            body = cap.rsplit("\n\n", 1)[0]
            sentences = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])", body)
            assert len(sentences) <= 2, f"{ins.id} {lang}: hook + context only, then the link line"
        for k in ("headline", "subtitle"):
            assert set(ins.chart_spec[k]) == {"en", "pt"}


def test_distance_insights_say_straight_line(data):
    for iid in ("closest_to_porto", "closest_to_lisbon", "closest_to_airports", "closest_to_coast"):
        ins = compute(iid, data)
        assert "straight line" in ins.caption_en and "linha reta" in ins.caption_pt
        assert ins.footnote and "straight line" in ins.footnote["en"]


def test_check_fails_loudly_on_bad_totals(fixture_dir):
    import json

    p = fixture_dir / "national.json"
    n = json.loads(p.read_text())
    n["census_mainland"]["2021"] += 1
    p.write_text(json.dumps(n))
    with pytest.raises(AssertionError, match="Census 2021"):
        Data(fixture_dir)


def test_formatting():
    assert num(1861, "en") == "1,861" and num(1861, "pt") == "1 861"
    assert pct(0.7719, "en") == "77%" and pct(0.0412, "pt", 1) == "4,1%"
    assert pct(0.9996, "en") == "99.96%"  # never a false 100%
    assert pct(0.0004, "en") == "0.04%" and pct(1.0, "en") == "100%"
    assert signed_pct(-0.092, "en") == "−9.2%" and signed_pct(0.001, "pt") == "+0,1%"


def test_real_prepared_data_loads_and_checks():
    """The committed prepared data passes the same checks (INE totals, CAOP area)."""
    d = Data()
    assert len(d.parishes) == 3049 and len(d.pnct) == 1860  # legal: IEFP's 1,861 − 3 + 2 (data/pnct_status.csv)
    ready, _ = compute_all(d)
    assert len(ready) >= 20


def test_cheapest_in_portugal_claim_only_when_the_table_says_so(fixture_dir):
    import json

    ins = compute("below_national_median", Data(fixture_dir))
    assert "lowest of any municipality in Portugal in 2025" in ins.caption_en
    assert "mais baixo de todos os municípios do país" in ins.caption_pt
    assert "4 of 5 municipalities" in ins.footnote["en"] and "Ilha" in ins.footnote["en"]
    p = fixture_dir / "national.json"
    n = json.loads(p.read_text())
    n["sale_m2"]["lowest_municipality"].update(municipality="Elsewhere", tied=["Elsewhere"], value=100.0)
    p.write_text(json.dumps(n))
    ins = compute("below_national_median", Data(fixture_dir))
    assert "lowest of any municipality" not in ins.caption_en and "Lowest in Portugal" not in ins.footnote["en"]


def test_coastline_wording_in_captions(data):
    for iid in ("closest_to_coast", "coastal_pnct_parishes", "cheapest_coastal_pnct"):
        ins = compute(iid, data)
        assert "coastline incl. estuaries and lagoons" in ins.caption_en, iid
        assert "linha de costa, incl. estuários e lagoas" in ins.caption_pt, iid


def test_population_share_says_what_it_measures(data):
    ins = compute("area_vs_population", data)
    assert "(Census 2021, all PNCT parishes)" in ins.caption_en
    assert "(Censos 2021, todas as freguesias PNCT)" in ins.caption_pt




def test_split_concelhos_use_the_legal_count(data):
    ins = compute("concelhos_split", data)
    text = " ".join(a["en"] for a in ins.assumptions)
    assert "Portaria 208/2017" in text and "21 split concelhos" in text
    assert ins.footnote["en"] == "1 parishes are classified differently by IEFP; see map." or "classified differently by IEFP" in ins.footnote["en"]
    assert all(e["concelho"] != "Aa" for e in ins.numbers["examples"])  # Aa has the disputed Bouça


def test_totals_use_the_legal_status_and_say_so(data):
    ins = compute("area_vs_population", data)
    assert ins.numbers["area_share"] == pytest.approx(205 / 255)  # Bouça (disputed, legally PNCT) still counts
    assert "classified differently by IEFP; see map" in ins.footnote["en"] and "lista do IEFP" in ins.footnote["pt"]
    assert any("Portaria 208/2017" in a["en"] for a in ins.assumptions)


def test_no_insight_names_a_disputed_parish(data):
    from insights.catalog import check_no_disputed

    ready, _ = compute_all(data)
    check_no_disputed(ready, data)  # Bouça never appears
    bad = compute("parish_count", data)
    bad.caption_en += " Bouça (Aa) is close."
    with pytest.raises(ValueError, match="Bouça"):
        check_no_disputed({"parish_count": bad}, data)


def test_real_data_legal_definition():
    """The legal definition on the real data: 21 split concelhos, nothing names a disputed parish, the
    CIC low-density note is gone, and the Porto headline is the first undisputed parish."""
    from insights.catalog import check_no_disputed

    d = Data()
    assert (d.municipalities.status == "partial").sum() == 21
    assert set(d.disputed.dicofre) == {"160209", "101610", "010613", "010614", "010615"}
    ready, _ = compute_all(d)
    check_no_disputed(ready, d)
    porto = ready["closest_to_porto"]
    assert porto.numbers["closest"] not in set(d.disputed.name)
    assert all("Deliberação 20/2018" not in (i.footnote or {}).get("en", "") for i in ready.values())
