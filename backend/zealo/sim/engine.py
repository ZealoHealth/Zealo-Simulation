"""The simulation loop.

One simulated day, in the order the spec fixes:

1. deliveries and transfers due today arrive
2. expired batches are removed and counted as waste
3. demand is served earliest-expiry-first; whatever is not served is unmet
4. the active policy decides refills and transfers
5. end-of-day state is recorded

Two properties are deliberately structural rather than hoped for:

*Determinism.* All randomness lives in the demand draw, which is generated once
into ``Scenario`` before any mode runs. The engine itself draws nothing.

*Mode fairness.* Both modes read the same ``Scenario``, so they get byte-identical
demand and identical opening stock. Any difference between "without Zealo" and
"with Zealo" is therefore caused by policy and nothing else. Both are tested.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Protocol

import numpy as np

from zealo.sim.events import Event, EventLog, EventType, Metrics
from zealo.sim.forecast import EwmaForecaster, Forecaster
from zealo.sim.inventory import Inventory
from zealo.sim.models import (
    ORDER_KINDS,
    TRANSFER_KINDS,
    Batch,
    Delivery,
    DeliveryKind,
    Facility,
    FacilityStatus,
    Manufacturer,
    Medicine,
    NodeKind,
)

EARTH_RADIUS_KM = 6371.0

# Facility status thresholds (see methods:facility_status).
#
# A facility's colour reflects the SHARE of its medicines that are in stock. The first rule
# ("red if any carried medicine is out") could not work with ~53 medicines per facility: one
# gap anywhere turned it red, so nearly every facility was red in both modes and the colour
# said nothing. Thresholds were fixed before looking at the result:
#   red    below 80% in stock -- the WHO / Health Action International availability
#          benchmark, cited in the Gadag survey paper itself
#   amber  below 95% in stock (the standard inventory service level), or more than 10% of
#          medicines under 7 days of cover, or more than 25% of units expiring within 90 days
# Cover counts stock on the shelf plus deliveries due within the same 7 days. Counting the
# shelf alone flagged ~90% of facility-days in both modes: with a 21-day manufacturer lead
# time, shelf stock routinely dips under a week while the replenishment is already on its
# way, which is normal operation rather than a risk.
#   green  otherwise
# Applied identically in both modes, so a colour difference is caused by the policy alone.
RED_BELOW_IN_STOCK_SHARE = 0.80
GREEN_FROM_IN_STOCK_SHARE = 0.95
LOW_COVER_DAYS = 7
AMBER_LOW_COVER_SHARE = 0.10
NEAR_EXPIRY_DAYS = 90
AMBER_NEAR_EXPIRY_SHARE = 0.25


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


@dataclass
class Scenario:
    """Everything both modes share. Built once, never mutated by a run."""

    facilities: list[Facility]
    medicines: list[Medicine]
    manufacturer: Manufacturer
    carried: dict[str, frozenset[str]]
    # demand[(facility_id, medicine_id)] -> array of length `days`
    demand: dict[tuple[str, str], np.ndarray]
    opening_batches: dict[tuple[str, str], list[Batch]]
    days: int
    seed: int
    # {"<day>:<facility_id>:<medicine_id>": "approve" | "reject"}
    approval_decisions: dict[str, str] = field(default_factory=dict)

    def facility(self, facility_id: str) -> Facility:
        return self._by_id[facility_id]

    def medicine(self, medicine_id: str) -> Medicine:
        return self._medicine_by_id[medicine_id]

    def __post_init__(self) -> None:
        self._by_id = {f.id: f for f in self.facilities}
        self._medicine_by_id = {m.id: m for m in self.medicines}
        self._distance: dict[tuple[str, str], float] = {}

    def distance_km(self, a: str, b: str) -> float:
        """Straight-line distance between two facilities, memoised.

        A routing service would give road distance; none is configured, so this is
        the documented fallback and is what the UI labels it.
        """
        key = (a, b) if a <= b else (b, a)
        if key not in self._distance:
            fa, fb = self.facility(key[0]), self.facility(key[1])
            self._distance[key] = haversine_km(fa.lat, fa.lon, fb.lat, fb.lon)
        return self._distance[key]


class Policy(Protocol):
    name: str

    def decide(self, day: int, state: SimulationState) -> None: ...


@dataclass
class DayRecord:
    """Compact per-day state, for playback in the browser."""

    day: int
    status: dict[str, str]
    availability_rate: float


class SimulationState:
    """Mutable state for one mode of one run.

    Policies never touch inventories or the delivery queue directly; they call
    ``place_order`` and ``transfer``, which enforce the model's invariants -- no
    self-transfer, transfers only between network members, and Zealo's minimum
    shelf life -- and write the event log.
    """

    def __init__(self, scenario: Scenario, mode: str) -> None:
        self.scenario = scenario
        self.mode = mode
        self.day = 0
        self.inventories: dict[str, Inventory] = {f.id: Inventory() for f in scenario.facilities}
        # Deliveries in transit, indexed by the (facility, medicine) they are bound
        # for. The policy asks "what is already on its way here?" for every facility
        # and medicine on every simulated day, and scanning one flat list for each
        # of those questions dominated the run time.
        self._pending: dict[tuple[str, str], list[Delivery]] = {}
        self.metrics = Metrics()
        self.events = EventLog()
        self.forecasters: dict[tuple[str, str], Forecaster] = {}
        self.history: dict[tuple[str, str], dict[str, np.ndarray]] = {}
        self.timeline: list[DayRecord] = []
        self._on_order: dict[tuple[str, str], int] = {}
        self._last_review: dict[tuple[str, str], int] = {}
        self._stockout_seen: dict[tuple[str, str], bool] = {}

        prices = [m.unit_price for m in scenario.medicines]
        self.metrics.prices_available = all(p is not None for p in prices)

        self._starting_units = 0
        for (fid, mid), batches in scenario.opening_batches.items():
            for batch in batches:
                self.inventories[fid].add(mid, batch.quantity, batch.expiry_day)
                self._starting_units += batch.quantity

        for fid, medicine_ids in scenario.carried.items():
            for mid in sorted(medicine_ids):
                self.forecasters[(fid, mid)] = self.make_forecaster(fid, mid)
                self.history[(fid, mid)] = {
                    key: np.zeros(scenario.days, dtype=np.int32)
                    for key in ("on_hand", "demand", "dispensed", "unmet", "next_expiry",
                                "incoming_7d", "on_the_way")
                }
                self.history[(fid, mid)]["forecast"] = np.zeros(scenario.days, dtype=np.float32)
                # -1 means "nothing on hand", which is distinct from "expires today".
                self.history[(fid, mid)]["next_expiry"].fill(-1)

        self.manufacturer_arrived_units = 0
        self.dispensed_units = 0
        self.expired_units = 0

    def make_forecaster(self, facility_id: str, medicine_id: str) -> Forecaster:
        """Seeded with the item's mean demand so day 0 is not a cold start."""
        series = self.scenario.demand.get((facility_id, medicine_id))
        prior = float(series.mean()) if series is not None and len(series) else 0.0
        return EwmaForecaster(alpha=0.2, prior=prior)

    # --- queries policies use -------------------------------------------------

    def on_hand(self, facility_id: str, medicine_id: str) -> int:
        return self.inventories[facility_id].on_hand(medicine_id)

    def on_order(self, facility_id: str, medicine_id: str) -> int:
        return self._on_order.get((facility_id, medicine_id), 0)

    def forecast(self, facility_id: str, medicine_id: str) -> float:
        forecaster = self.forecasters.get((facility_id, medicine_id))
        return forecaster.predict(self.day) if forecaster else 0.0

    @property
    def pending(self) -> list[Delivery]:
        """Everything in transit, flattened. Convenience for reporting and tests."""
        return [d for group in self._pending.values() for d in group]

    def _queue(self, delivery: Delivery) -> None:
        self._pending.setdefault(
            (delivery.facility_id, delivery.medicine_id), []
        ).append(delivery)

    def arrivals_within(self, facility_id: str, medicine_id: str, days: int) -> int:
        limit = self.day + days
        return sum(
            d.quantity
            for d in self._pending.get((facility_id, medicine_id), ())
            if d.arrival_day <= limit
        )

    def next_arrival_day(self, facility_id: str, medicine_id: str) -> int | None:
        group = self._pending.get((facility_id, medicine_id))
        return min(d.arrival_day for d in group) if group else None

    def in_transit_units(self) -> int:
        """Transfer stock only: an unarrived manufacturer order does not exist yet."""
        return sum(
            d.quantity
            for group in self._pending.values()
            for d in group
            if d.kind in TRANSFER_KINDS
        )

    def total_on_hand(self) -> int:
        return sum(inv.total_units() for inv in self.inventories.values())

    # --- actions policies take ------------------------------------------------

    def place_order(
        self,
        facility_id: str,
        medicine_id: str,
        quantity: int,
        *,
        express: bool = False,
        enforce_min_shelf_life: bool,
    ) -> bool:
        """Order from the manufacturer. Returns False if nothing was ordered."""
        manufacturer = self.scenario.manufacturer
        quantity = max(quantity, manufacturer.min_order_units)
        if quantity <= 0:
            return False

        facility = self.scenario.facility(facility_id)
        medicine = self.scenario.medicine(medicine_id)
        lead = manufacturer.express_lead_time_days if express else manufacturer.lead_time_days

        shelf_life = medicine.shelf_life_days
        if enforce_min_shelf_life and shelf_life < manufacturer.min_shelf_life_days:
            # Zealo will not take stock it cannot use in time.
            return False

        value = self._value(medicine, quantity)
        approval_delay = 0
        limit = facility.rules.auto_approval_limit
        key = f"{self.day}:{facility_id}:{medicine_id}"
        # The limit is in rupees when prices are known. The project reports units only
        # (no verified price list), and a rupee limit could then never be exceeded, so
        # approvals would silently never happen; the limit is read as units instead.
        measured = value if value is not None else quantity
        if limit is not None and measured > limit:
            decision = self.scenario.approval_decisions.get(key, "approve")
            self.metrics.approval_requests += 1
            self.events.add(
                Event(
                    day=self.day,
                    type=EventType.APPROVAL_REQUESTED,
                    medicine_id=medicine_id,
                    facility_id=facility_id,
                    quantity=quantity,
                    value=value,
                    message=(
                        f"{facility.display_label} requested approval to order "
                        f"{quantity} units of {medicine.generic_name} "
                        f"{medicine.strength} (above its auto-approval limit)."
                    ),
                )
            )
            if decision == "reject":
                self.events.add(
                    Event(
                        day=self.day,
                        type=EventType.APPROVAL_REJECTED,
                        medicine_id=medicine_id,
                        facility_id=facility_id,
                        quantity=quantity,
                        value=value,
                        message=(
                            f"Order of {quantity} units of {medicine.generic_name} for "
                            f"{facility.display_label} was rejected."
                        ),
                    )
                )
                return False
            approval_delay = facility.rules.approval_delay_days
            self.events.add(
                Event(
                    day=self.day,
                    type=EventType.APPROVAL_GRANTED,
                    medicine_id=medicine_id,
                    facility_id=facility_id,
                    quantity=quantity,
                    value=value,
                    message=(
                        f"Order of {quantity} units of {medicine.generic_name} for "
                        f"{facility.display_label} was approved."
                    ),
                )
            )

        arrival = self.day + approval_delay + lead
        kind = DeliveryKind.EXPRESS_ORDER if express else DeliveryKind.MANUFACTURER_ORDER
        self._queue(
            Delivery(
                arrival_day=arrival,
                facility_id=facility_id,
                medicine_id=medicine_id,
                quantity=quantity,
                expiry_day=arrival + shelf_life,
                kind=kind,
                source_kind=NodeKind.MANUFACTURER,
                source_id=manufacturer.id,
                ordered_on_day=self.day,
            )
        )
        self._on_order[(facility_id, medicine_id)] = (
            self._on_order.get((facility_id, medicine_id), 0) + quantity
        )
        self.metrics.manufacturer_orders += 1
        self.metrics.manufacturer_order_units += quantity
        if express:
            self.metrics.express_orders += 1
        self.events.add(
            Event(
                day=self.day,
                type=EventType.EXPRESS_ORDER if express else EventType.MANUFACTURER_ORDER,
                medicine_id=medicine_id,
                facility_id=facility_id,
                quantity=quantity,
                value=value,
                message=(
                    f"{facility.display_label} ordered {quantity} units of "
                    f"{medicine.generic_name} {medicine.strength} from "
                    f"{manufacturer.label}, arriving day {arrival}"
                    + (" (express)." if express else ".")
                ),
            )
        )
        return True

    def transfer(
        self,
        from_id: str,
        to_id: str,
        medicine_id: str,
        batches: list[Batch],
        kind: DeliveryKind,
        transit_days: int = 1,
    ) -> int:
        """Move stock between two network facilities. Returns units moved.

        Refuses anything the model forbids: a facility sending to itself, or either
        end not being in the Zealo network. There is no warehouse to route through
        and no node kind that could serve as one.
        """
        if from_id == to_id:
            raise ValueError("a facility cannot transfer stock to itself")
        source, target = self.scenario.facility(from_id), self.scenario.facility(to_id)
        if not (source.in_network and target.in_network):
            raise ValueError("transfers happen only between Zealo network facilities")

        medicine = self.scenario.medicine(medicine_id)
        distance = self.scenario.distance_km(from_id, to_id)
        moved = 0
        for batch in batches:
            if batch.quantity <= 0:
                continue
            arrival = self.day + transit_days
            self._queue(
                Delivery(
                    arrival_day=arrival,
                    facility_id=to_id,
                    medicine_id=medicine_id,
                    quantity=batch.quantity,
                    expiry_day=batch.expiry_day,
                    kind=kind,
                    source_kind=NodeKind.FACILITY,
                    source_id=from_id,
                    ordered_on_day=self.day,
                )
            )
            moved += batch.quantity

        if not moved:
            return 0

        value = self._value(medicine, moved)
        self.metrics.transfers += 1
        self.metrics.transfer_units += moved
        self.metrics.transfer_distance_km += distance
        if value is not None:
            self.metrics.transfer_value += value

        if kind is DeliveryKind.REBALANCE_TRANSFER:
            soonest = min(b.expiry_day for b in batches if b.quantity > 0)
            tail = f", {soonest - self.day} days before expiry"
            event_type = EventType.REBALANCE_TRANSFER
        else:
            tail = " to cover a shortage"
            event_type = EventType.RELIEF_TRANSFER

        self.events.add(
            Event(
                day=self.day,
                type=event_type,
                medicine_id=medicine_id,
                from_facility_id=from_id,
                to_facility_id=to_id,
                quantity=moved,
                value=value,
                distance_km=round(distance, 2),
                message=(
                    f"Moved {moved} units of {medicine.generic_name} {medicine.strength} "
                    f"from {source.display_label} to {target.display_label}"
                    f"{tail} ({distance:.1f} km)."
                ),
            )
        )
        return moved

    def _value(self, medicine: Medicine, quantity: int) -> float | None:
        return None if medicine.unit_price is None else medicine.unit_price * quantity


