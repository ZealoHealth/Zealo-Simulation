"""Optional unit prices. Absent by decision (R6): the site reports units only.

If data/manual/prices.csv is added from a verified public price list, prices are
loaded, tagged `real` with their source, and value metrics switch back on -- but only
when every simulated medicine is priced, so a total is never silently partial.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from zealo.config import MANUAL_DIR

PRICES_CSV = MANUAL_DIR / "prices.csv"


@dataclass(frozen=True)
class Price:
    drug_code: str
    unit_price_inr: float
    source_title: str
    source_url: str
    retrieved: str


def load_prices(path: Path | None = None) -> tuple[dict[str, Price], list[str]]:
    """Prices by indent drug code, plus problems with any rows that were skipped."""
    path = path or PRICES_CSV
    if not path.exists():
        return {}, []
    with path.open(newline="") as fh:
        lines = [line for line in fh if not line.lstrip().startswith("#")]
    prices: dict[str, Price] = {}
    problems: list[str] = []
    for row in csv.DictReader(lines):
        code = (row.get("drug_code") or "").strip()
        if not code:
            continue
        try:
            value = float(row.get("unit_price_inr") or "")
        except ValueError:
            problems.append(f"{code}: unit_price_inr is not a number")
            continue
        if value <= 0:
            problems.append(f"{code}: unit_price_inr must be positive")
            continue
        if not (row.get("source_title") or row.get("source_url")):
            problems.append(f"{code}: no source given; price not used")
            continue
        prices[code] = Price(
            code, value,
            (row.get("source_title") or "").strip(),
            (row.get("source_url") or "").strip(),
            (row.get("retrieved") or "").strip(),
        )
    return prices, problems
