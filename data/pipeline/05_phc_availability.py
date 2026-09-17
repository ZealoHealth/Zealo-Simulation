#!/usr/bin/env python
"""Resolve per-PHC availability (Figure 1) and rebuild the 15 x 104 availability matrix.

    python data/pipeline/05_phc_availability.py

Reads   data/manual/figure1_phc_availability.csv   (your transcription, R1)
        data/interim/survey_table2_items.csv        (from step 01)
Writes  data/processed/phc_availability_profiles.csv
        data/processed/phc_availability_matrix.csv
        data/interim/phc_availability_report.json

Uses your transcription once it is complete and passes validation; until then the
interim rule applies. A submitted file that fails validation is reported and NOT
used -- the interim rule stays in force.
"""

from __future__ import annotations

import csv
import json
import sys

from zealo.config import INTERIM_DIR, PROCESSED_DIR
from zealo.pipeline.phc_profiles import (
    build_matrix,
    column_totals,
    reconcile_row_totals,
    resolve_profiles,
)

MATRIX_SEED = 20230522  # the survey's publication date; any fixed value would do


def main() -> int:
    table2 = INTERIM_DIR / "survey_table2_items.csv"
    if not table2.exists():
        print("ERROR: run data/pipeline/01_extract_survey_tables.py first", file=sys.stderr)
        return 2

    items = {
        int(r["sl_no"]): float(r["availability_pct"])
        for r in csv.DictReader(table2.open(newline=""))
    }
    resolved = resolve_profiles()
    cols = column_totals(items)
    rows = reconcile_row_totals(resolved.profiles, sum(cols.values()), len(items))
    matrix = build_matrix(rows, cols, seed=MATRIX_SEED)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with (PROCESSED_DIR / "phc_availability_profiles.csv").open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["phc_number", "availability_pct", "items_in_stock", "provenance", "note"])
        for p in resolved.profiles:
            w.writerow([p.phc_number, p.availability_pct, rows[p.phc_number], p.provenance, p.note])

    with (PROCESSED_DIR / "phc_availability_matrix.csv").open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["phc_number", "survey_sl_no", "in_stock", "provenance"])
        for (phc, item), value in sorted(matrix.items()):
            w.writerow([phc, item, int(value), "derived"])

    # A compact, committed summary of the survey's published findings for the Data
    # Sources page (data/interim/ is not committed, so the site cannot read it there).
    table1 = INTERIM_DIR / "survey_table1_categories.csv"
    categories = [
        {"category": r["category"], "availability_pct": float(r["availability_pct"])}
        for r in csv.DictReader(table1.open(newline=""))
    ] if table1.exists() else []
    summary = {
        "source_id": "gadag_survey_2023",
        "provenance": "real",
        "phcs_surveyed": 15,
        "items_assessed": len(items),
        "period": "November 2021 to March 2022",
        "overall_availability_pct": 74.20,
        "highest_phc": {"phc": 4, "availability_pct": 94.17},
        "lowest_phc": {"phc": 1, "availability_pct": 45.45},
        "categories": categories,
        "unavailable_everywhere": [
            {"sl_no": n, "name": r["drug_name"]}
            for r in csv.DictReader(table2.open(newline=""))
            if float(r["availability_pct"]) == 0.0
            for n in [int(r["sl_no"])]
        ],
        "items_at_full_availability": sum(1 for v in items.values() if v == 100.0),
    }
    (PROCESSED_DIR / "survey_summary.json").write_text(json.dumps(summary, indent=2))

    report = {
        "source": resolved.source,
        "validation_problems": resolved.problems,
        "row_totals": rows,
        "column_total_sum": sum(cols.values()),
        "matrix_seed": MATRIX_SEED,
    }
    (INTERIM_DIR / "phc_availability_report.json").write_text(json.dumps(report, indent=2))

    label = "your transcription" if not resolved.is_interim else "INTERIM rule"
    print(f"PHC availability: using {label}; matrix 15 x {len(items)}, {sum(cols.values())} in-stock cells")
    if resolved.problems:
        print("\n>>> Figure 1 file was NOT used - it failed validation:")
        for p in resolved.problems:
            print(f"    - {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
