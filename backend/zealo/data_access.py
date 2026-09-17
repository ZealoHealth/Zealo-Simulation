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
POPULATION_JSON = PROCESSED_DIR / "population.json"
PROFILES_CSV = PROCESSED_DIR / "phc_availability_profiles.csv"
MATRIX_CSV = PROCESSED_DIR / "phc_availability_matrix.csv"

_BUILD_COMMANDS = {
    FACILITIES_CSV: "python data/pipeline/03_build_facilities.py",
    MEDICINES_CSV: "python data/pipeline/02_extract_indent_and_match.py",
    SURVEY_MATCHES_CSV: "python data/pipeline/02_extract_indent_and_match.py",
    BOUNDARY_GEOJSON: "python data/pipeline/03_build_facilities.py",
    POPULATION_JSON: "make data",
    PROFILES_CSV: "make data",
    MATRIX_CSV: "make data",
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
    facility_key: str = ""
    location_precision: str = "exact"
    medicine_list: str = "none"
    in_network_default: bool = True


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
                facility_key=row.get("facility_key", ""),
                location_precision=row.get("location_precision", "exact") or "exact",
                medicine_list=row.get("medicine_list", "none") or "none",
                in_network_default=_as_bool(row.get("in_network_default", "true")),
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


@dataclass(frozen=True)
class SurveyItem:
    """One of the survey's 104 items, whether or not it is matched to the indent."""

    sl_no: int
    name: str
    strength: str
    availability_pct: float
    essentiality: str
    indent_code: str | None
    match_status: str

    @property
    def quantity_modelled(self) -> bool:
        """Matched to an indent row, so it has demand and quantities in the simulation."""
        return bool(self.indent_code) and self.match_status in ("auto", "confirmed")

    @property
    def id(self) -> str:
        return self.indent_code if self.quantity_modelled else f"survey-{self.sl_no:03d}"

    @property
    def label(self) -> str:
        return f"{self.name} {self.strength}".strip()


@lru_cache(maxsize=1)
def load_survey_items() -> list[SurveyItem]:
    items = []
    for row in _read_csv(SURVEY_MATCHES_CSV):
        items.append(
            SurveyItem(
                sl_no=int(row["survey_sl_no"]),
                name=row["survey_drug_name"],
                strength=row["survey_strength"],
                availability_pct=float(row["survey_availability_pct"]),
                essentiality=row.get("survey_essentiality", "") or "",
                indent_code=row["indent_drug_code"].strip() or None,
                match_status=row["match_status"],
            )
        )
    return items


@lru_cache(maxsize=1)
def load_population_share() -> dict:
    return json.loads(_require(POPULATION_JSON).read_text())


@lru_cache(maxsize=1)
def load_phc_profiles() -> list[dict]:
    return [
        {
            "phc_number": int(r["phc_number"]),
            "availability_pct": float(r["availability_pct"]),
            "items_in_stock": int(r["items_in_stock"]),
            "provenance": r["provenance"],
            "note": r["note"],
        }
        for r in _read_csv(PROFILES_CSV)
    ]


@lru_cache(maxsize=1)
def load_phc_matrix() -> dict[tuple[int, int], bool]:
    return {
        (int(r["phc_number"]), int(r["survey_sl_no"])): r["in_stock"] == "1"
        for r in _read_csv(MATRIX_CSV)
    }


def clear_cache() -> None:
    """Drop cached datasets. Used by tests and after a pipeline re-run."""
    for loader in (load_facilities, load_medicines, load_boundary, load_survey_items,
                   load_population_share, load_phc_profiles, load_phc_matrix):
        loader.cache_clear()
