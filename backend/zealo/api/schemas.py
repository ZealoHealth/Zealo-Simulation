"""Request and response shapes for the API.

Provenance travels with the data. Every facility field that the UI shows a
number for carries its own `real` / `derived` / `estimated` tag, and every
response that can be misread carries the disclaimer or the relevant limitation.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    version: str
    disclaimer: str


class FacilityOut(BaseModel):
    """A facility as the website sees it. Never carries a real name."""

    id: str
    display_label: str = Field(description="What the UI shows, e.g. 'PHC 3'.")
    facility_type: str
    ownership: str
    lat: float
    lon: float
    beds: int | None
    in_network: bool
    verified: bool = Field(
        description="False until a human has checked the location and type."
    )
    review_flags: list[str] = Field(
        default_factory=list,
        description="Short codes naming what still needs confirming.",
    )
    source_ids: list[str]
    retrieved: str
    provenance: dict[str, str] = Field(
        description="Per-field provenance: real / derived / estimated / unknown."
    )
    location_precision: str = Field(
        default="exact", description="exact | approximate_village_centre"
    )
    medicine_list: str = Field(
        default="none", description="State list carried: phc/chc/tlh/dlh/tlh_proxy/none"
    )
    level_unconfirmed: bool = False


class Coverage(BaseModel):
    """How much of the real facility network our public sources actually cover."""

    phcs_mapped: int
    phcs_in_survey: int
    pharmacies_mapped: int
    statements: list[str]


class FacilitiesResponse(BaseModel):
    facilities: list[FacilityOut]
    boundary: dict | None = Field(
        default=None, description="Gadag taluk outline as GeoJSON, for the map."
    )
    coverage: Coverage | None = None
    attribution: str
    disclaimer: str
    caveats: list[str]


class MedicineOut(BaseModel):
    id: str
    drug_code: str
    name: str
    drug_type: str
    therapeutic_group: str
    levels: list[str] = Field(description="Facility levels that carry this item.")
    indent_qty: int | None
    provenance: str
    survey_availability_pct: float | None = Field(
        default=None,
        description="Observed availability across 15 PHCs, 2021-22. Real where present.",
    )
    survey_essentiality: str | None = None
    match_status: str | None = Field(
        default=None,
        description="How this item was linked to the survey: auto or confirmed.",
    )
    survey_sl_no: int | None = None
    quantity_modelled: bool = Field(
        default=True,
        description="False = survey availability only, no quantities or demand.",
    )


class MedicinesResponse(BaseModel):
    medicines: list[MedicineOut]
    survey_linked_count: int
    pending_review_count: int = Field(
        description="Survey items whose indent match is not yet confirmed, so excluded."
    )
    disclaimer: str
    caveats: list[str]


class SourceOut(BaseModel):
    id: str
    title: str
    publisher: str
    url: str | None
    licence: str
    attribution: str | None
    what_was_taken: str
    retrieved: str | None
    access: str
    limitations: list[str]
    source_quality: str | None = None


class SourcesResponse(BaseModel):
    sources: list[SourceOut]
    disclaimer: str


class FacilityRuleOverride(BaseModel):
    target_days: int | None = None
    safety_days: int | None = None
    auto_approval_limit: float | None = None
    approval_delay_days: int | None = None
    review_interval_days: int | None = None


class ScenarioRequest(BaseModel):
    """Everything the Settings page can change about a run."""

    days: int = Field(default=180, ge=1, le=730)
    seed: int = 42
    demand_scale: float = Field(default=1.0, gt=0, le=10)
    lead_time_days: int = Field(default=21, ge=1, le=180)
    express_lead_time_days: int = Field(default=5, ge=1, le=180)
    min_shelf_life_days: int = Field(default=180, ge=0, le=1095)
    near_expiry_share: float = Field(default=0.15, ge=0.0, le=1.0)
    private_demand_share: float | None = Field(
        default=None, ge=0.0, le=10.0,
        description=(
            "Private facilities' demand per unit of government demand. Omit to use the "
            "NSS 75th round Karnataka ratio (about 3.66)."
        ),
    )
    # Facility ids to take out of the Zealo network (kept for compatibility).
    excluded_facility_ids: list[str] = Field(default_factory=list)
    # Explicit membership, overriding each facility's default (pharmacies default out).
    network_overrides: dict[str, bool] = Field(default_factory=dict)
    rules: dict[str, FacilityRuleOverride] = Field(default_factory=dict)
    # "<day>:<facility_id>:<medicine_id>" -> "approve" | "reject"
    approval_decisions: dict[str, str] = Field(default_factory=dict)


class ModeSummary(BaseModel):
    mode: str
    metrics: dict


class DayStatus(BaseModel):
    day: int
    status: dict[str, str]
    availability_rate: float


class RunContext(BaseModel):
    """What this run rests on, so every figure can be labelled honestly."""

    population_share_pct: float
    private_demand_share: float
    private_share_basis: str
    figure1_interim: bool
    quantity_modelled_items: int
    availability_only_items: int
    phc_survey_profiles: dict[str, int]
    demand_split: str
    prices_real: bool
    level_unconfirmed_facilities: list[str]


class SimulateResponse(BaseModel):
    run_id: str
    days: int
    seed: int
    context: RunContext | None = None
    summaries: list[ModeSummary]
    timeline: dict[str, list[DayStatus]]
    events: dict[str, list[dict]]
    disclaimer: str
    caveats: list[str]


class TransferPoint(BaseModel):
    day: int
    transfers: int
    units: int
    distance_km: float


class MedicineImpact(BaseModel):
    medicine_id: str
    name: str
    relief_transfers: int
    relief_units: int
    rebalance_transfers: int
    rebalance_units: int


class FacilityBalance(BaseModel):
    """How a facility stands on one medicine: surplus, short, or neither."""

    facility_id: str
    display_label: str
    medicine_id: str
    on_hand: int
    days_of_cover: float | None
    position: str = Field(description="'surplus' | 'short' | 'balanced'")


class RedistributionResponse(BaseModel):
    run_id: str
    mode: str
    day: int
    transfers_over_time: list[TransferPoint]
    top_medicines: list[MedicineImpact]
    balances: list[FacilityBalance]
    unmapped_phcs: list[dict] = Field(default_factory=list)
    totals: dict
    disclaimer: str
    caveats: list[str]


class MedicineDayRow(BaseModel):
    facility_id: str
    display_label: str
    on_hand: int | None = Field(description="None for availability-only survey items.")
    in_stock: bool
    days_of_cover: float | None
    next_expiry_day: int | None
    status: str
    provenance: str = "estimated"


class MedicineAtFacilitiesResponse(BaseModel):
    run_id: str
    mode: str
    day: int
    medicine_id: str
    quantity_modelled: bool = True
    rows: list[MedicineDayRow]
    note: str | None = None
    disclaimer: str


class FacilityMedicineRow(BaseModel):
    medicine_id: str
    name: str
    therapeutic_group: str
    on_hand: int
    demand: int
    dispensed: int
    unmet: int
    forecast: float
    days_of_cover: float | None
    next_expiry_day: int | None
    status: str


class MedicineSeries(BaseModel):
    """A medicine's history at one facility, for the dashboard chart."""

    medicine_id: str
    name: str
    days: list[int]
    on_hand: list[int]
    demand: list[int]
    dispensed: list[int]
    unmet: list[int]
    forecast: list[float]


