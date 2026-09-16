"""Source registry entries must stay citable."""

from datetime import date

import pytest
from pydantic import ValidationError

from zealo.models.sources import AccessMethod, Source


def test_source_records_licence_and_limits():
    s = Source(
        id="gadag_survey_2023",
        title="An Assessment of the Availability of Essential Medicines in Gadag Taluk",
        publisher="Cureus 15(5): e39341",
        url="https://doi.org/10.7759/cureus.39341",
        licence="CC BY 4.0",
        attribution="Tejesh S, Nagaveni SJ (2023), CC BY 4.0",
        what_was_taken="Tables 1, 2 and 3; Figure 1 values",
        retrieved=date(2026, 9, 16),
        access=AccessMethod.AUTOMATED,
        raw_path="data/raw/gadag_phc_survey_cureus_e39341.pdf",
        limitations=["Single-day snapshot", "PHCs anonymised as PHC 1-15"],
    )
    assert s.licence == "CC BY 4.0"
    assert s.limitations


def test_source_requires_a_licence():
    with pytest.raises(ValidationError):
        Source(id="x", title="t", publisher="p", what_was_taken="w")
