#!/usr/bin/env python
"""Derive private facilities' demand share from NSS 75th round (Karnataka).

    python data/pipeline/06_private_share.py

Reads   data/manual/private_share.json
        data/raw/private_share/nss75_key_indicators_health.pdf  (verified, Table A8)
        data/processed/population.json                          (verified taluk total)
Writes  data/processed/private_share.json
Exits non-zero if any figure disagrees with the PDF or the population split does not add up.
"""

from __future__ import annotations

import json
import sys

from zealo.config import PROCESSED_DIR, REPO_ROOT
from zealo.pipeline.private_share import (
    PrivateShareError,
    load_private_share,
    validate,
    verify_against_pdf,
)


def main() -> int:
    try:
        share = load_private_share()
    except PrivateShareError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    population = PROCESSED_DIR / "population.json"
    taluk_total = None
    if population.exists():
        taluk_total = json.loads(population.read_text())["figures"]["gadag_taluk"]["value"]

    problems = validate(share, taluk_total)
    problems += verify_against_pdf(share, REPO_ROOT / share.source["raw_snapshot"])
    if problems:
        print("PRIVATE SHARE CHECKS FAILED:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    out = {
        "private_to_government_ratio": round(share.ratio, 4),
        "provenance": "derived",
        "method": "methods:private_demand_share",
        "geography": share.geography,
        "urban_weight": round(share.urban_weight, 4),
        "rural": {"government_pct": share.rural.government_pct,
                  "private_pct": round(share.rural.private_pct, 2),
                  "ratio": round(share.rural.ratio, 4)},
        "urban": {"government_pct": share.urban.government_pct,
                  "private_pct": round(share.urban.private_pct, 2),
                  "ratio": round(share.urban.ratio, 4)},
        "source": share.source,
        "machine_verified": True,
        "assumptions": [
            "A treated ailment draws on medicines similarly in government and private "
            "facilities; the survey counts treated spells, not medicine units.",
            "Karnataka-wide shares applied to Gadag taluk, weighted by the taluk's own "
            "urban/rural population.",
            "Charitable/NGO and informal providers are excluded; they are neither the "
            "government nor the private facilities on the map.",
            "Survey period July 2017 - June 2018.",
        ],
    }
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    (PROCESSED_DIR / "private_share.json").write_text(json.dumps(out, indent=2))
    print(
        f"Private share: rural {share.rural.ratio:.2f}, urban {share.urban.ratio:.2f}, "
        f"Gadag-weighted {share.ratio:.3f} private per government "
        f"({share.urban_weight:.1%} urban); verified against Table A8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
