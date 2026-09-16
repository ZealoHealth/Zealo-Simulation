"""API endpoints.

Two habits run through all of them. Every response that carries numbers also
carries the disclaimer and the caveats that apply to those numbers, so a client
cannot present them stripped of context. And a missing run returns a clear,
typed error rather than an empty body, so the frontend can re-run instead of
rendering an empty map.
"""

from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, HTTPException, Query

from zealo.api.schemas import (
    DayStatus,
    ExpiryAlert,
    FacilitiesResponse,
    FacilityBalance,
    FacilityMedicineRow,
    FacilityOut,
    FacilityRunResponse,
    MedicineAtFacilitiesResponse,
    MedicineDayRow,
    MedicineImpact,
    MedicineOut,
    MedicineSeries,
    MedicinesResponse,
    ModeSummary,
    RedistributionResponse,
    ScenarioRequest,
    SimulateResponse,
    SourceOut,
    SourcesResponse,
    TransferPoint,
)
from zealo.data_access import (
    DatasetMissing,
    load_boundary,
    load_facilities,
    load_medicines,
    survey_linked_medicines,
)
from zealo.sim.events import EventType
from zealo.sim.runner import (
    MissingDemandInputs,
    RunCache,
    build_scenario,
    run_both_modes,
)
from zealo.sources_registry import SOURCES

DISCLAIMER = (
    "Facility locations and medicine lists come from public sources. Stock levels are "
    "estimates. PHC availability patterns come from a 2021-22 published survey and are "
    "assigned to map locations for illustration."
)

OSM_ATTRIBUTION = "© OpenStreetMap contributors"

FACILITY_CAVEATS = [
    "Facility type and ownership are inferred from names: OpenStreetMap carries no "
    "operator field for any facility here.",
    "Bed counts are unknown, not estimated.",
    "Only 5 of the taluk's 15 PHCs appear in OpenStreetMap, and only 3 pharmacies.",
    "No facility has been verified by hand yet.",
    "Real facility names are never shown; facilities are labelled by type and number.",
]

MEDICINE_CAVEATS = [
    "Availability percentages are real observations from a 2021-22 survey of 15 PHCs.",
    "Indent quantities are statewide requests, not consumption, and not Gadag-specific.",
    "Survey items whose match to an indent row is not yet confirmed are excluded.",
    "No unit prices: no public price source is confirmed, so value figures are withheld.",
]

SIMULATION_CAVEATS = [
    "Both modes use identical demand and identical opening stock, so any difference "
    "between them is caused by policy alone.",
    "Stock levels are estimated. The survey records only whether an item was in stock, "
    "never how much.",
    "The assignment of the survey's anonymous PHC profiles to real locations is "
    "illustrative: the survey anonymised its PHCs.",
    "Value figures are withheld until a public unit price source is confirmed.",
]

router = APIRouter()
run_cache = RunCache()


def _dataset_error(exc: DatasetMissing) -> HTTPException:
    return HTTPException(status_code=503, detail={"error": "dataset_missing", "message": str(exc)})


@router.get("/facilities", response_model=FacilitiesResponse, tags=["data"])
def get_facilities(include_boundary: bool = True) -> FacilitiesResponse:
    """Every facility, with per-field provenance. Never includes real names."""
    try:
        records = load_facilities()
        boundary = load_boundary() if include_boundary else None
    except DatasetMissing as exc:
        raise _dataset_error(exc) from exc

    return FacilitiesResponse(
        facilities=[
            FacilityOut(
                id=r.internal_id,
                display_label=r.display_label,
                facility_type=r.facility_type,
                ownership=r.ownership,
                lat=r.lat,
                lon=r.lon,
                beds=r.beds,
                in_network=True,
                verified=r.verified,
                review_flags=r.review_flags,
                source_ids=r.source_ids,
                retrieved=r.retrieved,
                provenance=r.provenance,
            )
            for r in records
        ],
        boundary=boundary,
        attribution=OSM_ATTRIBUTION,
        disclaimer=DISCLAIMER,
        caveats=FACILITY_CAVEATS,
    )


