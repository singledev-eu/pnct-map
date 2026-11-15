"""Extremes: the smallest, emptiest, largest and densest parishes."""

from __future__ import annotations

from insights.catalog.base import (
    place,
    Data, Insight, a_area, a_legal, a_same, bar, both, caption, f_same, insight, num, sources,
)


def _km2(x: float, lang: str) -> str:
    return f"{num(x, lang, 1 if x < 10 else 0)} km²"


def _dens(x: float, lang: str) -> str:
    return f"{num(x, lang, 1 if x < 10 else 0)}/km²"


def _rows(d: Data, top, col: str, fmt) -> list[dict]:
    return [bar(d.label(r), r[col], both(lambda l, v=r[col]: fmt(v, l)), i == 0) for i, (_, r) in enumerate(top.iterrows())]


def _top5(top, col: str, nd: int = 1) -> list[dict]:
    return [{"dicofre": r.dicofre, "name": r["name"], "concelho": r.concelho, col: round(float(r[col]), nd)} for _, r in top.iterrows()]


def _people(x: float, lang: str) -> str:
    return num(x, lang)


@insight("least_populated_pnct")
def least_populated_pnct(d: Data) -> Insight:
    top = d.same[d.same.pnct].nsmallest(5, "pop2021")
    f = top.iloc[0]
    cap = caption(
        "least_populated_pnct",
        (f"{place(f)} had just {num(f.pop2021, 'en')} residents in the 2021 Census, the fewest of any PNCT parish unchanged since then.",
         f"Ten years earlier it had {num(f.pop2011, 'en')}."),
        (f"{place(f)} tinha apenas {num(f.pop2021, 'pt')} residentes nos Censos 2021, o menor número entre as freguesias PNCT sem alterações desde então.",
         f"Dez anos antes tinha {num(f.pop2011, 'pt')}."),
    )
    src, src_en = sources(d, "census", "caop")
    return Insight(
        id="least_populated_pnct",
        title="Least populated PNCT parishes",
        title_pt="Freguesias PNCT com menos habitantes",
        numbers={"top5": _top5(top, "pop2021", 0), "first_pop2011": int(f.pop2011)},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: num(f.pop2021, l)),
            "subtitle": {"en": f"residents in {f['name']}, the least populated PNCT parish (Census 2021)",
                         "pt": f"residentes: {f['name']}, a freguesia PNCT com menos habitantes (Censos 2021)"},
            "rows": _rows(d, top, "pop2021", _people),
        },
        evergreen=True,
        assumptions=[a_same(d), a_legal(d)],
        footnote=f_same(d),
    )


@insight("most_populous_pnct")
def most_populous_pnct(d: Data) -> Insight:
    top = d.same[d.same.pnct].nlargest(5, "pop2021")
    f = top.iloc[0]
    cap = caption(
        "most_populous_pnct",
        (f"Of the PNCT parishes unchanged since the 2021 Census, the most populous is {place(f)}, with {num(f.pop2021, 'en')} residents.",
         "PNCT is not only villages: these five parishes are home to " + num(top.pop2021.sum(), 'en') + " people."),
        (f"Entre as freguesias PNCT sem alterações desde os Censos 2021, a que tem mais habitantes é {place(f)}, com {num(f.pop2021, 'pt')} residentes.",
         "O PNCT não é só aldeias: estas cinco freguesias têm " + num(top.pop2021.sum(), 'pt') + " habitantes."),
    )
    src, src_en = sources(d, "census21", "caop")
    return Insight(
        id="most_populous_pnct",
        title="Most populous PNCT parishes",
        title_pt="Freguesias PNCT com mais habitantes",
        numbers={"top5": _top5(top, "pop2021", 0)},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: num(f.pop2021, l)),
            "subtitle": {"en": f"residents in {f['name']}, the most populous PNCT parish (Census 2021)",
                         "pt": f"residentes: {f['name']}, a freguesia PNCT com mais habitantes (Censos 2021)"},
            "rows": _rows(d, top, "pop2021", _people),
        },
        evergreen=True,
        assumptions=[a_same(d), a_legal(d)],
        footnote=f_same(d),
    )


@insight("largest_pnct_area")
def largest_pnct_area(d: Data) -> Insight:
    top = d.rank_pnct.nlargest(5, "area_km2")
    f = top.iloc[0]
    ratio = f.area_km2 / d.parishes.area_km2.median()
    cap = caption(
        "largest_pnct_area",
        (f"{place(f)} covers {_km2(f.area_km2, 'en')}, the largest PNCT parish.",
         f"That is {num(ratio, 'en')} times the median mainland parish."),
        (f"{place(f)} ocupa {_km2(f.area_km2, 'pt')}, a maior freguesia PNCT.",
         f"É {num(ratio, 'pt')} vezes a freguesia mediana do continente."),
    )
    src, src_en = sources(d, "caop")
    return Insight(
        id="largest_pnct_area",
        title="Largest PNCT parishes by area",
        title_pt="Maiores freguesias PNCT em área",
        numbers={"top5": _top5(top, "area_km2"), "median_parish_km2": round(float(d.parishes.area_km2.median()), 2)},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: _km2(f.area_km2, l)),
            "subtitle": {"en": f"{f['name']}, the largest PNCT parish", "pt": f"{f['name']}, a maior freguesia PNCT"},
            "rows": _rows(d, top, "area_km2", _km2),
        },
        evergreen=True,
        assumptions=[a_area(d), a_legal(d)],
    )


