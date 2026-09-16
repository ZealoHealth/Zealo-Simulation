"""Shared fixtures.

The scenario factory here builds **synthetic** facilities, medicines and demand.
That is deliberate and safe: it exists only to exercise the engine's mechanics,
lives in the test suite rather than in the shipped package, and never reaches
data/processed/ or the website. Real starting inventory and real demand come from
the data pipeline (Milestone 5), not from here.
"""

from __future__ import annotations

import numpy as np

from zealo.sim.engine import Scenario
from zealo.sim.models import (
    Batch,
    Facility,
    FacilityRules,
    FacilityType,
    Manufacturer,
    Medicine,
)


def make_medicine(mid: str = "med-1", price: float | None = 10.0, shelf_life: int = 730):
    return Medicine(
        id=mid,
        indent_drug_code=f"D{mid[-1]:0>5}",
        generic_name=f"Test Medicine {mid[-1]}",
        strength="500 mg",
        dosage_form="Tablet",
        therapeutic_group="Test group",
        essentiality="essential",
        levels=frozenset({FacilityType.PHC, FacilityType.TALUK_HOSPITAL}),
        unit_price=price,
        shelf_life_days=shelf_life,
    )


def make_facility(
    fid: str,
    lat: float,
    lon: float,
    *,
    in_network: bool = True,
    rules: FacilityRules | None = None,
    facility_type: FacilityType = FacilityType.PHC,
):
    return Facility(
        id=fid,
        display_label=f"PHC {fid[-1]}",
        facility_type=facility_type,
        ownership="government",
        lat=lat,
        lon=lon,
        in_network=in_network,
        rules=rules or FacilityRules(),
    )


def build_scenario(
    *,
    n_facilities: int = 3,
    n_medicines: int = 2,
    days: int = 90,
    seed: int = 42,
    daily_demand: float = 10.0,
    opening_days_of_stock: float = 20.0,
    opening_shelf_life: int = 400,
    price: float | None = 10.0,
    in_network: bool = True,
    rules: FacilityRules | None = None,
    lead_time: int = 21,
    approval_decisions: dict[str, str] | None = None,
) -> Scenario:
    """A small, fully-specified scenario with seeded Poisson demand."""
    rng = np.random.default_rng(seed)
    facilities = [
        make_facility(
            f"fac-{i}",
            lat=15.40 + 0.03 * i,
            lon=75.60 + 0.03 * i,
            in_network=in_network,
            rules=rules,
        )
        for i in range(n_facilities)
    ]
    medicines = [make_medicine(f"med-{j}", price=price) for j in range(n_medicines)]
    carried = {f.id: frozenset(m.id for m in medicines) for f in facilities}

    demand: dict[tuple[str, str], np.ndarray] = {}
    opening: dict[tuple[str, str], list[Batch]] = {}
    for f in facilities:
        for m in medicines:
            demand[(f.id, m.id)] = rng.poisson(daily_demand, days).astype(np.int32)
            units = int(daily_demand * opening_days_of_stock)
            if units:
                opening[(f.id, m.id)] = [
                    Batch(quantity=units, expiry_day=opening_shelf_life)
                ]

    return Scenario(
        facilities=facilities,
        medicines=medicines,
        manufacturer=Manufacturer(id="mfr-a", label="Manufacturer A", lead_time_days=lead_time),
        carried=carried,
        demand=demand,
        opening_batches=opening,
        days=days,
        seed=seed,
        approval_decisions=approval_decisions or {},
    )

