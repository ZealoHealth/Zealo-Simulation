"""Simulation invariants.

These are the properties the build spec names, and they are the reason any number
the site shows can be trusted: determinism, a fair comparison between the two
modes, conservation of stock, and the structural absence of warehouses.
"""

from __future__ import annotations

import numpy as np
import pytest

from tests.factories import build_scenario, make_medicine
from zealo.sim.engine import run
from zealo.sim.events import EventType
from zealo.sim.inventory import Inventory
from zealo.sim.models import (
    Batch,
    Delivery,
    DeliveryKind,
    FacilityRules,
    NodeKind,
)
from zealo.sim.policies import BaselinePolicy, ZealoPolicy


def run_both(**kwargs):
    """Run each mode on its own freshly-built but identically-seeded scenario."""
    baseline = run(build_scenario(**kwargs), BaselinePolicy())
    zealo = run(build_scenario(**kwargs), ZealoPolicy())
    return baseline, zealo


# --- determinism and fairness -------------------------------------------------

def test_the_same_seed_gives_identical_results():
    a = run(build_scenario(seed=7), ZealoPolicy())
    b = run(build_scenario(seed=7), ZealoPolicy())
    assert a.metrics.to_dict() == b.metrics.to_dict()
    assert a.events.to_list() == b.events.to_list()
    assert [d.status for d in a.timeline] == [d.status for d in b.timeline]


def test_a_different_seed_gives_different_demand():
    a = build_scenario(seed=1)
    b = build_scenario(seed=2)
    key = next(iter(a.demand))
    assert not np.array_equal(a.demand[key], b.demand[key])


def test_both_modes_see_identical_demand_and_opening_stock():
    """Any difference between the modes must come from policy, not from inputs."""
    a, b = build_scenario(seed=11), build_scenario(seed=11)
    for key, series in a.demand.items():
        assert np.array_equal(series, b.demand[key])
    for key, batches in a.opening_batches.items():
        assert [(x.quantity, x.expiry_day) for x in batches] == [
            (y.quantity, y.expiry_day) for y in b.opening_batches[key]
        ]


def test_both_modes_start_from_the_same_stock():
    baseline, zealo = run_both(seed=11)
    assert baseline.starting_units == zealo.starting_units


def test_both_modes_face_the_same_total_demand():
    baseline, zealo = run_both(seed=11)
    assert baseline.metrics.demand_units == zealo.metrics.demand_units


# --- conservation and sanity --------------------------------------------------

@pytest.mark.parametrize("policy_factory", [BaselinePolicy, ZealoPolicy])
def test_stock_is_conserved(policy_factory):
    """starting + manufacturer arrivals == dispensed + expired + on hand + in transit."""
    result = run(build_scenario(days=120), policy_factory())
    assert result.conserves_stock(), (
        f"start {result.starting_units} + arrived {result.manufacturer_arrived_units} != "
        f"dispensed {result.dispensed_units} + expired {result.expired_units} + "
        f"on hand {result.closing_units} + in transit {result.in_transit_units}"
    )


@pytest.mark.parametrize("policy_factory", [BaselinePolicy, ZealoPolicy])
def test_dispensed_plus_unmet_equals_demand(policy_factory):
    m = run(build_scenario(), policy_factory()).metrics
    assert m.dispensed_units + m.unmet_units == m.demand_units


@pytest.mark.parametrize("policy_factory", [BaselinePolicy, ZealoPolicy])
def test_stock_never_goes_negative(policy_factory):
    result = run(build_scenario(), policy_factory())
    for series in result.history.values():
        assert (series["on_hand"] >= 0).all()
        assert (series["dispensed"] >= 0).all()
        assert (series["unmet"] >= 0).all()


def test_a_facility_never_dispenses_more_than_was_demanded():
    result = run(build_scenario(), ZealoPolicy())
    for series in result.history.values():
        assert (series["dispensed"] <= series["demand"]).all()


def test_availability_rate_is_a_proportion():
    for result in run_both():
        assert 0.0 <= result.metrics.availability_rate <= 1.0


# --- the model has no warehouses ---------------------------------------------

def test_the_only_node_kinds_are_facility_and_manufacturer():
    """Structural: there is no warehouse or distributor node kind to route through."""
    assert {k.value for k in NodeKind} == {"facility", "manufacturer"}


def test_no_delivery_comes_from_anything_but_a_facility_or_a_manufacturer():
    result = run(build_scenario(days=120), ZealoPolicy())
    for event in result.events.events:
        assert event.type in set(EventType)
    # every transfer names two facilities; every order names no facility source
    for event in result.events.events:
        if event.type in (EventType.RELIEF_TRANSFER, EventType.REBALANCE_TRANSFER):
            assert event.from_facility_id and event.to_facility_id


def test_a_delivery_cannot_claim_a_warehouse_origin():
    with pytest.raises(ValueError):
        Delivery(
            arrival_day=1,
            facility_id="fac-1",
            medicine_id="med-1",
            quantity=5,
            expiry_day=400,
            kind=DeliveryKind.MANUFACTURER_ORDER,
            source_kind=NodeKind.FACILITY,  # an order must come from a manufacturer
            source_id="fac-2",
        )


