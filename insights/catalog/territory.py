"""Territory and population: how much of the mainland, and of its people, the PNCT covers."""

from __future__ import annotations

import unicodedata

from insights.catalog.base import (
    Data, Insight, a_area, a_census, bar, both, caption, de_pt, insight, num, pct, sources,
)


def _shares(d: Data) -> tuple[float, float, int, float]:
    area = d.pnct.area_km2.sum() / d.parishes.area_km2.sum()
    pop = int(d.units.loc[d.units.pnct, "pop2021"].sum())
    return area, pop / d.national["census_mainland"]["2021"], pop, d.pnct.area_km2.sum()


@insight("area_vs_population")
def area_vs_population(d: Data) -> Insight:
    area, pop, people, km2 = _shares(d)
    cap = caption(
        "area_vs_population",
        (f"The PNCT covers {pct(area, 'en')} of mainland Portugal, but only {pct(pop, 'en')} of its people live there (Census 2021, all PNCT parishes).",
         f"That is {num(people, 'en')} residents on {num(km2, 'en')} km² of the territory."),
        (f"O PNCT abrange {pct(area, 'pt')} do continente, mas só {pct(pop, 'pt')} da população vive lá (Censos 2021, todas as freguesias PNCT).",
         f"São {num(people, 'pt')} residentes em {num(km2, 'pt')} km² do território."),
    )
    src, src_en = sources(d, "census21", "caop")
    return Insight(
        id="area_vs_population",
        title="PNCT: share of mainland area vs share of population",
        title_pt="PNCT: parte do território vs parte da população",
        numbers={"area_share": area, "population_share": pop, "pnct_population_2021": people, "pnct_area_km2": km2},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "contrast",
            "title": {"en": "Mainland Portugal: how much is PNCT", "pt": "Continente: quanto é PNCT"},
            "headline": both(lambda l: f"{pct(area, l)} / {pct(pop, l)}"),
            "subtitle": both(lambda l: {"en": "of the mainland's territory is PNCT, but it holds this share of its people",
                                        "pt": "do território do continente é PNCT, mas tem esta parte da população"}[l]),
            "items": [
                {"value": both(lambda l: pct(area, l)), "label": {"en": "of the territory", "pt": "do território"}, "share": area, "highlight": True},
                {"value": both(lambda l: pct(pop, l)), "label": {"en": "of the population (Census 2021, all PNCT parishes)", "pt": "da população (Censos 2021, todas as freguesias PNCT)"}, "share": pop, "highlight": False},
            ],
        },
        evergreen=True,
        assumptions=[a_area(d), a_census(d)],
    )


@insight("parish_count")
def parish_count(d: Data) -> Insight:
    k, n = len(d.pnct), len(d.parishes)
    share = k / n
    cap = caption(
        "parish_count",
        (f"{num(k, 'en')} of mainland Portugal's {num(n, 'en')} parishes are PNCT: {pct(share, 'en')}.",
         f"Together they cover {pct(_shares(d)[0], 'en')} of the mainland's territory."),
        (f"{num(k, 'pt')} das {num(n, 'pt')} freguesias do continente são PNCT: {pct(share, 'pt')}.",
         f"Juntas ocupam {pct(_shares(d)[0], 'pt')} do território continental."),
    )
    src, src_en = sources(d, "caop")
    return Insight(
        id="parish_count",
        title="How many parishes are PNCT",
        title_pt="Quantas freguesias são PNCT",
        numbers={"pnct_parishes": k, "parishes": n, "share": share},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "map",
            "headline": both(lambda l: f"{num(k, l)} / {num(n, l)}"),
            "subtitle": {"en": "mainland parishes are in the PNCT", "pt": "freguesias do continente estão no PNCT"},
            "highlight": [],
            "legend": [{"en": "PNCT parish", "pt": "Freguesia PNCT"}, {"en": "Not PNCT", "pt": "Não PNCT"}],
        },
        evergreen=True,
        assumptions=[{"en": "Parishes as in CAOP 2025 (3,049 on the mainland), matched to the IEFP list of 2026-02-04.",
                      "pt": "Freguesias da CAOP 2025 (3049 no continente), associadas à lista do IEFP de 04-02-2026."}],
    )


