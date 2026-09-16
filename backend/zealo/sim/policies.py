"""The two ways of managing stock that the site compares.

**Without Zealo** every facility is alone. It reviews its own stock on a fixed
cycle, orders from the manufacturer, and never shares with anyone -- so a shortage
at one facility and a surplus at another a few kilometres away never meet.

**With Zealo** the same facilities share an inventory layer. Each day the network
looks ahead, moves stock between facilities to cover shortages and to use up
stock that would otherwise expire, and refills directly from manufacturers.

Both policies order from the *same* manufacturers. Neither has a warehouse or a
distributor, and there is no node kind that could act as one.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from zealo.sim.engine import SimulationState
from zealo.sim.models import DeliveryKind

# After running out, a lone facility over-orders -- the familiar reaction to a
# stockout, and the behaviour Zealo is meant to make unnecessary.
STOCKOUT_OVERORDER_MULTIPLIER = 1.5


def _target_units(daily_demand: float, days: int) -> int:
    return int(math.ceil(daily_demand * days))


def review_alone(day: int, state: SimulationState, facility) -> None:
    """One unsupported facility's periodic stock review.

    This is the whole of the baseline policy, and it is also what a facility
    outside the Zealo network does in the Zealo run -- opting out has to mean
    behaving exactly as it would have without Zealo, or the comparison is rigged.
    """
    rules = facility.rules
    scenario = state.scenario
    for medicine_id in scenario.carried.get(facility.id, frozenset()):
        key = (facility.id, medicine_id)
        last = state._last_review.get(key)
        if last is not None and day - last < rules.review_interval_days:
            continue
        state._last_review[key] = day

        daily = state.forecast(facility.id, medicine_id)
        if daily <= 0:
            continue

        position = state.on_hand(facility.id, medicine_id) + state.on_order(
            facility.id, medicine_id
        )
        reorder_point = _target_units(
            daily, scenario.manufacturer.lead_time_days + rules.safety_days
        )
        if position > reorder_point:
            continue

        shortfall = _target_units(daily, rules.target_days) - position
        if state._stockout_seen.get(key):
            shortfall = int(shortfall * STOCKOUT_OVERORDER_MULTIPLIER)
        if shortfall > 0:
            # A lone facility takes whatever the manufacturer sends, however
            # little shelf life is left on it.
            state.place_order(
                facility.id, medicine_id, shortfall, enforce_min_shelf_life=False
            )


@dataclass
class BaselinePolicy:
    """Every facility for itself: fixed review cycle, no sharing, ever."""

    name: str = "without_zealo"

    def decide(self, day: int, state: SimulationState) -> None:
        for facility in state.scenario.facilities:
            review_alone(day, state, facility)


@dataclass
class ZealoPolicy:
    """Shared inventory: forecast, relieve shortages, rebalance near-expiry, refill.

    Runs daily, and only for facilities whose ``in_network`` flag is set -- a
    facility outside the network behaves exactly as it does in the baseline.
    """

    name: str = "with_zealo"
    transit_days: int = 1

    def decide(self, day: int, state: SimulationState) -> None:
        network = [f for f in state.scenario.facilities if f.in_network]
        outside = [f for f in state.scenario.facilities if not f.in_network]

        for facility in network:
            for medicine_id in state.scenario.carried.get(facility.id, frozenset()):
                self._relieve_shortage(day, state, facility, medicine_id, network)
        for facility in network:
            for medicine_id in state.scenario.carried.get(facility.id, frozenset()):
                self._rebalance_near_expiry(day, state, facility, medicine_id, network)
        for facility in network:
            for medicine_id in state.scenario.carried.get(facility.id, frozenset()):
                self._refill(day, state, facility, medicine_id)

        # A facility outside the network gets no Zealo behaviour at all.
        for facility in outside:
            review_alone(day, state, facility)

    # --- step 2: shortage relief ---------------------------------------------

    def _relieve_shortage(self, day, state, facility, medicine_id, network) -> None:
        """Cover the gap until the next manufacturer delivery from a network peer.

        Looks at stock plus anything arriving within the manufacturer lead time. If
        that will not carry the facility to its next delivery, the gap is pulled
        from the **nearest** network facility holding more than its own safety
        level. Only if no peer can help does an express order go to the manufacturer
        -- moving stock that already exists beats making more of it.
        """
        daily = state.forecast(facility.id, medicine_id)
        if daily <= 0:
            return

        manufacturer = state.scenario.manufacturer
        horizon = state.next_arrival_day(facility.id, medicine_id)
        days_to_cover = (
            horizon - day if horizon is not None else manufacturer.lead_time_days
        )
        days_to_cover = max(days_to_cover, 1)

        available = state.on_hand(facility.id, medicine_id) + state.arrivals_within(
            facility.id, medicine_id, manufacturer.lead_time_days
        )
        needed = _target_units(daily, days_to_cover)
        gap = needed - available
        if gap <= 0:
            return

        for donor, _distance in self._nearest_donors(state, facility, medicine_id, network):
            spare = self._spare_units(state, donor, medicine_id)
            if spare <= 0:
                continue
            move = min(spare, gap)
            batches = state.inventories[donor.id].take_expiring_before(
                medicine_id, day + 10**6, move
            )
            moved = state.transfer(
                donor.id,
                facility.id,
                medicine_id,
                batches,
                DeliveryKind.RELIEF_TRANSFER,
                transit_days=self.transit_days,
            )
            gap -= moved
            if gap <= 0:
                return

        if gap > 0:
            state.place_order(
                facility.id, medicine_id, gap, express=True, enforce_min_shelf_life=True
            )

    def _nearest_donors(self, state, facility, medicine_id, network):
        candidates = [
            (peer, state.scenario.distance_km(facility.id, peer.id))
            for peer in network
            if peer.id != facility.id and state.on_hand(peer.id, medicine_id) > 0
        ]
        candidates.sort(key=lambda pair: pair[1])
        return candidates

    def _spare_units(self, state, facility, medicine_id) -> int:
        """Units above the facility's own safety level -- never below it."""
        daily = state.forecast(facility.id, medicine_id)
        safety = _target_units(daily, facility.rules.safety_days)
        return max(0, state.on_hand(facility.id, medicine_id) - safety)

    # --- step 3: near-expiry rebalancing --------------------------------------

    def _rebalance_near_expiry(self, day, state, facility, medicine_id, network) -> None:
        """Move stock this facility cannot use in time to one that can.

        At-risk quantity is whatever expires before the facility's own consumption
        would reach it. It goes to the nearest network facility whose forecast
        demand will actually consume it before the same expiry day -- otherwise the
        move only relocates the waste.
        """
        inventory = state.inventories[facility.id]
        batches = inventory.batches(medicine_id)
        if not batches:
            return
        daily = state.forecast(facility.id, medicine_id)
        if daily <= 0:
            return

        on_hand = state.on_hand(facility.id, medicine_id)
        soonest = min(b.expiry_day for b in batches)
        days_left = soonest - day
        if days_left <= 0:
            return
        consumable = _target_units(daily, days_left)
        at_risk = on_hand - consumable
        if at_risk <= 0:
            return

        for peer, _distance in self._nearest_donors(state, facility, medicine_id, network):
            peer_daily = state.forecast(peer.id, medicine_id)
            if peer_daily <= 0:
                continue
            peer_headroom = _target_units(peer_daily, days_left) - state.on_hand(
                peer.id, medicine_id
            )
            if peer_headroom <= 0:
                continue
            move = min(at_risk, peer_headroom)
            taken = inventory.take_expiring_before(medicine_id, soonest + 1, move)
            moved = state.transfer(
                facility.id,
                peer.id,
                medicine_id,
                taken,
                DeliveryKind.REBALANCE_TRANSFER,
                transit_days=self.transit_days,
            )
            at_risk -= moved
            if at_risk <= 0:
                return

    # --- step 4: refill -------------------------------------------------------

    def _refill(self, day, state, facility, medicine_id) -> None:
        """Order up to the target when the position falls below the reorder point.

        Zealo only accepts manufacturer stock with at least the configured minimum
        remaining shelf life.
        """
        daily = state.forecast(facility.id, medicine_id)
        if daily <= 0:
            return
        rules = facility.rules
        manufacturer = state.scenario.manufacturer
        position = state.on_hand(facility.id, medicine_id) + state.on_order(
            facility.id, medicine_id
        )
        reorder_point = _target_units(
            daily, manufacturer.lead_time_days + rules.safety_days
        )
        if position >= reorder_point:
            return
        shortfall = _target_units(daily, rules.target_days) - position
        if shortfall > 0:
            state.place_order(
                facility.id, medicine_id, shortfall, enforce_min_shelf_life=True
            )
