"""Parse the PNCT territories PDF into data/interim/pnct_raw.csv.

One row per PDF line (DISTRITO, CONCELHO, FREGUESIA), with exact duplicates
removed. Empty rows produced by pdfplumber's table detection are dropped.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "data/raw/territorios-pnct-2026-02-04.pdf"
OUT_PATH = ROOT / "data/interim/pnct_raw.csv"

HEADER = ["DISTRITO", "CONCELHO", "FREGUESIA", "PNCT"]
FIELDS = ["source_row", "page", "distrito", "concelho", "freguesia", "pnct"]


def clean(cell: str | None) -> str:
    return " ".join((cell or "").split())


def extract_rows(pdf_path: Path) -> tuple[list[dict], int]:
    rows: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    duplicates = 0
    with pdfplumber.open(pdf_path) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            for table in page.extract_tables():
                for raw in table:
                    cells = [clean(c) for c in raw]
                    if cells == HEADER or not any(cells):
                        continue
                    distrito, concelho, freguesia, pnct = cells
                    if not (distrito and concelho and freguesia):
                        raise ValueError(f"Incomplete row on page {page_no}: {raw!r}")
                    if pnct != "S":
                        raise ValueError(f"Unexpected PNCT value on page {page_no}: {raw!r}")
                    key = (distrito, concelho, freguesia)
                    if key in seen:
                        duplicates += 1
                        print(f"dedupe: {' / '.join(key)}", file=sys.stderr)
                        continue
                    seen.add(key)
                    rows.append(
                        {
                            "source_row": len(rows) + 1,
                            "page": page_no,
                            "distrito": distrito,
                            "concelho": concelho,
                            "freguesia": freguesia,
                            "pnct": pnct,
                        }
                    )
    return rows, duplicates


def main() -> None:
    rows, duplicates = extract_rows(PDF_PATH)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"{len(rows)} rows written to {OUT_PATH.relative_to(ROOT)} ({duplicates} duplicates dropped)")


if __name__ == "__main__":
    main()
