"""Distances: the PNCT parishes closest to the big cities, the airports and the coast. Always in a
straight line from the parish centroid, and labelled as such."""

from __future__ import annotations

from insights.catalog.base import (
    place,
    A_COAST, F_CENTROID, Data, Insight, a_centroid, bar, both, caption, insight, km, num, sources,
)


def _ref_assumption(d: Data, *keys: str) -> dict:
    refs = d.national["reference_points"]
    en = "; ".join(f"{refs[k]['en']}: {refs[k]['source']} ({refs[k]['lat']:.4f}, {refs[k]['lon']:.4f})" for k in keys)
    pt = "; ".join(f"{refs[k]['pt']}: {refs[k]['source']} ({refs[k]['lat']:.4f}, {refs[k]['lon']:.4f})" for k in keys)
    return {"en": f"Reference points: {en}.", "pt": f"Pontos de referência: {pt}."}


def _closest_city(d: Data, key: str, iid: str) -> Insight:
    ref = d.national["reference_points"][key]
    col = f"{key}_km"
    top = d.pnct.nsmallest(5, col)
    first = top.iloc[0]
    cap = caption(
        iid,
        (f"The closest PNCT parish to {ref['en']} is {place(first)}, {km(first[col], 'en')} away in a straight line.",
         f"The next four are all within {km(top[col].iloc[-1], 'en')} of central {ref['en']}."),
        (f"A freguesia PNCT mais próxima {'do' if ref['pt'] == 'Porto' else 'de'} {ref['pt']} é {place(first)}, a {km(first[col], 'pt')} em linha reta.",
         f"As quatro seguintes ficam todas a {km(top[col].iloc[-1], 'pt')} ou menos do centro da cidade."),
    )
    src, src_en = sources(d, "caop", "osm")
    rows = [bar(d.label(r), r[col], both(lambda l, v=r[col]: km(v, l)), i == 0) for i, (_, r) in enumerate(top.iterrows())]
    return Insight(
        id=iid,
        title=f"Closest PNCT parishes to {ref['en']}",
        title_pt=f"Freguesias PNCT mais próximas {'do' if ref['pt'] == 'Porto' else 'de'} {ref['pt']}",
        numbers={"closest": first["name"], "concelho": first.concelho, "km": round(first[col], 1),
                 "top5": [{"dicofre": r.dicofre, "name": r["name"], "km": round(r[col], 1)} for _, r in top.iterrows()]},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: km(first[col], l)),
            "subtitle": {"en": f"in a straight line from central {ref['en']} to the nearest PNCT parish",
                         "pt": f"em linha reta do centro {'do' if ref['pt'] == 'Porto' else 'de'} {ref['pt']} à freguesia PNCT mais próxima"},
            "rows": rows,
        },
        evergreen=True,
        assumptions=[a_centroid(d), _ref_assumption(d, key)],
        footnote=F_CENTROID,
    )


@insight("closest_to_porto")
def closest_to_porto(d: Data) -> Insight:
    return _closest_city(d, "porto", "closest_to_porto")


@insight("closest_to_lisbon")
def closest_to_lisbon(d: Data) -> Insight:
    return _closest_city(d, "lisbon", "closest_to_lisbon")


@insight("closest_to_airports")
def closest_to_airports(d: Data) -> Insight:
    refs = d.national["reference_points"]
    keys = ["opo", "lis", "fao"]
    best = {k: d.pnct.nsmallest(1, f"{k}_km").iloc[0] for k in keys}
    near = min(keys, key=lambda k: best[k][f"{k}_km"])
    b = best[near]
    rows = [bar({"en": f"{refs[k]['en']} → {b_['name']}", "pt": f"{refs[k]['pt'][0].upper()}{refs[k]['pt'][1:]} → {b_['name']}"},
                b_[f"{k}_km"], both(lambda l, v=b_[f"{k}_km"]: km(v, l)), k == near)
            for k, b_ in best.items()]
    others = [k for k in keys if k != near]
    cap = caption(
        "closest_to_airports",
        (f"From {refs[near]['en']}, the nearest PNCT parish, {place(b)}, is {km(b[f'{near}_km'], 'en')} away in a straight line.",
         "From " + " and from ".join(f"{refs[k]['en']} it is {km(best[k][f'{k}_km'], 'en')} ({best[k]['name']})" for k in others) + "."),
        (f"Do {refs[near]['pt']}, a freguesia PNCT mais próxima, {place(b)}, fica a {km(b[f'{near}_km'], 'pt')} em linha reta.",
         "Do " + " e do ".join(f"{refs[k]['pt']}, {km(best[k][f'{k}_km'], 'pt')} ({best[k]['name']})" for k in others) + "."),
    )
    src, src_en = sources(d, "caop", "osm")
    return Insight(
        id="closest_to_airports",
        title="Closest PNCT parish to each mainland airport",
        title_pt="Freguesia PNCT mais próxima de cada aeroporto do continente",
        numbers={k: {"parish": best[k]["name"], "concelho": best[k].concelho, "km": round(best[k][f"{k}_km"], 1)} for k in keys},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: km(b[f"{near}_km"], l)),
            "subtitle": {"en": f"from {refs[near]['en']} to the nearest PNCT parish, in a straight line",
                         "pt": f"do {refs[near]['pt']} à freguesia PNCT mais próxima, em linha reta"},
            "rows": rows,
        },
        evergreen=True,
        assumptions=[a_centroid(d), _ref_assumption(d, *keys),
                     {"en": "Airport position = the centre of the OSM aerodrome area.",
                      "pt": "Posição do aeroporto = centro da área do aeródromo no OSM."}],
        footnote=F_CENTROID,
    )


