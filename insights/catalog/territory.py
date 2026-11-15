"""Territory and population: how much of the mainland, and of its people, the PNCT covers."""

from __future__ import annotations

import unicodedata

from insights.catalog.base import (
    Data, Insight, a_area, a_census, a_legal, bar, both, caption, de_pt, f_disputed, insight, num, pct, sources,
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
        assumptions=[a_legal(d), a_area(d), a_census(d)],
        footnote=f_disputed(d),
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
        assumptions=[a_legal(d), {"en": "Parishes as in CAOP 2025 (3,049 on the mainland). On the map card, disputed parishes are drawn apart (amber), neither PNCT nor not.",
                                  "pt": "Freguesias da CAOP 2025 (3049 no continente). No mapa do cartão, as freguesias de fontes divergentes têm cor própria (âmbar)."}],
        footnote=f_disputed(d),
    )


@insight("concelhos_split")
def concelhos_split(d: Data) -> Insight:
    m = d.municipalities
    counts = m.status.value_counts()
    full, part, none = int(counts.get("full", 0)), int(counts.get("partial", 0)), int(counts.get("none", 0))
    p = m[(m.status == "partial") & ~m.dtmn.isin(set(d.disputed.dtmn))].copy()
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
                     LEGAL_SPLIT, a_legal(d)],
        footnote=f_disputed(d),
    )


# Split concelhos on the legal definition (data/sources/pnct-legal-status.md, checked 2026-11-15): the
# Portaria 208/2017 annex lists 73 parishes (2013 boundaries) in 21 municipalities that are not PNCT as a
# whole, so 21 split concelhos. The IEFP list of 2026-02-04 differs on 5 parishes; on it the count is 20
# (one municipality's only listed parish is missing there). Examples never use a concelho with a
# disputed parish, and no disputed parish is named.
LEGAL_SPLIT = {
    "en": "Counted on the legal definition: the Portaria 208/2017 annex lists 73 parishes (2013 boundaries) in 21 municipalities "
          "that are not PNCT as a whole, so 21 split concelhos. The IEFP list of 2026-02-04 classifies 5 parishes differently "
          "(the map marks them as disputed); on that list the count would be 20. Concelhos with a disputed parish are never used as examples.",
    "pt": "Contagem segundo a definição legal: o anexo da Portaria 208/2017 lista 73 freguesias (limites de 2013) em 21 municípios "
          "que não são PNCT no seu todo, por isso 21 concelhos divididos. A lista do IEFP de 04-02-2026 classifica 5 freguesias de outra "
          "forma (o mapa assinala-as como de fontes divergentes); com essa lista seriam 20. Concelhos com uma freguesia de fontes divergentes nunca servem de exemplo.",
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
        assumptions=[a_legal(d), *assumptions],
        footnote=f_disputed(d),
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
        assumptions=[a_legal(d), a_census(d), a_area(d),
                     {"en": "Density = Census 2021 residents ÷ CAOP 2025 area of the same group of parishes.",
                      "pt": "Densidade = residentes nos Censos 2021 ÷ área CAOP 2025 do mesmo grupo de freguesias."}],
        footnote=f_disputed(d),
    )
