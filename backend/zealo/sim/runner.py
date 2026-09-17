"""Assemble a scenario from the processed datasets, run both modes, cache the result.

Every input is either real or an explicitly labelled interim estimate agreed with the
project team, so a run can always be built -- nothing blocks on a manual file still
being filled in. What each number rests on is carried in `ScenarioContext`, which the
API returns alongside the results so the UI can badge it honestly.

Demand (see methods:taluk_annual_demand, methods:facility_demand_split):
    taluk annual demand = statewide indent qty x (Gadag taluk pop / Karnataka pop) x scale
    government facilities carrying the item share it -- by OPD attendance where every
    one of them has an HMIS figure (derived), otherwise equally (estimated)
    private facilities carrying the item share an additional, configurable fraction of it
    equally (estimated)

Opening stock (see methods:starting_stock):
    PHCs -> in / out of stock from the reconstructed availability matrix, using a survey
            profile assigned to the location for illustration
    others -> in stock with probability equal to the item's survey availability
    in-stock items open with 30 days of their own demand (estimated)
"""

from __future__ import annotations

import csv
from collections import OrderedDict
from dataclasses import dataclass, field

import numpy as np

from zealo.config import MANUAL_DIR
from zealo.data_access import (
    DatasetMissing,
    FacilityRecord,
    SurveyItem,
    load_facilities,
    load_medicines,
    load_phc_matrix,
    load_phc_profiles,
    load_population_share,
    load_survey_items,
)
from zealo.pipeline.prices import load_prices
from zealo.sim.engine import RunResult, Scenario, run
from zealo.sim.models import Batch, Facility, FacilityRules, FacilityType, Manufacturer, Medicine
from zealo.sim.policies import BaselinePolicy, ZealoPolicy

ATTENDANCE_CSV = MANUAL_DIR / "facility_attendance.csv"
OPENING_DAYS_OF_STOCK = 30
DEFAULT_PRIVATE_DEMAND_SHARE = 0.25
N_SURVEY_PROFILES = 15

LIST_COLUMN = {"phc": "at_phc", "chc": "at_chc", "tlh": "at_tlh", "dlh": "at_dlh",
               "tlh_proxy": "at_tlh"}


class MissingDemandInputs(RuntimeError):
    """A processed dataset the scenario needs has not been built. Run `make data`."""

    def __init__(self, missing: list[str], requests: list[str]) -> None:
        self.missing = missing
        self.requests = requests
        super().__init__("Cannot build a scenario without: " + "; ".join(missing))


@dataclass
class ScenarioContext:
    """What a run rests on, for honest labelling in the UI."""

    population_share: float
    profile_by_phc: dict[str, int]  # facility id -> survey profile number
    unmapped_profiles: list[dict]
    availability_only: list[SurveyItem]
    demand_method: dict[str, str] = field(default_factory=dict)  # medicine id -> method
    level_unconfirmed: list[str] = field(default_factory=list)
    prices_real: bool = False
    figure1_interim: bool = True


@dataclass
class BuiltScenario:
    scenario: Scenario
    context: ScenarioContext


def _facility_type(value: str) -> FacilityType:
    try:
        return FacilityType(value)
    except ValueError:
        return FacilityType.CLINIC


def _read_attendance() -> dict[str, float]:
    if not ATTENDANCE_CSV.exists():
        return {}
    with ATTENDANCE_CSV.open(newline="") as fh:
        lines = [line for line in fh if not line.lstrip().startswith("#")]
    out: dict[str, float] = {}
    for row in csv.DictReader(lines):
        raw = (row.get("opd_annual") or "").replace(",", "").strip()
        try:
            value = float(raw)
        except ValueError:
            continue
        if value > 0:
            out[row["facility_key"]] = value
    return out


