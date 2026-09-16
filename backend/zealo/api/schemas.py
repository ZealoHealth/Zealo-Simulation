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


class FacilitiesResponse(BaseModel):
    facilities: list[FacilityOut]
    boundary: dict | None = Field(
        default=None, description="Gadag taluk outline as GeoJSON, for the map."
    )
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
    # Facility ids to exclude from the Zealo network. Everything else is in.
    excluded_facility_ids: list[str] = Field(default_factory=list)
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


class SimulateResponse(BaseModel):
    run_id: str
    days: int
    seed: int
    summaries: list[ModeSummary]
    timeline: dict[str, list[DayStatus]]
    events: dict[str, list[dict]]
    disclaimer: str
    caveats: list[str]


class MedicineDayRow(BaseModel):
    facility_id: str
    display_label: str
    on_hand: int
    days_of_cover: float | None
    next_expiry_day: int | None
    status: str


class MedicineAtFacilitiesResponse(BaseModel):
    run_id: str
    mode: str
    day: int
    medicine_id: str
    rows: list[MedicineDayRow]
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


class FacilityRunResponse(BaseModel):
    run_id: str
    mode: str
    day: int
    facility_id: str
    display_label: str
    facility_type: str
    in_network: bool
    status: str
    medicines: list[FacilityMedicineRow]
    events: list[dict]
    disclaimer: str