def _arrive(state: SimulationState, day: int) -> None:
    due: list[Delivery] = []
    for key, group in list(state._pending.items()):
        arrived = [d for d in group if d.arrival_day <= day]
        if not arrived:
            continue
        due.extend(arrived)
        still_waiting = [d for d in group if d.arrival_day > day]
        if still_waiting:
            state._pending[key] = still_waiting
        else:
            del state._pending[key]
    for delivery in due:
        state.inventories[delivery.facility_id].add(
            delivery.medicine_id, delivery.quantity, delivery.expiry_day
        )
        if delivery.kind in ORDER_KINDS:
            state.manufacturer_arrived_units += delivery.quantity
            key = (delivery.facility_id, delivery.medicine_id)
            state._on_order[key] = max(0, state._on_order.get(key, 0) - delivery.quantity)


def _expire(state: SimulationState, day: int) -> None:
    for facility_id, inventory in state.inventories.items():
        for medicine_id, units in inventory.remove_expired(day).items():
            medicine = state.scenario.medicine(medicine_id)
            value = state._value(medicine, units)
            state.expired_units += units
            state.metrics.expired_units += units
            if value is not None:
                state.metrics.expired_value += value
            state.events.add(
                Event(
                    day=day,
                    type=EventType.EXPIRED,
                    medicine_id=medicine_id,
                    facility_id=facility_id,
                    quantity=units,
                    value=value,
                    message=(
                        f"{units} units of {medicine.generic_name} {medicine.strength} "
                        f"expired at {state.scenario.facility(facility_id).display_label}."
                    ),
                )
            )


