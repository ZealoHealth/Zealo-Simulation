"""The event log and the metrics accumulated from it.

Every order, approval request, transfer and expiry is logged with a
plain-language message, because the map's event feed has to be readable by a
judge who has never seen the model: "Moved 40 units of Ceftriaxone Injection 1 g
from PHC 3 to PHC 7, 45 days before expiry."
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum


class EventType(str, Enum):
    MANUFACTURER_ORDER = "manufacturer_order"
    EXPRESS_ORDER = "express_order"
    APPROVAL_REQUESTED = "approval_requested"
    APPROVAL_GRANTED = "approval_granted"
    APPROVAL_REJECTED = "approval_rejected"
    RELIEF_TRANSFER = "relief_transfer"
    REBALANCE_TRANSFER = "rebalance_transfer"
    EXPIRED = "expired"
    STOCKOUT = "stockout"


@dataclass
class Event:
    day: int
    type: EventType
    medicine_id: str
    message: str
    facility_id: str | None = None
    from_facility_id: str | None = None
    to_facility_id: str | None = None
    quantity: int = 0
    value: float | None = None
    distance_km: float | None = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["type"] = self.type.value
        return d


@dataclass
class Metrics:
    """Totals for one mode of one run.

    ``facility_medicine_days`` is the denominator for the availability rate: the
    number of (facility, medicine, day) cells the run actually covered.
    """

    facility_medicine_days: int = 0
    in_stock_days: int = 0
    stockout_item_days: int = 0
    demand_units: int = 0
    dispensed_units: int = 0
    unmet_units: int = 0
    expired_units: int = 0
    expired_value: float = 0.0
    manufacturer_orders: int = 0
    manufacturer_order_units: int = 0
    express_orders: int = 0
    transfers: int = 0
    transfer_units: int = 0
    transfer_value: float = 0.0
    transfer_distance_km: float = 0.0
    approval_requests: int = 0
    closing_stock_units: int = 0
    closing_stock_value: float = 0.0
    prices_available: bool = False

    @property
    def availability_rate(self) -> float:
        """Share of facility x medicine x day cells that had stock on hand."""
        if not self.facility_medicine_days:
            return 0.0
        return self.in_stock_days / self.facility_medicine_days

    @property
    def unmet_rate(self) -> float:
        if not self.demand_units:
            return 0.0
        return self.unmet_units / self.demand_units

    def to_dict(self) -> dict:
        d = asdict(self)
        d["availability_rate"] = round(self.availability_rate, 6)
        d["unmet_rate"] = round(self.unmet_rate, 6)
        if not self.prices_available:
            # No confirmed public price source yet, so value figures would be
            # fabricated. They are withheld rather than shown as zero.
            for key in ("expired_value", "transfer_value", "closing_stock_value"):
                d[key] = None
        return d


@dataclass
class EventLog:
    events: list[Event] = field(default_factory=list)

    def add(self, event: Event) -> None:
        self.events.append(event)

    def to_list(self) -> list[dict]:
        return [e.to_dict() for e in self.events]

    def __len__(self) -> int:
        return len(self.events)