@router.get("/medicines", response_model=MedicinesResponse, tags=["data"])
def get_medicines(survey_linked_only: bool = False) -> MedicinesResponse:
    """The medicine master list, with survey availability where it is known."""
    try:
        records = survey_linked_medicines() if survey_linked_only else load_medicines()
        linked = len(survey_linked_medicines())
    except DatasetMissing as exc:
        raise _dataset_error(exc) from exc

    level_names = {"at_phc": "phc", "at_chc": "chc", "at_tlh": "taluk_hospital",
                   "at_dlh": "district_hospital"}
    return MedicinesResponse(
        medicines=[
            MedicineOut(
                id=r.drug_code,
                drug_code=r.drug_code,
                name=r.drug_name,
                drug_type=r.drug_type,
                therapeutic_group=r.category,
                levels=[name for col, name in level_names.items() if getattr(r, col)],
                indent_qty=r.indent_qty,
                provenance=r.provenance,
                survey_availability_pct=r.survey_availability_pct,
                survey_essentiality=r.survey_essentiality,
                match_status=r.match_status,
            )
            for r in records
        ],
        survey_linked_count=linked,
        # 104 survey items exist; those not linked are awaiting human confirmation.
        pending_review_count=104 - linked,
        disclaimer=DISCLAIMER,
        caveats=MEDICINE_CAVEATS,
    )


@router.get("/sources", response_model=SourcesResponse, tags=["data"])
def get_sources() -> SourcesResponse:
    """Every source, with licence, attribution and known limitations."""
    return SourcesResponse(
        sources=[
            SourceOut(
                id=s.id,
                title=s.title,
                publisher=s.publisher,
                url=str(s.url) if s.url else None,
                licence=s.licence,
                attribution=s.attribution,
                what_was_taken=s.what_was_taken,
                retrieved=s.retrieved.isoformat() if s.retrieved else None,
                access=s.access.value,
                limitations=s.limitations,
            )
            for s in SOURCES
        ],
        disclaimer=DISCLAIMER,
    )


def _run_id(request: ScenarioRequest) -> str:
    """A stable id for a scenario: the same settings always name the same run."""
    payload = json.dumps(request.model_dump(), sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


@router.post("/simulate", response_model=SimulateResponse, tags=["simulation"])
def simulate(request: ScenarioRequest) -> SimulateResponse:
    """Run both modes over one scenario and return summaries, timeline and events.

    Playback happens in the browser from the returned timeline; there is no
    per-day endpoint to poll.
    """
    run_id = _run_id(request)
    cached = run_cache.get(run_id)
    if cached is None:
        try:
            scenario = build_scenario(
                days=request.days,
                seed=request.seed,
                demand_scale=request.demand_scale,
                lead_time_days=request.lead_time_days,
                express_lead_time_days=request.express_lead_time_days,
                min_shelf_life_days=request.min_shelf_life_days,
                near_expiry_share=request.near_expiry_share,
                excluded_facility_ids=request.excluded_facility_ids,
                rule_overrides={k: v.model_dump() for k, v in request.rules.items()},
                approval_decisions=request.approval_decisions,
            )
        except MissingDemandInputs as exc:
            # Not an internal failure: real-world inputs are genuinely absent, and
            # the client is told exactly which and how to supply them.
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "missing_demand_inputs",
                    "message": str(exc),
                    "missing": exc.missing,
                    "requests": exc.requests,
                },
            ) from exc
        except DatasetMissing as exc:
            raise _dataset_error(exc) from exc
        cached = run_both_modes(scenario, run_id)
        run_cache.put(cached)

    return SimulateResponse(
        run_id=run_id,
        days=request.days,
        seed=request.seed,
        summaries=[
            ModeSummary(mode=mode, metrics=result.metrics.to_dict())
            for mode, result in cached.results.items()
        ],
        timeline={
            mode: [
                DayStatus(day=d.day, status=d.status, availability_rate=d.availability_rate)
                for d in result.timeline
            ]
            for mode, result in cached.results.items()
        },
        events={mode: result.events.to_list() for mode, result in cached.results.items()},
        disclaimer=DISCLAIMER,
        caveats=SIMULATION_CAVEATS,
    )


