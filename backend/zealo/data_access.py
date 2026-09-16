"""Load the processed datasets the API serves.

Everything here reads `data/processed/`, which is produced by the re-runnable
scripts in `data/pipeline/` and contains **no real facility names**. Files are
read once and cached, since they change only when a pipeline is re-run.

If a dataset is missing, loading raises with the command that builds it rather
than returning empty data -- a silently empty facility list would look like a
taluk with no hospitals.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from zealo.config import PROCESSED_DIR

FACILITIES_CSV = PROCESSED_DIR / "facilities.csv"
MEDICINES_CSV = PROCESSED_DIR / "medicines.csv"
SURVEY_MATCHES_CSV = PROCESSED_DIR / "survey_item_matches.csv"
BOUNDARY_GEOJSON = PROCESSED_DIR / "gadag_taluk_boundary.geojson"

_BUILD_COMMANDS = {
    FACILITIES_CSV: "python data/pipeline/03_build_facilities.py",
    MEDICINES_CSV: "python data/pipeline/02_extract_indent_and_match.py",
    SURVEY_MATCHES_CSV: "python data/pipeline/02_extract_indent_and_match.py",
    BOUNDARY_GEOJSON: "python data/pipeline/03_build_facilities.py",
}


class DatasetMissing(RuntimeError):
    """A processed dataset has not been built yet."""


def _require(path: Path) -> Path:
    if not path.exists():
        command = _BUILD_COMMANDS.get(path, "the data pipeline")
        raise DatasetMissing(f"{path} is missing. Build it with: {command}")
    return path


def _read_csv(path: Path) -> list[dict[str, str]]:
    with _require(path).open(newline="") as fh:
        return list(csv.DictReader(fh))


def _as_bool(value: str) -> bool:
    return str(value).strip().lower() in ("true", "1", "yes")


def _as_int(value: str) -> int | None:
    value = str(value).strip()
    return int(value) if value.isdigit() else None


@dataclass(frozen=True)
class FacilityRecord:
    internal_id: str
    display_label: str
    facility_type: str
    ownership: str
    lat: float
    lon: float
    beds: int | None
    inside_boundary: bool
    source_ids: list[str]
    retrieved: str
    provenance: dict[str, str]
    review_flags: list[str]
    verified: bool


@dataclass(frozen=True)
class MedicineRecord:
    drug_code: str
    drug_name: str
    drug_type: str
    category: str
    indent_qty: int | None
    at_phc: bool
    at_chc: bool
    at_tlh: bool
    at_dlh: bool
    source_id: str
    provenance: str
    # Populated for the 104 survey items that have a confirmed link.
    survey_sl_no: int | None = None
    survey_availability_pct: float | None = None
    survey_essentiality: str | None = None
    match_status: str | None = None


@lru_cache(maxsize=1)
def load_facilities() -> list[FacilityRecord]:
    records = []
    for row in _read_csv(FACILITIES_CSV):
        records.append(
            FacilityRecord(
                internal_id=row["internal_id"],
                display_label=row["display_label"],
                facility_type=row["facility_type"],
                ownership=row["ownership"],
                lat=float(row["lat"]),
                lon=float(row["lon"]),
                beds=_as_int(row["beds"]),
                inside_boundary=_as_bool(row["inside_boundary"]),
                source_ids=[s for s in row["source_ids"].split() if s],
                retrieved=row["retrieved"],
                provenance={
                    "lat": row["lat_provenance"],
                    "lon": row["lon_provenance"],
                    "facility_type": row["facility_type_provenance"],
                    "ownership": row["ownership_provenance"],
                    "beds": row["beds_provenance"],
                },
                review_flags=[f for f in row["review_flags"].split() if f],
                verified=_as_bool(row["verified"]),
            )
        )
    return records


@lru_cache(maxsize=1)
def load_medicines() -> list[MedicineRecord]:
    """The 890-item master list, enriched where a survey item links to it.

    Only `auto` and `confirmed` matches contribute survey data. A match still
    awaiting human confirmation is deliberately left out, so an unreviewed guess
    cannot reach the UI.
    """
    survey_by_code: dict[str, dict[str, str]] = {}
    for row in _read_csv(SURVEY_MATCHES_CSV):
        code = row["indent_drug_code"].strip()
        if code and row["match_status"] in ("auto", "confirmed"):
            survey_by_code[code] = row

    records = []
    for row in _read_csv(MEDICINES_CSV):
        code = row["drug_code"]
        survey = survey_by_code.get(code)
        records.append(
            MedicineRecord(
                drug_code=code,
                drug_name=row["drug_name"],
                drug_type=row["drug_type"],
                category=row["category"],
                indent_qty=_as_int(row["indent_qty"]),
                at_phc=_as_bool(row["at_phc"]),
                at_chc=_as_bool(row["at_chc"]),
                at_tlh=_as_bool(row["at_tlh"]),
                at_dlh=_as_bool(row["at_dlh"]),
                source_id=row["source_id"],
                provenance=row["provenance"],
                survey_sl_no=_as_int(survey["survey_sl_no"]) if survey else None,
                survey_availability_pct=(
                    float(survey["survey_availability_pct"]) if survey else None
                ),
                survey_essentiality=survey["survey_essentiality"] if survey else None,
                match_status=survey["match_status"] if survey else None,
            )
        )
    return records


@lru_cache(maxsize=1)
def load_boundary() -> dict:
    return json.loads(_require(BOUNDARY_GEOJSON).read_text())


def survey_linked_medicines() -> list[MedicineRecord]:
    """Only the medicines with real observed availability behind them."""
    return [m for m in load_medicines() if m.survey_sl_no is not None]


def clear_cache() -> None:
    """Drop cached datasets. Used by tests and after a pipeline re-run."""
    load_facilities.cache_clear()
    load_medicines.cache_clear()
    load_boundary.cache_clear()