@insight("concelhos_split")
def concelhos_split(d: Data) -> Insight:
    m = d.municipalities
    counts = m.status.value_counts()
    full, part, none = int(counts.get("full", 0)), int(counts.get("partial", 0)), int(counts.get("none", 0))
    p = m[m.status == "partial"].copy()
    p["balance"] = (p.n_pnct / p.n_parishes - 0.5).abs()
    ex = p.sort_values(["balance", "n_parishes"], ascending=[True, False]).head(2)
    ex_en = " and ".join(f"{r.concelho} ({r.n_pnct} of {r.n_parishes} parishes)" for r in ex.itertuples())
    ex_pt = " e ".join(f"{r.concelho} ({r.n_pnct} de {r.n_parishes} freguesias)" for r in ex.itertuples())
    cap = caption(
        "concelhos_split",
        (f"{full} concelhos are PNCT in full, {none} not at all, and {part} are split between PNCT and non-PNCT parishes.",
         f"Among the split ones: {ex_en}."),
        (f"{full} concelhos são PNCT por inteiro, {none} não têm nenhuma freguesia PNCT e {part} estão divididos.",
         f"Entre os divididos: {ex_pt}."),
    )
    src, src_en = sources(d, "caop")
    lab = {
        "full": {"en": "Every parish PNCT", "pt": "Todas as freguesias PNCT"},
        "partial": {"en": "Some parishes PNCT", "pt": "Algumas freguesias PNCT"},
        "none": {"en": "No PNCT parish", "pt": "Nenhuma freguesia PNCT"},
    }
    return Insight(
        id="concelhos_split",
        title="Concelhos: fully, partly or not PNCT",
        title_pt="Concelhos: PNCT por inteiro, em parte ou nada",
        numbers={"full": full, "partial": part, "none": none, "examples": ex[["concelho", "n_pnct", "n_parishes"]].to_dict("records")},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: num(part, l)),
            "subtitle": {"en": f"of the {len(m)} concelhos are split: only some of their parishes are PNCT",
                         "pt": f"dos {len(m)} concelhos estão divididos: só algumas freguesias são PNCT"},
            "rows": [
                bar(lab["full"], full, both(lambda l: num(full, l))),
                bar(lab["partial"], part, both(lambda l: num(part, l)), True),
                bar(lab["none"], none, both(lambda l: num(none, l))),
            ],
        },
        evergreen=True,
        assumptions=[{"en": "A concelho is counted by its CAOP 2025 parishes; 'split' means at least one PNCT and one non-PNCT parish. Examples are the split concelhos closest to half-and-half.",
                      "pt": "Cada concelho é contado pelas freguesias da CAOP 2025; 'dividido' quer dizer pelo menos uma freguesia PNCT e uma não PNCT. Os exemplos são os divididos mais próximos de metade-metade."},
                     SPLIT_20_VS_21],
    )


