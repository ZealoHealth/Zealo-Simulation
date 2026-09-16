"""Extraction is checked against values the paper states in its own text.

These are the spot-checks the build spec calls for. If a pdfplumber upgrade or a
parser change shifts a column boundary, these fail rather than quietly producing
a plausible-looking but wrong dataset.
"""

import pytest

from zealo.config import RAW_DIR
from zealo.pipeline.survey import (
    PUBLISHED_N_CATEGORIES,
    PUBLISHED_N_ITEMS,
    PUBLISHED_N_TABLE3_ROWS,
    PUBLISHED_OVERALL_AVAILABILITY,
    PUBLISHED_ZERO_AVAILABILITY_ITEMS,
    TABLE2_NON_FIFTEENTH_ITEM,
    TABLE3_MISSING_ITEM,
    extract_table1,
    extract_table2,
    extract_table3,
    verify_against_publication,
)

PDF = RAW_DIR / "gadag_phc_survey_cureus_e39341.pdf"

pytestmark = pytest.mark.skipif(not PDF.exists(), reason="raw survey PDF not present")


@pytest.fixture(scope="module")
def tables():
    return extract_table1(PDF), extract_table2(PDF), extract_table3(PDF)


# --- Table 1 -----------------------------------------------------------------

def test_table1_has_the_published_category_count(tables):
    t1, _, _ = tables
    assert len(t1) == PUBLISHED_N_CATEGORIES


def test_table1_total_matches_the_published_overall_availability(tables):
    t1, _, _ = tables
    assert t1[0]["total_availability_pct"] == PUBLISHED_OVERALL_AVAILABILITY == 74.20


@pytest.mark.parametrize(
    "sl_no,category_fragment,pct",
    [
        (1, "NSAIDs", 86.66),
        (2, "Antibiotics", 73.33),
        (13, "ophthalmic", 40.00),     # lowest category, per the paper's text
        (15, "Sterile and disposable", 78.10),
    ],
)
def test_table1_spot_checks(tables, sl_no, category_fragment, pct):
    t1, _, _ = tables
    row = next(r for r in t1 if r["sl_no"] == sl_no)
    assert category_fragment.lower() in row["category"].lower()
    assert row["availability_pct"] == pct


def test_table1_categories_are_all_percentages(tables):
    t1, _, _ = tables
    assert all(0.0 <= r["availability_pct"] <= 100.0 for r in t1)


# --- Table 2 -----------------------------------------------------------------

def test_table2_has_the_published_item_count(tables):
    _, t2, _ = tables
    assert len(t2) == PUBLISHED_N_ITEMS == 104


def test_table2_serials_are_contiguous(tables):
    _, t2, _ = tables
    assert [r["sl_no"] for r in t2] == list(range(1, 105))


@pytest.mark.parametrize(
    "sl_no,name,strength,pct",
    [
        (1, "Absorbent cotton wool", "500gm", 93.33),
        (3, "Albendazole", "400mg tab", 100.00),
        (12, "Anti-D immunoglobin", "300mcg injection", 0.00),
        (38, "Glibenclamide", "5 mg tablet", 93.33),
        (104, "Zinc syrup", "60 ml", 66.67),
    ],
)
def test_table2_spot_checks(tables, sl_no, name, strength, pct):
    _, t2, _ = tables
    row = next(r for r in t2 if r["sl_no"] == sl_no)
    assert row["drug_name"] == name
    assert row["strength"] == strength
    assert row["availability_pct"] == pct


def test_table2_name_and_strength_are_separated(tables):
    """The two are distinct columns in the PDF and must not be merged."""
    _, t2, _ = tables
    assert all(r["strength"] for r in t2)
    assert not any(r["drug_name"].endswith(r["strength"]) for r in t2)