def _require_run(run_id: str, mode: str):
    cached = run_cache.get(run_id)
    if cached is None:
        # The frontend re-runs on this rather than showing a blank page.
        raise HTTPException(
            status_code=404,
            detail={
                "error": "run_not_found",
                "message": (
                    f"Run {run_id} is not cached. Re-submit the scenario to /simulate."
                ),
                "run_id": run_id,
            },
        )
    if mode not in cached.results:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "unknown_mode",
                "message": f"Unknown mode '{mode}'. Use one of {sorted(cached.results)}.",
            },
        )
    return cached


def _days_of_cover(on_hand: int, forecast: float) -> float | None:
    return round(on_hand / forecast, 2) if forecast > 0 else None


# Mirrors methods:facility_status, applied to one medicine rather than a facility.
LOW_COVER_DAYS = 7
NEAR_EXPIRY_DAYS = 90
EXPIRY_BUCKETS = (30, 60, 90)


def _expiry_bucket(days_remaining: int) -> int | None:
    """Which alert window a batch falls into, or None if it is further out."""
    for bucket in EXPIRY_BUCKETS:
        if days_remaining <= bucket:
            return bucket
    return None


def _row_status(
    on_hand: int, forecast: float, next_expiry: int | None, day: int
) -> str:
    if on_hand == 0:
        return "red"
    cover = _days_of_cover(on_hand, forecast)
    if cover is not None and cover < LOW_COVER_DAYS:
        return "amber"
    if next_expiry is not None and next_expiry - day <= NEAR_EXPIRY_DAYS:
        return "amber"
    return "green"


@router.get(
    "/runs/{run_id}/facilities/{facility_id}",
    response_model=FacilityRunResponse,
    tags=["simulation"],
)
def get_facility_run(
    run_id: str,
    facility_id: str,
    mode: str = Query("with_zealo"),
    day: int = Query(0, ge=0),
    series: str | None = Query(
        None, description="Medicine id to return a full time series for."
    ),
) -> FacilityRunResponse:
    """One facility's medicine-level state, events, expiry alerts and events.

    Pass `series=<medicine_id>` for that medicine's whole history, which is what
    the dashboard chart plots. It is opt-in because returning every medicine's
    series would be far larger than the day view needs.
    """
    cached = _require_run(run_id, mode)
    result = cached.results[mode]
    scenario = cached.scenario
    try:
        facility = scenario.facility(facility_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "facility_not_found", "facility_id": facility_id},
        ) from exc
    day = min(day, scenario.days - 1)

    rows: list[FacilityMedicineRow] = []
    alerts: list[ExpiryAlert] = []
    for medicine_id in sorted(scenario.carried.get(facility_id, frozenset())):
        history = result.history.get((facility_id, medicine_id))
        if history is None:
            continue
        medicine = scenario.medicine(medicine_id)
        on_hand = int(history["on_hand"][day])
        forecast = float(history["forecast"][day])
        expiry = int(history["next_expiry"][day])
        next_expiry = expiry if expiry >= 0 else None
        rows.append(
            FacilityMedicineRow(
                medicine_id=medicine_id,
                name=medicine.generic_name,
                therapeutic_group=medicine.therapeutic_group,
                on_hand=on_hand,
                demand=int(history["demand"][day]),
                dispensed=int(history["dispensed"][day]),
                unmet=int(history["unmet"][day]),
                forecast=round(forecast, 3),
                days_of_cover=_days_of_cover(on_hand, forecast),
                next_expiry_day=next_expiry,
                status=_row_status(on_hand, forecast, next_expiry, day),
            )
        )
        if next_expiry is not None and on_hand > 0:
            remaining = next_expiry - day
            bucket = _expiry_bucket(remaining)
            if bucket is not None:
                alerts.append(
                    ExpiryAlert(
                        medicine_id=medicine_id,
                        name=medicine.generic_name,
                        on_hand=on_hand,
                        expires_on_day=next_expiry,
                        days_until_expiry=remaining,
                        bucket=bucket,
                    )
                )
    alerts.sort(key=lambda a: a.days_until_expiry)

    medicine_series = None
    if series:
        history = result.history.get((facility_id, series))
        if history is None:
            raise HTTPException(
                status_code=404,
                detail={"error": "medicine_not_carried", "medicine_id": series},
            )
        medicine_series = MedicineSeries(
            medicine_id=series,
            name=scenario.medicine(series).generic_name,
            days=list(range(scenario.days)),
            on_hand=[int(v) for v in history["on_hand"]],
            demand=[int(v) for v in history["demand"]],
            dispensed=[int(v) for v in history["dispensed"]],
            unmet=[int(v) for v in history["unmet"]],
            forecast=[round(float(v), 3) for v in history["forecast"]],
        )

    events = [
        e.to_dict()
        for e in result.events.events
        if facility_id in (e.facility_id, e.from_facility_id, e.to_facility_id)
    ]
    status = result.timeline[day].status.get(facility_id, "green")

    return FacilityRunResponse(
        run_id=run_id,
        mode=mode,
        day=day,
        facility_id=facility_id,
        display_label=facility.display_label,
        facility_type=facility.facility_type.value,
        in_network=facility.in_network,
        status=status,
        medicines=rows,
        events=events,
        expiry_alerts=alerts,
        series=medicine_series,
        disclaimer=DISCLAIMER,
    )


