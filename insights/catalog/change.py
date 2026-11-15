"""Population change between the 2011 and 2021 Censuses (INE publishes 2011 on the 2021 parishes)."""

from __future__ import annotations

from insights.catalog.base import (
    Blocked, Data, Insight, a_census, bar, both, caption, insight, num, pct, signed_pct, sources,
)

A_MUN = {
    "en": "Concelho populations are INE's own Census figures per municipality; 'PNCT concelhos' are the ones where every parish is PNCT.",
    "pt": "A população de cada concelho é o valor do INE nos Censos; 'concelhos PNCT' são os que têm todas as freguesias no PNCT.",
}


def _change(df) -> float:
    return df.pop2021.sum() / df.pop2011.sum() - 1


@insight("population_change")
def population_change(d: Data) -> Insight:
    u = d.units
    cp, cn = _change(u[u.pnct]), _change(u[~u.pnct])
    lost = int(u[u.pnct].pop2011.sum() - u[u.pnct].pop2021.sum())
    cap = caption(
        "population_change",
        (f"PNCT parishes lost {pct(-cp, 'en', 1)} of their residents between the 2011 and 2021 Censuses: {num(lost, 'en')} people.",
         f"The rest of the mainland changed by {signed_pct(cn, 'en')}."),
        (f"As freguesias PNCT perderam {pct(-cp, 'pt', 1)} dos residentes entre os Censos de 2011 e 2021: {num(lost, 'pt')} pessoas.",
         f"No resto do continente, a variação foi de {signed_pct(cn, 'pt')}."),
    ) if cp < 0 else caption(
        "population_change",
        (f"PNCT parishes changed by {signed_pct(cp, 'en')} between the 2011 and 2021 Censuses.",
         f"The rest of the mainland changed by {signed_pct(cn, 'en')}."),
        (f"As freguesias PNCT variaram {signed_pct(cp, 'pt')} entre os Censos de 2011 e 2021.",
         f"No resto do continente, a variação foi de {signed_pct(cn, 'pt')}."),
    )
    src, src_en = sources(d, "census", "caop")
    return Insight(
        id="population_change",
        title="Population change 2011→2021: PNCT vs the rest",
        title_pt="Variação da população 2011→2021: PNCT vs resto",
        numbers={"pnct_change": cp, "other_change": cn, "pnct_lost": lost},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "contrast",
            "title": {"en": "Population change, Census 2011 → 2021", "pt": "Variação da população, Censos 2011 → 2021"},
            "headline": both(lambda l: signed_pct(cp, l)),
            "subtitle": {"en": "residents in PNCT parishes, Census 2011 → 2021", "pt": "residentes nas freguesias PNCT, Censos 2011 → 2021"},
            "items": [
                {"value": both(lambda l: signed_pct(cp, l)), "label": {"en": "PNCT parishes", "pt": "Freguesias PNCT"}, "highlight": True},
                {"value": both(lambda l: signed_pct(cn, l)), "label": {"en": "rest of the mainland", "pt": "resto do continente"}, "highlight": False},
            ],
        },
        evergreen=True,
        assumptions=[a_census(d)],
    )


@insight("shrinking_parishes")
def shrinking_parishes(d: Data) -> Insight:
    u = d.units
    sp = (u[u.pnct].pop2021 < u[u.pnct].pop2011).mean()
    so = (u[~u.pnct].pop2021 < u[~u.pnct].pop2011).mean()
    cap = caption(
        "shrinking_parishes",
        (f"{pct(sp, 'en')} of PNCT parishes lost residents between the 2011 and 2021 Censuses.",
         f"Outside the PNCT, {pct(so, 'en')} did."),
        (f"{pct(sp, 'pt')} das freguesias PNCT perderam residentes entre os Censos de 2011 e 2021.",
         f"Fora do PNCT, foram {pct(so, 'pt')}."),
    )
    src, src_en = sources(d, "census", "caop")
    return Insight(
        id="shrinking_parishes",
        title="Share of parishes that lost population, 2011→2021",
        title_pt="Parte das freguesias que perderam população, 2011→2021",
        numbers={"pnct_share_shrank": sp, "other_share_shrank": so,
                 "pnct_census_parishes": int(u.pnct.sum()), "other_census_parishes": int((~u.pnct).sum())},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "contrast",
            "title": {"en": "Parishes that lost residents, Census 2011 → 2021", "pt": "Freguesias que perderam residentes, Censos 2011 → 2021"},
            "headline": both(lambda l: pct(sp, l)),
            "subtitle": {"en": "of PNCT parishes lost residents, Census 2011 → 2021", "pt": "das freguesias PNCT perderam residentes, Censos 2011 → 2021"},
            "items": [
                {"value": both(lambda l: pct(sp, l)), "label": {"en": "of PNCT parishes shrank", "pt": "das freguesias PNCT diminuíram"}, "share": sp, "highlight": True},
                {"value": both(lambda l: pct(so, l)), "label": {"en": "of the other parishes shrank", "pt": "das outras freguesias diminuíram"}, "share": so, "highlight": False},
            ],
        },
        evergreen=True,
        assumptions=[a_census(d), {"en": "Counted on Census 2021 parishes, the unit both Censuses are published on.",
                                   "pt": "Contagem nas freguesias dos Censos 2021, a unidade em que ambos os Censos são publicados."}],
        footnote={"en": "Parishes as delimited in the 2021 Census.", "pt": "Freguesias com os limites dos Censos 2021."},
    )