def test_the_two_items_the_paper_calls_universally_unavailable_are_zero(tables):
    _, t2, _ = tables
    zero = {r["drug_name"].lower() for r in t2 if r["availability_pct"] == 0.0}
    for expected in PUBLISHED_ZERO_AVAILABILITY_ITEMS:
        assert any(expected in n for n in zero), f"{expected} should be 0.00%"


def test_table2_availability_is_a_multiple_of_one_fifteenth(tables):
    """n=15, so every percentage must be k/15 -- a strong check on OCR-style errors.

    Exactly one published value breaks this: item 49 at 83.33% (= 12.5/15). That is
    the paper's own inconsistency, verified against the printed PDF, so it is pinned
    here as a known exception instead of loosening the check for all 104 items.
    """
    _, t2, _ = tables
    offenders = [
        r["sl_no"]
        for r in t2
        if abs(r["availability_pct"] * 15 / 100 - round(r["availability_pct"] * 15 / 100)) >= 0.01
    ]
    assert offenders == [TABLE2_NON_FIFTEENTH_ITEM]


def test_the_known_inconsistent_item_is_still_the_one_we_documented(tables):
    _, t2, _ = tables
    row = next(r for r in t2 if r["sl_no"] == TABLE2_NON_FIFTEENTH_ITEM)
    assert row["drug_name"] == "Lignocaine inj"
    assert row["availability_pct"] == 83.33


# --- Table 3 -----------------------------------------------------------------

def test_table3_row_count_matches_the_documented_finding(tables):
    _, _, t3 = tables
    assert len(t3) == PUBLISHED_N_TABLE3_ROWS == 103


def test_table3_is_one_short_of_table2_because_of_a_gap_in_the_paper(tables):
    """Glibenclamide is in Table 2 and absent from Table 3. Not an extraction bug."""
    _, t2, t3 = tables
    assert any(TABLE3_MISSING_ITEM.lower() in r["drug_name"].lower() for r in t2)
    assert not any(TABLE3_MISSING_ITEM.lower() in r["drug_name"].lower() for r in t3)
    assert len(t2) - len(t3) == 1


def test_table3_drug_codes_are_unique(tables):
    _, _, t3 = tables
    codes = [r["drug_code"] for r in t3]
    assert len(set(codes)) == len(codes)


def test_table3_every_row_has_a_recognised_essentiality_class(tables):
    _, _, t3 = tables
    assert {r["essentiality"] for r in t3} == {"essential", "most_essential", "very_essential"}


def test_table3_multiline_cells_are_reassembled(tables):
    """The three hardest rows in the table: wrapped name, wrapped dosage, NA/NA."""
    _, _, t3 = tables
    by_code = {r["drug_code"]: r for r in t3}

    iron = by_code["20.1.24"]
    assert iron["drug_name"].startswith("Iron and folic acid tablets large")
    assert iron["drug_name"].endswith("(sugar-coated and red color)")  # third wrapped line
    assert iron["strength"] == "60mg + 500mcg"
    assert iron["dosage_form"] == "Tablet"

    venom = by_code["5.2.1"]
    assert venom["drug_name"] == "Antisnake venom (polyvalent lyophilized)"
    assert venom["dosage_form"] == "Powder for Infusion"  # wrapped across two lines

    mask = by_code["28.23.9"]
    assert mask["strength"] == "NA" and mask["dosage_form"] == "NA"


def test_table3_codes_use_edl_numbering_not_indent_codes(tables):
    """Survey codes look like 6.3.2; KSMSCL indent codes look like D00303.

    This is why Milestone 3 has to match on name+strength+form instead of joining.
    """
    _, _, t3 = tables
    assert all(r["drug_code"][0].isdigit() for r in t3)
    assert not any(r["drug_code"].startswith("D") for r in t3)


# --- Whole-extraction verification -------------------------------------------

def test_verification_reports_no_problems(tables):
    t1, t2, t3 = tables
    report = verify_against_publication(t1, t2, t3)
    assert report.ok, f"verification problems: {report.problems}"