@router.get(
    "/runs/{run_id}/medicines/{medicine_id}",
    response_model=MedicineAtFacilitiesResponse,
    tags=["simulation"],
)
def get_medicine_run(
    run_id: str,
    medicine_id: str,
    mode: str = Query("with_zealo"),
    day: int = Query(0, ge=0),
) -> MedicineAtFacilitiesResponse:
    """Where one medicine is in stock on a given day. Backs the map's search."""
    cached = _require_run(run_id, mode)
    result = cached.results[mode]
    scenario = cached.scenario
    day = min(day, scenario.days - 1)

    rows: list[MedicineDayRow] = []
    for facility in scenario.facilities:
        history = result.history.get((facility.id, medicine_id))
        if history is None:
            continue
        on_hand = int(history["on_hand"][day])
        forecast = float(history["forecast"][day])
        rows.append(
            MedicineDayRow(
                facility_id=facility.id,
                display_label=facility.display_label,
                on_hand=on_hand,
                days_of_cover=_days_of_cover(on_hand, forecast),
                next_expiry_day=None,
                status="red" if on_hand == 0 else "green",
            )
        )
    if not rows:
        raise HTTPException(
            status_code=404,
            detail={"error": "medicine_not_found", "medicine_id": medicine_id},
        )

    return MedicineAtFacilitiesResponse(
        run_id=run_id,
        mode=mode,
        day=day,
        medicine_id=medicine_id,
        rows=rows,
        disclaimer=DISCLAIMER,
    )


# Surplus and shortage thresholds, in days of forecast cover. A facility with
# more than a month's cover has stock the network could use elsewhere; one with
# under a week is the reason a transfer happens.
SURPLUS_DAYS = 30
SHORT_DAYS = 7

REDISTRIBUTION_CAVEATS = [
    "Surplus and shortage are measured in days of forecast cover, not absolute units: "
    "a hundred paracetamol tablets is surplus at one facility and a day's use at another.",
    "Distances are straight-line. No routing service is configured, so road distance "
    "would be longer.",
    "Value moved is not shown: no public unit price source is confirmed.",
]


