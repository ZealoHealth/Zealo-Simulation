"""Assemble a scenario from the real datasets, run both modes, cache the result.

The assembler is the point where the project's honesty rule bites hardest. Taluk
demand is `statewide indent quantity x (Gadag population / Karnataka population)`,
and PHC opening stock comes from the survey's reconstructed availability matrix.
Neither input exists yet: the population figures are request R5 and the matrix
needs the Figure 1 transcription, request R1.

So rather than substituting a plausible number, ``build_scenario`` raises
``MissingDemandInputs`` naming exactly what is absent and which request supplies
it. The API turns that into a 422 the UI can show. Everything else -- facilities,
medicines, levels, the engine, both policies -- is already wired to real data and
starts working the moment those two inputs land.
"""

from __future__ import annotations

import json
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from zealo.config import MANUAL_DIR
from zealo.data_access import load_facilities, survey_linked_medicines
from zealo.sim.engine import RunResult, Scenario, run
from zealo.sim.models import (
    Batch,
    Facility,
    FacilityRules,
    FacilityType,
    Manufacturer,
    Medicine,
)
from zealo.sim.policies import BaselinePolicy, ZealoPolicy

POPULATION_JSON = MANUAL_DIR / "population.json"
AVAILABILITY_MATRIX_CSV = MANUAL_DIR / "phc_availability_matrix.csv"

LEVEL_COLUMNS = {
    FacilityType.PHC: "at_phc",
    FacilityType.CHC: "at_chc",
    FacilityType.TALUK_HOSPITAL: "at_tlh",
    FacilityType.DISTRICT_HOSPITAL: "at_dlh",
    FacilityType.GOVERNMENT_OTHER: "at_chc",
}
# Private facilities have no public medicine list. The taluk-hospital list is used
# as a documented proxy and is tagged estimated wherever it reaches the UI.
PRIVATE_PROXY_COLUMN = "at_tlh"


class MissingDemandInputs(RuntimeError):
    """Required real-world inputs are absent, so no run can be built.

    Carries the specific requests that would unblock it, so the UI can say what
    is needed instead of showing an empty map.
    """

    def __init__(self, missing: list[str], requests: list[str]) -> None:
        self.missing = missing
        self.requests = requests
        super().__init__(
            "Cannot build a scenario without: "
            + "; ".join(missing)
            + f". See data/manual/REQUESTS.md ({', '.join(requests)})."
        )


@dataclass(frozen=True)
class PopulationInputs:
    """Official population figures. Supplied by hand; never estimated here."""

    gadag_taluk: int
    karnataka: int
    source: str
    retrieved: str

    @property
    def taluk_share(self) -> float:
        return self.gadag_taluk / self.karnataka


