"""Housing: INE's median dwelling sale value (€/m²) per concelho. Not evergreen: INE publishes a new
year every summer, so these are re-rendered with each refresh."""

from __future__ import annotations

from insights import config as cfg
from insights.catalog.base import (
    A_COAST, COASTLINE, Blocked, Data, Insight, a_full, bar, both, caption, eur_m2, insight, num, pct, sources,
)

F_FULL = {"en": "Concelhos where every parish is PNCT.", "pt": "Concelhos com todas as freguesias no PNCT."}


def _priced(d: Data):
    f = d.full.dropna(subset=["sale_m2"])
    return f


def _national(d: Data) -> tuple[float, str]:
    s = d.national["sale_m2"]
    if s.get("portugal") is None:
        raise ValueError("INE national €/m² value missing from national.json")
    return float(s["portugal"]), s["period"]


def _rows(top, ref: float) -> list[dict]:
    return [bar(r.concelho, r.sale_m2, both(lambda l, v=r.sale_m2: eur_m2(v, l)), i == 0) for i, r in enumerate(top.itertuples())]


@insight("cheapest_coastal_pnct", evergreen=False)
def cheapest_coastal_pnct(d: Data) -> Insight:
    nat, period = _national(d)
    f = _priced(d)
    near = f[f.seat_coast_km <= cfg.COAST_KM].nsmallest(5, "sale_m2")
    if near.empty:
        raise Blocked(f"No fully PNCT concelho has its seat within {cfg.COAST_KM} km of the coast.")
    first = near.iloc[0]
    cap = caption(
        "cheapest_coastal_pnct",
        (f"In {first.concelho}, a PNCT concelho whose seat is {num(first.seat_coast_km, 'en')} km from the {COASTLINE['en']}, in a straight line, homes sold for a median {eur_m2(first.sale_m2, 'en')} in {period}.",
         f"Portugal's median was {eur_m2(nat, 'en')}."),
        (f"{first.concelho}, concelho PNCT com sede a {num(first.seat_coast_km, 'pt')} km da {COASTLINE['pt']}, em linha reta: as casas venderam-se a um valor mediano de {eur_m2(first.sale_m2, 'pt')} em {period}.",
         f"O valor mediano em Portugal foi {eur_m2(nat, 'pt')}."),
    )
    src, src_en = sources(d, "sale", "caop", "osm")
    return Insight(
        id="cheapest_coastal_pnct",
        title=f"Cheapest PNCT concelhos within {cfg.COAST_KM} km of the coast (€/m²)",
        title_pt=f"Concelhos PNCT mais baratos a menos de {cfg.COAST_KM} km da costa (€/m²)",
        numbers={"period": period, "portugal": nat, "coast_km": cfg.COAST_KM,
                 "top5": [{"concelho": r.concelho, "sale_m2": r.sale_m2, "seat_coast_km": round(r.seat_coast_km, 1)} for r in near.itertuples()]},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: eur_m2(first.sale_m2, l)),
            "subtitle": {"en": f"median sale value in {first.concelho} ({period}): the cheapest PNCT concelho within {cfg.COAST_KM} km of the coast",
                         "pt": f"valor mediano de venda ({period}): {first.concelho}, o concelho PNCT mais barato a menos de {cfg.COAST_KM} km da costa"},
            "rows": _rows(near, nat),
            "reference": {"value": nat, "label": both(lambda l: ("Portugal: " if l == "en" else "Portugal: ") + eur_m2(nat, l))},
        },
        evergreen=False,
        assumptions=[a_full(d), A_COAST,
                     {"en": f"'Within {cfg.COAST_KM} km of the coast' = the concelho's seat (OSM admin_centre) is within {cfg.COAST_KM} km of the coastline in a straight line.",
                      "pt": f"'A menos de {cfg.COAST_KM} km da costa' = a sede do concelho (admin_centre no OSM) fica a menos de {cfg.COAST_KM} km da linha de costa, em linha reta."}],
        footnote={"en": f"Concelhos where every parish is PNCT; seat within {cfg.COAST_KM} km of the {COASTLINE['en']}, straight line.",
                  "pt": f"Concelhos com todas as freguesias no PNCT; sede a menos de {cfg.COAST_KM} km da {COASTLINE['pt']}, em linha reta."},
    )


