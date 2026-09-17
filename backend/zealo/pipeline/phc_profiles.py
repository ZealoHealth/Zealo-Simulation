"""Per-PHC availability (Figure 1) and the 15 x 104 availability matrix built from it.

Figure 1 of the survey is a raster image, so its 15 per-PHC percentages are being
transcribed by hand into data/manual/figure1_phc_availability.csv (request R1).
Until that file is complete and passes validation, an **interim rule** agreed with
the project team is used:

    PHC 1 = 45.45 and PHC 4 = 94.17   (stated in the paper's text -> real)
    the other 13 = one equal value that keeps the published mean of 74.20
                                       (-> estimated, "interim: equal distribution")

The matrix is then rebuilt from whichever values are in force. Its row totals come
from these percentages and its column totals from Table 2; every individual cell is
a reconstruction, never an observation, and is tagged `derived`.
"""

from __future__ import annotations

import csv
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from zealo.config import MANUAL_DIR

FIGURE1_CSV = MANUAL_DIR / "figure1_phc_availability.csv"

N_PHCS = 15
N_ITEMS = 104
PUBLISHED = {1: 45.45, 4: 94.17}
PUBLISHED_MEAN = 74.20
MEAN_TOLERANCE = 0.5
INTERIM_NOTE = "interim: equal distribution pending Figure 1 transcription"


@dataclass(frozen=True)
class Profile:
    phc_number: int
    availability_pct: float
    provenance: str  # real | estimated
    note: str


@dataclass(frozen=True)
class ResolvedProfiles:
    profiles: list[Profile]
    source: str  # "transcribed" | "interim"
    problems: list[str]  # why a submitted file was not used, if it was not

    @property
    def is_interim(self) -> bool:
        return self.source == "interim"


def read_figure1(path: Path | None = None) -> dict[int, float | None]:
    """Read the transcription file. Missing or blank cells come back as None."""
    path = path or FIGURE1_CSV
    values: dict[int, float | None] = {n: None for n in range(1, N_PHCS + 1)}
    if not path.exists():
        return values
    with path.open(newline="") as fh:
        lines = [line for line in fh if not line.lstrip().startswith("#")]
    for row in csv.DictReader(lines):
        label = (row.get("phc_label") or "").strip().upper().replace("PHC", "").strip()
        if not label.isdigit():
            continue
        number = int(label)
        raw = (row.get("availability_pct") or "").strip()
        if number in values and raw:
            try:
                values[number] = float(raw)
            except ValueError:
                values[number] = float("nan")
    return values


def validate_figure1(values: dict[int, float | None]) -> list[str]:
    """The checks the team specified. Empty list means the file may be used."""
    problems: list[str] = []
    missing = [n for n, v in values.items() if v is None]
    if missing:
        problems.append(f"{len(missing)} PHC values not filled in yet: {missing}")
        return problems

    filled = {n: float(v) for n, v in values.items()}  # type: ignore[arg-type]
    for n, v in filled.items():
        if math.isnan(v) or not 0.0 <= v <= 100.0:
            problems.append(f"PHC {n} = {v} is not a percentage between 0 and 100")
    for n, expected in PUBLISHED.items():
        if abs(filled[n] - expected) > 1e-6:
            problems.append(f"PHC {n} must be {expected} (stated in the paper), got {filled[n]}")
    if max(filled.values()) != filled[4]:
        problems.append("PHC 4 must be the highest value (the paper says so)")
    if min(filled.values()) != filled[1]:
        problems.append("PHC 1 must be the lowest value (the paper says so)")
    mean = sum(filled.values()) / N_PHCS
    if abs(mean - PUBLISHED_MEAN) > MEAN_TOLERANCE:
        problems.append(
            f"mean of the 15 values is {mean:.2f}, outside {PUBLISHED_MEAN} +/- {MEAN_TOLERANCE}"
        )
    return problems


def interim_value() -> float:
    """The single value for the 13 unpublished PHCs that preserves the published mean."""
    remaining = PUBLISHED_MEAN * N_PHCS - sum(PUBLISHED.values())
    return remaining / (N_PHCS - len(PUBLISHED))


