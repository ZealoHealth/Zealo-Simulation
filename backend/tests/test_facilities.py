"""Facility list construction.

The load-bearing test here is `test_no_real_facility_name_reaches_processed_output`.
Real names must never leave data/raw/ and the verification sheet, and a review note
that quoted a neighbouring facility's name did leak one during development.
"""

import json

import pytest

from zealo.config import PROCESSED_DIR, RAW_DIR
from zealo.pipeline.facilities import (
    CLINIC,
    DISTRICT_HOSPITAL,
    GOVERNMENT_OTHER,
    PHARMACY,
    PHC,
    OsmRecord,
    build_facilities,
    classify_ownership,
    classify_type,
    exclusion_reason,
    group_duplicates,
    haversine_m,
    load_boundary,
    load_osm_records,
    name_similarity,
    point_in_rings,
    stitch_rings,
)

OSM_DIR = RAW_DIR / "osm"
HEALTH_JSON = OSM_DIR / "overpass_gadag_health_20260916.json"
BOUNDARY_JSON = OSM_DIR / "overpass_gadag_taluk_boundary_20260916.json"

needs_raw = pytest.mark.skipif(
    not (HEALTH_JSON.exists() and BOUNDARY_JSON.exists()),
    reason="raw OSM extracts not present",
)


# --- geometry ----------------------------------------------------------------

def test_haversine_matches_a_known_distance():
    # One degree of latitude is about 111 km anywhere on the globe.
    assert 110_000 < haversine_m(15.0, 75.0, 16.0, 75.0) < 112_000


def test_haversine_is_zero_for_the_same_point():
    assert haversine_m(15.43, 75.63, 15.43, 75.63) == 0.0


def test_stitch_rings_joins_fragments_in_any_direction():
    # A unit square delivered as three fragments, one of them reversed.
    ways = [
        [(0.0, 0.0), (0.0, 1.0)],
        [(1.0, 1.0), (0.0, 1.0)],  # reversed
        [(1.0, 1.0), (1.0, 0.0), (0.0, 0.0)],
    ]
    rings = stitch_rings(ways)
    assert len(rings) == 1
    assert rings[0][0] == rings[0][-1], "ring should close"


def test_point_in_rings():
    square = [[(0.0, 0.0), (0.0, 2.0), (2.0, 2.0), (2.0, 0.0), (0.0, 0.0)]]
    assert point_in_rings(1.0, 1.0, square)
    assert not point_in_rings(3.0, 1.0, square)


# --- classification ----------------------------------------------------------

@pytest.mark.parametrize(
    "tags,expected",
    [
        ({"name": "Hulkoti PHC", "amenity": "clinic"}, PHC),
        (
            {"name": "Government Hospital, Gadag", "description": "District Hospital"},
            DISTRICT_HOSPITAL,
        ),
        ({"name": "Railway Hospital", "amenity": "hospital"}, GOVERNMENT_OTHER),
        ({"name": "Mulagund Government Hospital", "amenity": "hospital"}, GOVERNMENT_OTHER),
        ({"name": "Vikram Medicals", "amenity": "pharmacy"}, PHARMACY),
        ({"name": "Ashwini Clinic", "amenity": "clinic"}, CLINIC),
        ({"name": "Dr. Amaresh Hombal", "amenity": "doctors"}, CLINIC),
    ],
)
def test_type_classification(tags, expected):
    assert classify_type(tags)[0] == expected


def test_a_government_facility_of_unknown_level_is_not_called_a_taluk_hospital():
    """The level decides the medicine list, so guessing it would be inventing data."""
    facility_type, flags = classify_type({"name": "Railway Hospital", "amenity": "hospital"})
    assert facility_type == GOVERNMENT_OTHER
    assert "unclear_government_level" in flags


def test_a_generic_primary_health_name_is_flagged():
    facility_type, flags = classify_type({"name": "Primary Health Care", "amenity": "clinic"})
    assert facility_type == PHC
    assert "generic_phc_name" in flags


def test_an_explicit_phc_is_not_flagged():
    assert "generic_phc_name" not in classify_type({"name": "Hulkoti PHC"})[1]


@pytest.mark.parametrize(
    "tags,expected",
    [
        ({"name": "Hulkoti PHC"}, "government"),
        ({"name": "Kasturba Hospital, Gadag", "amenity": "hospital"}, "private"),
        ({"name": "Ashwini Clinic", "amenity": "clinic"}, "private"),
    ],
)
def test_ownership_inference(tags, expected):
    assert classify_ownership(classify_type(tags)[0], tags) == expected


