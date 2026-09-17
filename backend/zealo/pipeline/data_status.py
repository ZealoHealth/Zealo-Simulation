"""What data is still pending, what is interim, and what failed validation.

One source of truth for three consumers: `make data-check` (terminal), the generated
data/DATA_TODO.md, and `GET /data-status` behind the site's Data status panel.
"""

from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass, field
from datetime import date
from pathlib import Path

from zealo.config import DATA_DIR, INTERIM_DIR, MANUAL_DIR, PROCESSED_DIR, RAW_DIR
from zealo.pipeline.phc_profiles import resolve_profiles
from zealo.pipeline.population import PopulationError, load_population, validate
from zealo.pipeline.prices import PRICES_CSV, load_prices

TODO_MD = DATA_DIR / "DATA_TODO.md"

COMPLETE, INTERIM, PENDING, INVALID, DECIDED, OPTIONAL = (
    "complete", "interim", "pending", "invalid", "decided", "optional",
)


@dataclass
class StatusItem:
    id: str
    title: str
    status: str
    file: str
    unlocks: str
    interim_approach: str
    progress: str = ""
    problems: list[str] = field(default_factory=list)


def _rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="") as fh:
        lines = [line for line in fh if not line.lstrip().startswith("#")]
    return list(csv.DictReader(lines))


def _json(path: Path) -> dict:
    return json.loads(path.read_text()) if path.exists() else {}


def _files_in(folder: Path) -> int:
    if not folder.exists():
        return 0
    return sum(1 for p in folder.iterdir() if p.name not in (".gitkeep", "README.md"))