@insight("below_national_median", evergreen=False)
def below_national_median(d: Data) -> Insight:
    nat, period = _national(d)
    f = _priced(d).assign(gap=lambda x: 1 - x.sale_m2 / nat)
    top = f.nlargest(5, "gap")
    first = top.iloc[0]
    low = d.national["sale_m2"].get("lowest_municipality") or {}
    # "Cheapest in Portugal" only when INE's table across all 308 municipalities says so, with no tie.
    cheapest = low.get("municipality") == first.concelho and low.get("tied") == [first.concelho] and low.get("value") == first.sale_m2
    cap = caption(
        "below_national_median",
        (f"Homes in {first.concelho} sold for a median {eur_m2(first.sale_m2, 'en')} in {period}, {pct(first.gap, 'en')} below Portugal's {eur_m2(nat, 'en')}.",
         f"That is the lowest of any municipality in Portugal in {period}." if cheapest else "These are the PNCT concelhos furthest below the national value."),
        (f"{first.concelho}: as casas venderam-se a um valor mediano de {eur_m2(first.sale_m2, 'pt')} em {period}, {pct(first.gap, 'pt')} abaixo dos {eur_m2(nat, 'pt')} de Portugal.",
         f"É o valor mais baixo de todos os municípios do país em {period}." if cheapest else "Estes são os concelhos PNCT mais abaixo do valor nacional."),
    )
    lowest_note = {
        "en": f"Lowest in Portugal among the {low.get('with_value')} of {low.get('municipalities')} municipalities with a {period} value in INE's table (none for {', '.join(low.get('no_value', []))}).",
        "pt": f"O mais baixo de Portugal entre os {low.get('with_value')} de {low.get('municipalities')} municípios com valor de {period} na tabela do INE (sem valor: {', '.join(low.get('no_value', []))}).",
    } if cheapest else None
    src, src_en = sources(d, "sale", "caop")
    return Insight(
        id="below_national_median",
        title="PNCT concelhos furthest below Portugal's median €/m²",
        title_pt="Concelhos PNCT mais abaixo do valor mediano nacional (€/m²)",
        numbers={"period": period, "portugal": nat,
                 "top5": [{"concelho": r.concelho, "sale_m2": r.sale_m2, "below": round(r.gap, 4)} for r in top.itertuples()]},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: "−" + pct(first.gap, l)),
            "subtitle": {"en": f"{first.concelho} vs Portugal's median sale value per m² ({period})",
                         "pt": f"{first.concelho} face ao valor mediano de venda por m² em Portugal ({period})"},
            "rows": _rows(top, nat),
            "reference": {"value": nat, "label": both(lambda l: "Portugal: " + eur_m2(nat, l))},
        },
        evergreen=False,
        assumptions=[a_full(d), *([lowest_note] if lowest_note else [])],
        footnote={l: F_FULL[l] + (" " + lowest_note[l] if lowest_note else "") for l in ("en", "pt")},
    )