def _serve_demand(state: SimulationState, day: int) -> None:
    scenario = state.scenario
    for facility_id, medicine_ids in scenario.carried.items():
        inventory = state.inventories[facility_id]
        # Sorted so the event log's order does not depend on the hash seed.
        for medicine_id in sorted(medicine_ids):
            key = (facility_id, medicine_id)
            series = scenario.demand.get(key)
            wanted = int(series[day]) if series is not None else 0
            served = inventory.dispense(medicine_id, wanted) if wanted else 0
            unmet = wanted - served

            state.dispensed_units += served
            state.metrics.demand_units += wanted
            state.metrics.dispensed_units += served
            state.metrics.unmet_units += unmet

            forecaster = state.forecasters.get(key)
            if forecaster is not None:
                # Observed demand is served + unmet: learning from served alone
                # would teach a short facility to stay short.
                forecaster.update(day, float(wanted))

            record = state.history[key]
            record["demand"][day] = wanted
            record["dispensed"][day] = served
            record["unmet"][day] = unmet
            record["on_hand"][day] = inventory.on_hand(medicine_id)
            record["forecast"][day] = (
                forecaster.predict(day) if forecaster is not None else 0.0
            )
            # Drives the 30/60/90-day expiry alerts on the facility dashboard.
            next_expiry = inventory.next_expiry(medicine_id)
            record["next_expiry"][day] = -1 if next_expiry is None else next_expiry

            state.metrics.facility_medicine_days += 1
            if record["on_hand"][day] > 0:
                state.metrics.in_stock_days += 1
            else:
                state.metrics.stockout_item_days += 1
                if not state._stockout_seen.get(key):
                    state._stockout_seen[key] = True
                    medicine = scenario.medicine(medicine_id)
                    state.events.add(
                        Event(
                            day=day,
                            type=EventType.STOCKOUT,
                            medicine_id=medicine_id,
                            facility_id=facility_id,
                            quantity=unmet,
                            message=(
                                f"{scenario.facility(facility_id).display_label} ran out of "
                                f"{medicine.generic_name} {medicine.strength}."
                            ),
                        )
                    )