@insight("smallest_pnct_area")
def smallest_pnct_area(d: Data) -> Insight:
    top = d.rank_pnct.nsmallest(5, "area_km2")
    f = top.iloc[0]
    big = d.rank_pnct.area_km2.max()
    cap = caption(
        "smallest_pnct_area",
        (f"The smallest PNCT parish, {place(f)}, covers just {_km2(f.area_km2, 'en')}.",
         f"The largest is {num(big / f.area_km2, 'en')} times bigger."),
        (f"A freguesia PNCT mais pequena, {place(f)}, ocupa apenas {_km2(f.area_km2, 'pt')}.",
         f"A maior é {num(big / f.area_km2, 'pt')} vezes maior."),
    )
    src, src_en = sources(d, "caop")
    return Insight(
        id="smallest_pnct_area",
        title="Smallest PNCT parishes by area",
        title_pt="Freguesias PNCT mais pequenas em área",
        numbers={"top5": _top5(top, "area_km2", 2), "largest_km2": round(float(big), 1)},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: _km2(f.area_km2, l)),
            "subtitle": {"en": f"{f['name']}, the smallest PNCT parish", "pt": f"{f['name']}, a freguesia PNCT mais pequena"},
            "rows": _rows(d, top, "area_km2", _km2),
        },
        evergreen=True,
        assumptions=[a_area(d), a_legal(d)],
    )


def _with_density(d: Data):
    s = d.same.copy()
    s["density"] = s.pop2021 / s.area_km2
    return s


@insight("emptiest_pnct_density")
def emptiest_pnct_density(d: Data) -> Insight:
    s = _with_density(d)
    top = s[s.pnct].nsmallest(5, "density")
    f = top.iloc[0]
    cap = caption(
        "emptiest_pnct_density",
        (f"{place(f)} has {num(f.density, 'en', 1)} residents per km², the emptiest PNCT parish unchanged since the 2021 Census.",
         f"{num(f.pop2021, 'en')} people on {_km2(f.area_km2, 'en')} (Census 2021)."),
        (f"{place(f)} tem {num(f.density, 'pt', 1)} habitantes por km², a freguesia PNCT menos povoada entre as que não mudaram desde os Censos 2021.",
         f"São {num(f.pop2021, 'pt')} pessoas em {_km2(f.area_km2, 'pt')} (Censos 2021)."),
    )
    src, src_en = sources(d, "census21", "caop")
    return Insight(
        id="emptiest_pnct_density",
        title="Emptiest PNCT parishes (residents per km²)",
        title_pt="Freguesias PNCT menos povoadas (habitantes por km²)",
        numbers={"top5": _top5(top, "density", 2)},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: _dens(f.density, l)),
            "subtitle": {"en": f"residents per km² in {f['name']}, the emptiest PNCT parish",
                         "pt": f"habitantes por km²: {f['name']}, a freguesia PNCT menos povoada"},
            "rows": _rows(d, top, "density", _dens),
        },
        evergreen=True,
        assumptions=[a_same(d), a_area(d), a_legal(d)],
        footnote=f_same(d),
    )


@insight("densest_pnct_vs_emptiest_other")
def densest_pnct_vs_emptiest_other(d: Data) -> Insight:
    s = _with_density(d)
    dense = s[s.pnct].nlargest(1, "density").iloc[0]
    empty = s[~s.pnct].nsmallest(1, "density").iloc[0]
    cap = caption(
        "densest_pnct_vs_emptiest_other",
        (f"The densest PNCT parish, {place(dense)}, has {num(dense.density, 'en')} residents per km²; the emptiest parish outside the PNCT, {place(empty)}, has {num(empty.density, 'en', 1)}.",
         "Both among the parishes unchanged since the 2021 Census."),
        (f"A freguesia PNCT mais densa, {place(dense)}, tem {num(dense.density, 'pt')} habitantes por km²; a menos povoada fora do PNCT, {place(empty)}, tem {num(empty.density, 'pt', 1)}.",
         "Ambas entre as freguesias sem alterações desde os Censos 2021."),
    )
    src, src_en = sources(d, "census21", "caop")
    return Insight(
        id="densest_pnct_vs_emptiest_other",
        title="Densest PNCT parish vs emptiest non-PNCT parish",
        title_pt="Freguesia PNCT mais densa vs freguesia não PNCT menos povoada",
        numbers={"densest_pnct": {"name": dense["name"], "concelho": dense.concelho, "density": round(float(dense.density), 1)},
                 "emptiest_other": {"name": empty["name"], "concelho": empty.concelho, "density": round(float(empty.density), 2)}},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "contrast",
            "title": {"en": "Residents per km²: PNCT is not about density alone", "pt": "Habitantes por km²: ser PNCT não depende só da densidade"},
            "headline": both(lambda l: f"{num(dense.density, l)} vs {num(empty.density, l, 1)}"),
            "subtitle": {"en": "residents per km²: PNCT status is not about density alone",
                         "pt": "habitantes por km²: ser PNCT não depende só da densidade"},
            "items": [
                {"value": both(lambda l: _dens(dense.density, l)), "label": {"en": f"{place(dense)}, PNCT", "pt": f"{place(dense)}, PNCT"}, "highlight": True},
                {"value": both(lambda l: _dens(empty.density, l)), "label": {"en": f"{place(empty)}, not PNCT", "pt": f"{place(empty)}, não PNCT"}, "highlight": False},
            ],
        },
        evergreen=True,
        assumptions=[a_same(d), a_area(d), a_legal(d)],
        footnote=f_same(d),
    )