@insight("housing_median_contrast", evergreen=False)
def housing_median_contrast(d: Data) -> Insight:
    nat, period = _national(d)
    f = _priced(d)
    med = float(f.sale_m2.median())
    cap = caption(
        "housing_median_contrast",
        (f"In half of the fully PNCT concelhos, the median home sold for {eur_m2(med, 'en')} or less in {period}.",
         f"Portugal's median sale value was {eur_m2(nat, 'en')}, about {num(nat / med, 'en', 1)} times as much."),
        (f"Em metade dos concelhos totalmente PNCT, o valor mediano de venda das casas foi de {eur_m2(med, 'pt')} ou menos em {period}.",
         f"O valor mediano em Portugal foi {eur_m2(nat, 'pt')}, cerca de {num(nat / med, 'pt', 1)} vezes mais."),
    )
    src, src_en = sources(d, "sale", "caop")
    return Insight(
        id="housing_median_contrast",
        title="Sale value per m²: PNCT concelhos vs Portugal",
        title_pt="Valor de venda por m²: concelhos PNCT vs Portugal",
        numbers={"period": period, "portugal": nat, "median_of_pnct_concelhos": med, "concelhos": len(f)},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "contrast",
            "title": both(lambda l: {"en": f"Median sale value of homes per m², {period}", "pt": f"Valor mediano de venda das casas por m², {period}"}[l]),
            "headline": both(lambda l: f"{eur_m2(med, l)}"),
            "subtitle": {"en": f"or less in half of the fully PNCT concelhos ({period}), median sale value",
                         "pt": f"ou menos em metade dos concelhos totalmente PNCT ({period}), valor mediano de venda"},
            "items": [
                {"value": both(lambda l: eur_m2(med, l)), "label": {"en": "median of the PNCT concelhos", "pt": "mediana dos concelhos PNCT"}, "highlight": True},
                {"value": both(lambda l: eur_m2(nat, l)), "label": {"en": "Portugal", "pt": "Portugal"}, "highlight": False},
            ],
        },
        evergreen=False,
        assumptions=[a_full(d), {"en": "The PNCT figure is the median of the concelho medians (each concelho counts once), not a median of all sales.",
                                 "pt": "O valor PNCT é a mediana dos valores medianos de cada concelho (cada concelho conta uma vez), não a mediana de todas as vendas."}],
        footnote={"en": "Median of concelho medians; concelhos where every parish is PNCT.",
                  "pt": "Mediana dos valores dos concelhos; concelhos com todas as freguesias no PNCT."},
    )


@insight("under_1000_m2", evergreen=False)
def under_1000_m2(d: Data) -> Insight:
    _, period = _national(d)
    f = _priced(d)
    k = int((f.sale_m2 < 1000).sum())
    n = len(f)
    cap = caption(
        "under_1000_m2",
        (f"In {k} of the {n} fully PNCT concelhos, the median home sold for under 1,000 €/m² in {period}.",
         "Values are INE's median sale value per m² for each concelho."),
        (f"Em {k} dos {n} concelhos totalmente PNCT, o valor mediano de venda das casas ficou abaixo de 1000 €/m² em {period}.",
         "Valores medianos de venda por m² do INE, por concelho."),
    )
    src, src_en = sources(d, "sale", "caop")
    return Insight(
        id="under_1000_m2",
        title="PNCT concelhos where homes sell under 1,000 €/m²",
        title_pt="Concelhos PNCT com casas abaixo de 1000 €/m²",
        numbers={"period": period, "under_1000": k, "concelhos": n, "share": k / n},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "contrast",
            "title": both(lambda l: {"en": f"{k} of {n} fully PNCT concelhos: homes under 1,000 €/m² ({period})", "pt": f"{k} de {n} concelhos totalmente PNCT: casas abaixo de 1000 €/m² ({period})"}[l]),
            "headline": both(lambda l: f"{k} / {n}"),
            "subtitle": {"en": f"fully PNCT concelhos had a median sale value under 1,000 €/m² ({period})",
                         "pt": f"concelhos totalmente PNCT com valor mediano de venda abaixo de 1000 €/m² ({period})"},
            "items": [
                {"value": both(lambda l: pct(k / n, l)), "label": {"en": "under 1,000 €/m²", "pt": "abaixo de 1000 €/m²"}, "share": k / n, "highlight": True},
                {"value": both(lambda l: pct(1 - k / n, l)), "label": {"en": "1,000 €/m² or more", "pt": "1000 €/m² ou mais"}, "share": 1 - k / n, "highlight": False},
            ],
        },
        evergreen=False,
        assumptions=[a_full(d)],
        footnote=F_FULL,
    )
