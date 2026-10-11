"""Match PNCT PDF rows (data/interim/pnct_raw.csv) to CAOP 2025 parishes.

Outputs:
  data/processed/pnct_parishes.csv  one row per matched parish (unique dicofre)
  data/processed/unmatched.csv      PDF rows that could not be resolved
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd
import pyogrio
from rapidfuzz import fuzz

ROOT = Path(__file__).resolve().parents[1]
RAW_CSV = ROOT / "data" / "interim" / "pnct_raw.csv"
OVERRIDES_CSV = ROOT / "data" / "overrides.csv"
CAOP_GPKG = (
    ROOT / "data" / "external" / "CAOP_Continente_2025-gpkg" / "Continente_CAOP2025.gpkg"
)
CAOP_LAYER = "cont_freguesias"
OUT_DIR = ROOT / "data" / "processed"
OUT_PARISHES = OUT_DIR / "pnct_parishes.csv"
OUT_UNMATCHED = OUT_DIR / "unmatched.csv"

WILDCARD_CONCELHO = "TODOS OS CONCELHOS"
WILDCARD_FREGUESIA = "TODAS AS FREGUESIAS DO CONCELHO"

FUZZY_MIN = 90.0
FUZZY_MARGIN = 5.0

# Lower number = higher priority when the same dicofre is produced twice.
METHOD_PRIORITY = {"override": 0, "exact": 1, "normalized": 2, "fuzzy": 3, "wildcard": 4}

PARISH_COLUMNS = [
    "dicofre",
    "distrito",
    "concelho",
    "freguesia_official",
    "source_row",
    "match_method",
    "match_score",
]
UNMATCHED_COLUMNS = ["source_row", "distrito", "concelho", "freguesia", "reason", "candidates"]

_UNION_PREFIX = re.compile(
    r"^(?:UNIAO\s+(?:DAS|DA|DOS|DO|DE)\s+FREGUESIAS?|U\.?\s?F\.?)\s+"
    r"(?:(?:DE|DO|DA|DOS|DAS)\s+)?"
)


# --------------------------------------------------------------------------- #
# Normalisation
# --------------------------------------------------------------------------- #
def _collapse(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def normalize(s: str) -> str:
    """Strip accents, uppercase, drop apostrophes, collapse whitespace."""
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.upper()
    s = re.sub(r"[\u0027\u2019\u2018\u02bc`\u00b4]", "", s)
    return _collapse(s)


def is_union(s: str) -> bool:
    return _UNION_PREFIX.match(normalize(s)) is not None


def name_key(s: str) -> str:
    """normalize(s) with any leading union prefix (U.F. / UNIAO DAS FREGUESIAS ...) removed."""
    n = normalize(s)
    return _collapse(_UNION_PREFIX.sub("", n, count=1))


def _upper_ws(s: str) -> str:
    """Uppercase + whitespace collapse only (accents kept)."""
    return _collapse(str(s).upper())


# --------------------------------------------------------------------------- #
# Loading
# --------------------------------------------------------------------------- #
def load_caop() -> pd.DataFrame:
    df = pyogrio.read_dataframe(CAOP_GPKG, layer=CAOP_LAYER, read_geometry=False)
    df = df[["dtmnfr", "freguesia", "designacao_simplificada", "municipio", "distrito_ilha"]].copy()
    df["dtmnfr"] = df["dtmnfr"].astype(str).str.zfill(6)
    for c in ["freguesia", "designacao_simplificada", "municipio", "distrito_ilha"]:
        df[c] = df[c].fillna("").astype(str)
    df["n_municipio"] = df["municipio"].map(normalize)
    df["n_distrito"] = df["distrito_ilha"].map(normalize)
    df["k_freguesia"] = df["freguesia"].map(name_key)
    df["k_designacao"] = df["designacao_simplificada"].map(name_key)
    df["u_freguesia"] = df["freguesia"].map(_upper_ws)
    return df.reset_index(drop=True)


def load_overrides() -> tuple[dict, list[dict]]:
    """Return (concelho aliases, row-level pins)."""
    ov = pd.read_csv(OVERRIDES_CSV, dtype=str, keep_default_na=False)
    aliases: dict[tuple[str, str], str] = {}
    pins: list[dict] = []
    for i, r in ov.iterrows():
        key_c = (normalize(r["distrito"]), normalize(r["concelho"]))
        if r["freguesia"].strip() == "*":
            if not r["target_concelho"].strip():
                raise ValueError(f"overrides.csv line {i + 2}: alias row without target_concelho")
            aliases[key_c] = r["target_concelho"].strip()
        else:
            pins.append(
                {
                    "line": i + 2,
                    "distrito": normalize(r["distrito"]),
                    "concelho": normalize(r["concelho"]),
                    "freguesia": normalize(r["freguesia"]),
                    "target_concelho": r["target_concelho"].strip(),
                    "targets": [t.strip() for t in r["target_dicofre"].split(";") if t.strip()],
                    "used": False,
                }
            )
    return aliases, pins


# --------------------------------------------------------------------------- #
# Matching
# --------------------------------------------------------------------------- #
def resolve_municipality(caop: pd.DataFrame, distrito: str, concelho: str, aliases: dict) -> pd.DataFrame:
    target = aliases.get((normalize(distrito), normalize(concelho)), concelho)
    mask = (caop["n_municipio"] == normalize(target)) & (caop["n_distrito"] == normalize(distrito))
    return caop[mask]


def fuzzy_scores(key: str, muni: pd.DataFrame) -> list[tuple[float, str, str]]:
    out = []
    for _, p in muni.iterrows():
        best = 0.0
        for cand in {p["k_freguesia"], p["k_designacao"]}:
            if not cand:
                continue
            best = max(best, fuzz.token_sort_ratio(key, cand), fuzz.ratio(key, cand))
        out.append((float(best), p["dtmnfr"], p["freguesia"]))
    out.sort(key=lambda t: (-t[0], t[1]))
    return out


def fmt_candidates(scores: list[tuple[float, str, str]], n: int = 3) -> str:
    return "; ".join(f"{d} {name} ({s:.1f})" for s, d, name in scores[:n])


def validate_pin(pin: dict, caop: pd.DataFrame, expected_muni: pd.DataFrame) -> list[str]:
    by_id = caop.set_index("dtmnfr")
    expected_ids = set(expected_muni["dtmnfr"])
    for t in pin["targets"]:
        if t not in by_id.index:
            raise ValueError(f"overrides.csv line {pin['line']}: target_dicofre {t} not found in CAOP")
        if t not in expected_ids:
            raise ValueError(
                f"overrides.csv line {pin['line']}: target_dicofre {t} "
                f"({by_id.loc[t, 'municipio']}) is not in expected concelho "
                f"{expected_muni['municipio'].iloc[0] if len(expected_muni) else pin['concelho']}"
            )
    if not pin["targets"]:
        raise ValueError(f"overrides.csv line {pin['line']}: row-level pin without target_dicofre")
    return pin["targets"]


def parish_record(p: pd.Series, source_row: int, method: str, score: float) -> dict:
    return {
        "dicofre": p["dtmnfr"],
        "distrito": p["distrito_ilha"],
        "concelho": p["municipio"],
        "freguesia_official": p["freguesia"],
        "source_row": source_row,
        "match_method": method,
        "match_score": round(float(score), 1),
    }


def match_all(raw: pd.DataFrame, caop: pd.DataFrame, aliases: dict, pins: list[dict]):
    matched: list[dict] = []
    unmatched: list[dict] = []
    fuzzy_log: list[tuple[int, str, str, str, float]] = []
    by_id = caop.set_index("dtmnfr", drop=False)

    def fail(row, reason, candidates=""):
        unmatched.append(
            {
                "source_row": int(row["source_row"]),
                "distrito": row["distrito"],
                "concelho": row["concelho"],
                "freguesia": row["freguesia"],
                "reason": reason,
                "candidates": candidates,
            }
        )

    for _, row in raw.iterrows():
        sr = int(row["source_row"])
        distrito, concelho, freguesia = row["distrito"], row["concelho"], row["freguesia"]

        # --- district wildcard ------------------------------------------------
        if _upper_ws(concelho) == WILDCARD_CONCELHO:
            sub = caop[caop["n_distrito"] == normalize(distrito)]
            if sub.empty:
                fail(row, f"distrito not found in CAOP: {distrito}")
                continue
            for _, p in sub.iterrows():
                matched.append(parish_record(p, sr, "wildcard", 100))
            continue

        muni = resolve_municipality(caop, distrito, concelho, aliases)
        if muni.empty:
            fail(row, f"municipality not found in CAOP: {distrito} / {concelho}")
            continue

        # --- municipality wildcard -------------------------------------------
        if _upper_ws(freguesia) == WILDCARD_FREGUESIA:
            for _, p in muni.iterrows():
                matched.append(parish_record(p, sr, "wildcard", 100))
            continue

        # --- 1. row-level override -------------------------------------------
        pin = next(
            (
                pn
                for pn in pins
                if pn["distrito"] == normalize(distrito)
                and pn["concelho"] == normalize(concelho)
                and pn["freguesia"] == normalize(freguesia)
            ),
            None,
        )
        if pin is not None:
            pin["used"] = True
            expected = (
                caop[(caop["n_municipio"] == normalize(pin["target_concelho"])) & (caop["n_distrito"] == normalize(distrito))]
                if pin["target_concelho"]
                else muni
            )
            for t in validate_pin(pin, caop, expected):
                matched.append(parish_record(by_id.loc[t], sr, "override", 100))
            continue

        # --- 2. exact ----------------------------------------------------------
        hits = muni[muni["u_freguesia"] == _upper_ws(freguesia)]
        if len(hits) == 1:
            matched.append(parish_record(hits.iloc[0], sr, "exact", 100))
            continue
        if len(hits) > 1:
            fail(row, "ambiguous exact match", "; ".join(f"{d} {n}" for d, n in zip(hits["dtmnfr"], hits["freguesia"])))
            continue

        # --- 3. normalized -----------------------------------------------------
        key = name_key(freguesia)
        hits = muni[(muni["k_freguesia"] == key) | (muni["k_designacao"] == key)]
        if len(hits) == 1:
            matched.append(parish_record(hits.iloc[0], sr, "normalized", 100))
            continue
        if len(hits) > 1:
            fail(row, "ambiguous normalized match", "; ".join(f"{d} {n}" for d, n in zip(hits["dtmnfr"], hits["freguesia"])))
            continue

        # --- 4. fuzzy ----------------------------------------------------------
        scores = fuzzy_scores(key, muni)
        best = scores[0][0]
        second = scores[1][0] if len(scores) > 1 else None
        cands = fmt_candidates(scores)
        if best < FUZZY_MIN:
            fail(row, f"no match: best fuzzy score {best:.1f} < {FUZZY_MIN:.0f}", cands)
        elif second is not None and second >= best - FUZZY_MARGIN:
            fail(row, f"ambiguous fuzzy match: best {best:.1f}, second {second:.1f}", cands)
        else:
            _, d, name = scores[0]
            matched.append(parish_record(by_id.loc[d], sr, "fuzzy", best))
            fuzzy_log.append((sr, f"{distrito}/{concelho}/{freguesia}", d, name, best))

    return matched, unmatched, fuzzy_log


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    raw = pd.read_csv(RAW_CSV, dtype=str, keep_default_na=False)
    raw["source_row"] = raw["source_row"].astype(int)
    caop = load_caop()
    aliases, pins = load_overrides()

    matched, unmatched, fuzzy_log = match_all(raw, caop, aliases, pins)

    stale = [p for p in pins if not p["used"]]
    if stale:
        desc = "; ".join(f"line {p['line']} ({p['distrito']}/{p['concelho']}/{p['freguesia']})" for p in stale)
        raise ValueError(f"stale override(s) matching no PDF row: {desc}")

    # Method counts by PDF row (before dedup).
    row_methods: dict[int, str] = {}
    for m in matched:
        row_methods.setdefault(m["source_row"], m["match_method"])

    # Deduplicate by dicofre.
    df = pd.DataFrame(matched, columns=PARISH_COLUMNS)
    if not df.empty:
        df["_prio"] = df["match_method"].map(METHOD_PRIORITY)
        df = df.sort_values(["dicofre", "_prio", "source_row"], kind="stable")
        dup_mask = df.duplicated("dicofre", keep=False)
        if dup_mask.any():
            print("WARNING: dicofre produced by more than one PDF row (keeping best by priority):", file=sys.stderr)
            for d, g in df[dup_mask].groupby("dicofre", sort=True):
                parts = ", ".join(f"row {r.source_row} [{r.match_method}]" for r in g.itertuples())
                print(f"  {d} {g['freguesia_official'].iloc[0]}: {parts}", file=sys.stderr)
        df = df.drop_duplicates("dicofre", keep="first").drop(columns="_prio")
    df = df.sort_values("dicofre").reset_index(drop=True)
    df["match_score"] = df["match_score"].astype(float).round(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    df[PARISH_COLUMNS].to_csv(OUT_PARISHES, index=False, lineterminator="\n", float_format="%.1f")
    um = pd.DataFrame(unmatched, columns=UNMATCHED_COLUMNS).sort_values("source_row")
    um.to_csv(OUT_UNMATCHED, index=False, lineterminator="\n")

    # Summary
    print(f"PDF rows: {len(raw)}")
    counts = pd.Series(row_methods).value_counts()
    for method in METHOD_PRIORITY:
        print(f"  {method:<11} {int(counts.get(method, 0))}")
    print(f"  {'unmatched':<11} {len(um)}")
    print(f"PNCT parishes (unique dicofre): {len(df)}")
    print(f"Unmatched rows: {len(um)}")
    if fuzzy_log:
        print("Fuzzy matches:")
        for sr, src, d, name, score in fuzzy_log:
            print(f"  row {sr}: {src} -> {d} {name} ({score:.1f})")
    if len(um):
        print("Unmatched:")
        for r in um.itertuples():
            print(f"  row {r.source_row}: {r.distrito}/{r.concelho}/{r.freguesia} - {r.reason} [{r.candidates}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