@insight("closest_to_coast")
def closest_to_coast(d: Data) -> Insight:
    top = d.pnct.nsmallest(5, "coast_km")
    first = top.iloc[0]
    cap = caption(
        "closest_to_coast",
        (f"The PNCT reaches the sea: the centre of {place(first)} is {km(first.coast_km, 'en')} from the coastline in a straight line.",
         "These are the five PNCT parishes whose centres sit closest to the coast."),
        (f"O PNCT chega ao mar: o centro da freguesia {place(first)} fica a {km(first.coast_km, 'pt')} da linha de costa, em linha reta.",
         "Estas são as cinco freguesias PNCT com o centro mais perto da costa."),
    )
    src, src_en = sources(d, "caop")
    rows = [bar(d.label(r), r.coast_km, both(lambda l, v=r.coast_km: km(v, l)), i == 0) for i, (_, r) in enumerate(top.iterrows())]
    return Insight(
        id="closest_to_coast",
        title="PNCT parishes closest to the coast",
        title_pt="Freguesias PNCT mais perto da costa",
        numbers={"top5": [{"dicofre": r.dicofre, "name": r["name"], "concelho": r.concelho, "km": round(r.coast_km, 2)} for _, r in top.iterrows()]},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: km(first.coast_km, l)),
            "subtitle": {"en": f"from the centre of {first['name']}, a PNCT parish, to the coastline",
                         "pt": f"do centro da freguesia PNCT {first['name']} até à linha de costa"},
            "rows": rows,
        },
        evergreen=True,
        assumptions=[a_centroid(d), A_COAST],
        footnote=F_CENTROID,
    )


@insight("coastal_pnct_parishes")
def coastal_pnct_parishes(d: Data) -> Insight:
    coastal = d.parishes[d.parishes.touches_coast.astype(bool)]
    pn = coastal[coastal.pnct]
    k, n = len(pn), len(coastal)
    conc = sorted(pn.concelho.unique())
    cap = caption(
        "coastal_pnct_parishes",
        (f"{k} PNCT parishes touch the coastline, out of {n} coastal parishes on the mainland.",
         f"They are in {len(conc)} concelhos: {', '.join(conc)}."),
        (f"{k} freguesias PNCT tocam a linha de costa, num total de {n} freguesias costeiras no continente.",
         f"Ficam em {len(conc)} concelhos: {', '.join(conc)}."),
    )
    src, src_en = sources(d, "caop")
    return Insight(
        id="coastal_pnct_parishes",
        title="PNCT parishes on the coast",
        title_pt="Freguesias PNCT no litoral",
        numbers={"pnct_coastal": k, "coastal": n, "concelhos": conc, "parishes": pn.dicofre.tolist()},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "map",
            "headline": both(lambda l: f"{num(k, l)} / {num(n, l)}"),
            "subtitle": {"en": "coastal parishes are PNCT", "pt": "freguesias do litoral são PNCT"},
            "highlight": pn.dicofre.tolist(),
            "legend": [{"en": "PNCT, on the coast", "pt": "PNCT, no litoral"}, {"en": "Other PNCT", "pt": "Outras PNCT"}, {"en": "Not PNCT", "pt": "Não PNCT"}],
        },
        evergreen=True,
        assumptions=[A_COAST, {"en": "A parish is coastal when its CAOP 2025 boundary touches the coastline (within 1 m).",
                               "pt": "Uma freguesia é costeira quando o seu limite na CAOP 2025 toca a linha de costa (a menos de 1 m)."}],
        footnote={"en": "Coastline as in CAOP 2025, estuary and lagoon shores included.",
                  "pt": "Linha de costa da CAOP 2025, incluindo margens de estuários e rias."},
    )
