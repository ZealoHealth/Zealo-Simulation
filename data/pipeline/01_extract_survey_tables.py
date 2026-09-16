#!/usr/bin/env python
"""Extract Tables 1, 2 and 3 from the Gadag PHC survey PDF into CSVs.

    python data/pipeline/01_extract_survey_tables.py

Reads   data/raw/gadag_phc_survey_cureus_e39341.pdf   (never modified)
Writes  data/interim/survey_table1_categories.csv
        data/interim/survey_table2_items.csv
        data/interim/survey_table3_items.csv
        data/interim/survey_extraction_report.json

Exits non-zero if the extraction disagrees with any figure the paper states in
its own text, so a silent regression cannot pass unnoticed.
"""

from __future__ import annotations

import json
import sys
from datetime import date

import pandas as pd

from zealo.config import INTERIM_DIR, RAW_DIR
from zealo.pipeline.survey import (
    PUBLISHED_HIGHEST,
    PUBLISHED_LOWEST,
    PUBLISHED_OVERALL_AVAILABILITY,
    TABLE3_MISSING_ITEM,
    extract_table1,
    extract_table2,
    extract_table3,
    verify_against_publication,
)

SOURCE_ID = "gadag_survey_2023"
PDF = RAW_DIR / "gadag_phc_survey_cureus_e39341.pdf"


def main() -> int:
    if not PDF.exists():
        print(f"ERROR: missing raw source {PDF}", file=sys.stderr)
        return 2

    INTERIM_DIR.mkdir(parents=True, exist_ok=True)

    t1 = extract_table1(PDF)
    t2 = extract_table2(PDF)
    t3 = extract_table3(PDF)
    report = verify_against_publication(t1, t2, t3)

    # Every row carries its source. These are transcriptions of published values,
    # so they are 'real' -- no modelling has happened yet.
    for rows in (t1, t2, t3):
        for r in rows:
            r["source_id"] = SOURCE_ID
            r["provenance"] = "real"

    pd.DataFrame(t1).to_csv(INTERIM_DIR / "survey_table1_categories.csv", index=False)
    pd.DataFrame(t2).to_csv(INTERIM_DIR / "survey_table2_items.csv", index=False)
    pd.DataFrame(t3).to_csv(INTERIM_DIR / "survey_table3_items.csv", index=False)

    meta = {
        "source_id": SOURCE_ID,
        "extracted_on": date.today().isoformat(),
        "pdf": str(PDF.relative_to(PDF.parents[2])),
        "table1_categories": report.table1_rows,
        "table2_items": report.table2_rows,
        "table3_items": report.table3_rows,
        "published_overall_availability_pct": PUBLISHED_OVERALL_AVAILABILITY,
        "published_highest": {"phc": PUBLISHED_HIGHEST[0], "pct": PUBLISHED_HIGHEST[1]},
        "published_lowest": {"phc": PUBLISHED_LOWEST[0], "pct": PUBLISHED_LOWEST[1]},
        "known_gap": (
            f"Table 3 lists {report.table3_rows} rows against Table 2's {report.table2_rows} "
            f"items: '{TABLE3_MISSING_ITEM}' appears in Table 2 only."
        ),
        "verification_passed": report.ok,
        "problems": report.problems,
    }
    (INTERIM_DIR / "survey_extraction_report.json").write_text(json.dumps(meta, indent=2))

    print(f"Table 1: {report.table1_rows} categories")
    print(f"Table 2: {report.table2_rows} items")
    print(f"Table 3: {report.table3_rows} items  ({TABLE3_MISSING_ITEM} absent -- see report)")
    if report.ok:
        print(f"\nVerified against the paper: overall {PUBLISHED_OVERALL_AVAILABILITY}%, "
              f"{PUBLISHED_HIGHEST[0]} {PUBLISHED_HIGHEST[1]}%, "
              f"{PUBLISHED_LOWEST[0]} {PUBLISHED_LOWEST[1]}%.")
        print(f"Wrote 3 CSVs + report to {INTERIM_DIR}")
        return 0

    print("\nVERIFICATION FAILED:", file=sys.stderr)
    for p in report.problems:
        print(f"  - {p}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
