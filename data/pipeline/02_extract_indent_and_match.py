#!/usr/bin/env python
"""Build the medicine master list and match the survey's 104 items to it.

    python data/pipeline/02_extract_indent_and_match.py

Reads   data/raw/ksmscl_annual_indent_2025_26.pdf   (never modified)
        data/raw/gadag_phc_survey_cureus_e39341.pdf (never modified)
        data/manual/indent_match_review.csv         (your decisions, if present)
Writes  data/processed/medicines.csv
        data/processed/survey_item_matches.csv
        data/manual/indent_match_review.csv         (decisions preserved)
        data/interim/indent_match_report.json

Re-running is safe: decisions already recorded in the review file are read back and
kept. An uncertain match with no decision stays **excluded** from the build.
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import date

import pandas as pd
from rapidfuzz import fuzz, process

from zealo.config import INTERIM_DIR, MANUAL_DIR, PROCESSED_DIR, RAW_DIR
from zealo.pipeline.indent import PUBLISHED_N_DRUGS, extract_indent, verify_indent
from zealo.pipeline.matching import REVIEW_CANDIDATES, MatchResult, match_items
from zealo.pipeline.survey import extract_table2, extract_table3

INDENT_PDF = RAW_DIR / "ksmscl_annual_indent_2025_26.pdf"
SURVEY_PDF = RAW_DIR / "gadag_phc_survey_cureus_e39341.pdf"
REVIEW_CSV = MANUAL_DIR / "indent_match_review.csv"

INDENT_SOURCE = "ksmscl_indent_2025_26"
SURVEY_SOURCE = "gadag_survey_2023"

# Linking survey Table 2 (availability) to Table 3 (dosage form, essentiality).
# Both describe the same 104 items in the same paper, so a high bar is appropriate.
TABLE_LINK_THRESHOLD = 85


def _link_table2_to_table3(t2: list[dict], t3: list[dict]) -> int:
    """Attach Table 3's dosage form and essentiality to Table 2 rows, in place."""
    keys = [f"{r['drug_name']} {r['strength']}" for r in t3]
    linked = 0
    for row in t2:
        query = f"{row['drug_name']} {row['strength']}"
        _, score, idx = process.extractOne(query, keys, scorer=fuzz.token_set_ratio)
        if score >= TABLE_LINK_THRESHOLD:
            row["dosage_form"] = t3[idx]["dosage_form"]
            row["essentiality"] = t3[idx]["essentiality"]
            row["survey_drug_code"] = t3[idx]["drug_code"]
            linked += 1
    return linked


REVIEW_HEADER = """\
# MATCH REVIEW (request R7). Fill the `decision` column; leave a row blank to skip it for now.
#   accept      -> use the `suggested` value in that row
#   D00461      -> use this indent drug code (any code, not only the candidates shown)
#   none        -> this survey item has no equivalent in the indent
# Rules: accept a match only when generic name, strength AND dosage form all align.
#   A different strength or dosage form is `none`, even if the drug is the same.
#   Survey items with no indent equivalent (e.g. some surgical consumables) are `none`.
# Rows are sorted most useful first: most essential, then very essential, then essential;
#   within each, items whose best candidate is stocked at PHC level come first.
# Unmatched items still appear on the map with survey availability only (no quantities).
# Re-running the pipeline never overwrites a decision you have entered.
"""

VALID_CONFIDENCE = ("high", "medium", "low")


def _read_review_rows() -> dict[int, dict[str, str]]:
    """Previously written review rows, keyed by survey item, comment lines skipped."""
    if not REVIEW_CSV.exists():
        return {}
    with REVIEW_CSV.open(newline="") as fh:
        lines = [line for line in fh if not line.lstrip().startswith("#")]
    rows: dict[int, dict[str, str]] = {}
    for row in csv.DictReader(lines):
        try:
            rows[int(row["survey_sl_no"])] = row
        except (KeyError, TypeError, ValueError):
            continue
    return rows


def _read_decisions() -> dict[int, dict[str, str]]:
    """Decisions entered by the team, resolved to a concrete code or `none`.

    `accept` resolves to the `suggested` value **in the same row of the file**, i.e.
    exactly what the reviewer saw, never a suggestion recomputed afterwards.
    """
    decisions: dict[int, dict[str, str]] = {}
    for sl_no, row in _read_review_rows().items():
        raw = (row.get("decision") or "").strip()
        if not raw:
            continue
        if raw.lower() == "accept":
            resolved = (row.get("suggested") or "").strip()
        else:
            resolved = raw
        decisions[sl_no] = {
            "decision": raw,
            "resolved": resolved,
            "suggested": (row.get("suggested") or "").strip(),
            "suggestion_confidence": (row.get("suggestion_confidence") or "").strip(),
            "notes": row.get("notes", ""),
        }
    return decisions


ESSENTIALITY_ORDER = {"most_essential": 0, "very_essential": 1, "essential": 2}