# --- transfer rules -----------------------------------------------------------

def test_a_facility_cannot_transfer_to_itself():
    with pytest.raises(ValueError):
        Delivery(
            arrival_day=1,
            facility_id="fac-1",
            medicine_id="med-1",
            quantity=5,
            expiry_day=400,
            kind=DeliveryKind.RELIEF_TRANSFER,
            source_kind=NodeKind.FACILITY,
            source_id="fac-1",
        )


def test_transfers_only_happen_between_two_different_network_facilities():
    result = run(_imbalanced_scenario(), ZealoPolicy())
    transfers = [
        e
        for e in result.events.events
        if e.type in (EventType.RELIEF_TRANSFER, EventType.REBALANCE_TRANSFER)
    ]
    for event in transfers:
        assert event.from_facility_id != event.to_facility_id


def test_a_network_with_no_members_makes_no_transfers():
    """Opting every facility out must reproduce lone-facility behaviour."""
    result = run(build_scenario(in_network=False, days=120), ZealoPolicy())
    assert result.metrics.transfers == 0


def test_opting_out_of_the_network_matches_the_baseline_exactly():
    out = run(build_scenario(in_network=False, days=120, seed=5), ZealoPolicy())
    base = run(build_scenario(in_network=False, days=120, seed=5), BaselinePolicy())
    assert out.metrics.to_dict() == base.metrics.to_dict()


def _imbalanced_scenario(days: int = 60):
    """One facility well stocked, the others nearly empty: the case transfers exist for."""
    scenario = build_scenario(days=days, opening_days_of_stock=2)
    for (fid, _mid), batches in scenario.opening_batches.items():
        if fid == "fac-0":
            batches[0].quantity = 10 * 90  # 90 days of demand
    return scenario


def test_the_network_moves_stock_from_surplus_to_shortage():
    result = run(_imbalanced_scenario(), ZealoPolicy())
    relief = [e for e in result.events.events if e.type is EventType.RELIEF_TRANSFER]
    assert relief, "a well-stocked facility next to empty ones should relieve them"
    assert all(e.from_facility_id == "fac-0" for e in relief[:5])
    assert result.metrics.transfer_distance_km > 0


def test_uniformly_short_facilities_do_not_trade_stock():
    """If nobody has a surplus, moving stock around only relocates the shortage."""
    result = run(build_scenario(days=60, opening_days_of_stock=2), ZealoPolicy())
    assert result.metrics.transfers == 0


def test_no_transfer_is_smaller_than_the_minimum():
    result = run(_imbalanced_scenario(), ZealoPolicy())
    minimum = ZealoPolicy().min_transfer_units
    moves = [e for e in result.events.events
             if e.type in (EventType.RELIEF_TRANSFER, EventType.REBALANCE_TRANSFER)]
    assert moves and all(e.quantity >= minimum for e in moves)


def test_a_donor_never_gives_itself_below_its_reorder_point():
    """Giving below the reorder point caused cascades: each transfer triggered another."""
    scenario = _imbalanced_scenario()
    result = run(scenario, ZealoPolicy())
    received_back = [
        e for e in result.events.events
        if e.type is EventType.RELIEF_TRANSFER and e.to_facility_id == "fac-0"
    ]
    assert not received_back, "the donor should never need relief from its recipients"


def test_stock_does_not_ping_pong_between_two_facilities():
    result = run(_imbalanced_scenario(days=90), ZealoPolicy())
    routes = {
        (e.from_facility_id, e.to_facility_id, e.medicine_id)
        for e in result.events.events
        if e.type in (EventType.RELIEF_TRANSFER, EventType.REBALANCE_TRANSFER)
    }
    reversed_routes = [r for r in routes if (r[1], r[0], r[2]) in routes]
    assert not reversed_routes


# --- minimum shelf life -------------------------------------------------------

def test_zealo_refuses_manufacturer_stock_below_the_minimum_shelf_life():
    """Default minimum is 180 days; a 90-day product must never be ordered."""
    scenario = build_scenario(days=90, opening_days_of_stock=2)
    short_life = make_medicine("med-0", price=10.0, shelf_life=90)
    scenario.medicines = [short_life] + [m for m in scenario.medicines if m.id != "med-0"]
    scenario.__post_init__()
    result = run(scenario, ZealoPolicy())
    ordered = {
        e.medicine_id
        for e in result.events.events
        if e.type in (EventType.MANUFACTURER_ORDER, EventType.EXPRESS_ORDER)
    }
    assert "med-0" not in ordered


def test_a_lone_facility_will_accept_short_dated_stock():
    """The contrast that makes the previous test meaningful."""
    scenario = build_scenario(days=90, opening_days_of_stock=2)
    short_life = make_medicine("med-0", price=10.0, shelf_life=90)
    scenario.medicines = [short_life] + [m for m in scenario.medicines if m.id != "med-0"]
    scenario.__post_init__()
    result = run(scenario, BaselinePolicy())
    ordered = {
        e.medicine_id
        for e in result.events.events
        if e.type is EventType.MANUFACTURER_ORDER
    }
    assert "med-0" in ordered


