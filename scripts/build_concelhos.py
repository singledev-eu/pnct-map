"""Build the concelho card data: population block (INE) and câmara contacts, keyed by DICO.

Inputs:  data/external/ine/*.json and fetch.json (scripts/fetch_ine.py), CAOP 2025 cont_municipios
         (area_ha), data/contacts/camaras.csv (hand-curated, checked by validate_contacts.py).
Outputs: data/concelhos.json      every field, with the curators' contact notes
         web/data/concelhos.json  the same without the notes, compact; fetched by the app on the
                                  first card that opens (web/src/concelho.ts)

Shape:
  fields     per-field meta: source, url, as_of, licence (and how a derived field is computed)
  national   reference values (ageing index and population of Portugal)
  snit_url, issues_url
  concelhos  {dico: {population, population_2011, population_2021, census_change, density,
              ageing_index, contacts}}; a missing value is null, never estimated. contacts is null
              for a concelho not curated yet; urbanism_url is null where the câmara has none.

Usage: uv run python scripts/build_concelhos.py
"""

from __future__ import annotations

import csv
import json
import sys

import pyogrio

import concelhos_config as cfg
import validate_contacts

CONTACT_FIELDS = ["website", "email", "phone", "urbanism_url", "pdm_url", "pdm_status", "as_of"]


def municipal_values(response: list) -> tuple[dict[str, float], dict[str, float]]:
    """({dico: value} for the mainland municipalities, {geocod: value} for the rest). NUTS 2024
    tables code a municipality as NUTS3 (3 chars) + DICO; the Census table uses the bare DICO."""
    mun, other = {}, {}
    for rows in response[0]["Dados"].values():
        for r in rows:
            if r.get("valor") in (None, ""):
                continue
            code, value = r["geocod"], float(r["valor"])
            if len(code) == 7 and code.startswith(cfg.MAINLAND):
                mun[code[3:]] = value
            elif len(code) == 4 and code.isdigit() and int(code[:2]) <= 18:
                mun[code] = value
            else:
                other[code] = value
    return mun, other


def pct_change(new: float | None, old: float | None) -> float | None:
    return None if new is None or not old else round(100 * (new - old) / old, 1)


def load_contacts(dicos: dict[str, str]) -> tuple[dict[str, dict], str | None]:
    """Contacts by DICO (offline-validated; a problem stops the build) and the latest as_of."""
    if not cfg.CONTACTS_CSV.exists():
        return {}, None
    with cfg.CONTACTS_CSV.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    problems = [f"{r['dico']} {r['name']}: {p}" for r in rows for p in validate_contacts.check_row(r, dicos) if not p.startswith(validate_contacts.WARNING)]
    if len({r["dico"] for r in rows}) != len(rows):
        problems.append("duplicate dico in the contacts CSV")
    if problems:
        raise SystemExit("contacts CSV:\n  " + "\n  ".join(problems))
    contacts = {r["dico"]: {k: (r[k] or None) for k in CONTACT_FIELDS} | {"notes": r["notes"] or None} for r in rows}
    return contacts, max((r["as_of"] for r in rows), default=None)


def build() -> dict:
    fetched = json.loads((cfg.CACHE / "fetch.json").read_text(encoding="utf-8"))
    year = fetched["estimate_year"]
    if year < cfg.FIRST_ESTIMATE_YEAR:
        raise SystemExit(f"estimate year {year} is before the current series")
    values, refs = {}, {}
    for q in cfg.QUERIES:
        values[q.name], refs[q.name] = municipal_values(json.loads((cfg.CACHE / f"{q.name}.json").read_text(encoding="utf-8")))

    caop = pyogrio.read_dataframe(cfg.CAOP_GPKG, layer="cont_municipios", read_geometry=False)
    names = dict(zip(caop.dtmn, caop.municipio))
    area_km2 = dict(zip(caop.dtmn, caop.area_ha / 100))
    contacts, contacts_as_of = load_contacts(names)

    concelhos = {}
    for dico in sorted(names):
        get = lambda name: values[name].get(dico)  # noqa: E731
        pop = get("population")
        concelhos[dico] = {
            "population": None if pop is None else int(pop),
            "population_2011": None if get("population_2011") is None else int(get("population_2011")),
            "population_2021": None if get("population_2021") is None else int(get("population_2021")),
            "census_change": pct_change(get("population_2021"), get("population_2011")),
            "density": None if pop is None else round(pop / area_km2[dico], 1),
            "ageing_index": get("ageing_index"),
            "contacts": contacts.get(dico),
        }

    q = fetched["queries"]
    info = lambda name: cfg.INFO_URL.format(code=q[name]["code"])  # noqa: E731
    src = lambda name, title: {"source": f"INE, {title} ({q[name]['code']})", "url": info(name), "as_of": q[name]["period"], "licence": cfg.LICENCE, "ine_updated": q[name]["ine_updated"]}  # noqa: E731
    fields = {
        "population": src("population", f"Estimativas Anuais da População Residente, 31 Dec {year}"),
        "population_2011": src("population_2011", "Censos 2011"),
        "population_2021": src("population_2021", "Censos 2021"),
        "census_change": {
            "source": "Computed: (population_2021 − population_2011) / population_2011, both Census counts (INE 0011609)",
            "url": info("population_2011"),
            "as_of": "2011–2021",
            "licence": cfg.LICENCE,
        },
        "density": {
            "source": f"Computed: population ({year}) / municipal area, CAOP 2025 (DGT)",
            "url": "https://www.dgterritorio.gov.pt/cartografia/cartografia-tematica/caop",
            "as_of": str(year),
            "licence": cfg.LICENCE,
        },
        "ageing_index": src("ageing_index", f"Índice de envelhecimento {year}"),
        "contacts": {
            "source": "Câmara websites, curated by hand (generic institutional contacts only)",
            "url": "https://github.com/singledev-eu/pnct-map/blob/main/data/contacts/camaras.csv",
            "as_of": contacts_as_of,
            "licence": None,
        },
    }
    national = {"ageing_index": refs["ageing_index"][cfg.NATIONAL], "population": int(refs["population"][cfg.NATIONAL])}
    return {
        "estimate_year": year,
        "fields": fields,
        "national": national,
        "mainland": {name: refs[name].get(cfg.MAINLAND) for name in ["population", "population_2011", "population_2021"]},
        "snit_url": cfg.SNIT_URL,
        "issues_url": cfg.ISSUES_URL,
        "concelhos": concelhos,
    }


def main() -> None:
    data = build()
    cfg.OUT_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    web = json.loads(json.dumps(data))
    del web["mainland"]
    for c in web["concelhos"].values():
        if c["contacts"]:
            del c["contacts"]["notes"]
    cfg.OUT_WEB.write_text(json.dumps(web, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    cs = data["concelhos"].values()
    print(f"{cfg.OUT_DATA.relative_to(cfg.ROOT)}, {cfg.OUT_WEB.relative_to(cfg.ROOT)} ({cfg.OUT_WEB.stat().st_size / 1024:.1f} KB)")
    print(f"estimates {data['estimate_year']}; {sum(c['population'] is not None for c in cs)} with population, {sum(c['contacts'] is not None for c in cs)} with contacts; national ageing index {data['national']['ageing_index']}")


if __name__ == "__main__":
    sys.exit(main())