def facility_status(state: SimulationState, facility_id: str, day: int) -> FacilityStatus:
    """Red / amber / green for the map. See methods:facility_status and the thresholds above."""
    medicine_ids = state.scenario.carried.get(facility_id, frozenset())
    if not medicine_ids:
        return FacilityStatus.GREEN
    inventory = state.inventories[facility_id]

    in_stock = 0
    low_cover = 0
    near_expiry_units = 0
    total_units = 0
    for medicine_id in medicine_ids:
        on_hand = inventory.on_hand(medicine_id)
        if on_hand > 0:
            in_stock += 1
            daily = state.forecast(facility_id, medicine_id)
            if daily > 0:
                incoming = state.arrivals_within(facility_id, medicine_id, LOW_COVER_DAYS)
                if (on_hand + incoming) / daily < LOW_COVER_DAYS:
                    low_cover += 1
        total_units += on_hand
        near_expiry_units += inventory.quantity_expiring_before(
            medicine_id, day + NEAR_EXPIRY_DAYS
        )

    n = len(medicine_ids)
    in_stock_share = in_stock / n
    if in_stock_share < RED_BELOW_IN_STOCK_SHARE:
        return FacilityStatus.RED
    near_expiry_share = near_expiry_units / total_units if total_units else 0.0
    if (
        in_stock_share < GREEN_FROM_IN_STOCK_SHARE
        or low_cover / n > AMBER_LOW_COVER_SHARE
        or near_expiry_share > AMBER_NEAR_EXPIRY_SHARE
    ):
        return FacilityStatus.AMBER
    return FacilityStatus.GREEN