class ExpiryAlert(BaseModel):
    medicine_id: str
    name: str
    on_hand: int
    expires_on_day: int
    days_until_expiry: int
    bucket: int = Field(description="30, 60 or 90 - the window it falls into.")


class AvailabilityOnlyRow(BaseModel):
    """A survey item with no confirmed indent match: in or out of stock, nothing more."""

    medicine_id: str
    name: str
    survey_sl_no: int
    in_stock: bool
    provenance: str = "derived"


class FacilityRunResponse(BaseModel):
    run_id: str
    mode: str
    day: int
    facility_id: str
    display_label: str
    facility_type: str
    in_network: bool
    status: str
    survey_profile: int | None = Field(
        default=None, description="Survey PHC profile assigned here, for illustration."
    )
    level_unconfirmed: bool = False
    medicines: list[FacilityMedicineRow]
    availability_only: list[AvailabilityOnlyRow] = Field(default_factory=list)
    events: list[dict]
    expiry_alerts: list[ExpiryAlert]
    series: MedicineSeries | None = Field(
        default=None, description="Populated when ?series=<medicine_id> is given."
    )
    disclaimer: str


class DataStatusItem(BaseModel):
    id: str
    title: str
    status: str
    file: str
    unlocks: str
    interim_approach: str
    progress: str
    problems: list[str]


class DataStatusResponse(BaseModel):
    items: list[DataStatusItem]
    pending_count: int
