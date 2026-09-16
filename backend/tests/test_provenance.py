"""The provenance rules are load-bearing: an untagged number must not be constructible."""

from datetime import date

import pytest
from pydantic import ValidationError

from zealo.models.provenance import Provenance, Tagged, derived, estimated, real


def test_real_value_keeps_its_source_and_date():
    v = real(74.20, source_ids=["gadag_survey_2023"], retrieved=date(2026, 9, 16))
    assert v.value == 74.20
    assert v.provenance is Provenance.REAL
    assert v.source_ids == ["gadag_survey_2023"]
    assert v.retrieved == date(2026, 9, 16)


def test_real_value_without_a_source_is_rejected():
    with pytest.raises(ValidationError, match="at least one source_id"):
        Tagged[float](value=74.20, provenance=Provenance.REAL)


@pytest.mark.parametrize("prov", [Provenance.DERIVED, Provenance.ESTIMATED])
def test_derived_and_estimated_must_name_a_method(prov):
    with pytest.raises(ValidationError, match="must name the method"):
        Tagged[float](value=1.0, provenance=prov, source_ids=["x"])


def test_derived_and_estimated_shorthands_carry_their_method():
    d = derived(203.0, method="methods:taluk_annual_demand", source_ids=["ksmscl_indent_2025_26"])
    e = estimated(30, method="methods:starting_shelf_life")
    assert d.provenance is Provenance.DERIVED
    assert d.method == "methods:taluk_annual_demand"
    assert e.provenance is Provenance.ESTIMATED
    assert e.source_ids == []


def test_estimated_needs_no_source_but_still_needs_a_method():
    with pytest.raises(ValidationError):
        Tagged[int](value=30, provenance=Provenance.ESTIMATED)


def test_tagged_values_are_immutable():
    v = real(1, source_ids=["s"])
    with pytest.raises(ValidationError):
        v.value = 2


def test_provenance_serialises_to_the_string_the_ui_expects():
    v = real(1, source_ids=["s"])
    assert v.model_dump(mode="json")["provenance"] == "real"
