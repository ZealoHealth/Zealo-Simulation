#!/usr/bin/env python
"""Validate population figures and publish them for the demand model.

    python data/pipeline/04_population.py

Reads   data/manual/population.json, data/raw/population/*.html (snapshots)
Writes  data/processed/population.json
Exits non-zero if a sanity check fails, so a wrong figure cannot reach the model.
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict

from zealo.config import PROCESSED_DIR
from zealo.pipeline.population import PopulationError, load_population, validate


def main() -> int:
    try:
        population = load_population()
    except PopulationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    problems = validate(population)
    if problems:
        print("POPULATION SANITY CHECKS FAILED:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    unverified = [
        f.key
        for f in (population.karnataka, population.gadag_taluk, population.gadag_district)
        if not f.machine_verified
    ]
    out = {
        "census_year": population.census_year,
        "taluk_share_of_state": population.taluk_share_of_state,
        "taluk_share_of_district": population.taluk_share_of_district,
        "figures": {
            f.key: {**asdict(f), "provenance": "real"}
            for f in (population.karnataka, population.gadag_taluk, population.gadag_district)
        },
        "limitations": [
            "Census 2011 populations are paired with 2025-26 indent quantities. Only the "
            "taluk's share of state population is used, assumed broadly stable; no growth "
            "projection is applied.",
            "Gadag district now has 7 taluks (5 at the 2011 census), so the taluk boundary "
            "may have changed since the census. Not adjusted for.",
            "The Gadag taluk figure comes from a third-party mirror of Census 2011; the "
            "official census site could not be accessed securely.",
        ],
    }
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    (PROCESSED_DIR / "population.json").write_text(json.dumps(out, indent=2))

    print(
        f"Population: Gadag taluk {population.gadag_taluk.value:,} / Karnataka "
        f"{population.karnataka.value:,} = {population.taluk_share_of_state * 100:.4f}%"
    )
    print(f"            share of district {population.taluk_share_of_district * 100:.2f}%")
    print(f"            machine-verified: {'all' if not unverified else 'NOT ' + ', '.join(unverified)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