def assign_survey_profiles(phc_ids: list[str], seed: int) -> tuple[dict[str, int], list[int]]:
    """Attach anonymous survey profiles 1-15 to mapped PHCs, seeded and illustrative.

    With fewer mapped PHCs than profiles, the remaining profiles stay unassigned rather
    than being doubled up; they are listed as unmapped and still count in taluk-wide
    survey statistics.
    """
    rng = np.random.default_rng(seed)
    profiles = [int(p) for p in rng.permutation(N_SURVEY_PROFILES) + 1]
    ordered = sorted(phc_ids)
    assigned = {fid: profiles[i] for i, fid in enumerate(ordered[:N_SURVEY_PROFILES])}
    return assigned, profiles[len(assigned):]


def _check_datasets() -> None:
    try:
        load_population_share()
        load_phc_profiles()
        load_phc_matrix()
        load_survey_items()
        load_facilities()
    except DatasetMissing as exc:
        raise MissingDemandInputs([str(exc)], ["make data"]) from exc


def build_scenario(
    *,
    days: int,
    seed: int,
    demand_scale: float,
    lead_time_days: int,
    express_lead_time_days: int,
    min_shelf_life_days: int,
    near_expiry_share: float,
    excluded_facility_ids: list[str] | None = None,
    network_overrides: dict[str, bool] | None = None,
    private_demand_share: float = DEFAULT_PRIVATE_DEMAND_SHARE,
    rule_overrides: dict[str, dict] | None = None,
    approval_decisions: dict[str, str] | None = None,
) -> BuiltScenario:
    _check_datasets()
    rng = np.random.default_rng(seed)
    overrides = dict(network_overrides or {})
    for fid in excluded_facility_ids or []:
        overrides[fid] = False
    rule_overrides = rule_overrides or {}

    records: list[FacilityRecord] = load_facilities()
    indent = {m.drug_code: m for m in load_medicines()}
    survey = load_survey_items()
    prices, _ = load_prices()

    # --- facilities -----------------------------------------------------------------
    facilities: list[Facility] = []
    record_by_id: dict[str, FacilityRecord] = {}
    for r in records:
        requested = rule_overrides.get(r.internal_id) or {}
        rules = {k: v for k, v in requested.items() if v is not None}
        facilities.append(
            Facility(
                id=r.internal_id,
                display_label=r.display_label,
                facility_type=_facility_type(r.facility_type),
                ownership=r.ownership,
                lat=r.lat,
                lon=r.lon,
                beds=r.beds,
                in_network=overrides.get(r.internal_id, r.in_network_default),
                rules=FacilityRules(**rules) if rules else FacilityRules(),
            )
        )
        record_by_id[r.internal_id] = r

    # --- medicines with quantities ------------------------------------------------------
    modelled = [s for s in survey if s.quantity_modelled and s.indent_code in indent]
    availability_only = [s for s in survey if not s.quantity_modelled]
    medicines: list[Medicine] = []
    for s in modelled:
        rec = indent[s.indent_code]
        levels = {lvl for lvl, col in (
            (FacilityType.PHC, "at_phc"), (FacilityType.CHC, "at_chc"),
            (FacilityType.TALUK_HOSPITAL, "at_tlh"), (FacilityType.DISTRICT_HOSPITAL, "at_dlh"),
        ) if getattr(rec, col)}
        price = prices.get(s.indent_code)
        medicines.append(
            Medicine(
                id=s.indent_code,
                indent_drug_code=s.indent_code,
                generic_name=s.label,
                strength="",  # already part of the survey label
                dosage_form="",
                therapeutic_group=rec.category,
                essentiality=s.essentiality or rec.drug_type,
                levels=frozenset(levels),
                unit_price=price.unit_price_inr if price else None,
            )
        )
    survey_by_code = {s.indent_code: s for s in modelled}

    carried: dict[str, frozenset[str]] = {}
    for f in facilities:
        column = LIST_COLUMN.get(record_by_id[f.id].medicine_list)
        carried[f.id] = frozenset(
            m.id for m in medicines if column and getattr(indent[m.id], column)
        )

    # --- demand -------------------------------------------------------------------------
    share = float(load_population_share()["taluk_share_of_state"])
    attendance = _read_attendance()
    demand: dict[tuple[str, str], np.ndarray] = {}
    method: dict[str, str] = {}
    for m in medicines:
        taluk_annual = (indent[m.id].indent_qty or 0) * share * demand_scale
        holders = [f for f in facilities if m.id in carried[f.id]]
        if not holders or taluk_annual <= 0:
            continue
        government = [f for f in holders if f.ownership == "government"]
        private = [f for f in holders if f.ownership != "government"]

        weights: dict[str, float] = {}
        keys = [record_by_id[f.id].facility_key for f in government]
        if government and all(k in attendance for k in keys):
            total = sum(attendance[k] for k in keys)
            weights = {
                f.id: attendance[record_by_id[f.id].facility_key] / total for f in government
            }
            method[m.id] = "attendance_weighted"
        elif government:
            weights = {f.id: 1 / len(government) for f in government}
            method[m.id] = "equal_shares"
        for f in government:
            rate = taluk_annual * weights[f.id] / 365
            demand[(f.id, m.id)] = rng.poisson(rate, days).astype(np.int32)
        if private and private_demand_share > 0:
            per = taluk_annual * private_demand_share / len(private) / 365
            for f in private:
                demand[(f.id, m.id)] = rng.poisson(per, days).astype(np.int32)

    # --- opening stock --------------------------------------------------------------------
    phc_ids = [f.id for f in facilities if f.facility_type is FacilityType.PHC]
    profile_by_phc, unassigned = assign_survey_profiles(phc_ids, seed)
    matrix = load_phc_matrix()
    profiles = {p["phc_number"]: p for p in load_phc_profiles()}
    opening: dict[tuple[str, str], list[Batch]] = {}
    for f in facilities:
        for mid in carried[f.id]:
            series = demand.get((f.id, mid))
            if series is None:
                continue
            item = survey_by_code[mid]
            if f.id in profile_by_phc:
                in_stock = matrix.get((profile_by_phc[f.id], item.sl_no), False)
            else:
                in_stock = rng.random() < item.availability_pct / 100
            # Ceiling, not rounding: an item the survey records as in stock must open with
            # stock. Rounding sent slow items at private facilities in at zero units.
            units = int(np.ceil(float(series.mean()) * OPENING_DAYS_OF_STOCK))
            if not in_stock or units <= 0:
                continue
            near = rng.random() < near_expiry_share
            expiry = int(rng.integers(30, 90)) if near else int(rng.integers(180, 700))
            opening[(f.id, mid)] = [Batch(quantity=units, expiry_day=expiry)]

    scenario = Scenario(
        facilities=facilities,
        medicines=medicines,
        manufacturer=Manufacturer(
            id="mfr-a", label="Manufacturer A",
            lead_time_days=lead_time_days, express_lead_time_days=express_lead_time_days,
            min_shelf_life_days=min_shelf_life_days,
        ),
        carried=carried,
        demand=demand,
        opening_batches=opening,
        days=days,
        seed=seed,
        approval_decisions=approval_decisions or {},
    )
    context = ScenarioContext(
        population_share=share,
        profile_by_phc=profile_by_phc,
        unmapped_profiles=[profiles[n] for n in sorted(unassigned)],
        availability_only=availability_only,
        demand_method=method,
        level_unconfirmed=[
            f.id for f in facilities
            if record_by_id[f.id].facility_type in ("government_level_unknown", "other_government")
        ],
        prices_real=bool(medicines) and all(m.unit_price is not None for m in medicines),
        figure1_interim=any(p["provenance"] != "real" for p in profiles.values()),
    )
    return BuiltScenario(scenario, context)


@dataclass
class CachedRun:
    run_id: str
    scenario: Scenario
    results: dict[str, RunResult]
    context: ScenarioContext | None = None


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


def run_both_modes(built: BuiltScenario | Scenario, run_id: str) -> CachedRun:
    """Run the baseline and Zealo policies over the same scenario."""
    scenario = built.scenario if isinstance(built, BuiltScenario) else built
    context = built.context if isinstance(built, BuiltScenario) else None
    return CachedRun(
        run_id=run_id,
        scenario=scenario,
        results={
            "without_zealo": run(scenario, BaselinePolicy()),
            "with_zealo": run(scenario, ZealoPolicy()),
        },
        context=context,
    )