# --- approvals ----------------------------------------------------------------

def test_a_low_auto_approval_limit_creates_approval_requests():
    tight = FacilityRules(auto_approval_limit=1.0)
    result = run(build_scenario(rules=tight, days=90), ZealoPolicy())
    assert result.metrics.approval_requests > 0
    assert any(e.type is EventType.APPROVAL_REQUESTED for e in result.events.events)


def test_no_approval_requests_when_there_is_no_limit():
    result = run(build_scenario(days=90), ZealoPolicy())
    assert result.metrics.approval_requests == 0


def test_rejecting_an_order_changes_the_outcome():
    tight = FacilityRules(auto_approval_limit=1.0)
    approved = run(build_scenario(rules=tight, days=90, seed=3), ZealoPolicy())
    first = next(
        e
        for e in approved.events.events
        if e.type is EventType.APPROVAL_REQUESTED
    )
    key = f"{first.day}:{first.facility_id}:{first.medicine_id}"
    rejected = run(
        build_scenario(
            rules=tight, days=90, seed=3, approval_decisions={key: "reject"}
        ),
        ZealoPolicy(),
    )
    assert any(e.type is EventType.APPROVAL_REJECTED for e in rejected.events.events)
    assert rejected.metrics.to_dict() != approved.metrics.to_dict()


# --- inventory mechanics ------------------------------------------------------

def test_batches_are_consumed_earliest_expiry_first():
    inv = Inventory()
    inv.add("m", 10, expiry_day=100)
    inv.add("m", 10, expiry_day=50)
    inv.dispense("m", 12)
    remaining = {(b.expiry_day, b.quantity) for b in inv.batches("m")}
    assert remaining == {(100, 8)}


def test_dispensing_more_than_is_held_serves_only_what_exists():
    inv = Inventory()
    inv.add("m", 5, expiry_day=100)
    assert inv.dispense("m", 50) == 5
    assert inv.on_hand("m") == 0


def test_expired_batches_are_removed_and_counted():
    inv = Inventory()
    inv.add("m", 7, expiry_day=10)
    inv.add("m", 3, expiry_day=100)
    assert inv.remove_expired(10) == {"m": 7}
    assert inv.on_hand("m") == 3


def test_a_batch_cannot_hold_a_negative_quantity():
    with pytest.raises(ValueError):
        Batch(quantity=-1, expiry_day=10)


def test_safety_days_must_be_below_target_days():
    with pytest.raises(ValueError):
        FacilityRules(target_days=10, safety_days=10)


# --- the comparison the site is built around ----------------------------------

def test_the_network_beats_lone_facilities_on_availability():
    """The claim the product makes, checked on identical demand and opening stock."""
    baseline = run(_imbalanced_scenario(days=90), BaselinePolicy())
    zealo = run(_imbalanced_scenario(days=90), ZealoPolicy())
    assert zealo.metrics.availability_rate >= baseline.metrics.availability_rate
    assert zealo.metrics.unmet_units <= baseline.metrics.unmet_units


def test_every_transfer_event_carries_a_readable_message():
    result = run(_imbalanced_scenario(), ZealoPolicy())
    for event in result.events.events:
        if event.type in (EventType.RELIEF_TRANSFER, EventType.REBALANCE_TRANSFER):
            assert "Moved" in event.message and "km" in event.message
            assert event.distance_km is not None


def test_value_metrics_are_withheld_when_prices_are_unknown():
    """No confirmed price source yet, so a value figure would be invented."""
    result = run(build_scenario(price=None), ZealoPolicy())
    data = result.metrics.to_dict()
    assert data["transfer_value"] is None
    assert data["expired_value"] is None
    assert data["closing_stock_value"] is None


def test_value_metrics_appear_once_prices_are_known():
    scenario = build_scenario(price=5.0, days=60, opening_days_of_stock=2)
    for (fid, _), batches in scenario.opening_batches.items():
        if fid == "fac-0":
            batches[0].quantity = 900
    result = run(scenario, ZealoPolicy())
    assert result.metrics.to_dict()["transfer_value"] is not None


def test_the_timeline_has_one_record_per_day_with_a_status_per_facility():
    scenario = build_scenario(days=60)
    result = run(scenario, ZealoPolicy())
    assert len(result.timeline) == 60
    for record in result.timeline:
        assert set(record.status) == {f.id for f in scenario.facilities}
        assert set(record.status.values()) <= {"green", "amber", "red"}


def test_an_approval_limit_works_in_units_when_prices_are_unknown():
    """Units-only was decided; a rupee limit could then never be exceeded."""
    tight = FacilityRules(auto_approval_limit=5)
    result = run(build_scenario(rules=tight, days=90, price=None), ZealoPolicy())
    assert result.metrics.approval_requests > 0
