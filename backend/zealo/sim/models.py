"""Entities the simulation moves stock between.

The node vocabulary is closed on purpose. Zealo's model has exactly two kinds of
place: a **facility** that dispenses medicine, and a **manufacturer** that makes
it. There is no warehouse and no distributor anywhere in this project, and
``NodeKind`` is what makes that structural rather than a promise -- a transfer or
delivery cannot name a node kind that does not exist.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class NodeKind(str, Enum):
    """Every place stock can sit. Deliberately only two."""

    FACILITY = "facility"
    MANUFACTURER = "manufacturer"


class FacilityType(str, Enum):
    PHC = "phc"
    CHC = "chc"
    TALUK_HOSPITAL = "taluk_hospital"
    DISTRICT_HOSPITAL = "district_hospital"
    OTHER_GOVERNMENT = "other_government"
    GOVERNMENT_LEVEL_UNKNOWN = "government_level_unknown"
    PRIVATE_HOSPITAL = "private_hospital"
    CLINIC = "clinic"
    PHARMACY = "pharmacy"


class DeliveryKind(str, Enum):
    """Why stock is moving. Transfers are always facility-to-facility."""

    MANUFACTURER_ORDER = "manufacturer_order"
    EXPRESS_ORDER = "express_order"
    RELIEF_TRANSFER = "relief_transfer"
    REBALANCE_TRANSFER = "rebalance_transfer"


TRANSFER_KINDS = frozenset({DeliveryKind.RELIEF_TRANSFER, DeliveryKind.REBALANCE_TRANSFER})
ORDER_KINDS = frozenset({DeliveryKind.MANUFACTURER_ORDER, DeliveryKind.EXPRESS_ORDER})


class FacilityStatus(str, Enum):
    GREEN = "green"
    AMBER = "amber"
    RED = "red"


@dataclass(frozen=True)
class FacilityRules:
    """Per-facility policy settings. Editable in the UI."""

    target_days: int = 30
    safety_days: int = 7
    # Order lines at or below this value are approved automatically. None = no limit.
    auto_approval_limit: float | None = None
    approval_delay_days: int = 1
    # Baseline only: how often a lone facility reviews its own stock.
    review_interval_days: int = 7

    def __post_init__(self) -> None:
        if self.target_days <= 0 or self.safety_days < 0:
            raise ValueError("target_days must be positive and safety_days non-negative")
        if self.safety_days >= self.target_days:
            raise ValueError("safety_days must be below target_days")


@dataclass(frozen=True)
class Medicine:
    """An inventory item. Never a clinical entity -- no dosing, no guidance."""

    id: str
    indent_drug_code: str
    generic_name: str
    strength: str
    dosage_form: str
    therapeutic_group: str
    essentiality: str
    levels: frozenset[FacilityType]
    # Unit price stays optional: no public price source is confirmed yet, and an
    # invented price would put a fabricated number on screen. Value metrics are
    # reported only when every medicine in a run is priced.
    unit_price: float | None = None
    shelf_life_days: int = 730


@dataclass(frozen=True)
class Facility:
    id: str
    display_label: str
    facility_type: FacilityType
    ownership: str
    lat: float
    lon: float
    beds: int | None = None
    in_network: bool = True
    rules: FacilityRules = field(default_factory=FacilityRules)


@dataclass(frozen=True)
class Manufacturer:
    """A generic supply node, drawn off-map. Never a real company name."""

    id: str
    label: str
    lead_time_days: int = 21
    express_lead_time_days: int = 5
    min_order_units: int = 10
    # Zealo refuses manufacturer stock with less remaining shelf life than this.
    min_shelf_life_days: int = 180


@dataclass
class Batch:
    """A quantity of one medicine at one facility, with an expiry day."""

    quantity: int
    expiry_day: int

    def __post_init__(self) -> None:
        if self.quantity < 0:
            raise ValueError("a batch cannot hold a negative quantity")


@dataclass
class Delivery:
    """Stock in transit. Arrives at the start of ``arrival_day``."""

    arrival_day: int
    facility_id: str
    medicine_id: str
    quantity: int
    expiry_day: int
    kind: DeliveryKind
    source_kind: NodeKind
    source_id: str
    # Set when an order line exceeded the facility's auto-approval limit.
    awaiting_approval: bool = False
    ordered_on_day: int = 0

    def __post_init__(self) -> None:
        if self.quantity <= 0:
            raise ValueError("a delivery must move a positive quantity")
        if self.kind in TRANSFER_KINDS:
            if self.source_kind is not NodeKind.FACILITY:
                raise ValueError("a transfer must originate at a facility")
            if self.source_id == self.facility_id:
                raise ValueError("a facility cannot transfer stock to itself")
        elif self.source_kind is not NodeKind.MANUFACTURER:
            raise ValueError("an order must originate at a manufacturer")