def load_population(path: Path | None = None) -> PopulationInputs | None:
    """Read the population figures, if a human has supplied them."""
    path = path or POPULATION_JSON
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    try:
        return PopulationInputs(
            gadag_taluk=int(data["gadag_taluk_population"]),
            karnataka=int(data["karnataka_population"]),
            source=str(data["source"]),
            retrieved=str(data.get("retrieved", "")),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise MissingDemandInputs(
            [f"{path} is present but malformed ({exc})"], ["R5"]
        ) from exc


def load_availability_matrix(path: Path | None = None) -> dict[tuple[int, int], bool] | None:
    """Read the reconstructed 15 x 104 PHC availability matrix, if it exists."""
    path = path or AVAILABILITY_MATRIX_CSV
    if not path.exists():
        return None
    import csv

    matrix: dict[tuple[int, int], bool] = {}
    with path.open(newline="") as fh:
        for row in csv.DictReader(fh):
            phc = int(row["phc_number"])
            item = int(row["survey_sl_no"])
            matrix[(phc, item)] = str(row["in_stock"]).strip().lower() in ("1", "true", "yes")
    return matrix


def check_inputs() -> None:
    """Raise unless every real-world input a run needs is present."""
    missing: list[str] = []
    requests: list[str] = []
    if load_population() is None:
        missing.append(
            "official Gadag taluk and Karnataka population figures "
            f"(expected at {POPULATION_JSON})"
        )
        requests.append("R5")
    if load_availability_matrix() is None:
        missing.append(
            "the reconstructed PHC availability matrix, which needs the Figure 1 "
            f"per-PHC values (expected at {AVAILABILITY_MATRIX_CSV})"
        )
        requests.append("R1")
    if missing:
        raise MissingDemandInputs(missing, requests)


def _facility_type(value: str) -> FacilityType:
    try:
        return FacilityType(value)
    except ValueError:
        return FacilityType.CLINIC


def _carried_column(facility_type: FacilityType) -> str:
    return LEVEL_COLUMNS.get(facility_type, PRIVATE_PROXY_COLUMN)


def build_medicines() -> list[Medicine]:
    """The medicines a run models: survey items with a confirmed indent link.

    Unit prices stay None until a public price source is confirmed (request R6),
    which is why value metrics are withheld rather than shown as zero.
    """
    medicines: list[Medicine] = []
    for record in survey_linked_medicines():
        levels = {
            level
            for level, column in LEVEL_COLUMNS.items()
            if getattr(record, column, False)
        }
        medicines.append(
            Medicine(
                id=record.drug_code,
                indent_drug_code=record.drug_code,
                generic_name=record.drug_name.split(" IP ")[0].strip() or record.drug_name,
                strength="",
                dosage_form="",
                therapeutic_group=record.category,
                essentiality=record.survey_essentiality or record.drug_type,
                levels=frozenset(levels),
                unit_price=None,
            )
        )
    return medicines


def build_facilities(
    excluded_ids: frozenset[str],
    rule_overrides: dict[str, dict] | None = None,
) -> list[Facility]:
    rule_overrides = rule_overrides or {}
    facilities: list[Facility] = []
    for record in load_facilities():
        override = {k: v for k, v in (rule_overrides.get(record.internal_id) or {}).items()
                    if v is not None}
        facilities.append(
            Facility(
                id=record.internal_id,
                display_label=record.display_label,
                facility_type=_facility_type(record.facility_type),
                ownership=record.ownership,
                lat=record.lat,
                lon=record.lon,
                beds=record.beds,
                in_network=record.internal_id not in excluded_ids,
                rules=FacilityRules(**override) if override else FacilityRules(),
            )
        )
    return facilities


def build_scenario(
    *,
    days: int,
    seed: int,
    demand_scale: float,
    lead_time_days: int,
    express_lead_time_days: int,
    min_shelf_life_days: int,
    near_expiry_share: float,
    excluded_facility_ids: list[str],
    rule_overrides: dict[str, dict] | None = None,
    approval_decisions: dict[str, str] | None = None,
) -> Scenario:
    """Build a runnable scenario from the real datasets.

    Raises ``MissingDemandInputs`` when population figures or the availability
    matrix are absent, rather than inventing either.
    """
    check_inputs()
    population = load_population()
    matrix = load_availability_matrix()
    assert population is not None and matrix is not None  # check_inputs guarantees it

    facilities = build_facilities(frozenset(excluded_facility_ids), rule_overrides)
    medicines = build_medicines()
    by_code = {m.drug_code: m for m in survey_linked_medicines()}

    carried: dict[str, frozenset[str]] = {}
    for facility in facilities:
        column = _carried_column(facility.facility_type)
        carried[facility.id] = frozenset(
            m.id for m in medicines if getattr(by_code[m.id], column, False)
        )

    rng = np.random.default_rng(seed)
    share = population.taluk_share

    demand: dict[tuple[str, str], np.ndarray] = {}
    opening: dict[tuple[str, str], list[Batch]] = {}

    # Split each item's taluk demand across the facilities that carry it. HMIS
    # attendance would weight this (request R4); until then it is an equal split,
    # tagged estimated and labelled as such in the UI.
    for medicine in medicines:
        record = by_code[medicine.id]
        statewide = record.indent_qty or 0
        taluk_annual = statewide * share * demand_scale
        holders = [f for f in facilities if medicine.id in carried[f.id]]
        if not holders or taluk_annual <= 0:
            continue
        per_facility_daily = taluk_annual / len(holders) / 365.0
        for facility in holders:
            demand[(facility.id, medicine.id)] = rng.poisson(
                per_facility_daily, days
            ).astype(np.int32)

    # Opening stock: PHCs from the reconstructed matrix, others from the survey's
    # availability for the same item, both tagged estimated in quantity.
    phc_numbers = _assign_survey_profiles(facilities, seed)
    for facility in facilities:
        for medicine_id in carried[facility.id]:
            key = (facility.id, medicine_id)
            series = demand.get(key)
            if series is None:
                continue
            record = by_code[medicine_id]
            if facility.facility_type is FacilityType.PHC:
                phc = phc_numbers.get(facility.id)
                in_stock = matrix.get((phc, record.survey_sl_no), False)
            else:
                pct = record.survey_availability_pct or 0.0
                in_stock = rng.random() < (pct / 100.0)
            if not in_stock:
                continue
            daily = float(series.mean())
            units = int(round(daily * 30))
            if units <= 0:
                continue
            near_expiry = rng.random() < near_expiry_share
            expiry = int(rng.integers(30, 90)) if near_expiry else int(rng.integers(180, 700))
            opening[key] = [Batch(quantity=units, expiry_day=expiry)]

    return Scenario(
        facilities=facilities,
        medicines=medicines,
        manufacturer=Manufacturer(
            id="mfr-a",
            label="Manufacturer A",
            lead_time_days=lead_time_days,
            express_lead_time_days=express_lead_time_days,
            min_shelf_life_days=min_shelf_life_days,
        ),
        carried=carried,
        demand=demand,
        opening_batches=opening,
        days=days,
        seed=seed,
        approval_decisions=approval_decisions or {},
    )


def _assign_survey_profiles(facilities: list[Facility], seed: int) -> dict[str, int]:
    """Attach the survey's anonymous PHC 1-15 profiles to real PHC locations.

    The survey anonymised its PHCs, so no profile can be matched to a real place.
    This assignment is seeded and **illustrative**, and the UI must say so.
    """
    phcs = sorted(f.id for f in facilities if f.facility_type is FacilityType.PHC)
    rng = np.random.default_rng(seed)
    profiles = rng.permutation(15) + 1
    return {fid: int(profiles[i % 15]) for i, fid in enumerate(phcs)}


@dataclass
class CachedRun:
    run_id: str
    scenario: Scenario
    results: dict[str, RunResult]


class RunCache:
    """Most-recent-first cache of finished runs, bounded in size."""

    def __init__(self, capacity: int = 8) -> None:
        self.capacity = capacity
        self._runs: OrderedDict[str, CachedRun] = OrderedDict()

    def put(self, cached: CachedRun) -> None:
        self._runs[cached.run_id] = cached
        self._runs.move_to_end(cached.run_id)
        while len(self._runs) > self.capacity:
            self._runs.popitem(last=False)

    def get(self, run_id: str) -> CachedRun | None:
        cached = self._runs.get(run_id)
        if cached is not None:
            self._runs.move_to_end(run_id)
        return cached

    def __len__(self) -> int:
        return len(self._runs)


def run_both_modes(scenario: Scenario, run_id: str) -> CachedRun:
    """Run the baseline and Zealo policies over the same scenario."""
    return CachedRun(
        run_id=run_id,
        scenario=scenario,
        results={
            "without_zealo": run(scenario, BaselinePolicy()),
            "with_zealo": run(scenario, ZealoPolicy()),
        },
    )
