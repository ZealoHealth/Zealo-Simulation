"""Population figures used to scale statewide indent quantities down to Gadag taluk.

Decided by the project team (request R5): Census 2011 values, each machine-verified
against a saved snapshot of its source page in data/raw/population/. The Gadag
taluk figure comes from a third-party mirror of Census 2011, because the official
census site serves an incomplete TLS chain and cannot be fetched securely; that is
recorded as `source_quality` and shown on the Data Sources page.

Only the taluk's *share* of state population is used, so no growth projection is
applied to pair 2011 populations with 2025-26 indent quantities.
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from pathlib import Path

from zealo.config import MANUAL_DIR, REPO_ROOT

POPULATION_JSON = MANUAL_DIR / "population.json"

# Sanity ratios the team specified. Stored values must reproduce them.
EXPECTED_TALUK_SHARE_OF_STATE_PCT = 0.601
EXPECTED_TALUK_SHARE_OF_DISTRICT_PCT = 34.5
STATE_SHARE_TOLERANCE_PCT = 0.005
DISTRICT_SHARE_TOLERANCE_PCT = 0.2


class PopulationError(ValueError):
    """The population inputs are missing, malformed or fail a sanity check."""


@dataclass(frozen=True)
class Figure:
    key: str
    value: int
    source_title: str
    source_url: str
    source_quality: str
    raw_snapshot: str | None
    retrieved: str
    machine_verified: bool


@dataclass(frozen=True)
class Population:
    census_year: int
    karnataka: Figure
    gadag_taluk: Figure
    gadag_district: Figure

    @property
    def taluk_share_of_state(self) -> float:
        return self.gadag_taluk.value / self.karnataka.value

    @property
    def taluk_share_of_district(self) -> float:
        return self.gadag_taluk.value / self.gadag_district.value


def _digits_pattern(value: int) -> re.Pattern[str]:
    """Match a number however it is grouped: 61095297, 61,095,297 or 6,10,95,297."""
    return re.compile(r",?".join(str(value)))


def snapshot_contains(snapshot: Path, value: int) -> bool:
    """True if the saved source page states this exact value."""
    if not snapshot.exists():
        return False
    raw = snapshot.read_text(errors="ignore")
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw)))
    return bool(_digits_pattern(value).search(text))


def _figure(data: dict, key: str) -> Figure:
    try:
        entry = data[key]
        value = int(entry["value"])
    except (KeyError, TypeError, ValueError) as exc:
        raise PopulationError(
            f"population.json: '{key}' is missing or has no numeric value"
        ) from exc
    snapshot = entry.get("raw_snapshot")
    verified = bool(snapshot) and snapshot_contains(REPO_ROOT / snapshot, value)
    return Figure(
        key=key,
        value=value,
        source_title=str(entry.get("source_title", "")),
        source_url=str(entry.get("source_url", "")),
        source_quality=str(entry.get("source_quality", "")),
        raw_snapshot=snapshot,
        retrieved=str(entry.get("retrieved", "")),
        machine_verified=verified,
    )


def load_population(path: Path | None = None) -> Population:
    path = path or POPULATION_JSON
    if not path.exists():
        raise PopulationError(f"{path.name} is missing")
    data = json.loads(path.read_text())
    return Population(
        census_year=int(data.get("census_year", 0)),
        karnataka=_figure(data, "karnataka"),
        gadag_taluk=_figure(data, "gadag_taluk"),
        gadag_district=_figure(data, "gadag_district"),
    )


def validate(population: Population) -> list[str]:
    """Sanity checks the team specified. Returns failures; empty means valid."""
    problems: list[str] = []
    state_pct = population.taluk_share_of_state * 100
    district_pct = population.taluk_share_of_district * 100
    if abs(state_pct - EXPECTED_TALUK_SHARE_OF_STATE_PCT) > STATE_SHARE_TOLERANCE_PCT:
        problems.append(
            f"taluk share of state is {state_pct:.4f}%, expected about "
            f"{EXPECTED_TALUK_SHARE_OF_STATE_PCT}%"
        )
    if abs(district_pct - EXPECTED_TALUK_SHARE_OF_DISTRICT_PCT) > DISTRICT_SHARE_TOLERANCE_PCT:
        problems.append(
            f"taluk share of district is {district_pct:.2f}%, expected about "
            f"{EXPECTED_TALUK_SHARE_OF_DISTRICT_PCT}%"
        )
    taluk, district = population.gadag_taluk.value, population.gadag_district.value
    if not taluk < district < population.karnataka.value:
        problems.append("expected taluk < district < state")
    return problems