@dataclass
class RunResult:
    mode: str
    metrics: Metrics
    events: EventLog
    timeline: list[DayRecord]
    history: dict[tuple[str, str], dict[str, np.ndarray]]
    starting_units: int
    manufacturer_arrived_units: int
    dispensed_units: int
    expired_units: int
    closing_units: int
    in_transit_units: int

    def conserves_stock(self) -> bool:
        """starting + arrived == dispensed + expired + on hand + in transit."""
        return (
            self.starting_units + self.manufacturer_arrived_units
            == self.dispensed_units
            + self.expired_units
            + self.closing_units
            + self.in_transit_units
        )


def run(scenario: Scenario, policy: Policy) -> RunResult:
    """Run one mode end to end. The engine draws no randomness of its own."""
    state = SimulationState(scenario, policy.name)

    for day in range(scenario.days):
        state.day = day
        _arrive(state, day)
        _expire(state, day)
        _serve_demand(state, day)
        policy.decide(day, state)
        # Deliveries due within the cover window, after today's orders are placed -- the
        # same quantity the status rule counts, so the facility panel agrees with the map.
        # Also everything still on its way, orders and transfers alike, for the
        # dashboard's "shelf plus deliveries on the way" line. Recorded, never read back.
        for (fid, mid), record in state.history.items():
            record["incoming_7d"][day] = state.arrivals_within(fid, mid, LOW_COVER_DAYS)
            record["on_the_way"][day] = state.arrivals_within(fid, mid, scenario.days)

        statuses = {
            f.id: facility_status(state, f.id, day).value for f in scenario.facilities
        }
        covered = state.metrics.facility_medicine_days
        state.timeline.append(
            DayRecord(
                day=day,
                status=statuses,
                availability_rate=round(
                    state.metrics.in_stock_days / covered if covered else 0.0, 6
                ),
            )
        )

    closing = state.total_on_hand()
    state.metrics.closing_stock_units = closing
    if state.metrics.prices_available:
        state.metrics.closing_stock_value = sum(
            state.scenario.medicine(mid).unit_price * inv.on_hand(mid)
            for fid, inv in state.inventories.items()
            for mid in inv.medicines()
        )

    return RunResult(
        mode=policy.name,
        metrics=state.metrics,
        events=state.events,
        timeline=state.timeline,
        history=state.history,
        starting_units=state._starting_units,
        manufacturer_arrived_units=state.manufacturer_arrived_units,
        dispensed_units=state.dispensed_units,
        expired_units=state.expired_units,
        closing_units=closing,
        in_transit_units=state.in_transit_units(),
    )
