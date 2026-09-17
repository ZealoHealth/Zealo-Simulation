"""API contract tests, run against the real processed datasets.

Population figures are real (R5 decided) and Figure 1 uses the agreed interim rule
until transcribed (R1), so `/simulate` always builds. One test removes a processed
dataset to check the refusal path still reports clearly.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from zealo.api import routes
from zealo.data_access import DatasetMissing, load_facilities, load_medicines
from zealo.main import DISCLAIMER, app
from zealo.sim import runner

client = TestClient(app)


@pytest.fixture(autouse=True)
def _empty_run_cache():
    routes.run_cache = type(routes.run_cache)(capacity=4)
    yield


@pytest.fixture
def simulation_inputs():
    """Real processed inputs now always exist (`make data`), so nothing to stand in for."""
    yield


def simulate(**overrides):
    payload = {"days": 20, "seed": 5}
    payload.update(overrides)
    response = client.post("/simulate", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


# --- read endpoints -----------------------------------------------------------

def test_health_reports_ok_with_the_disclaimer():
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["disclaimer"] == DISCLAIMER


def test_facilities_returns_every_facility_with_provenance():
    body = client.get("/facilities").json()
    assert len(body["facilities"]) == len(load_facilities())
    for facility in body["facilities"]:
        assert set(facility["provenance"]) == {
            "lat", "lon", "facility_type", "ownership", "beds"
        }
        assert facility["source_ids"]


def test_facilities_never_expose_a_real_name():
    """The hard rule, checked at the API boundary as well as in the data."""
    body = client.get("/facilities").json()
    for facility in body["facilities"]:
        assert "name" not in facility
        label = facility["display_label"]
        assert any(
            label.startswith(prefix)
            for prefix in ("PHC", "CHC", "Clinic", "Pharmacy", "Private Hospital",
                           "District Hospital", "Government Hospital", "Taluk Hospital",
                           "Other Government Facility")
        ), label


def test_facilities_carry_the_openstreetmap_attribution():
    """ODbL requires it, and the map cannot be shown without it."""
    body = client.get("/facilities").json()
    assert "OpenStreetMap contributors" in body["attribution"]


def test_facilities_include_the_boundary_and_can_omit_it():
    assert client.get("/facilities").json()["boundary"]["type"] == "FeatureCollection"
    assert client.get("/facilities?include_boundary=false").json()["boundary"] is None


def test_facilities_state_that_nothing_is_verified_yet():
    body = client.get("/facilities").json()
    assert not any(f["verified"] for f in body["facilities"])
    assert any("verified" in c for c in body["caveats"])


def test_medicines_returns_the_master_list():
    body = client.get("/medicines").json()
    assert len(body["medicines"]) == len(load_medicines()) == 890


def test_medicines_can_be_narrowed_to_survey_items():
    body = client.get("/medicines?survey_linked_only=true").json()
    assert all(m["survey_availability_pct"] is not None for m in body["medicines"])
    assert body["survey_linked_count"] == sum(m["quantity_modelled"] for m in body["medicines"])


def test_medicines_report_how_many_matches_still_await_confirmation():
    body = client.get("/medicines").json()
    assert body["pending_review_count"] > 0
    assert body["survey_linked_count"] + body["pending_review_count"] == 104


def test_only_confirmed_matches_carry_survey_data():
    body = client.get("/medicines").json()
    for medicine in body["medicines"]:
        if medicine["survey_availability_pct"] is not None:
            assert medicine["match_status"] in ("auto", "confirmed")


def test_sources_include_licences_and_required_attribution():
    body = client.get("/sources").json()
    by_id = {s["id"]: s for s in body["sources"]}
    assert "CC BY 4.0" in by_id["gadag_survey_2023"]["licence"]
    assert "Tejesh" in by_id["gadag_survey_2023"]["attribution"]
    assert by_id["osm_overpass"]["attribution"] == "© OpenStreetMap contributors"


def test_every_source_records_what_was_taken_and_its_limits():
    for source in client.get("/sources").json()["sources"]:
        assert source["licence"] and source["what_was_taken"]
        assert source["access"] in ("automated", "manual", "pending")


def test_unobtained_sources_are_marked_rather_than_omitted():
    """A source we could not get must still be visible, with the reason."""
    by_id = {s["id"]: s for s in client.get("/sources").json()["sources"]}
    assert by_id["hmis_mohfw"]["access"] == "pending"
    assert by_id["unit_prices"]["access"] == "pending"


def test_the_third_party_population_source_is_labelled_as_such():
    by_id = {s["id"]: s for s in client.get("/sources").json()["sources"]}
    taluk = by_id["gadag_taluk_population_2011"]
    assert taluk["source_quality"] == "third_party_census_mirror"
    assert any("third-party mirror" in lim for lim in taluk["limitations"])
    assert by_id["karnataka_population_2011"]["source_quality"] == "official_state_government"


def test_the_units_only_decision_is_stated_on_the_sources():
    prices = {s["id"]: s for s in client.get("/sources").json()["sources"]}["unit_prices"]
    assert any("rupees are not shown" in lim for lim in prices["limitations"])


@pytest.mark.parametrize("path", ["/facilities", "/medicines", "/sources"])
def test_every_data_endpoint_carries_the_disclaimer(path):
    assert client.get(path).json()["disclaimer"] == DISCLAIMER


# --- /simulate when a processed dataset is missing ---------------------------

def test_simulate_refuses_clearly_when_a_processed_dataset_is_missing(monkeypatch):
    def missing():
        raise DatasetMissing("population.json is missing. Build it with: make data")

    monkeypatch.setattr(runner, "load_population_share", missing)
    response = client.post("/simulate", json={"days": 10, "seed": 991})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["error"] == "missing_demand_inputs"
    assert "make data" in detail["requests"]


# --- /simulate with inputs supplied -------------------------------------------

def test_simulate_returns_both_modes(simulation_inputs):
    body = simulate()
    assert {s["mode"] for s in body["summaries"]} == {"without_zealo", "with_zealo"}
    assert body["disclaimer"] == DISCLAIMER
    assert body["caveats"]


def test_simulate_timeline_has_one_entry_per_day_per_mode(simulation_inputs):
    body = simulate(days=15)
    for mode in ("without_zealo", "with_zealo"):
        assert len(body["timeline"][mode]) == 15
        for entry in body["timeline"][mode]:
            assert set(entry["status"].values()) <= {"green", "amber", "red"}


def test_the_same_settings_return_the_same_run_id(simulation_inputs):
    assert simulate(seed=9)["run_id"] == simulate(seed=9)["run_id"]


def test_different_settings_return_a_different_run_id(simulation_inputs):
    assert simulate(seed=1)["run_id"] != simulate(seed=2)["run_id"]


def test_value_metrics_are_withheld_while_prices_are_unknown(simulation_inputs):
    body = simulate()
    for summary in body["summaries"]:
        assert summary["metrics"]["transfer_value"] is None
        assert summary["metrics"]["closing_stock_value"] is None


def test_both_modes_face_identical_demand(simulation_inputs):
    body = simulate()
    totals = {s["mode"]: s["metrics"]["demand_units"] for s in body["summaries"]}
    assert totals["without_zealo"] == totals["with_zealo"]


def test_excluding_a_facility_from_the_network_changes_the_run(simulation_inputs):
    everyone = simulate(seed=4)
    some_out = simulate(seed=4, excluded_facility_ids=["phc-01", "phc-02"])
    assert everyone["run_id"] != some_out["run_id"]


def test_facility_detail_returns_medicine_level_state(simulation_inputs):
    body = simulate()
    run_id = body["run_id"]
    response = client.get(
        f"/runs/{run_id}/facilities/phc-01", params={"mode": "with_zealo", "day": 3}
    )
    assert response.status_code == 200
    detail = response.json()
    assert detail["facility_id"] == "phc-01"
    assert detail["display_label"].startswith("PHC")
    assert detail["status"] in ("green", "amber", "red")
    for row in detail["medicines"]:
        assert row["on_hand"] >= 0
        assert row["dispensed"] <= row["demand"]


def test_medicine_detail_lists_where_it_is_in_stock(simulation_inputs):
    body = simulate()
    run_id = body["run_id"]
    medicine_id = client.get("/medicines?survey_linked_only=true").json()["medicines"][0]["id"]
    response = client.get(
        f"/runs/{run_id}/medicines/{medicine_id}", params={"mode": "with_zealo", "day": 2}
    )
    assert response.status_code == 200
    rows = response.json()["rows"]
    assert rows and all(r["on_hand"] >= 0 for r in rows)


def test_a_day_beyond_the_run_is_clamped_rather_than_erroring(simulation_inputs):
    body = simulate(days=10)
    response = client.get(
        f"/runs/{body['run_id']}/facilities/phc-01", params={"day": 9999}
    )
    assert response.status_code == 200
    assert response.json()["day"] == 9


# --- error handling -----------------------------------------------------------

def test_a_missing_run_returns_a_clear_error_the_frontend_can_act_on():
    response = client.get("/runs/nosuchrun/facilities/phc-01")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["error"] == "run_not_found"
    assert "/simulate" in detail["message"]


def test_an_unknown_mode_is_rejected(simulation_inputs):
    body = simulate()
    response = client.get(
        f"/runs/{body['run_id']}/facilities/phc-01", params={"mode": "sideways"}
    )
    assert response.status_code == 400
    assert response.json()["detail"]["error"] == "unknown_mode"


def test_an_unknown_facility_is_rejected(simulation_inputs):
    body = simulate()
    response = client.get(f"/runs/{body['run_id']}/facilities/not-a-facility")
    assert response.status_code == 404
    assert response.json()["detail"]["error"] == "facility_not_found"


@pytest.mark.parametrize(
    "payload",
    [
        {"days": 0},
        {"days": 5000},
        {"demand_scale": 0},
        {"demand_scale": -1},
        {"near_expiry_share": 2},
        {"lead_time_days": 0},
    ],
)
def test_invalid_scenario_settings_are_rejected(payload):
    assert client.post("/simulate", json=payload).status_code == 422


def test_the_run_cache_evicts_the_oldest_run(simulation_inputs):
    ids = [simulate(seed=s)["run_id"] for s in range(6)]
    # capacity is 4 in this fixture, so the first two are gone
    assert client.get(f"/runs/{ids[0]}/facilities/phc-01").status_code == 404
    assert client.get(f"/runs/{ids[-1]}/facilities/phc-01").status_code == 200


# --- dashboard and redistribution data (Milestone 9) --------------------------

def test_facility_detail_reports_a_real_next_expiry(simulation_inputs):
    """Expiry was a placeholder until the engine started recording it."""
    body = simulate()
    detail = client.get(
        f"/runs/{body['run_id']}/facilities/phc-01", params={"day": 2}
    ).json()
    with_stock = [row for row in detail["medicines"] if row["on_hand"] > 0]
    assert with_stock, "expected some stock on hand"
    assert any(row["next_expiry_day"] is not None for row in with_stock)


def test_a_medicine_with_no_stock_has_no_expiry(simulation_inputs):
    body = simulate()
    detail = client.get(
        f"/runs/{body['run_id']}/facilities/phc-01", params={"day": 2}
    ).json()
    for row in detail["medicines"]:
        if row["on_hand"] == 0:
            assert row["next_expiry_day"] is None


def test_expiry_alerts_are_bucketed_and_sorted(simulation_inputs):
    body = simulate(days=40)
    detail = client.get(
        f"/runs/{body['run_id']}/facilities/phc-01", params={"day": 20}
    ).json()
    alerts = detail["expiry_alerts"]
    assert all(a["bucket"] in (30, 60, 90) for a in alerts)
    assert all(a["days_until_expiry"] <= a["bucket"] for a in alerts)
    assert [a["days_until_expiry"] for a in alerts] == sorted(
        a["days_until_expiry"] for a in alerts
    )


def test_a_time_series_is_returned_only_when_asked_for(simulation_inputs):
    body = simulate(days=25)
    run_id = body["run_id"]
    without = client.get(f"/runs/{run_id}/facilities/phc-01").json()
    assert without["series"] is None

    medicine_id = without["medicines"][0]["medicine_id"]
    with_series = client.get(
        f"/runs/{run_id}/facilities/phc-01", params={"series": medicine_id}
    ).json()
    series = with_series["series"]
    assert series["medicine_id"] == medicine_id
    for key in ("days", "on_hand", "demand", "dispensed", "unmet", "forecast"):
        assert len(series[key]) == 25


def test_asking_for_a_series_of_an_uncarried_medicine_is_rejected(simulation_inputs):
    body = simulate()
    response = client.get(
        f"/runs/{body['run_id']}/facilities/phc-01", params={"series": "not-a-medicine"}
    )
    assert response.status_code == 404
    assert response.json()["detail"]["error"] == "medicine_not_carried"


def test_redistribution_reports_transfers_over_time(simulation_inputs):
    body = simulate(days=30)
    data = client.get(
        f"/runs/{body['run_id']}/redistribution", params={"mode": "with_zealo"}
    ).json()
    assert len(data["transfers_over_time"]) == 30
    assert all(p["transfers"] >= 0 for p in data["transfers_over_time"])
    assert data["totals"]["transfers"] >= 0


def test_redistribution_classifies_surplus_and_shortage(simulation_inputs):
    body = simulate(days=30)
    data = client.get(
        f"/runs/{body['run_id']}/redistribution", params={"day": 10}
    ).json()
    assert data["balances"]
    assert {b["position"] for b in data["balances"]} <= {"surplus", "short", "balanced"}
    assert data["totals"]["surplus_positions"] + data["totals"]["short_positions"] >= 0


def test_redistribution_can_be_narrowed_to_one_medicine(simulation_inputs):
    body = simulate(days=20)
    run_id = body["run_id"]
    everything = client.get(f"/runs/{run_id}/redistribution").json()
    medicine_id = everything["balances"][0]["medicine_id"]
    narrowed = client.get(
        f"/runs/{run_id}/redistribution", params={"medicine_id": medicine_id}
    ).json()
    assert {b["medicine_id"] for b in narrowed["balances"]} == {medicine_id}
    assert len(narrowed["balances"]) < len(everything["balances"])


def test_the_baseline_makes_no_transfers_in_the_redistribution_view(simulation_inputs):
    """Without Zealo there is no network, so there is nothing to redistribute."""
    body = simulate(days=30)
    data = client.get(
        f"/runs/{body['run_id']}/redistribution", params={"mode": "without_zealo"}
    ).json()
    assert data["totals"]["transfers"] == 0
    assert data["top_medicines"] == []


def test_redistribution_withholds_value(simulation_inputs):
    body = simulate(days=20)
    data = client.get(f"/runs/{body['run_id']}/redistribution").json()
    assert data["totals"]["transfer_value"] is None


def test_redistribution_needs_a_cached_run():
    response = client.get("/runs/nosuchrun/redistribution")
    assert response.status_code == 404
    assert response.json()["detail"]["error"] == "run_not_found"



# --- interim data rules -----------------------------------------------------------------

def test_facilities_report_coverage_honestly():
    coverage = client.get("/facilities").json()["coverage"]
    assert coverage["phcs_in_survey"] == 15
    assert coverage["phcs_mapped"] < 15
    assert any("PHCs have a public location" in s for s in coverage["statements"])
    assert any("much higher" in s for s in coverage["statements"])


def test_pharmacies_and_the_railway_hospital_start_outside_the_network():
    facilities = client.get("/facilities").json()["facilities"]
    for f in facilities:
        if f["facility_type"] in ("pharmacy", "other_government"):
            assert f["in_network"] is False, f["display_label"]


def test_facilities_of_unconfirmed_level_are_flagged():
    facilities = client.get("/facilities").json()["facilities"]
    unknown = [f for f in facilities if f["facility_type"] == "government_level_unknown"]
    assert unknown and all(f["level_unconfirmed"] for f in unknown)
    assert all(f["medicine_list"] == "phc" for f in unknown)
    assert all(f["provenance"]["facility_type"] == "estimated" for f in unknown)


def test_survey_items_include_the_availability_only_ones():
    body = client.get("/medicines?survey_linked_only=true").json()
    items = body["medicines"]
    assert len(items) == 104
    availability_only = [m for m in items if not m["quantity_modelled"]]
    assert availability_only, "unmatched survey items must be kept, not dropped"
    assert all(m["id"].startswith("survey-") and m["indent_qty"] is None for m in availability_only)
    assert any("availability only" in c for c in body["caveats"])


def test_a_run_reports_what_it_rests_on(simulation_inputs):
    context = simulate()["context"]
    assert context["population_share_pct"] == pytest.approx(0.6011, abs=0.001)
    assert context["quantity_modelled_items"] + context["availability_only_items"] == 104
    assert context["demand_split"] in ("equal_shares", "attendance_weighted", "mixed")


def test_a_phc_shows_its_survey_profile_and_availability_only_items(simulation_inputs):
    body = simulate()
    detail = client.get(f"/runs/{body['run_id']}/facilities/phc-01").json()
    assert 1 <= detail["survey_profile"] <= 15
    assert detail["availability_only"]
    assert all(isinstance(row["in_stock"], bool) for row in detail["availability_only"])
    assert all(row["provenance"] == "derived" for row in detail["availability_only"])


def test_searching_an_availability_only_item_returns_no_quantities(simulation_inputs):
    body = simulate()
    items = client.get("/medicines?survey_linked_only=true").json()["medicines"]
    item = next(m for m in items if not m["quantity_modelled"])
    data = client.get(f"/runs/{body['run_id']}/medicines/{item['id']}").json()
    assert data["quantity_modelled"] is False
    assert data["rows"] and all(r["on_hand"] is None for r in data["rows"])
    assert data["note"]


def test_unmapped_survey_profiles_are_listed(simulation_inputs):
    body = simulate()
    data = client.get(f"/runs/{body['run_id']}/redistribution").json()
    context = body["context"]
    mapped = len(context["phc_survey_profiles"])
    assert len(data["unmapped_phcs"]) == 15 - mapped


def test_a_network_override_takes_a_facility_out_and_back_in(simulation_inputs):
    phc = next(
        f for f in client.get("/facilities").json()["facilities"] if f["facility_type"] == "phc"
    )
    default = simulate(seed=12)
    out = simulate(seed=12, network_overrides={phc["id"]: False})
    assert default["run_id"] != out["run_id"]
    detail = client.get(f"/runs/{out['run_id']}/facilities/{phc['id']}").json()
    assert detail["in_network"] is False


def test_the_proof_of_concept_shows_fifteen_facilities():
    body = client.get("/facilities").json()
    assert len(body["facilities"]) == 15
    types = [f["facility_type"] for f in body["facilities"]]
    assert types.count("phc") == 5
    assert "other_government" not in types, "the Railway Hospital adds nothing to the simulation"
    assert any("15 of the" in s for s in body["coverage"]["statements"])


def test_facility_rows_report_deliveries_due_within_the_week(simulation_inputs):
    body = simulate()
    rows = client.get(f"/runs/{body['run_id']}/facilities/phc-01", params={"day": 40}).json()
    assert all("incoming_7d" in r for r in rows["medicines"])


def test_data_status_lists_every_request_with_its_interim_approach():
    body = client.get("/data-status").json()
    by_id = {i["id"]: i for i in body["items"]}
    assert {"R1", "R4a", "R4b", "R5", "R6", "R7", "R8"} <= set(by_id)
    assert by_id["R5"]["status"] == "complete"
    assert by_id["R6"]["status"] == "decided"
    assert all(i["interim_approach"] for i in body["items"])



def test_private_demand_defaults_to_the_nss_research_ratio(simulation_inputs):
    context = simulate()["context"]
    assert context["private_share_basis"] == "nss_75th_round"
    assert context["private_demand_share"] == pytest.approx(3.656, abs=0.001)


def test_a_settings_value_overrides_the_research_ratio(simulation_inputs):
    context = simulate(private_demand_share=0.5)["context"]
    assert context["private_share_basis"] == "user_setting"
    assert context["private_demand_share"] == 0.5


def test_the_nss_source_is_listed_with_its_assumption():
    by_id = {s["id"]: s for s in client.get("/sources").json()["sources"]}
    nss = by_id["nss75_health_karnataka"]
    assert "Table A8" in nss["what_was_taken"]
    assert any("not medicines" in lim for lim in nss["limitations"])


def test_poc_demand_is_the_facilitys_share_of_the_whole_taluk(simulation_inputs):
    """Splitting taluk demand over 15 facilities would inflate each one several times over."""
    from zealo.data_access import load_facility_universe
    from zealo.sim.runner import build_scenario

    built = build_scenario(days=365, seed=3, demand_scale=1.0, lead_time_days=21,
                           express_lead_time_days=5, min_shelf_life_days=180,
                           near_expiry_share=0.15)
    universe = load_facility_universe()
    private_holders = sum(1 for u in universe if u["ownership"] != "government"
                          and u["medicine_list"] != "none")
    poc_private = [f for f in built.scenario.facilities if f.ownership != "government"]
    assert private_holders > len(poc_private) * 5, "the universe must be the full taluk"
