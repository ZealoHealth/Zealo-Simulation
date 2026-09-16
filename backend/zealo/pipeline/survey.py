"""Extract Tables 1, 2 and 3 from the Gadag taluk PHC survey PDF.

Source: Tejesh S, Nagaveni SJ (2023), Cureus 15(5): e39341, CC BY 4.0.
Raw file: data/raw/gadag_phc_survey_cureus_e39341.pdf

Why geometry and not text
-------------------------
Tables 2 and 3 are striped: only the shaded rows carry cell rectangles, so
``page.extract_tables()`` resolves every other row and collapses the rest. Cells
also wrap vertically -- an essentiality class renders as "Most" / "essential" /
"drug list" on three lines centred on its data row, and long drug names wrap
above and below theirs.

So rows are rebuilt from word coordinates instead. Each row is anchored by the
word in its first column (a serial number or a drug code); every other word is
attached to the nearest anchor by vertical distance. Rows sit ~28.8pt apart and
wrapped lines ~10.8pt from their anchor, so the nearest anchor is unambiguous.

Nothing here interprets or adjusts a published number. Values are transcribed as
printed; verification against the paper's stated figures lives in
``verify_against_publication`` and in the tests.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pdfplumber

# --- What the paper states in its own text. Used to verify extraction, never to patch it. ---
PUBLISHED_OVERALL_AVAILABILITY = 74.20
PUBLISHED_HIGHEST = ("PHC 4", 94.17)
PUBLISHED_LOWEST = ("PHC 1", 45.45)
PUBLISHED_N_ITEMS = 104
PUBLISHED_N_PHCS = 15
PUBLISHED_N_CATEGORIES = 15

# Table 3 prints 103 rows, not 104. This is a property of the paper, not a bug in
# this extractor: "Glibenclamide 5 mg tablet" appears in Table 2 (item 38, 93.33%
# availability) and nowhere in Table 3. Verified by searching every page of the
# PDF. Item 38 therefore has availability data but no drug code, strength-form
# record or essentiality class, and will have no Table 3 attributes to match on in
# the indent-matching step.
PUBLISHED_N_TABLE3_ROWS = 103
TABLE3_MISSING_ITEM = "Glibenclamide"

# With n=15 PHCs, every Table 2 percentage must be k/15 for an integer k. Exactly
# one printed value is not: item 49, "Lignocaine inj 2 % w/v", at 83.33%, which is
# 12.5/15. Verified as printed in the PDF, so this is an inconsistency in the
# published paper rather than an extraction error. It matters because the derived
# availability matrix needs an integer column total for every item, so item 49's
# total has to be rounded -- a decision recorded in data/METHODS.md.
TABLE2_NON_FIFTEENTH_ITEM = 49
# Stated in the text: these two are unavailable at every PHC.
PUBLISHED_ZERO_AVAILABILITY_ITEMS = ("glyceryl trinitrate", "anti-d immunoglobin")

_TABLE1_PAGE = 2  # 0-indexed
_TABLE2_PAGES = range(3, 7)
_TABLE3_PAGES = range(7, 13)

_CODE = re.compile(r"^\d+(?:\.\d+)+$")
_SERIAL = re.compile(r"^\d{1,3}$")
_TABLE1_ROW = re.compile(r"^(\d{1,2})\s+(.+?)\s+(\d{1,3}\.\d{2})$")
_TABLE1_TOTAL = re.compile(r"^Total\s+(\d{1,3}\.\d{2})$")

# Column left edges, read off the PDF. A word belongs to the last column whose
# left edge it is at or past.
_TABLE2_COLUMNS = [
    ("sl_no", 70.0),
    ("drug_name", 105.0),
    ("strength", 305.0),
    ("availability", 430.0),
]
_TABLE3_COLUMNS = [
    ("drug_code", 70.0),
    ("drug_name", 105.0),
    ("strength", 317.0),
    ("dosage_form", 444.0),
    ("essentiality", 486.0),
]

# A wrapped line sits ~10.8pt from its anchor; the next row is ~28.8pt away.
_MAX_ROW_DY = 14.0


@dataclass(frozen=True)
class ExtractionReport:
    """What came out, and whether it matches what the paper claims."""

    table1_rows: int
    table2_rows: int
    table3_rows: int
    problems: list[str]

    @property
    def ok(self) -> bool:
        return not self.problems


def _column_of(x0: float, columns: list[tuple[str, float]]) -> str | None:
    """Return the column a word starting at ``x0`` belongs to."""
    found = None
    for name, left in columns:
        if x0 >= left - 1.0:
            found = name
    return found


def _assemble_rows(
    words: list[dict[str, Any]],
    columns: list[tuple[str, float]],
    anchor_pattern: re.Pattern[str],
) -> list[dict[str, str]]:
    """Rebuild logical rows from positioned words.

    Anchors are words in the first column matching ``anchor_pattern``. Every other
    word joins the anchor nearest to it vertically, provided it is within
    ``_MAX_ROW_DY``; anything further away (page headers, footers, captions) is
    dropped.
    """
    first_col, second_col_left = columns[0][0], columns[1][1]
    anchors = [
        w
        for w in words
        if w["x0"] < second_col_left and anchor_pattern.match(w["text"])
    ]
    if not anchors:
        return []
    anchors.sort(key=lambda w: w["top"])

    buckets: list[dict[str, list[tuple[float, float, str]]]] = [
        {name: [] for name, _ in columns} for _ in anchors
    ]
    anchor_tops = [a["top"] for a in anchors]

    for w in words:
        col = _column_of(w["x0"], columns)
        if col is None:
            continue
        # nearest anchor by vertical distance
        idx = min(range(len(anchors)), key=lambda i: abs(anchor_tops[i] - w["top"]))
        if abs(anchor_tops[idx] - w["top"]) > _MAX_ROW_DY:
            continue
        # the anchor word itself is the row's first-column value
        if w is anchors[idx] and col != first_col:
            col = first_col
        buckets[idx][col].append((w["top"], w["x0"], w["text"]))

    rows = []
    for bucket in buckets:
        row = {}
        for name, _ in columns:
            parts = sorted(bucket[name])
            row[name] = " ".join(p[2] for p in parts).strip()
        rows.append(row)
    return rows


def _words_on(pdf: pdfplumber.PDF, page_index: int) -> list[dict[str, Any]]:
    return pdf.pages[page_index].extract_words()


def extract_table1(pdf_path: Path) -> list[dict[str, Any]]:
    """Table 1 -- availability (%) by therapeutic category.

    Read from text: the category name is unambiguous because the percentage is
    always the final token on the line.
    """
    with pdfplumber.open(pdf_path) as pdf:
        text = pdf.pages[_TABLE1_PAGE].extract_text() or ""

    rows: list[dict[str, Any]] = []
    total: float | None = None
    for line in text.split("\n"):
        line = line.strip()
        if (m := _TABLE1_ROW.match(line)) and not line.startswith("TABLE"):
            rows.append(
                {
                    "sl_no": int(m.group(1)),
                    "category": m.group(2).strip(),
                    "availability_pct": float(m.group(3)),
                }
            )
        elif m := _TABLE1_TOTAL.match(line):
            total = float(m.group(1))

    # Keep only the contiguous 1..N block, so stray numbered prose cannot leak in.
    rows = [r for i, r in enumerate(rows, start=1) if r["sl_no"] == i]
    for r in rows:
        r["total_availability_pct"] = total
    return rows


def extract_table2(pdf_path: Path) -> list[dict[str, Any]]:
    """Table 2 -- per-item availability across the 15 PHCs.

    Row 105 is the printed "Total" line, not an item; it is dropped here and
    checked separately.
    """
    rows: list[dict[str, Any]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for pno in _TABLE2_PAGES:
            words = _words_on(pdf, pno)
            for raw in _assemble_rows(words, _TABLE2_COLUMNS, _SERIAL):
                avail = raw["availability"]
                if not re.fullmatch(r"\d{1,3}\.\d{2}", avail):
                    continue
                name = raw["drug_name"].strip()
                if not name or name.lower() == "total":
                    continue
                rows.append(
                    {
                        "sl_no": int(raw["sl_no"]),
                        "drug_name": name,
                        "strength": raw["strength"].strip(),
                        "availability_pct": float(avail),
                    }
                )
    rows.sort(key=lambda r: r["sl_no"])
    return [r for r in rows if r["sl_no"] <= PUBLISHED_N_ITEMS]


def _normalise_essentiality(raw: str) -> str:
    """Map the wrapped class text onto a stable key."""
    t = " ".join(raw.lower().split())
    if t.startswith("very essential"):
        return "very_essential"
    if t.startswith("most essential"):
        return "most_essential"
    if t.startswith("essential"):
        return "essential"
    return ""


def extract_table3(pdf_path: Path) -> list[dict[str, Any]]:
    """Table 3 -- the item list with drug code, strength, dosage form and class."""
    rows: list[dict[str, Any]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for pno in _TABLE3_PAGES:
            words = _words_on(pdf, pno)
            for raw in _assemble_rows(words, _TABLE3_COLUMNS, _CODE):
                name = " ".join(raw["drug_name"].split())
                if not name:
                    continue
                rows.append(
                    {
                        "drug_code": raw["drug_code"].strip(),
                        "drug_name": name,
                        "strength": " ".join(raw["strength"].split()),
                        "dosage_form": " ".join(raw["dosage_form"].split()),
                        "essentiality": _normalise_essentiality(raw["essentiality"]),
                        "essentiality_raw": " ".join(raw["essentiality"].split()),
                    }
                )
    return rows


def verify_against_publication(
    table1: list[dict[str, Any]],
    table2: list[dict[str, Any]],
    table3: list[dict[str, Any]],
) -> ExtractionReport:
    """Check the extraction against figures the paper states in its own text.

    Returns problems rather than raising, so a run can report every mismatch at
    once instead of stopping at the first.
    """
    problems: list[str] = []

    if len(table1) != PUBLISHED_N_CATEGORIES:
        problems.append(f"Table 1: expected {PUBLISHED_N_CATEGORIES} categories, got {len(table1)}")
    if table1:
        total = table1[0]["total_availability_pct"]
        if total != PUBLISHED_OVERALL_AVAILABILITY:
            problems.append(
                f"Table 1: printed total {total} != published {PUBLISHED_OVERALL_AVAILABILITY}"
            )

    if len(table2) != PUBLISHED_N_ITEMS:
        problems.append(f"Table 2: expected {PUBLISHED_N_ITEMS} items, got {len(table2)}")
    serials = [r["sl_no"] for r in table2]
    if serials != list(range(1, len(table2) + 1)):
        missing = sorted(set(range(1, PUBLISHED_N_ITEMS + 1)) - set(serials))
        problems.append(f"Table 2: serial numbers are not 1..N; missing {missing[:10]}")
    for r in table2:
        if not 0.0 <= r["availability_pct"] <= 100.0:
            problems.append(f"Table 2: item {r['sl_no']} availability out of range")
    zero_named = {
        r["drug_name"].lower() for r in table2 if r["availability_pct"] == 0.0
    }
    for expected in PUBLISHED_ZERO_AVAILABILITY_ITEMS:
        if not any(expected in n for n in zero_named):
            problems.append(f"Table 2: '{expected}' should be 0.00% per the paper's text")

    if len(table3) != PUBLISHED_N_TABLE3_ROWS:
        problems.append(
            f"Table 3: expected {PUBLISHED_N_TABLE3_ROWS} rows, got {len(table3)}"
        )
    codes = [r["drug_code"] for r in table3]
    if len(set(codes)) != len(codes):
        problems.append("Table 3: duplicate drug codes")
    for r in table3:
        if not r["drug_name"] or not r["dosage_form"]:
            problems.append(f"Table 3: incomplete row for {r['drug_code']}")
    for r in table3:
        if not r["essentiality"]:
            problems.append(f"Table 3: unrecognised essentiality for {r['drug_code']}")

    return ExtractionReport(len(table1), len(table2), len(table3), problems)