# Why 20 split concelhos and not the 21 of the official annexes (checked 2026-11-15; report
# docs/reports/insights-fixes.md). Portaria n.º 208/2017 (annex) and CIC Deliberação n.º 20/2018 list
# 74 parishes in 21 municipalities that are not low-density as a whole (2013 parish geography; 73 in
# the Portaria, plus the União das Freguesias da Raiva, Pedorido e Paraíso added by the Deliberação).
# The IEFP list of 2026-02-04 that the map uses has no line for two of them: Dem (Caminha, CAOP
# 160209) and São Bento (Porto de Mós, 101610). Caminha keeps two listed parishes, so only Porto de
# Mós drops out: 21 − 1 = 20. The other 72 entries are 72 Census 2021 parishes, 83 parishes today
# after the 2025 de-aggregation (+11). The two missing parishes are reported, never added: the map
# follows the IEFP list.
SPLIT_20_VS_21 = {
    "en": "The official annexes (Portaria 208/2017 and CIC Deliberação 20/2018) list 74 parishes in 21 municipalities that are not "
          "low-density as a whole. The IEFP list of 2026-02-04 used here has no line for two of them, Dem (Caminha) and São Bento "
          "(Porto de Mós). Caminha keeps two listed parishes, so only Porto de Mós drops out: 20 split concelhos, not 21. The other "
          "72 entries are 83 parishes today, after the 2025 de-aggregation. The two missing parishes are not added; the map follows the IEFP list.",
    "pt": "Os anexos oficiais (Portaria 208/2017 e Deliberação CIC 20/2018) listam 74 freguesias em 21 municípios que não são de baixa "
          "densidade no seu todo. A lista do IEFP de 04-02-2026, usada aqui, não inclui duas delas: Dem (Caminha) e São Bento (Porto de Mós). "
          "Caminha mantém duas freguesias da lista, por isso só Porto de Mós sai: 20 concelhos divididos, não 21. As outras 72 entradas "
          "correspondem hoje a 83 freguesias, após a desagregação de 2025. As duas freguesias em falta não são acrescentadas; o mapa segue a lista do IEFP.",
}


def _district_rows(values, fmt) -> list[dict]:
    return [bar(name, v, both(lambda l, v=v: fmt(v, l)), v >= 1) for name, v in values]


def _fold(name: str) -> str:
    return unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()


def _and(names: list[str], lang: str) -> str:
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + (" and " if lang == "en" else " e ") + names[-1]


def _district_insight(d: Data, iid: str, shares, what: str) -> Insight:
    """shares: Series of 0–1 by district code; what: 'area' or 'population'."""
    di = d.districts.assign(share=d.districts.dt.map(shares), key=d.districts.distrito.map(_fold))
    di = di.sort_values(["share", "key"], ascending=[False, True])
    full = sorted(di[di.share >= 1].distrito, key=_fold)
    zero = sorted(di[di.share <= 0].distrito, key=_fold)
    k, n = len(full), len(di)
    if what == "area":
        hook_en = f"{k} of mainland Portugal's {n} districts are PNCT from border to border" + (f": {_and(full, 'en')}." if full else ".")
        hook_pt = f"{k} dos {n} distritos do continente são PNCT por inteiro" + (f": {_and(full, 'pt')}." if full else ".")
        sub = {"en": "districts are entirely PNCT. Share of each district's area:",
               "pt": "distritos são totalmente PNCT. Parte da área de cada distrito:"}
        title, title_pt = "Districts ranked by share of area that is PNCT", "Distritos por parte da área PNCT"
        src = sources(d, "caop")
        assumptions = [a_area(d)]
    else:
        hook_en = f"In {k} of the {n} mainland districts, every resident lives in a PNCT parish."
        hook_pt = f"Em {k} dos {n} distritos do continente, todos os residentes vivem numa freguesia PNCT."
        sub = {"en": "districts: every resident lives in a PNCT parish. Share by district, Census 2021:",
               "pt": "distritos: todos os residentes vivem numa freguesia PNCT. Por distrito, Censos 2021:"}
        title, title_pt = "Districts ranked by share of residents in PNCT parishes", "Distritos por parte da população em freguesias PNCT"
        src = sources(d, "census21", "caop")
        assumptions = [a_census(d), {"en": "District = the first two digits of the Census parish code.",
                                     "pt": "Distrito = os dois primeiros dígitos do código da freguesia nos Censos."}]
    mid = di[(di.share > 0) & (di.share < 1)]
    if len(zero) > 1:
        ctx_en = f"{_and(zero, 'en')} districts have no PNCT parish at all."
        ctx_pt = f"Os distritos {_and([de_pt(z)[3:] for z in zero], 'pt')} não têm nenhuma freguesia PNCT."
    elif zero:
        ctx_en = f"{_and(zero, 'en')} district has no PNCT parish at all; next lowest is {mid.iloc[-1].distrito} district, at {pct(mid.iloc[-1].share, 'en')}."
        ctx_pt = f"O distrito {de_pt(zero[0])} não tem nenhuma freguesia PNCT; segue-se o distrito {de_pt(mid.iloc[-1].distrito)}, com {pct(mid.iloc[-1].share, 'pt')}."
    else:
        ctx_en = f"The lowest share is {di.iloc[-1].distrito}, {pct(di.iloc[-1].share, 'en')}."
        ctx_pt = f"A parte mais baixa é a {de_pt(di.iloc[-1].distrito)}, {pct(di.iloc[-1].share, 'pt')}."
    cap = caption(iid, (hook_en, ctx_en), (hook_pt, ctx_pt))
    return Insight(
        id=iid, title=title, title_pt=title_pt,
        numbers={"entirely_pnct": full, "no_pnct": zero, "shares": {r.distrito: round(r.share, 4) for r in di.itertuples()}},
        caption_en=cap[0], caption_pt=cap[1], source=src[0], source_en=src[1],
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: f"{k} / {n}"),
            "subtitle": sub,
            "rows": _district_rows(zip(di.distrito, di.share), pct),
            "max": 1.0,
        },
        evergreen=True,
        assumptions=assumptions,
    )