def _full_change(d: Data):
    f = d.full.copy()
    f["change"] = f.pop2021 / f.pop2011 - 1
    return f


@insight("concelhos_biggest_loss")
def concelhos_biggest_loss(d: Data) -> Insight:
    f = _full_change(d)
    top = f.nsmallest(5, "change")
    first = top.iloc[0]
    shrank = int((f.change < 0).sum())
    cap = caption(
        "concelhos_biggest_loss",
        (f"{first.concelho} lost {pct(-first.change, 'en', 1)} of its residents between the 2011 and 2021 Censuses, the most of any PNCT concelho.",
         f"{shrank} of the {len(f)} fully PNCT concelhos shrank."),
        (f"{first.concelho} perdeu {pct(-first.change, 'pt', 1)} dos residentes entre os Censos de 2011 e 2021, a maior perda entre os concelhos PNCT.",
         f"{shrank} dos {len(f)} concelhos totalmente PNCT perderam população."),
    )
    src, src_en = sources(d, "census", "caop")
    rows = [bar(r.concelho, -r.change, both(lambda l, v=r.change: signed_pct(v, l)), i == 0) for i, r in enumerate(top.itertuples())]
    return Insight(
        id="concelhos_biggest_loss",
        title="PNCT concelhos that lost the most residents, 2011→2021",
        title_pt="Concelhos PNCT que mais população perderam, 2011→2021",
        numbers={"shrank": shrank, "full_concelhos": len(f),
                 "top5": [{"concelho": r.concelho, "change": round(r.change, 4), "pop2011": int(r.pop2011), "pop2021": int(r.pop2021)} for r in top.itertuples()]},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: signed_pct(first.change, l)),
            "subtitle": {"en": f"residents in {first.concelho}, Census 2011 → 2021", "pt": f"residentes: {first.concelho}, Censos 2011 → 2021"},
            "rows": rows,
        },
        evergreen=True,
        assumptions=[A_MUN],
        footnote={"en": "Concelhos where every parish is PNCT.", "pt": "Concelhos com todas as freguesias no PNCT."},
    )


@insight("concelhos_that_grew")
def concelhos_that_grew(d: Data) -> Insight:
    f = _full_change(d)
    grew = f[f.change > 0].sort_values("change", ascending=False)
    k = len(grew)
    names = [r.concelho for r in grew.itertuples()]
    if k == 0:
        raise Blocked("No fully PNCT concelho grew, so there is nothing to rank (the loss insight covers it).")
    hook_en = f"Only {k} of the {len(f)} fully PNCT concelhos grew between the 2011 and 2021 Censuses."
    hook_pt = f"Só {k} dos {len(f)} concelhos totalmente PNCT cresceram entre os Censos de 2011 e 2021."
    shown = grew.head(6)
    if k == 1:
        ctx = (f"It is {names[0]}.", f"É {names[0]}.")
    elif k <= 6:
        ctx = (f"They are {', '.join(names[:-1])} and {names[-1]}.", f"São {', '.join(names[:-1])} e {names[-1]}.")
    else:
        ctx = (f"The biggest gains: {', '.join(names[:3])}.", f"Os maiores ganhos: {', '.join(names[:3])}.")
    cap = caption("concelhos_that_grew", (hook_en, ctx[0]), (hook_pt, ctx[1]))
    src, src_en = sources(d, "census", "caop")
    rows = [bar(r.concelho, r.change, both(lambda l, v=r.change: signed_pct(v, l)), True) for r in shown.itertuples()]
    return Insight(
        id="concelhos_that_grew",
        title="PNCT concelhos that grew, 2011→2021",
        title_pt="Concelhos PNCT que cresceram, 2011→2021",
        numbers={"grew": k, "full_concelhos": len(f),
                 "concelhos": [{"concelho": r.concelho, "change": round(r.change, 4)} for r in grew.itertuples()]},
        caption_en=cap[0], caption_pt=cap[1], source=src, source_en=src_en,
        chart_spec={
            "type": "bars",
            "headline": both(lambda l: f"{k} / {len(f)}"),
            "subtitle": {"en": "fully PNCT concelhos gained residents, Census 2011 → 2021",
                         "pt": "concelhos totalmente PNCT ganharam residentes, Censos 2011 → 2021"},
            "rows": rows,
        },
        evergreen=True,
        assumptions=[A_MUN],
        footnote={"en": "Concelhos where every parish is PNCT.", "pt": "Concelhos com todas as freguesias no PNCT."},
    )
