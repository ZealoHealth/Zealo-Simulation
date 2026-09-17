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
    AvailabilityOnlyRow,
    Coverage,
    DataStatusItem,
    DataStatusResponse,
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
    RunContext,
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
    load_facility_universe,
    load_medicines,
    load_phc_matrix,
    load_survey_items,
)
from zealo.pipeline.data_status import collect as collect_data_status
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
    "Facilities not yet checked by hand are marked 'Location unverified'.",
    "Real facility names are never shown; facilities are labelled by type and number.",
]

LEVEL_UNCONFIRMED_TYPES = ("government_level_unknown", "other_government")

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
    "All figures are in units. No verified public price list could be accessed.",
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

    phcs = sum(1 for r in records if r.facility_type == "phc")
    universe = load_facility_universe()
    universe_pharmacies = sum(1 for u in universe if u["facility_type"] == "pharmacy")
    coverage = Coverage(
        phcs_mapped=phcs,
        phcs_in_survey=15,
        pharmacies_mapped=universe_pharmacies,
        statements=[
            f"This proof of concept shows {len(records)} of the {len(universe)} health "
            "facilities mapped in Gadag taluk from public sources: every state facility with "
            "a medicine list, and the private facility nearest each PHC and the district "
            "hospital. Each keeps the demand it would have with all facilities present.",
            f"{phcs} of Gadag taluk's 15 PHCs have a public location in our sources. "
            "Survey results for all 15 are used in taluk-wide statistics.",
            f"Only {universe_pharmacies} pharmacies have public map records; the real number "
            "in Gadag taluk is much higher.",
        ],
    )

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
                in_network=r.in_network_default,
                verified=r.verified,
                review_flags=r.review_flags,
                source_ids=r.source_ids,
                retrieved=r.retrieved,
                provenance=r.provenance,
                location_precision=r.location_precision,
                medicine_list=r.medicine_list,
                level_unconfirmed=r.facility_type in LEVEL_UNCONFIRMED_TYPES,
            )
            for r in records
        ],
        boundary=boundary,
        coverage=coverage,
        attribution=OSM_ATTRIBUTION,
        disclaimer=DISCLAIMER,
        caveats=FACILITY_CAVEATS,
    )