@router.get(
    "/runs/{run_id}/redistribution",
    response_model=RedistributionResponse,
    tags=["simulation"],
)
def get_redistribution(
    run_id: str,
    mode: str = Query("with_zealo"),
    day: int = Query(0, ge=0),
    medicine_id: str | None = Query(None),
) -> RedistributionResponse:
    """Where stock is surplus, where it is short, and how much has moved.

    Backs the network redistribution view. Aggregated from the cached run rather
    than re-simulated, so switching day or medicine costs nothing.
    """
    cached = _require_run(run_id, mode)
    result = cached.results[mode]
    scenario = cached.scenario
    day = min(day, scenario.days - 1)

    # Transfers per day, cumulative through the current day.
    per_day: dict[int, dict[str, float]] = {}
    impact: dict[str, dict[str, int]] = {}
    for event in result.events.events:
        if event.type not in (EventType.RELIEF_TRANSFER, EventType.REBALANCE_TRANSFER):
            continue
        bucket = per_day.setdefault(
            event.day, {"transfers": 0, "units": 0, "distance_km": 0.0}
        )
        bucket["transfers"] += 1
        bucket["units"] += event.quantity
        bucket["distance_km"] += event.distance_km or 0.0

        row = impact.setdefault(
            event.medicine_id,
            {"relief_transfers": 0, "relief_units": 0,
             "rebalance_transfers": 0, "rebalance_units": 0},
        )
        if event.type is EventType.RELIEF_TRANSFER:
            row["relief_transfers"] += 1
            row["relief_units"] += event.quantity
        else:
            row["rebalance_transfers"] += 1
            row["rebalance_units"] += event.quantity

    transfers_over_time = [
        TransferPoint(
            day=d,
            transfers=int(per_day.get(d, {}).get("transfers", 0)),
            units=int(per_day.get(d, {}).get("units", 0)),
            distance_km=round(per_day.get(d, {}).get("distance_km", 0.0), 2),
        )
        for d in range(scenario.days)
    ]

    top_medicines = [
        MedicineImpact(
            medicine_id=mid,
            name=scenario.medicine(mid).generic_name,
            relief_transfers=row["relief_transfers"],
            relief_units=row["relief_units"],
            rebalance_transfers=row["rebalance_transfers"],
            rebalance_units=row["rebalance_units"],
        )
        for mid, row in impact.items()
    ]
    top_medicines.sort(
        key=lambda m: m.relief_units + m.rebalance_units, reverse=True
    )

    # Surplus/shortage positions on the selected day, for the chosen medicine or
    # every medicine the facility carries.
    balances: list[FacilityBalance] = []
    for facility in scenario.facilities:
        carried = scenario.carried.get(facility.id, frozenset())
        medicine_ids = [medicine_id] if medicine_id else sorted(carried)
        for mid in medicine_ids:
            history = result.history.get((facility.id, mid))
            if history is None:
                continue
            on_hand = int(history["on_hand"][day])
            forecast = float(history["forecast"][day])
            cover = _days_of_cover(on_hand, forecast)
            if cover is None:
                position = "balanced"
            elif cover >= SURPLUS_DAYS:
                position = "surplus"
            elif cover < SHORT_DAYS:
                position = "short"
            else:
                position = "balanced"
            balances.append(
                FacilityBalance(
                    facility_id=facility.id,
                    display_label=facility.display_label,
                    medicine_id=mid,
                    on_hand=on_hand,
                    days_of_cover=cover,
                    position=position,
                )
            )

    metrics = result.metrics
    totals = {
        "transfers": metrics.transfers,
        "transfer_units": metrics.transfer_units,
        "transfer_distance_km": round(metrics.transfer_distance_km, 1),
        "transfer_value": metrics.to_dict()["transfer_value"],
        "expired_units": metrics.expired_units,
        "unmet_units": metrics.unmet_units,
        "surplus_positions": sum(1 for b in balances if b.position == "surplus"),
        "short_positions": sum(1 for b in balances if b.position == "short"),
    }

    return RedistributionResponse(
        run_id=run_id,
        mode=mode,
        day=day,
        transfers_over_time=transfers_over_time,
        top_medicines=top_medicines[:15],
        balances=balances,
        totals=totals,
        disclaimer=DISCLAIMER,
        caveats=REDISTRIBUTION_CAVEATS,
    )
