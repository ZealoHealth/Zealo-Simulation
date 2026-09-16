"""Match the 104 survey items to rows in the Karnataka annual indent.

Why this is not a join
----------------------
The survey's drug codes use Karnataka EDL section numbering ("6.3.2") and the
indent uses "D00303"/"M00122". The indent does contain seven EDL-style codes, but
they share no values with the survey's 103, so there is no code-level join for a
single survey item. Matching therefore has to work from the text.

Why not one fuzzy score
-----------------------
A single similarity score over the whole label is not safe enough to build stock
levels on. Measured against the real data, "Amoxycillin 250mg/5ml syrup" scores 81
against "Amoxycillin Capsules IP 250 mg 1x1" -- same drug, same strength, wrong
dosage form -- and "Zinc syrup 60 ml" scores 50 against a paracetamol syrup whose
60ml pack size looks like an agreeing strength.

So each label is parsed into three comparable parts instead:

    base name   the drug itself, with form words, pharmacopoeia markers, pack
                sizes and strengths stripped out
    form        tablet / injection / syrup / ...
    strengths   numeric quantities normalised to a common unit

A match is auto-accepted only when the base names are close **and** the forms
agree **and** the strengths agree. Everything else goes to a review file for a
human, and stays excluded from the build until confirmed. Thresholds were tuned
against the real output, not guessed; see data/METHODS.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from rapidfuzz import fuzz

# Pharmacopoeia markers carry no identifying information for matching.
_PHARMACOPOEIA = {"ip", "bp", "usp", "i.p", "b.p", "u.s.p", "each", "contains"}

# Dosage forms, mapped to a canonical spelling. Order matters only for readability.
_FORMS = {
    "tablet": "tablet", "tablets": "tablet", "tab": "tablet", "tabs": "tablet",
    "capsule": "capsule", "capsules": "capsule", "cap": "capsule", "caps": "capsule",
    "injection": "injection", "injections": "injection", "inj": "injection",
    "syrup": "syrup", "syp": "syrup",
    "suspension": "suspension", "susp": "suspension",
    "solution": "solution", "soln": "solution", "sol": "solution",
    "powder": "powder", "powd": "powder",
    "drops": "drops", "drop": "drops",
    "ointment": "ointment", "oint": "ointment",
    "cream": "cream", "gel": "gel", "lotion": "lotion",
    "infusion": "infusion", "inhaler": "inhaler", "sachet": "sachet",
    "pessaries": "pessary", "pessary": "pessary",
    "liquid": "liquid", "liq": "liquid",
    "granules": "granules", "spray": "spray", "patch": "patch",
    "suppository": "suppository", "enema": "enema",
}

# Forms that are the same product presented differently. Treated as compatible so
# a genuine match is not pushed into review over wording.
_FORM_EQUIVALENT = [
    {"syrup", "suspension", "liquid", "solution", "drops"},
    {"powder", "granules", "sachet"},
    {"injection", "infusion"},
    {"ointment", "cream", "gel"},
]

_PACK = re.compile(r"^\d+\s*x\s*[\d.]*\s*[a-z]*$")
_NUM_UNIT = re.compile(r"(\d+(?:\.\d+)?)\s*(mg|mcg|g|gm|ml|l|iu|i\.u|%|lakh)\b")
_UNIT_SCALE = {"g": ("mg", 1000.0), "gm": ("mg", 1000.0), "l": ("ml", 1000.0)}

# Tuned against the real 104-item output; see data/METHODS.md.
AUTO_ACCEPT_NAME_SCORE = 88.0
REVIEW_CANDIDATES = 3


@dataclass(frozen=True)
class ParsedMedicine:
    """A medicine label split into the parts that can be compared."""

    raw: str
    base_name: str
    form: str
    strengths: frozenset[tuple[float, str]]


def _canonical_strengths(text: str) -> frozenset[tuple[float, str]]:
    t = text.lower().replace("i.u", "iu")
    t = re.sub(r"(\d)\s+(mg|mcg|g|gm|ml|l|iu|%)", r"\1\2", t)
    t = t.replace("1,00,000", "100000").replace(",", "")
    out: set[tuple[float, str]] = set()
    for num, unit in _NUM_UNIT.findall(t):
        value, unit = float(num), unit.replace("i.u", "iu")
        if unit in _UNIT_SCALE:
            unit, factor = _UNIT_SCALE[unit]
            value *= factor
        if unit == "lakh":
            value, unit = value * 100000, "iu"
        out.add((value, unit))
    return frozenset(out)


def parse_medicine(text: str) -> ParsedMedicine:
    """Split a medicine label into base name, dosage form and strengths."""
    strengths = _canonical_strengths(text)

    t = text.lower()
    # The indent appends long compositional prose ("Each tablet contains ...").
    # It describes the same product, so it is cut before the name comparison.
    t = re.split(r"\beach\b", t)[0]
    t = t.replace("+", " ").replace("/", " ").replace("-", " ")
    t = re.sub(r"[(),]", " ", t)
    t = re.sub(r"(\d)\s+(mg|mcg|g|gm|ml|l|iu|%)", r"\1\2", t)

    form = ""
    words: list[str] = []
    for tok in t.split():
        tok = tok.strip(".")
        if not tok or tok in _PHARMACOPOEIA or _PACK.match(tok):
            continue
        if tok in _FORMS:
            form = form or _FORMS[tok]
            continue
        if _NUM_UNIT.fullmatch(tok) or re.fullmatch(r"[\d.]+", tok):
            continue
        words.append(tok)

    return ParsedMedicine(
        raw=text, base_name=" ".join(words).strip(), form=form, strengths=strengths
    )


def forms_compatible(a: str, b: str) -> bool:
    """True if two dosage forms describe the same kind of product.

    An absent form on either side is treated as compatible: the survey often omits
    it, and refusing to match on missing information would send genuine matches to
    review for no reason.
    """
    if not a or not b or a == b:
        return True
    return any(a in group and b in group for group in _FORM_EQUIVALENT)


# Units grouped by what they measure. Comparing within a family is what makes a
# disagreeing dose visible; comparing across families is what hid one.
_UNIT_FAMILY = {
    "mg": "mass", "mcg": "mass",
    "ml": "volume",
    "iu": "activity",
    "%": "concentration",
}


def _by_family(
    strengths: frozenset[tuple[float, str]],
) -> dict[str, set[float]]:
    """Group strengths by what they measure, normalising mcg to mg."""
    grouped: dict[str, set[float]] = {}
    for value, unit in strengths:
        family = _UNIT_FAMILY.get(unit)
        if family is None:
            continue
        if unit == "mcg":
            value = value / 1000.0
        grouped.setdefault(family, set()).add(round(value, 6))
    return grouped


def strengths_compatible(
    a: frozenset[tuple[float, str]], b: frozenset[tuple[float, str]]
) -> bool:
    """True if two strength sets agree, compared family by family.

    Comparing the sets wholesale is not safe. "Amoxycillin 250mg/5ml syrup" and
    "Amoxycillin oral suspension 125 mg/5ml" share the 5ml volume, so a plain
    intersection calls them compatible while the actual dose differs twofold.

    So each family of unit (mass, volume, activity, concentration) is compared
    separately, and every family present on **both** sides must agree. A family
    present on only one side carries no contradiction and is ignored, as is a label
    with no numeric strength at all -- many consumables have none.
    """
    if not a or not b:
        return True
    fa, fb = _by_family(a), _by_family(b)
    if not fa or not fb:
        return True  # only units we do not model; nothing to contradict
    shared = set(fa) & set(fb)
    if not shared:
        # Both labels carry a strength, but they are not measuring the same thing
        # -- "Vitamin A capsules 25000 IU" against "Vitamin-E Capsules 400mg".
        # Treating that as "no contradiction" let a wrong drug through, so it
        # counts as a disagreement and goes to review.
        return False
    return all(fa[family] & fb[family] for family in shared)


@dataclass
class MatchCandidate:
    indent_sl_no: int
    indent_code: str
    indent_name: str
    name_score: float
    form_ok: bool
    strength_ok: bool

    @property
    def acceptable(self) -> bool:
        return (
            self.name_score >= AUTO_ACCEPT_NAME_SCORE and self.form_ok and self.strength_ok
        )


@dataclass
class MatchResult:
    survey_sl_no: int
    survey_label: str
    parsed: ParsedMedicine
    candidates: list[MatchCandidate] = field(default_factory=list)
    forced_review: str | None = None

    @property
    def best(self) -> MatchCandidate | None:
        return self.candidates[0] if self.candidates else None

    @property
    def auto_accepted(self) -> bool:
        """Accepted only when the top candidate qualifies and no runner-up ties it.

        A near-tie means the evidence does not distinguish two indent rows, so the
        choice belongs to a human even though the top score looks strong.
        """
        if self.forced_review is not None:
            return False
        if not self.candidates or not self.candidates[0].acceptable:
            return False
        if len(self.candidates) > 1:
            runner_up = self.candidates[1]
            if runner_up.acceptable and (
                self.candidates[0].name_score - runner_up.name_score < 2.0
            ):
                return False
        return True

    @property
    def matched_code(self) -> str | None:
        return self.candidates[0].indent_code if self.auto_accepted else None


def match_items(
    survey_items: list[dict[str, Any]],
    indent_rows: list[dict[str, Any]],
    top_n: int = REVIEW_CANDIDATES,
) -> list[MatchResult]:
    """Match each survey item against the indent, keeping the top candidates.

    Args:
        survey_items: rows with ``sl_no``, ``drug_name``, ``strength`` and
            optionally ``dosage_form`` (from survey Table 3, where available).
        indent_rows: rows from ``zealo.pipeline.indent.extract_indent``.
        top_n: how many candidates to retain per item for the review file.
    """
    parsed_indent = [(r, parse_medicine(r["drug_name"])) for r in indent_rows]

    results: list[MatchResult] = []
    for item in survey_items:
        label = " ".join(
            str(item.get(k, "")) for k in ("drug_name", "strength", "dosage_form")
        ).strip()
        parsed = parse_medicine(label)

        scored: list[MatchCandidate] = []
        for row, pi in parsed_indent:
            score = fuzz.token_set_ratio(parsed.base_name, pi.base_name)
            if score < 60:
                continue
            scored.append(
                MatchCandidate(
                    indent_sl_no=row["sl_no"],
                    indent_code=row["drug_code"],
                    indent_name=row["drug_name"],
                    name_score=round(score, 1),
                    form_ok=forms_compatible(parsed.form, pi.form),
                    strength_ok=strengths_compatible(parsed.strengths, pi.strengths),
                )
            )
        # Prefer fully-qualifying candidates, then higher name similarity.
        scored.sort(key=lambda c: (c.acceptable, c.name_score), reverse=True)
        results.append(
            MatchResult(
                survey_sl_no=item["sl_no"],
                survey_label=label,
                parsed=parsed,
                candidates=scored[:top_n],
            )
        )
    flag_duplicate_targets(results)
    return results


def flag_duplicate_targets(results: list[MatchResult]) -> None:
    """Send every item to review when two of them claim the same indent row.

    Each indent row is one product, so two survey items resolving to it means at
    least one is wrong -- the survey lists both "Disposable mask" and "Triple layer
    mask" while the indent has a single "Disposable Mask Triple Layer Elastic
    type". Which survey item that row belongs to, if either, is a judgement call,
    so both are held for confirmation rather than silently double-counted.
    """
    claimed: dict[str, list[MatchResult]] = {}
    for r in results:
        if r.auto_accepted and r.best is not None:
            claimed.setdefault(r.best.indent_code, []).append(r)
    for code, group in claimed.items():
        if len(group) > 1:
            others = [g.survey_sl_no for g in group]
            for r in group:
                rest = [n for n in others if n != r.survey_sl_no]
                r.forced_review = (
                    f"indent row {code} is also the best match for survey "
                    f"item(s) {rest}"
                )