def _suggest(r: MatchResult) -> tuple[str, str]:
    """A candidate code (or `none`) and how far the suggestion can be trusted.

    Applies the team's rule: only a candidate whose name, strength and dosage form all
    align may be suggested as a match; otherwise `none`. "high" is reserved for cases a
    reviewer can accept without reading the candidates, so it requires both labels to
    name a form, a strict name score as well as the lenient one, and no near-tie. Items
    that share a suggestion with another item are capped separately afterwards.
    """
    aligned = [c for c in r.candidates if c.form_ok and c.strength_ok]
    if aligned:
        best = max(aligned, key=lambda c: (c.name_score, c.strict_name_score))
        if r.forced_review or r.near_tie:
            return best.indent_code, "low"
        if best.form_known and best.name_score >= 90 and best.strict_name_score >= 90:
            return best.indent_code, "high"
        if best.name_score >= 75 and best.strict_name_score >= 60:
            return best.indent_code, "medium"
        return best.indent_code, "low"
    if r.candidates and r.candidates[0].name_score >= 88:
        # Same drug by name, but strength or form differs -> `none` by the rule.
        return "none", "medium"
    return "none", "low"


def _cap_shared_suggestions(suggestions: dict[int, tuple[str, str]]) -> dict[int, tuple[str, str]]:
    """At most one survey item can truly be a given indent row.

    Four glove sizes all pointing at the single size-7 row means at least three are
    wrong, so every item sharing a suggested code drops to `low`.
    """
    counts: dict[str, int] = {}
    for code, _ in suggestions.values():
        if code != "none":
            counts[code] = counts.get(code, 0) + 1
    return {
        sl: (code, "low" if code != "none" and counts[code] > 1 else confidence)
        for sl, (code, confidence) in suggestions.items()
    }


def _write_review(
    results: list[MatchResult],
    decisions: dict[int, dict[str, str]],
    survey_rows: dict[int, dict],
    indent_by_code: dict[str, dict],
) -> int:
    """Write the review file for every item that is not auto-accepted."""
    fields = [
        "survey_sl_no", "essentiality", "survey_label", "why_review",
        "suggested", "suggestion_confidence", "decision", "notes",
    ]
    for i in range(1, REVIEW_CANDIDATES + 1):
        fields += [
            f"cand{i}_code", f"cand{i}_name", f"cand{i}_score",
            f"cand{i}_form_ok", f"cand{i}_strength_ok", f"cand{i}_at_phc",
        ]

    pending_rows = [r for r in results if not r.auto_accepted]
    suggestions = _cap_shared_suggestions({r.survey_sl_no: _suggest(r) for r in pending_rows})

    def sort_key(r: MatchResult):
        essentiality = survey_rows[r.survey_sl_no].get("essentiality", "")
        best = r.candidates[0] if r.candidates else None
        at_phc = bool(best and indent_by_code.get(best.indent_code, {}).get("at_phc"))
        return (ESSENTIALITY_ORDER.get(essentiality, 3), 0 if at_phc else 1, r.survey_sl_no)

    pending = 0
    with REVIEW_CSV.open("w", newline="") as fh:
        fh.write(REVIEW_HEADER)
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for r in sorted(pending_rows, key=sort_key):
            existing = decisions.get(r.survey_sl_no, {})
            if existing.get("decision"):
                # Freeze what the reviewer saw: never swap the suggestion under a decision.
                suggested = existing.get("suggested", "")
                confidence = existing.get("suggestion_confidence", "")
            else:
                pending += 1
                suggested, confidence = suggestions[r.survey_sl_no]
            row = {
                "survey_sl_no": r.survey_sl_no,
                "essentiality": survey_rows[r.survey_sl_no].get("essentiality", "") or "unknown",
                "survey_label": r.survey_label,
                "why_review": _why(r),
                "suggested": suggested,
                "suggestion_confidence": confidence,
                "decision": existing.get("decision", ""),
                "notes": existing.get("notes", ""),
            }
            for i in range(1, REVIEW_CANDIDATES + 1):
                c = r.candidates[i - 1] if len(r.candidates) >= i else None
                row[f"cand{i}_code"] = c.indent_code if c else ""
                row[f"cand{i}_name"] = c.indent_name if c else ""
                row[f"cand{i}_score"] = c.name_score if c else ""
                row[f"cand{i}_form_ok"] = c.form_ok if c else ""
                row[f"cand{i}_strength_ok"] = c.strength_ok if c else ""
                row[f"cand{i}_at_phc"] = (
                    bool(indent_by_code.get(c.indent_code, {}).get("at_phc")) if c else ""
                )
            writer.writerow(row)
    return pending


def _why(r: MatchResult) -> str:
    if r.forced_review:
        return r.forced_review
    if not r.candidates:
        return "no candidate scored above the minimum name similarity"
    best = r.candidates[0]
    reasons = []
    if best.name_score < 88.0:
        reasons.append(f"name similarity only {best.name_score}")
    if not best.form_ok:
        reasons.append("dosage form disagrees")
    if not best.strength_ok:
        reasons.append("strength disagrees")
    if not reasons:
        reasons.append("top two candidates are too close to separate")
    return "; ".join(reasons)


