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
    for medicine_id in sorted(scenario.carried.get(facility.id, frozenset())):
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
    # Not worth dispatching a vehicle for less. Without a floor, facilities with a
    # demand of about one unit a day traded one- and two-unit parcels constantly.
    min_transfer_units: int = 5
    # Rebalancing only acts on batches this close to expiry -- the same 90-day window the
    # map uses for amber. Without it, a minimum order lot outlasting a slow item's shelf
    # life was shipped off two years early and labelled "near expiry".
    near_expiry_horizon_days: int = 90

    def decide(self, day: int, state: SimulationState) -> None:
        network = [f for f in state.scenario.facilities if f.in_network]
        outside = [f for f in state.scenario.facilities if not f.in_network]

        # Medicines in sorted order: a frozenset's order changes with the hash seed, and
        # the event log (and anything ordered by it) must be identical on every run.
        for facility in network:
            for medicine_id in sorted(state.scenario.carried.get(facility.id, frozenset())):
                self._relieve_shortage(day, state, facility, medicine_id, network)
        for facility in network:
            for medicine_id in sorted(state.scenario.carried.get(facility.id, frozenset())):
                self._rebalance_near_expiry(day, state, facility, medicine_id, network)
        for facility in network:
            for medicine_id in sorted(state.scenario.carried.get(facility.id, frozenset())):
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
        if gap < self.min_transfer_units:
            # A small shortfall is left to the regular refill rather than a transfer.
            return

        for donor, _distance in self._nearest_donors(state, facility, medicine_id, network):
            spare = self._spare_units(state, donor, medicine_id)
            if spare < self.min_transfer_units:
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
        """Units a donor can give without creating a shortage of its own.

        "Surplus above its own safety level" is read as surplus above the donor's
        **reorder point** -- enough to last the manufacturer lead time plus its safety
        days. Reading it as the safety days alone let a donor give itself below its
        reorder point, so the next day it pulled stock from someone else: a cascade in
        which every transfer caused another.
        """
        daily = state.forecast(facility.id, medicine_id)
        keep = _target_units(
            daily, state.scenario.manufacturer.lead_time_days + facility.rules.safety_days
        )
        return max(0, state.on_hand(facility.id, medicine_id) - keep)

    # --- step 3: near-expiry rebalancing --------------------------------------

    def _rebalance_near_expiry(self, day, state, facility, medicine_id, network) -> None:
        """Move stock this facility cannot use in time to one that can.

        Stock is consumed earliest-expiry-first, so what is at risk is the quantity
        expiring by the soonest expiry date **minus what this facility will consume before
        then**. Comparing total stock instead made any fresh delivery look like it put an
        old batch at risk.

        A receiver qualifies only if it will consume the stock before that date *after*
        its own stock expiring by then -- otherwise the move relocates the waste, and the
        receiver's own rebalancing sends it straight on again.
        """
        inventory = state.inventories[facility.id]
        batches = inventory.batches(medicine_id)
        if not batches:
            return
        daily = state.forecast(facility.id, medicine_id)
        soonest = min(b.expiry_day for b in batches)
        if soonest - day > self.near_expiry_horizon_days:
            return
        days_left = soonest - day - self.transit_days
        if days_left <= 0:
            return

        expiring = inventory.quantity_expiring_before(medicine_id, soonest + 1)
        consumable = int(daily * (soonest - day))
        at_risk = expiring - consumable
        if at_risk < self.min_transfer_units:
            return

        for peer, _distance in self._nearest_peers(state, facility, network):
            peer_daily = state.forecast(peer.id, medicine_id)
            if peer_daily <= 0:
                continue
            peer_expiring = state.inventories[peer.id].quantity_expiring_before(
                medicine_id, soonest + 1
            )
            headroom = int(peer_daily * days_left) - peer_expiring
            move = min(at_risk, headroom)
            if move < self.min_transfer_units:
                continue
            taken = inventory.take_expiring_before(medicine_id, soonest + 1, move)
            moved = state.transfer(
                facility.id, peer.id, medicine_id, taken,
                DeliveryKind.REBALANCE_TRANSFER, transit_days=self.transit_days,
            )
            at_risk -= moved
            if at_risk < self.min_transfer_units:
                return

    def _nearest_peers(self, state, facility, network):
        """Every other network facility, nearest first -- whether or not it holds stock."""
        peers = [
            (peer, state.scenario.distance_km(facility.id, peer.id))
            for peer in network
            if peer.id != facility.id
        ]
        peers.sort(key=lambda pair: pair[1])
        return peers

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
