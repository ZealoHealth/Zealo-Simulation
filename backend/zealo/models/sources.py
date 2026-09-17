"""The source registry.

One entry per real-world source. Every `Tagged` value references entries here by
`id`, so the Data Sources page can be generated rather than hand-maintained, and
so a number with no traceable origin fails a test instead of shipping.
"""

from __future__ import annotations

from datetime import date
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class AccessMethod(str, Enum):
    """How the raw file got into data/raw/ — recorded so runs are reproducible."""

    AUTOMATED = "automated"          # fetched by a pipeline script; robots.txt permits it
    MANUAL_DOWNLOAD = "manual"       # a human downloaded it (robots.txt disallows automation)
    PENDING = "pending"              # identified, not yet obtained


class Source(BaseModel):
    """A citable source, with its licence and its known limits."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(description="Stable key referenced by Tagged.source_ids.")
    title: str
    publisher: str
    url: HttpUrl | None = None
    licence: str = Field(description="Licence or terms of use, verbatim where possible.")
    attribution: str | None = Field(
        default=None, description="Credit line the UI is required to display."
    )
    what_was_taken: str = Field(description="Exactly which fields/tables we used.")
    retrieved: date | None = None
    access: AccessMethod = AccessMethod.PENDING
    raw_path: str | None = Field(
        default=None, description="Path under data/raw/ holding the untouched original."
    )
    limitations: list[str] = Field(
        default_factory=list,
        description="Known limits, shown in the UI. Never silently dropped.",
    )
    source_quality: str | None = Field(
        default=None,
        description="e.g. official_state_government, third_party_census_mirror.",
    )
