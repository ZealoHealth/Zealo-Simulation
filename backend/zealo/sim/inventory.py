"""Stock held at one facility, batch by batch.

Batches are consumed earliest-expiry-first (FEFO), which is what a pharmacy
actually does and what makes near-expiry rebalancing meaningful: if stock were
consumed newest-first, nothing would ever be at risk.
"""

from __future__ import annotations

from collections import defaultdict

from zealo.sim.models import Batch


class Inventory:
    """Batches for every medicine at one facility.

    Every quantity that leaves is accounted for -- dispensed, expired or
    transferred out. Conservation is checked by test, so this class never
    silently drops or creates units.
    """

    def __init__(self) -> None:
        self._batches: dict[str, list[Batch]] = defaultdict(list)
        # Running total per medicine. The policy asks for on-hand stock millions of
        # times in a full run -- once per facility, per medicine, per peer, per day --
        # and re-summing the batch list each time dominated the profile.
        self._totals: dict[str, int] = {}

    def add(self, medicine_id: str, quantity: int, expiry_day: int) -> None:
        if quantity <= 0:
            return
        self._totals[medicine_id] = self._totals.get(medicine_id, 0) + quantity
        batches = self._batches[medicine_id]
        for batch in batches:
            if batch.expiry_day == expiry_day:
                batch.quantity += quantity
                return
        batches.append(Batch(quantity=quantity, expiry_day=expiry_day))
        batches.sort(key=lambda b: b.expiry_day)

    def on_hand(self, medicine_id: str) -> int:
        return self._totals.get(medicine_id, 0)

    def medicines(self) -> list[str]:
        return [m for m, total in self._totals.items() if total > 0]

    def next_expiry(self, medicine_id: str) -> int | None:
        batches = [b for b in self._batches.get(medicine_id, ()) if b.quantity > 0]
        return min(b.expiry_day for b in batches) if batches else None

    def dispense(self, medicine_id: str, quantity: int) -> int:
        """Take up to ``quantity`` units, earliest expiry first. Returns units served."""
        served = 0
        for batch in self._batches.get(medicine_id, ()):
            if served >= quantity:
                break
            take = min(batch.quantity, quantity - served)
            batch.quantity -= take
            served += take
        self._totals[medicine_id] = self._totals.get(medicine_id, 0) - served
        self._drop_empty(medicine_id)
        return served

    def remove_expired(self, day: int) -> dict[str, int]:
        """Discard batches whose expiry day has passed. Returns units lost per medicine."""
        lost: dict[str, int] = {}
        for medicine_id, batches in self._batches.items():
            wasted = sum(b.quantity for b in batches if b.expiry_day <= day)
            if wasted:
                lost[medicine_id] = wasted
                self._totals[medicine_id] = self._totals.get(medicine_id, 0) - wasted
                self._batches[medicine_id] = [b for b in batches if b.expiry_day > day]
        return lost

    def take_expiring_before(self, medicine_id: str, day: int, quantity: int) -> list[Batch]:
        """Remove up to ``quantity`` units that expire before ``day``, soonest first.

        Used by near-expiry rebalancing, which must move the *at-risk* stock rather
        than whatever happens to be nearest to hand.
        """
        taken: list[Batch] = []
        remaining = quantity
        for batch in self._batches.get(medicine_id, ()):
            if remaining <= 0 or batch.expiry_day >= day:
                break
            move = min(batch.quantity, remaining)
            batch.quantity -= move
            remaining -= move
            taken.append(Batch(quantity=move, expiry_day=batch.expiry_day))
        self._totals[medicine_id] = self._totals.get(medicine_id, 0) - (quantity - remaining)
        self._drop_empty(medicine_id)
        return taken

    def quantity_expiring_before(self, medicine_id: str, day: int) -> int:
        return sum(
            b.quantity for b in self._batches.get(medicine_id, ()) if b.expiry_day < day
        )

    def total_units(self) -> int:
        return sum(self._totals.values())

    def batches(self, medicine_id: str) -> list[Batch]:
        return [b for b in self._batches.get(medicine_id, ()) if b.quantity > 0]

    def _drop_empty(self, medicine_id: str) -> None:
        self._batches[medicine_id] = [
            b for b in self._batches.get(medicine_id, ()) if b.quantity > 0
        ]
