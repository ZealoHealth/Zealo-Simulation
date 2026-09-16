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
    FacilitiesResponse,
    FacilityMedicineRow,
    FacilityOut,
    FacilityRunResponse,
    MedicineAtFacilitiesResponse,
    MedicineDayRow,
    MedicineOut,
    MedicinesResponse,
    ModeSummary,
    ScenarioRequest,
    SimulateResponse,
    SourceOut,
    SourcesResponse,
)
from zealo.data_access import (
    DatasetMissing,
    load_boundary,
    load_facilities,
    load_medicines,
    survey_linked_medicines,
)
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
) -> FacilityRunResponse:
    """One facility's medicine-level state and events on a given day."""
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
    for medicine_id in sorted(scenario.carried.get(facility_id, frozenset())):
        history = result.history.get((facility_id, medicine_id))
        if history is None:
            continue
        medicine = scenario.medicine(medicine_id)
        on_hand = int(history["on_hand"][day])
        forecast = float(history["forecast"][day])
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
                next_expiry_day=None,
                status="red" if on_hand == 0 else "green",
            )
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
