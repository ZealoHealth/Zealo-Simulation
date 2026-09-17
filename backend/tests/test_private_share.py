"""Private facilities' demand share: NSS 75th round, Karnataka, verified against the PDF."""

import json

import pytest

from zealo.config import MANUAL_DIR, PROCESSED_DIR, REPO_ROOT
from zealo.pipeline.private_share import (
    AreaShares,
    PrivateShare,
    load_private_share,
    validate,
    verify_against_pdf,
)

PDF = REPO_ROOT / "data/raw/private_share/nss75_key_indicators_health.pdf"
needs_pdf = pytest.mark.skipif(not PDF.exists(), reason="NSS key indicators PDF not present")


def _share(**overrides) -> PrivateShare:
    base = dict(
        rural=AreaShares(29.0, 35.3, 35.4, 0.2),
        urban=AreaShares(14.1, 55.0, 29.0, 2.0),
        urban_population=191375,
        rural_population=175883,
        geography="Karnataka",
        source={"raw_snapshot": "data/raw/private_share/nss75_key_indicators_health.pdf"},
    )
    base.update(overrides)
    return PrivateShare(**base)


def test_the_ratio_is_private_treated_ailments_per_government_one():
    area = AreaShares(
        government_pct=20, private_hospital_pct=30, private_clinic_pct=50, other_pct=0
    )
    assert area.ratio == pytest.approx(4.0)


def test_rural_and_urban_are_weighted_by_the_taluks_own_population():
    share = _share()
    assert share.urban_weight == pytest.approx(191375 / 367258)
    government = share.urban_weight * 14.1 + (1 - share.urban_weight) * 29.0
    private = share.urban_weight * 84.0 + (1 - share.urban_weight) * 70.7
    assert share.ratio == pytest.approx(private / government)
    assert share.ratio == pytest.approx(3.656, abs=0.001)


def test_karnataka_is_more_private_in_towns_than_villages():
    share = _share()
    assert share.urban.ratio > share.rural.ratio


def test_shares_that_do_not_sum_to_100_are_rejected():
    bad = _share(rural=AreaShares(29.0, 35.3, 10.0, 0.2))
    assert any("sum to" in p for p in validate(bad))


def test_the_population_split_must_match_the_verified_taluk_total():
    assert not validate(_share(), taluk_total=367258)
    assert any("does not equal" in p for p in validate(_share(), taluk_total=400000))


@needs_pdf
def test_the_recorded_figures_match_table_a8():
    assert verify_against_pdf(load_private_share(), PDF) == []


@needs_pdf
def test_a_mistyped_figure_is_caught_against_the_pdf():
    wrong = _share(urban=AreaShares(41.4, 55.0, 29.0, 2.0))
    problems = verify_against_pdf(wrong, PDF)
    assert problems and "government/public hospital" in problems[0]


def test_the_committed_manual_file_is_valid():
    assert not validate(load_private_share(MANUAL_DIR / "private_share.json"), 367258)


@pytest.mark.skipif(
    not (PROCESSED_DIR / "private_share.json").exists(), reason="run make data first"
)
def test_the_processed_ratio_is_marked_derived_and_verified():
    data = json.loads((PROCESSED_DIR / "private_share.json").read_text())
    assert data["provenance"] == "derived"
    assert data["machine_verified"] is True
    assert data["private_to_government_ratio"] == pytest.approx(3.656, abs=0.001)
