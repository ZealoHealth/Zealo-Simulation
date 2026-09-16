"""Matching survey items to indent rows.

The build spec requires uncertain matches to be excluded until a human confirms
them, so the decisive tests here are about what is *refused*, not what is accepted.
"""

import pytest

from zealo.pipeline.matching import (
    forms_compatible,
    match_items,
    parse_medicine,
    strengths_compatible,
)


def _survey(sl_no, name, strength="", form=""):
    return {"sl_no": sl_no, "drug_name": name, "strength": strength, "dosage_form": form}


def _indent(sl_no, code, name):
    return {"sl_no": sl_no, "drug_code": code, "drug_name": name}


# --- parsing ------------------------------------------------------------------

def test_parse_splits_name_form_and_strength():
    p = parse_medicine("Amlodipine Tablet IP 5 mg 1x1")
    assert p.base_name == "amlodipine"
    assert p.form == "tablet"
    assert (5.0, "mg") in p.strengths


def test_parse_drops_pharmacopoeia_and_pack_size():
    p = parse_medicine("Paracetamol Tablet IP 500 mg 1x1")
    assert "ip" not in p.base_name
    assert "1x1" not in p.base_name


def test_parse_normalises_gram_to_milligram():
    assert (1000.0, "mg") in parse_medicine("Pralidoxime Chloride Injection IP 1 gm").strengths


def test_parse_cuts_compositional_prose():
    """The indent appends 'Each tablet contains ...', which is not part of the name."""
    p = parse_medicine("Albendazole Tablet IP 400 mg Each chewable tablet contains ...")
    assert p.base_name == "albendazole"


# --- strength comparison ------------------------------------------------------

def test_a_shared_volume_does_not_excuse_a_differing_dose():
    """250mg/5ml vs 125mg/5ml share '5ml'; comparing sets wholesale called them equal."""
    a = parse_medicine("Amoxycillin 250mg/5ml syrup").strengths
    b = parse_medicine("Amoxycillin oral suspension 125 mg/5ml 1x60ml bottle").strengths
    assert not strengths_compatible(a, b)


def test_matching_dose_and_volume_agree():
    a = parse_medicine("Amoxycillin 250mg/5ml syrup").strengths
    b = parse_medicine("Amoxycillin oral suspension 250 mg/5ml 1x60ml bottle").strengths
    assert strengths_compatible(a, b)


def test_strengths_in_unrelated_units_are_treated_as_disagreement():
    """'Vitamin A 25000 IU' vs 'Vitamin-E 400mg' -- different drugs entirely."""
    a = parse_medicine("Vitamin A capsules 25000 IU").strengths
    b = parse_medicine("Vitamin-E Capsules USP 400mg 1x1").strengths
    assert not strengths_compatible(a, b)


def test_a_missing_strength_cannot_contradict():
    assert strengths_compatible(parse_medicine("Sterile blood lancets NA").strengths,
                                parse_medicine("Surgical gloves latex 7 1x1").strengths)


def test_microgram_and_milligram_compare_on_the_same_scale():
    a = parse_medicine("Anti-D immunoglobin 300mcg injection").strengths
    b = parse_medicine("Anti-D Immunoglobulin IP 300 mcg 1x1 ml Vial").strengths
    assert strengths_compatible(a, b)


# --- form comparison ----------------------------------------------------------

@pytest.mark.parametrize(
    "a,b,expected",
    [
        ("tablet", "tablet", True),
        ("syrup", "suspension", True),    # same product, different wording
        ("injection", "infusion", True),
        ("tablet", "injection", False),
        ("syrup", "capsule", False),
        ("", "tablet", True),             # survey often omits the form
    ],
)
def test_form_compatibility(a, b, expected):
    assert forms_compatible(a, b) is expected


# --- acceptance rules ---------------------------------------------------------

def test_a_clean_match_is_auto_accepted():
    res = match_items(
        [_survey(1, "Amlodipine", "5mg tablet", "Tablet")],
        [_indent(1, "D00461", "Amlodipine Tablet IP 5 mg 1x1")],
    )
    assert res[0].auto_accepted
    assert res[0].matched_code == "D00461"


def test_a_wrong_dosage_form_is_not_auto_accepted():
    res = match_items(
        [_survey(1, "Amoxycillin", "250mg/5ml syrup", "Oral Liquid")],
        [_indent(1, "D00999", "Amoxycillin Capsules IP 250 mg 1x1")],
    )
    assert not res[0].auto_accepted
    assert res[0].matched_code is None


def test_a_wrong_strength_is_not_auto_accepted():
    res = match_items(
        [_survey(1, "Ibuprofen", "200mg tablet", "Tablet")],
        [_indent(1, "D00888", "Ibuprofen Tablet IP 400 mg 1x1")],
    )
    assert not res[0].auto_accepted


def test_two_equally_good_candidates_are_not_auto_accepted():
    """A near-tie means the evidence does not pick a row, so a human must."""
    res = match_items(
        [_survey(1, "Risperidone", "2mg tablet", "Tablet")],
        [
            _indent(1, "D00001", "Risperidone Tablet IP 2 mg 1x1"),
            _indent(2, "D00002", "Risperidone Tablets IP 2 mg 1x1"),
        ],
    )
    assert not res[0].auto_accepted


def test_two_survey_items_cannot_claim_the_same_indent_row():
    res = match_items(
        [_survey(1, "Disposable mask", "NA"), _survey(2, "Triple layer mask", "NA")],
        [_indent(1, "M00167", "Disposable Mask Triple Layer Elastic type 1x1")],
    )
    assert not any(r.auto_accepted for r in res)
    assert all(r.forced_review for r in res)
    assert all(r.matched_code is None for r in res)


def test_an_item_with_no_plausible_candidate_yields_no_match():
    res = match_items(
        [_survey(1, "Zinc syrup", "60 ml")],
        [_indent(1, "D00777", "Paracetamol Pediatric Syrup IP 125 mg/5ml 1x60ml bottle")],
    )
    assert not res[0].auto_accepted
    assert res[0].matched_code is None


def test_unconfirmed_matches_never_produce_a_code():
    """The spec's rule: uncertain matches stay excluded until confirmed."""
    res = match_items(
        [_survey(1, "Something Unmatchable", "1mg")],
        [_indent(1, "D00001", "Totally Different Drug Injection IP 5 mg")],
    )
    assert all(r.matched_code is None for r in res if not r.auto_accepted)