def collect() -> list[StatusItem]:
    items: list[StatusItem] = []

    # R5 population
    try:
        population = load_population()
        problems = validate(population)
        figures = (population.karnataka, population.gadag_taluk, population.gadag_district)
        unverified = [f.key for f in figures if not f.machine_verified]
        items.append(StatusItem(
            "R5", "Population figures", INVALID if problems else COMPLETE,
            "data/manual/population.json",
            "Scaling statewide indent quantities to Gadag taluk demand",
            "None needed: Census 2011 figures in use, sanity-checked.",
            progress=(
                "machine-verified" if not unverified
                else "unverified: " + ", ".join(unverified)
            ),
            problems=problems,
        ))
    except PopulationError as exc:
        items.append(StatusItem(
            "R5", "Population figures", INVALID, "data/manual/population.json",
            "Scaling statewide indent quantities to Gadag taluk demand",
            "None: the simulation cannot scale demand without it.", problems=[str(exc)],
        ))

    # R1 Figure 1
    resolved = resolve_profiles()
    filled = sum(1 for p in resolved.profiles if p.provenance == "real")
    items.append(StatusItem(
        "R1", "Figure 1 per-PHC availability",
        COMPLETE if not resolved.is_interim else (INVALID if resolved.problems else INTERIM),
        "data/manual/figure1_phc_availability.csv",
        "Real per-PHC availability, and a matrix rebuilt from it",
        "PHC 1 = 45.45 and PHC 4 = 94.17 (published); the other 13 set to one equal value "
        "(74.88) that keeps the published mean of 74.20. Tagged estimated.",
        progress=f"{filled} of 15 values real",
        problems=resolved.problems,
    ))

    # R7 medicine matches
    review = _rows(MANUAL_DIR / "indent_match_review.csv")
    decided = sum(1 for r in review if (r.get("decision") or "").strip())
    matches = _rows(PROCESSED_DIR / "survey_item_matches.csv")
    quantified = sum(1 for r in matches if r.get("match_status") in ("auto", "confirmed"))
    invalid = [
        f"survey item {r['survey_sl_no']}: decision names an unknown indent code"
        for r in matches if r.get("match_status") == "invalid_decision"
    ]
    items.append(StatusItem(
        "R7", "Medicine match confirmations",
        COMPLETE if review and decided == len(review) and not invalid
        else (INVALID if invalid else INTERIM),
        "data/manual/indent_match_review.csv",
        "Quantities and demand for the remaining survey medicines",
        "Unconfirmed items show survey availability only (in stock / out of stock at PHCs), "
        "with no quantities or demand.",
        progress=f"{decided} of {len(review)} decided; {quantified} of 104 survey items "
        "have quantity estimates",
        problems=invalid,
    ))

    # R8 facility verification
    facilities = _rows(PROCESSED_DIR / "facilities.csv")
    verified = sum(1 for r in facilities if str(r.get("verified")).lower() == "true")
    build = _json(INTERIM_DIR / "facility_build_report.json")
    items.append(StatusItem(
        "R8", "Facility verification",
        COMPLETE if facilities and verified == len(facilities) else INTERIM,
        "data/manual/facility_verification.csv",
        "Confirmed facility types, ownership and medicine lists",
        "Unverified facilities are shown with a 'Location unverified' badge. Three "
        "government facilities of unconfirmed level carry the PHC medicine list; the "
        "Railway Hospital is kept out of the network with no state list.",
        progress=f"{verified} of {len(facilities)} verified",
        problems=list(build.get("correction_problems", [])),
    ))

    # R4 PHC locations
    phcs_mapped = build.get("phcs_mapped", 0)
    items.append(StatusItem(
        "R4a", "Locations of the PHCs missing from OpenStreetMap",
        COMPLETE if phcs_mapped >= 15 else INTERIM,
        "data/manual/phc_locations.csv",
        "Putting all 15 survey PHCs on the map",
        f"{phcs_mapped} of 15 PHCs mapped. Survey profiles are assigned to mapped PHCs for "
        "illustration; the rest are listed as unmapped in the network view. Taluk-wide "
        "survey statistics still use all 15.",
        progress=f"{phcs_mapped} of 15 mapped",
        problems=list(build.get("location_report", [])),
    ))

    # R4 attendance
    attendance = _rows(MANUAL_DIR / "facility_attendance.csv")
    with_opd = sum(1 for r in attendance if (r.get("opd_annual") or "").strip())
    items.append(StatusItem(
        "R4b", "OPD/IPD attendance (HMIS)",
        COMPLETE if attendance and with_opd == len(attendance) else INTERIM,
        "data/manual/facility_attendance.csv",
        "Splitting demand between facilities by attendance",
        "Demand split in equal shares between the facilities carrying each medicine. "
        "Tagged estimated.",
        progress=f"{with_opd} of {len(attendance)} government facilities",
    ))

    # R6 prices
    prices, price_problems = load_prices()
    items.append(StatusItem(
        "R6", "Unit prices",
        COMPLETE if prices and not price_problems else DECIDED,
        "data/manual/prices.csv (optional)",
        "Value figures in rupees",
        "Decided: units only. No stock value, value moved or value saved from expiry is shown.",
        progress=f"{len(prices)} priced" if PRICES_CSV.exists() else "no price file",
        problems=price_problems,
    ))

    # R2 / R3 optional
    for item_id, title, folder, unlocks in (
        ("R2", "Open Government Data facility lists", "ogd",
         "Fixing the pharmacy undercount and confirming facility levels"),
        ("R3", "ABDM Health Facility Registry export", "abdm",
         "Fixing the pharmacy undercount and confirming facility levels"),
    ):
        n = _files_in(RAW_DIR / folder)
        items.append(StatusItem(
            item_id, title, COMPLETE if n else OPTIONAL, f"data/raw/{folder}/",
            unlocks,
            f"Only the {build.get('pharmacies_mapped', 3)} OpenStreetMap pharmacies are shown; "
            "no pharmacy count is estimated. Pharmacies are outside the network by default.",
            progress=f"{n} file(s) supplied",
        ))
    return items


def as_dicts(items: list[StatusItem]) -> list[dict]:
    return [asdict(i) for i in items]


def render_todo(items: list[StatusItem]) -> str:
    order = {INVALID: 0, INTERIM: 1, PENDING: 2, OPTIONAL: 3, DECIDED: 4, COMPLETE: 5}
    lines = [
        "# Data to-do",
        "",
        f"_Generated by `make data-check` on {date.today().isoformat()}. Do not edit by hand -- "
        "fill in the files listed, then run `make data`._",
        "",
        "| Status | Item | File to fill | Unlocks | Progress |",
        "|---|---|---|---|---|",
    ]
    for i in sorted(items, key=lambda x: (order.get(x.status, 9), x.id)):
        lines.append(
            f"| **{i.status}** | {i.id} {i.title} | `{i.file}` | {i.unlocks} | {i.progress} |"
        )
    lines += ["", "## Interim approach currently in use", ""]
    for i in items:
        if i.status in (INTERIM, INVALID, OPTIONAL, DECIDED):
            lines.append(f"- **{i.id} {i.title}** — {i.interim_approach}")
    problems = [(i, p) for i in items for p in i.problems]
    lines += ["", "## Validation failures", ""]
    lines += [f"- **{i.id}**: {p}" for i, p in problems] or ["None."]
    return "\n".join(lines) + "\n"