@pytest.mark.parametrize(
    "name,excluded",
    [
        ("Veterinary Hospital", True),
        ("Dr. Khona Blood bank", True),
        ("Kasturba Hospital, Gadag", False),
    ],
)
def test_non_human_medicine_facilities_are_excluded(name, excluded):
    assert (exclusion_reason({"name": name}) is not None) is excluded


# --- de-duplication ----------------------------------------------------------

def _rec(i, name, lat, lon):
    return OsmRecord(osm_id=f"node/{i}", name=name, lat=lat, lon=lon, tags={"name": name})


def test_the_same_facility_mapped_twice_is_merged():
    records = [
        _rec(1, "PHC, Betigeri", 15.44058, 75.65446),
        _rec(2, "Phc Betageri", 15.44052, 75.65451),
    ]
    clusters, _ = group_duplicates(records)
    assert len(clusters) == 1


def test_different_practices_sharing_a_surname_are_not_merged():
    """'J C Shirol' and 'V C Shirol' are metres apart but are different practices.

    A substring/token-set score called them identical and collapsed four records
    into one, erasing real facilities.
    """
    records = [
        _rec(1, "J C Shirol Nursing Home", 15.43122, 75.63725),
        _rec(2, "V C Shirol Nursing Home", 15.43121, 75.63712),
    ]
    clusters, suspects = group_duplicates(records)
    assert len(clusters) == 2, "must not merge"
    assert suspects, "but must be raised for a human to judge"


def test_distant_facilities_with_similar_names_are_not_merged():
    records = [
        _rec(1, "Sanjeevini Hospital", 15.43216, 75.64124),
        _rec(2, "Sanjivini Hospital", 15.44491, 75.64619),
    ]
    assert len(group_duplicates(records)[0]) == 2


def test_name_similarity_ignores_generic_words():
    assert name_similarity("Shirol Nursing Home", "Shirol Hospital") > 90


# --- full build --------------------------------------------------------------

@pytest.fixture(scope="module")
def built():
    rings = load_boundary(BOUNDARY_JSON)
    records = load_osm_records(HEALTH_JSON)
    return build_facilities(records, rings), rings


@needs_raw
def test_every_facility_has_coordinates_inside_the_taluk_boundary(built):
    (facilities, _), rings = built
    for f in facilities:
        assert f.inside_boundary, f"{f.internal_id} is outside the boundary"
        assert point_in_rings(f.lat, f.lon, rings)


@needs_raw
def test_every_facility_carries_a_source_and_a_label(built):
    (facilities, _), _ = built
    for f in facilities:
        assert f.osm_ids, f"{f.internal_id} has no source reference"
        assert f.display_label and f.internal_id


@needs_raw
def test_display_labels_are_unique(built):
    (facilities, _), _ = built
    labels = [f.display_label for f in facilities]
    assert len(set(labels)) == len(labels)


@needs_raw
def test_labels_are_stable_across_runs(built):
    """Labels are what the site shows, so they must not shuffle between builds."""
    (facilities, _), rings = built
    again, _ = build_facilities(load_osm_records(HEALTH_JSON), rings)
    assert [(f.internal_id, f.lat, f.lon) for f in facilities] == [
        (f.internal_id, f.lat, f.lon) for f in again
    ]


@needs_raw
def test_veterinary_and_blood_bank_are_excluded_with_a_reason(built):
    (_, excluded), _ = built
    reasons = {e["reason"] for e in excluded}
    assert any("veterinary" in r for r in reasons)
    assert all(e["reason"] for e in excluded), "an exclusion must say why"


@needs_raw
def test_no_facility_starts_out_verified(built):
    """The list is not usable until a human checks it."""
    (facilities, _), _ = built
    assert not any(f.verified for f in facilities)


@needs_raw
def test_review_flags_never_contain_a_real_facility_name(built):
    (facilities, _), _ = built
    names = {
        e.get("tags", {}).get("name", "")
        for e in json.loads(HEALTH_JSON.read_text())["elements"]
    }
    names = {n for n in names if n}
    for f in facilities:
        for flag in f.review_flags:
            assert not any(n in flag for n in names)


@pytest.mark.skipif(
    not (PROCESSED_DIR / "facilities.csv").exists(),
    reason="run data/pipeline/03_build_facilities.py first",
)
@needs_raw
def test_no_real_facility_name_reaches_processed_output():
    """Hard rule: real names live in data/raw/ only and never reach the website."""
    names = {
        e.get("tags", {}).get("name", "")
        for e in json.loads(HEALTH_JSON.read_text())["elements"]
    }
    names = {n for n in names if n}
    assert names, "expected the raw extract to contain real names"
    for path in PROCESSED_DIR.glob("*"):
        text = path.read_text()
        leaked = sorted(n for n in names if n in text)
        assert not leaked, f"{path.name} leaks real facility names: {leaked}"