@router.get("/medicines", response_model=MedicinesResponse, tags=["data"])
def get_medicines(survey_linked_only: bool = False) -> MedicinesResponse:
    """The medicine master list, or the survey's 104 items.

    With `survey_linked_only=true` the response is the survey's items: those matched to
    the indent carry quantities; the rest are **availability only** -- kept on the map
    rather than dropped, but with no quantities or demand.
    """
    try:
        indent = load_medicines()
        survey = load_survey_items()
    except DatasetMissing as exc:
        raise _dataset_error(exc) from exc

    level_names = {"at_phc": "phc", "at_chc": "chc", "at_tlh": "taluk_hospital",
                   "at_dlh": "district_hospital"}
    by_code = {m.drug_code: m for m in indent}
    quantified = sum(1 for s in survey if s.quantity_modelled and s.indent_code in by_code)

    if survey_linked_only:
        out = []
        for s in sorted(survey, key=lambda x: x.sl_no):
            rec = by_code.get(s.indent_code or "") if s.quantity_modelled else None
            out.append(
                MedicineOut(
                    id=s.id,
                    drug_code=rec.drug_code if rec else "",
                    name=s.label,
                    drug_type=rec.drug_type if rec else "",
                    therapeutic_group=(
                        rec.category if rec else "Survey item (no indent match yet)"
                    ),
                    levels=(
                        [n for c, n in level_names.items() if getattr(rec, c)] if rec
                        else ["phc"]
                    ),
                    indent_qty=rec.indent_qty if rec else None,
                    provenance="real",
                    survey_availability_pct=s.availability_pct,
                    survey_essentiality=s.essentiality or None,
                    match_status=s.match_status,
                    survey_sl_no=s.sl_no,
                    quantity_modelled=rec is not None,
                )
            )
    else:
        linked = {s.indent_code: s for s in survey if s.quantity_modelled}
        out = [
            MedicineOut(
                id=r.drug_code,
                drug_code=r.drug_code,
                name=r.drug_name,
                drug_type=r.drug_type,
                therapeutic_group=r.category,
                levels=[n for c, n in level_names.items() if getattr(r, c)],
                indent_qty=r.indent_qty,
                provenance=r.provenance,
                survey_availability_pct=linked[r.drug_code].availability_pct
                if r.drug_code in linked else None,
                survey_essentiality=(linked[r.drug_code].essentiality or None)
                if r.drug_code in linked else None,
                match_status=linked[r.drug_code].match_status if r.drug_code in linked else None,
                survey_sl_no=linked[r.drug_code].sl_no if r.drug_code in linked else None,
            )
            for r in indent
        ]

    return MedicinesResponse(
        medicines=out,
        survey_linked_count=quantified,
        pending_review_count=len(survey) - quantified,
        disclaimer=DISCLAIMER,
        caveats=MEDICINE_CAVEATS + [
            f"{quantified} of {len(survey)} survey items have quantity estimates; the rest "
            "show availability only."
        ],
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
                source_quality=getattr(s, "source_quality", None),
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
                network_overrides=request.network_overrides,
                private_demand_share=request.private_demand_share,
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

    ctx = cached.context
    context = None
    if ctx is not None:
        methods = set(ctx.demand_method.values())
        context = RunContext(
            population_share_pct=round(ctx.population_share * 100, 4),
            private_demand_share=round(ctx.private_demand_share, 4),
            private_share_basis=ctx.private_share_basis,
            figure1_interim=ctx.figure1_interim,
            quantity_modelled_items=len(cached.scenario.medicines),
            availability_only_items=len(ctx.availability_only),
            phc_survey_profiles=ctx.profile_by_phc,
            demand_split="attendance_weighted" if methods == {"attendance_weighted"}
            else ("mixed" if len(methods) > 1 else "equal_shares"),
            prices_real=ctx.prices_real,
            level_unconfirmed_facilities=ctx.level_unconfirmed,
        )

    return SimulateResponse(
        run_id=run_id,
        days=request.days,
        seed=request.seed,
        context=context,
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
    on_hand: int, forecast: float, next_expiry: int | None, day: int, incoming: int = 0
) -> str:
    """One medicine's status. Cover counts deliveries due within the week, as the map does."""
    if on_hand == 0:
        return "red"
    cover = _days_of_cover(on_hand + incoming, forecast)
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
        incoming = int(history["incoming_7d"][day])
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
                incoming_7d=incoming,
                next_expiry_day=next_expiry,
                status=_row_status(on_hand, forecast, next_expiry, day, incoming),
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

    ctx = cached.context
    profile = ctx.profile_by_phc.get(facility_id) if ctx else None
    availability_only: list[AvailabilityOnlyRow] = []
    if ctx is not None and profile is not None:
        # Survey items with no confirmed indent match: shown as in/out of stock from the
        # reconstructed matrix, with no quantities. Static, because the survey is a
        # single-day snapshot.
        matrix = load_phc_matrix()
        availability_only = [
            AvailabilityOnlyRow(
                medicine_id=item.id,
                name=item.label,
                survey_sl_no=item.sl_no,
                in_stock=matrix.get((profile, item.sl_no), False),
            )
            for item in ctx.availability_only
        ]

    return FacilityRunResponse(
        run_id=run_id,
        mode=mode,
        day=day,
        facility_id=facility_id,
        display_label=facility.display_label,
        facility_type=facility.facility_type.value,
        in_network=facility.in_network,
        status=status,
        survey_profile=profile,
        level_unconfirmed=bool(ctx and facility_id in ctx.level_unconfirmed),
        medicines=rows,
        availability_only=availability_only,
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
    ctx = cached.context

    rows: list[MedicineDayRow] = []
    quantity_modelled = True
    note = None
    availability_item = next(
        (i for i in (ctx.availability_only if ctx else []) if i.id == medicine_id), None
    )
    if availability_item is not None:
        quantity_modelled = False
        note = (
            "No confirmed match to the state indent yet, so this item has no quantities. "
            "Shown for PHCs only, from the survey's availability pattern."
        )
        matrix = load_phc_matrix()
        for facility in scenario.facilities:
            profile = ctx.profile_by_phc.get(facility.id)
            if profile is None:
                continue
            in_stock = matrix.get((profile, availability_item.sl_no), False)
            rows.append(
                MedicineDayRow(
                    facility_id=facility.id,
                    display_label=facility.display_label,
                    on_hand=None,
                    in_stock=in_stock,
                    days_of_cover=None,
                    next_expiry_day=None,
                    status="green" if in_stock else "red",
                    provenance="derived",
                )
            )
    else:
        for facility in scenario.facilities:
            history = result.history.get((facility.id, medicine_id))
            if history is None:
                continue
            on_hand = int(history["on_hand"][day])
            forecast = float(history["forecast"][day])
            expiry = int(history["next_expiry"][day])
            next_expiry = expiry if expiry >= 0 else None
            incoming = int(history["incoming_7d"][day])
            rows.append(
                MedicineDayRow(
                    facility_id=facility.id,
                    display_label=facility.display_label,
                    on_hand=on_hand,
                    in_stock=on_hand > 0,
                    days_of_cover=_days_of_cover(on_hand, forecast),
                    next_expiry_day=next_expiry,
                    status=_row_status(on_hand, forecast, next_expiry, day, incoming),
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
        quantity_modelled=quantity_modelled,
        rows=rows,
        note=note,
        disclaimer=DISCLAIMER,
    )


# Surplus and shortage thresholds, in days of forecast cover. A facility with
# more than a month's cover has stock the network could use elsewhere; one with
# under a week is the reason a transfer happens. "Short" is the map's low-cover
# threshold, so the two views cannot disagree.
SURPLUS_DAYS = 30
SHORT_DAYS = LOW_COVER_DAYS

REDISTRIBUTION_CAVEATS = [
    "Surplus and shortage are measured in days of forecast cover, not absolute units: "
    "a hundred paracetamol tablets is surplus at one facility and a day's use at another.",
    "Distances are straight-line. No routing service is configured, so road distance "
    "would be longer.",
    "Only PHCs with a public location are simulated; the survey's remaining profiles "
    "are listed as unmapped.",
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

    Everything counts **up to and including** ``day``, so the page agrees with
    the map at the same point in playback. ``transfers_over_time`` is the one
    exception: it is a series over the whole run, for a chart that marks the day.
    """
    cached = _require_run(run_id, mode)
    result = cached.results[mode]
    scenario = cached.scenario
    day = min(day, scenario.days - 1)

    per_day: dict[int, dict[str, float]] = {}
    impact: dict[str, dict[str, int]] = {}
    totals = {"transfers": 0, "transfer_units": 0, "transfer_distance_km": 0.0,
              "expired_units": 0}
    transfer_values: list[float | None] = []
    for event in result.events.events:
        if event.type is EventType.EXPIRED:
            if event.day <= day:
                totals["expired_units"] += event.quantity
            continue
        if event.type not in (EventType.RELIEF_TRANSFER, EventType.REBALANCE_TRANSFER):
            continue
        bucket = per_day.setdefault(
            event.day, {"transfers": 0, "units": 0, "distance_km": 0.0}
        )
        bucket["transfers"] += 1
        bucket["units"] += event.quantity
        bucket["distance_km"] += event.distance_km or 0.0
        if event.day > day:
            continue

        totals["transfers"] += 1
        totals["transfer_units"] += event.quantity
        totals["transfer_distance_km"] += event.distance_km or 0.0
        transfer_values.append(event.value)
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
    # every medicine the facility carries. Cover counts deliveries due within the
    # week, as the map colours do, so a facility the map shows green is not listed
    # as short while its refill is a day away.
    balances: list[FacilityBalance] = []
    unmet_units = 0
    for facility in scenario.facilities:
        carried = scenario.carried.get(facility.id, frozenset())
        for mid in sorted(carried):
            history = result.history.get((facility.id, mid))
            if history is None:
                continue
            unmet_units += int(history["unmet"][: day + 1].sum())
            if medicine_id and mid != medicine_id:
                continue
            on_hand = int(history["on_hand"][day])
            incoming = int(history["incoming_7d"][day])
            forecast = float(history["forecast"][day])
            cover = _days_of_cover(on_hand + incoming, forecast)
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
                    name=scenario.medicine(mid).generic_name,
                    on_hand=on_hand,
                    incoming_7d=incoming,
                    days_of_cover=cover,
                    position=position,
                )
            )

    prices_known = result.metrics.prices_available
    totals.update(
        transfer_distance_km=round(totals["transfer_distance_km"], 1),
        # Withheld rather than zeroed while no verified price list exists.
        transfer_value=(
            round(sum(v or 0.0 for v in transfer_values), 2) if prices_known else None
        ),
        unmet_units=unmet_units,
        surplus_positions=sum(1 for b in balances if b.position == "surplus"),
        short_positions=sum(1 for b in balances if b.position == "short"),
    )

    return RedistributionResponse(
        run_id=run_id,
        mode=mode,
        day=day,
        transfers_over_time=transfers_over_time,
        top_medicines=top_medicines[:15],
        balances=balances,
        unmapped_phcs=cached.context.unmapped_profiles if cached.context else [],
        totals=totals,
        disclaimer=DISCLAIMER,
        caveats=REDISTRIBUTION_CAVEATS,
    )


@router.get("/data-status", response_model=DataStatusResponse, tags=["data"])
def get_data_status() -> DataStatusResponse:
    """Pending manual data, the interim approach in use for each, and any failures."""
    items = collect_data_status()
    return DataStatusResponse(
        items=[DataStatusItem(**vars(i)) for i in items],
        pending_count=sum(1 for i in items if i.status in ("interim", "pending", "invalid")),
    )


@router.get("/survey-summary", tags=["data"])
def get_survey_summary() -> dict:
    """The Gadag PHC survey's published headline findings. Every figure is real."""
    from zealo.config import PROCESSED_DIR

    path = PROCESSED_DIR / "survey_summary.json"
    if not path.exists():
        raise HTTPException(
            status_code=503,
            detail={"error": "dataset_missing", "message": "Run `make data` first."},
        )
    import json

    return {**json.loads(path.read_text()), "disclaimer": DISCLAIMER}
