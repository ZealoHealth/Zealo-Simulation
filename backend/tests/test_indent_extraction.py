"""The indent is the medicine master list, so its extraction is pinned to the source.

Several of these lock in defects found and fixed during Milestone 3: content
leaking between rows, a glued category/availability token, and quantities split
across two words by the PDF's text layer.
"""

import pytest

from zealo.config import RAW_DIR
from zealo.pipeline.indent import (
    FACILITY_LEVELS,
    PUBLISHED_N_DRUGS,
    extract_indent,
    verify_indent,
)

PDF = RAW_DIR / "ksmscl_annual_indent_2025_26.pdf"

pytestmark = pytest.mark.skipif(not PDF.exists(), reason="raw indent PDF not present")


@pytest.fixture(scope="module")
def rows():
    return extract_indent(PDF)


@pytest.fixture(scope="module")
def by_sl(rows):
    return {r["sl_no"]: r for r in rows}


def test_row_count_matches_the_documents_own_claim(rows):
    assert len(rows) == PUBLISHED_N_DRUGS == 890


def test_serial_numbers_are_contiguous(rows):
    assert sorted(r["sl_no"] for r in rows) == list(range(1, 891))


def test_drug_codes_are_unique(rows):
    codes = [r["drug_code"] for r in rows]
    assert len(set(codes)) == len(codes)


def test_verification_reports_no_problems(rows):
    report = verify_indent(rows)
    assert report.ok, f"problems: {report.problems}"


@pytest.mark.parametrize(
    "sl_no,code,name_fragment,qty,levels",
    [
        (1, "D00303", "Aciclovir Tablet IP 200 mg", 764610, (False, True, True, True)),
        (2, "D00461", "Amlodipine Tablet IP 10 mg", 27719810, (False, True, True, True)),
        (281, "M00167", "Disposable Mask Triple Layer", None, (True, True, True, True)),
    ],
)
def test_spot_checks_against_the_pdf(by_sl, sl_no, code, name_fragment, qty, levels):
    r = by_sl[sl_no]
    assert r["drug_code"] == code
    assert name_fragment.lower() in r["drug_name"].lower()
    if qty is not None:
        assert r["indent_qty"] == qty
    assert tuple(r[f"at_{lvl}"] for lvl in FACILITY_LEVELS) == levels


def test_every_row_has_all_four_levels_parsed(rows):
    for r in rows:
        for lvl in FACILITY_LEVELS:
            assert isinstance(r[f"at_{lvl}"], bool), f"row {r['sl_no']} {lvl} unparsed"


def test_every_row_has_a_quantity(rows):
    assert all(isinstance(r["indent_qty"], int) for r in rows)


def test_facility_levels_nest(rows):
    """Anything a PHC stocks, higher levels stock too. A break means a misread column."""
    for lower, higher in (("phc", "chc"), ("chc", "tlh"), ("tlh", "dlh")):
        assert not [r["sl_no"] for r in rows if r[f"at_{lower}"] and not r[f"at_{higher}"]]


def test_quantity_split_across_two_tokens_is_reassembled(by_sl):
    """The PDF emits this one as '1' + '3,84,87,350'; naive parsing drops it."""
    assert by_sl[23]["drug_code"] == "D00448"
    assert by_sl[23]["indent_qty"] == 138487350


def test_category_glued_to_availability_is_split(by_sl):
    """'AntioxytocicsAvailable' is one token in the PDF; PHC must still be read."""
    for sl_no in (13, 28, 132, 308):
        r = by_sl[sl_no]
        assert r["at_phc"] is True
        assert "Oxytocics" in r["category"]
        assert "Available" not in r["category"]


@pytest.mark.parametrize(
    "sl_no,starts_with,not_containing",
    [
        # Row content used to leak across row boundaries in both directions.
        (281, "Disposable Mask", "ampoules"),
        (297, "Ampicillin Capsules", "Antacid"),
        (19, "Vitamin C Chewable", "Zinc"),
        (280, "Bupivacaine", "Disposable"),
    ],
)
def test_rows_do_not_borrow_content_from_their_neighbours(
    by_sl, sl_no, starts_with, not_containing
):
    name = by_sl[sl_no]["drug_name"]
    assert name.startswith(starts_with)
    assert not_containing.lower() not in name.lower()


def test_phc_list_is_a_meaningful_subset(rows):
    """The PHC column is what drives 'should carry vs carries' in the UI."""
    phc = [r for r in rows if r["at_phc"]]
    assert 200 < len(phc) < 600
    assert len(phc) < len(rows)