@insight("districts_area_share")
def districts_area_share(d: Data) -> Insight:
    return _district_insight(d, "districts_area_share", d.districts.set_index("dt").eval("pnct_km2 / area_km2"), "area")


@insight("districts_population_share")
def districts_population_share(d: Data) -> Insight:
    u = d.units.assign(dt=d.units.census_code.str[:2])
    shares = u.groupby("dt").apply(lambda x: x.loc[x.pnct, "pop2021"].sum() / x.pop2021.sum(), include_groups=False)
    return _district_insight(d, "districts_population_share", shares, "population")


@insight("density_contrast")
def density_contrast(d: Data) -> Insight:
    u, p = d.units, d.parishes
    dp = u.loc[u.pnct, "pop2021"].sum() / p.loc[p.pnct, "area_km2"].sum()
    dn = u.loc[~u.pnct, "pop2021"].sum() / p.loc[~p.pnct, "area_km2"].sum()
    ratio = dn / dp
    cap = caption(
        "density_contrast",
        (f"PNCT parishes average {num(dp, 'en')} residents per km²; the rest of the mainland, {num(dn, 'en')}.",
         f"That is about {num(ratio, 'en')} times as dense (Census 2021)."),
        (f"As freguesias PNCT têm em média {num(dp, 'pt')} habitantes por km²; o resto do continente, {num(dn, 'pt')}.",
         f"Fora do PNCT, a densidade é cerca de {num(ratio, 'pt')} vezes maior (Censos 2021)."),
    )
    src, src_en = sources(d, "census21", "caop")
    return Insight(
        id="density_contrast",
        title="Population density: PNCT vs the rest",
        title_pt="Densidade populacional: PNCT vs resto",
        numbers={"pnct_density": dp, "non_pnct_density": dn, "ratio": ratio},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "contrast",
            "title": {"en": "Residents per km², Census 2021", "pt": "Habitantes por km², Censos 2021"},
            "headline": both(lambda l: f"{num(dp, l)} vs {num(dn, l)}"),
            "subtitle": {"en": "residents per km², Census 2021", "pt": "habitantes por km², Censos 2021"},
            "items": [
                {"value": both(lambda l: num(dp, l)), "label": {"en": "per km² in PNCT parishes", "pt": "por km² nas freguesias PNCT"}, "highlight": True},
                {"value": both(lambda l: num(dn, l)), "label": {"en": "per km² in the rest of the mainland", "pt": "por km² no resto do continente"}, "highlight": False},
            ],
        },
        evergreen=True,
        assumptions=[a_census(d), a_area(d),
                     {"en": "Density = Census 2021 residents ÷ CAOP 2025 area of the same group of parishes.",
                      "pt": "Densidade = residentes nos Censos 2021 ÷ área CAOP 2025 do mesmo grupo de freguesias."}],
    )