def resolve_profiles(path: Path | None = None) -> ResolvedProfiles:
    """Use the transcription if it is complete and valid, otherwise the interim rule."""
    values = read_figure1(path)
    problems = validate_figure1(values)
    submitted_any = any(v is not None for n, v in values.items() if n not in PUBLISHED)

    if not problems:
        return ResolvedProfiles(
            profiles=[
                Profile(n, float(values[n]), "real", "transcribed from Figure 1, page 4")  # type: ignore[arg-type]
                for n in range(1, N_PHCS + 1)
            ],
            source="transcribed",
            problems=[],
        )

    fill = interim_value()
    profiles = []
    for n in range(1, N_PHCS + 1):
        if n in PUBLISHED:
            profiles.append(Profile(n, PUBLISHED[n], "real", "stated in the paper's text"))
        else:
            profiles.append(Profile(n, round(fill, 4), "estimated", INTERIM_NOTE))
    # Only report problems when someone has actually started filling the file in;
    # an untouched template is the expected interim state, not a failure.
    return ResolvedProfiles(profiles, "interim", problems if submitted_any else [])


def _round_half_down(x: float) -> int:
    """12.5 -> 12. Used for the one published value that is not a multiple of 1/15."""
    return int(math.floor(x + 0.5 - 1e-9))


def column_totals(item_pcts: dict[int, float]) -> dict[int, int]:
    """PHCs holding each item, from Table 2's percentages over n = 15."""
    return {item: _round_half_down(pct / 100 * N_PHCS) for item, pct in item_pcts.items()}


def reconcile_row_totals(
    profiles: list[Profile], target_sum: int, n_items: int
) -> dict[int, int]:
    """Integer items-in-stock per PHC, adjusted so rows and columns sum to the same total.

    The percentages do not map exactly onto whole items, so rounding leaves the row sum a
    little off the column sum. The difference is absorbed one item at a time by the rows
    whose rounding was closest to going the other way -- **estimated rows first**, so the
    two published values move only if nothing else can absorb it.
    """
    exact = {p.phc_number: p.availability_pct / 100 * n_items for p in profiles}
    totals = {n: _round_half_down(v) for n, v in exact.items()}
    estimated = {p.phc_number for p in profiles if p.provenance != "real"}
    diff = target_sum - sum(totals.values())
    step = 1 if diff > 0 else -1

    while diff != 0:
        def headroom(n: int) -> bool:
            return 0 < totals[n] + step <= n_items

        def residual(n: int) -> float:
            r = exact[n] - totals[n]
            return r if step > 0 else -r

        candidates = [n for n in totals if headroom(n)]
        if not candidates:
            raise ValueError("cannot reconcile row and column totals")
        preferred = [n for n in candidates if n in estimated] or candidates
        chosen = max(preferred, key=lambda n: (residual(n), -n))
        totals[chosen] += step
        diff -= step
    return totals


def gale_ryser_feasible(rows: list[int], cols: list[int]) -> bool:
    """Whether a binary matrix with these margins exists at all."""
    if sum(rows) != sum(cols):
        return False
    rows_sorted = sorted(rows, reverse=True)
    for k in range(1, len(rows_sorted) + 1):
        if sum(rows_sorted[:k]) > sum(min(c, k) for c in cols):
            return False
    return True


def build_matrix(
    row_totals: dict[int, int], col_totals: dict[int, int], seed: int
) -> dict[tuple[int, int], bool]:
    """A binary PHC x item matrix whose margins match exactly.

    Ryser's construction: take items in descending order of how many PHCs hold them, and
    give each to the PHCs with the most remaining capacity. Ties are broken by a seeded
    shuffle, so the matrix is reproducible but not arbitrarily ordered. Exact margins are
    asserted afterwards rather than assumed.
    """
    rows = sorted(row_totals)
    items = sorted(col_totals, key=lambda i: (-col_totals[i], i))
    if not gale_ryser_feasible([row_totals[r] for r in rows], [col_totals[i] for i in items]):
        raise ValueError("no binary matrix satisfies these row and column totals")

    rng = np.random.default_rng(seed)
    remaining = dict(row_totals)
    matrix = {(r, i): False for r in rows for i in col_totals}

    for item in items:
        order = list(rng.permutation(rows))
        order.sort(key=lambda r: -remaining[r])  # stable: shuffle breaks ties
        for r in order[: col_totals[item]]:
            matrix[(int(r), item)] = True
            remaining[int(r)] -= 1

    for r in rows:
        got = sum(matrix[(r, i)] for i in col_totals)
        if got != row_totals[r]:
            raise AssertionError(f"PHC {r}: row total {got} != {row_totals[r]}")
    for i in col_totals:
        got = sum(matrix[(r, i)] for r in rows)
        if got != col_totals[i]:
            raise AssertionError(f"item {i}: column total {got} != {col_totals[i]}")
    return matrix