def main() -> int:
    for pdf in (INDENT_PDF, SURVEY_PDF):
        if not pdf.exists():
            print(f"ERROR: missing raw source {pdf}", file=sys.stderr)
            return 2

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)

    indent = extract_indent(INDENT_PDF)
    report = verify_indent(indent)
    if not report.ok:
        print("INDENT VERIFICATION FAILED:", file=sys.stderr)
        for p in report.problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    t2 = extract_table2(SURVEY_PDF)
    t3 = extract_table3(SURVEY_PDF)
    linked = _link_table2_to_table3(t2, t3)

    results = match_items(t2, indent)
    decisions = _read_decisions()
    survey_rows = {r["sl_no"]: r for r in t2}
    indent_by_code = {r["drug_code"]: r for r in indent}
    invalid = {
        sl: d["resolved"]
        for sl, d in decisions.items()
        if d["resolved"].lower() != "none" and d["resolved"] not in indent_by_code
    }
    pending = _write_review(results, decisions, survey_rows, indent_by_code)

    # Master list: every indent row, tagged as transcribed from the source.
    medicines = pd.DataFrame(indent)
    medicines["source_id"] = INDENT_SOURCE
    medicines["provenance"] = "real"
    medicines.to_csv(PROCESSED_DIR / "medicines.csv", index=False)

    # Survey items with whatever link we can justify.
    by_indent = {r["drug_code"]: r for r in indent}
    rows = []
    for r, survey_row in zip(results, t2, strict=True):
        decision = decisions.get(r.survey_sl_no, {}).get("resolved", "")
        if r.auto_accepted:
            code, status = r.matched_code, "auto"
        elif r.survey_sl_no in invalid:
            # An unknown code is not silently accepted; the item stays availability-only.
            code, status = None, "invalid_decision"
        elif decision.lower() == "none":
            code, status = None, "confirmed_no_match"
        elif decision:
            code, status = decision, "confirmed"
        else:
            code, status = None, "pending_review"
        matched = by_indent.get(code) if code else None
        rows.append(
            {
                "survey_sl_no": r.survey_sl_no,
                "survey_drug_name": survey_row["drug_name"],
                "survey_strength": survey_row["strength"],
                "survey_dosage_form": survey_row.get("dosage_form", ""),
                "survey_essentiality": survey_row.get("essentiality", ""),
                "survey_availability_pct": survey_row["availability_pct"],
                "indent_drug_code": code or "",
                "indent_drug_name": matched["drug_name"] if matched else "",
                "indent_category": matched["category"] if matched else "",
                "at_phc": matched["at_phc"] if matched else "",
                "at_chc": matched["at_chc"] if matched else "",
                "at_tlh": matched["at_tlh"] if matched else "",
                "at_dlh": matched["at_dlh"] if matched else "",
                "indent_qty": matched["indent_qty"] if matched else "",
                "match_status": status,
                # The link itself is derived; the availability it carries is real.
                "provenance": "derived" if code else "unmatched",
                "source_id": f"{SURVEY_SOURCE}+{INDENT_SOURCE}" if code else SURVEY_SOURCE,
            }
        )
    pd.DataFrame(rows).to_csv(PROCESSED_DIR / "survey_item_matches.csv", index=False)

    counts = {
        "auto": sum(1 for r in rows if r["match_status"] == "auto"),
        "confirmed": sum(1 for r in rows if r["match_status"] == "confirmed"),
        "confirmed_no_match": sum(
            1 for r in rows if r["match_status"] == "confirmed_no_match"
        ),
        "pending_review": sum(1 for r in rows if r["match_status"] == "pending_review"),
        "invalid_decision": sum(1 for r in rows if r["match_status"] == "invalid_decision"),
    }
    meta = {
        "built_on": date.today().isoformat(),
        "indent_rows": report.rows,
        "published_n_drugs": PUBLISHED_N_DRUGS,
        "survey_items": len(t2),
        "survey_table2_linked_to_table3": linked,
        "match_counts": counts,
        "usable_for_build": counts["auto"] + counts["confirmed"],
        "note": (
            "Items with match_status 'pending_review' are excluded from the build "
            "until a decision is recorded in data/manual/indent_match_review.csv."
        ),
    }
    (INTERIM_DIR / "indent_match_report.json").write_text(json.dumps(meta, indent=2))

    print(f"Indent:  {report.rows} drugs (published claim: {PUBLISHED_N_DRUGS})")
    print(f"Survey:  {len(t2)} items, {linked} linked to Table 3 attributes")
    print(
        f"Matches: {counts['auto']} auto, {counts['confirmed']} confirmed, "
        f"{counts['confirmed_no_match']} confirmed-no-match, "
        f"{counts['pending_review']} pending"
    )
    print(f"\nWrote medicines.csv and survey_item_matches.csv to {PROCESSED_DIR}")
    if invalid:
        print("\n>>> These decisions name an indent code that does not exist, so were NOT used:")
        for sl, code in sorted(invalid.items()):
            print(f"    survey item {sl}: '{code}'")
    if pending:
        print(
            f"\n>>> {pending} uncertain matches need your confirmation in\n"
            f"    {REVIEW_CSV}\n"
            "    Fill 'decision' with accept, an indent drug code, or none.\n"
            "    They stay excluded from the build until you do."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
