"""Provenance tagging.

Every number Zealo puts on screen must be traceable. This module provides the
single mechanism for that: a value is wrapped together with how we know it.

    real      taken directly from a source record, unmodified
    derived   calculated from real data using a formula documented in METHODS.md
    estimated modelled; not observed anywhere

The invariants below are enforced at construction time so that an untagged or
unsourced number cannot reach the API by accident.
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

T = TypeVar("T")


class Provenance(str, Enum):
    """How a value came to be known."""

    REAL = "real"
    DERIVED = "derived"
    ESTIMATED = "estimated"

    @property
    def needs_method(self) -> bool:
        """Derived and estimated values must document how they were produced."""
        return self in (Provenance.DERIVED, Provenance.ESTIMATED)


class Tagged(BaseModel, Generic[T]):
    """A value plus the evidence for it.

    Examples:
        Tagged(value=74.20, provenance=REAL, source_ids=["gadag_survey_2023"])
        Tagged(value=203.0, provenance=DERIVED, source_ids=["ksmscl_indent_2025_26",
               "census_2011"], method="methods:taluk_annual_demand")
    """

    model_config = ConfigDict(frozen=True)

    value: T
    provenance: Provenance
    source_ids: list[str] = Field(default_factory=list)
    retrieved: date | None = None
    method: str | None = Field(
        default=None,
        description="Anchor into data/METHODS.md, e.g. 'methods:taluk_annual_demand'.",
    )
    note: str | None = Field(
        default=None, description="Plain-language caveat shown in the UI on hover."
    )

    @model_validator(mode="after")
    def _check_evidence(self) -> Tagged[T]:
        if self.provenance is Provenance.REAL and not self.source_ids:
            raise ValueError("a 'real' value must cite at least one source_id")
        if self.provenance.needs_method and not self.method:
            raise ValueError(
                f"a '{self.provenance.value}' value must name the method that produced it"
            )
        return self


def real(value: T, *, source_ids: list[str], retrieved: date | None = None, **kw) -> Tagged[T]:
    """Shorthand for a value copied straight out of a source."""
    return Tagged[T](
        value=value,
        provenance=Provenance.REAL,
        source_ids=source_ids,
        retrieved=retrieved,
        **kw,
    )


def derived(value: T, *, method: str, source_ids: list[str] | None = None, **kw) -> Tagged[T]:
    """Shorthand for a value computed from real data by a documented formula."""
    return Tagged[T](
        value=value,
        provenance=Provenance.DERIVED,
        source_ids=source_ids or [],
        method=method,
        **kw,
    )


def estimated(value: T, *, method: str, source_ids: list[str] | None = None, **kw) -> Tagged[T]:
    """Shorthand for a modelled value that is not observed in any source."""
    return Tagged[T](
        value=value,
        provenance=Provenance.ESTIMATED,
        source_ids=source_ids or [],
        method=method,
        **kw,
    )
