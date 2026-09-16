"""Extract the medicine master list from the Karnataka State Annual Indent 2025-26.

Source: Karnataka State Medical Supplies Corporation Limited, "Annual Indent
2025-26 -- Drugs List Considered for Procurement - 890 Drugs".
Raw file: data/raw/ksmscl_annual_indent_2025_26.pdf

This is the medicine master list: which items exist, which therapeutic group they
belong to, which facility levels carry them (PHC / CHC / TLH / DLH), and the
statewide quantity that taluk demand is later scaled down from.

Like the survey tables, rows are rebuilt from word coordinates rather than text --
see ``zealo.pipeline.pdf_tables``. The four availability columns each hold
"Available" or "Not Available", and "Not Available" wraps onto two lines, which is
exactly the case that defeats a line-by-line read.

Nothing here reinterprets a published value. Indent quantities are transcribed as
printed; what they *mean* (a request, not consumption) is a limitation recorded in
data/SOURCES.md, not something this module adjusts for.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pdfplumber

from zealo.pipeline.pdf_tables import (
    assemble_rows,
    horizontal_rules,
    split_straddling_words,
)

# Stated on every page: "Drugs List Considered for Procurement - 890 Drugs".
PUBLISHED_N_DRUGS = 890

# Codes come in three forms, confirmed by extraction rather than assumed:
#   D##### -- drugs (761)
#   M##### -- medical devices and consumables (122)
#   dotted -- 7 blood-factor products carrying EDL-style numbering (e.g. "10.1.16")
# The dotted codes look like the survey's Table 3 scheme but share none of its
# values, so the survey still cannot be joined to the indent by code.
_CODE_FORMS = re.compile(r"^(?:[DM]\d{5}|\d+(?:\.\d+)+)$")

FACILITY_LEVELS = ("phc", "chc", "tlh", "dlh")

# Column left edges, read off the PDF. The availability values sit slightly left
# of their headers because "Available" is wider than "PHC" and is centred.
# Measured across all 26 pages: no word starts between x=158.3 and x=178.9, so the
# category/PHC split at 178.0 is unambiguous and also lands correctly inside the
# glued 'AntioxytocicsAvailable' token.
_COLUMNS = [
    ("sl_no", 20.0),
    ("drug_code", 38.0),
    ("drug_type", 66.0),
    ("category", 100.0),
    ("phc", 178.0),
    ("chc", 204.0),
    ("tlh", 233.0),
    ("dlh", 262.0),
    ("drug_name", 292.0),
    ("indent_qty", 440.0),
    ("mode_of_procurement", 478.0),
    ("quarantine_required", 570.0),
]

_SERIAL = re.compile(r"^\d{1,3}$")
# The repeated page header ends around y=64; data starts at ~69. Dropping it here
# keeps it from competing for the nearest-anchor assignment.
_HEADER_BOTTOM = 65.0
# Row heights vary far too much for a distance rule: a long drug name wraps to
# five lines and its outermost ones sit nearer a neighbouring row's serial number
# than their own. The table draws a shaded rectangle behind alternate rows, and
# those rectangles' edges partition the page into exactly its real rows -- checked
# across pages, every band holds exactly one serial number. So the document's own
# rules are used instead of inferring row extents from the text.
_MIN_RULE_WIDTH = 500.0


@dataclass(frozen=True)
class IndentReport:
    rows: int
    problems: list[str]

    @property
    def ok(self) -> bool:
        return not self.problems


def _parse_availability(raw: str) -> bool | None:
    """'Available' -> True, 'Not Available' -> False, anything else -> None."""
    t = " ".join(raw.lower().split())
    if t == "available":
        return True
    if t == "not available":
        return False
    return None


def _parse_qty(raw: str) -> int | None:
    """Indian digit grouping, e.g. '2,77,19,810' -> 27719810.

    Whitespace is stripped throughout, not just at the ends: the PDF's text layer
    sometimes breaks a long number into two tokens (``'1'`` + ``'3,84,87,350'``),
    which assemble into a single cell separated by a space.
    """
    t = "".join(raw.split()).replace(",", "")
    return int(t) if t.isdigit() else None


def extract_indent(pdf_path: Path) -> list[dict[str, Any]]:
    """Return one record per drug in the annual indent."""
    rows: list[dict[str, Any]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            boundaries = horizontal_rules(page, _MIN_RULE_WIDTH)
            words = [w for w in page.extract_words() if w["top"] > _HEADER_BOTTOM]
            chars = [c for c in page.chars if c["top"] > _HEADER_BOTTOM]
            words = split_straddling_words(words, chars, _COLUMNS)
            assembled = assemble_rows(
                words, _COLUMNS, _SERIAL, row_boundaries=boundaries
            )
            for raw in assembled:
                name = " ".join(raw["drug_name"].split())
                code = raw["drug_code"].strip()
                if not name or not code:
                    continue
                record: dict[str, Any] = {
                    "sl_no": int(raw["sl_no"]),
                    "drug_code": code,
                    "drug_type": " ".join(raw["drug_type"].split()),
                    "category": " ".join(raw["category"].split()),
                    "drug_name": name,
                    "indent_qty": _parse_qty(raw["indent_qty"]),
                    "mode_of_procurement": " ".join(raw["mode_of_procurement"].split()),
                    "quarantine_required": " ".join(raw["quarantine_required"].split()),
                }
                for level in FACILITY_LEVELS:
                    record[f"at_{level}"] = _parse_availability(raw[level])
                rows.append(record)
    return rows


def verify_indent(rows: list[dict[str, Any]]) -> IndentReport:
    """Check the extraction against what the document states about itself."""
    problems: list[str] = []

    if len(rows) != PUBLISHED_N_DRUGS:
        problems.append(f"expected {PUBLISHED_N_DRUGS} drugs, got {len(rows)}")

    codes = [r["drug_code"] for r in rows]
    dupes = {c for c in codes if codes.count(c) > 1}
    if dupes:
        problems.append(f"duplicate drug codes: {sorted(dupes)[:10]}")

    malformed = [c for c in codes if not _CODE_FORMS.match(c)]
    if malformed:
        problems.append(f"unrecognised drug code format: {malformed[:10]}")

    for level in FACILITY_LEVELS:
        unparsed = [r["sl_no"] for r in rows if r[f"at_{level}"] is None]
        if unparsed:
            problems.append(f"{level.upper()} availability unparsed for rows {unparsed[:10]}")

    no_qty = [r["sl_no"] for r in rows if r["indent_qty"] is None]
    if no_qty:
        problems.append(f"indent quantity unparsed for rows {no_qty[:10]}")

    no_name = [r["sl_no"] for r in rows if not r["drug_name"]]
    if no_name:
        problems.append(f"missing drug name for rows {no_name[:10]}")

    # Facility levels should nest: anything a PHC carries, a CHC/TLH/DLH carries too.
    # A break here means a column was misread, so it is checked rather than assumed.
    for lower, higher in (("phc", "chc"), ("chc", "tlh"), ("tlh", "dlh")):
        broken = [
            r["sl_no"] for r in rows if r[f"at_{lower}"] and not r[f"at_{higher}"]
        ]
        if broken:
            problems.append(
                f"{len(broken)} items at {lower.upper()} but not {higher.upper()}: "
                f"{broken[:10]}"
            )

    return IndentReport(len(rows), problems)
