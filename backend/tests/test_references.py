"""data/references.csv must cover every source the app cites, and stay well-formed."""

import csv

from zealo.config import DATA_DIR
from zealo.sources_registry import SOURCES

REFERENCES = DATA_DIR / "references.csv"
STATUSES = {"used", "used_via_citation", "consulted_not_used", "blocked", "pending_manual",
            "rejected", "authorised_not_yet_used"}
# Registry entries that describe a class of source rather than one reference.
NOT_IN_REFERENCES = {"ogd_platforms", "unit_prices", "team_verification"}


def _rows():
    with REFERENCES.open(newline="") as fh:
        return list(csv.DictReader(fh))


def test_every_cited_source_is_in_the_references():
    ids = {r["ref_id"] for r in _rows()}
    missing = {s.id for s in SOURCES} - ids - NOT_IN_REFERENCES
    assert not missing, f"sources missing from data/references.csv: {sorted(missing)}"


def test_reference_ids_are_unique():
    ids = [r["ref_id"] for r in _rows()]
    assert len(ids) == len(set(ids))


def test_every_reference_has_a_known_status_and_a_purpose():
    for r in _rows():
        assert r["status"] in STATUSES, r["ref_id"]
        assert r["title"] and r["used_for"], r["ref_id"]


def test_anything_used_is_locatable():
    for r in _rows():
        if r["status"] == "used":
            assert r["url"] or r["raw_file"], r["ref_id"]
