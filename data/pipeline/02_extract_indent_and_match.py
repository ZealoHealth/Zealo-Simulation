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


def _read_decisions() -> dict[int, dict[str, str]]:
    """Read previously recorded decisions so a re-run never discards them."""
    if not REVIEW_CSV.exists():
        return {}
    decisions: dict[int, dict[str, str]] = {}
    with REVIEW_CSV.open(newline="") as fh:
        for row in csv.DictReader(fh):
            try:
                sl_no = int(row["survey_sl_no"])
            except (KeyError, ValueError):
                continue
            decision = (row.get("decision") or "").strip()
            if decision:
                decisions[sl_no] = {"decision": decision, "notes": row.get("notes", "")}
    return decisions


def _write_review(results: list[MatchResult], decisions: dict[int, dict[str, str]]) -> int:
    """Write the review file for every item that is not auto-accepted."""
    fields = ["survey_sl_no", "survey_label", "why_review"]
    for i in range(1, REVIEW_CANDIDATES + 1):
        fields += [
            f"cand{i}_code",
            f"cand{i}_name",
            f"cand{i}_score",
            f"cand{i}_form_ok",
            f"cand{i}_strength_ok",
        ]
    fields += ["decision", "notes"]

    pending = 0
    with REVIEW_CSV.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for r in results:
            if r.auto_accepted:
                continue
            existing = decisions.get(r.survey_sl_no, {})
            if not existing.get("decision"):
                pending += 1
            row = {
                "survey_sl_no": r.survey_sl_no,
                "survey_label": r.survey_label,
                "why_review": _why(r),
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
    pending = _write_review(results, decisions)

    # Master list: every indent row, tagged as transcribed from the source.
    medicines = pd.DataFrame(indent)
    medicines["source_id"] = INDENT_SOURCE
    medicines["provenance"] = "real"
    medicines.to_csv(PROCESSED_DIR / "medicines.csv", index=False)

    # Survey items with whatever link we can justify.
    by_indent = {r["drug_code"]: r for r in indent}
    rows = []
    for r, survey_row in zip(results, t2, strict=True):
        decision = decisions.get(r.survey_sl_no, {}).get("decision", "")
        if r.auto_accepted:
            code, status = r.matched_code, "auto"
        elif decision and decision.lower() != "none":
            code, status = decision, "confirmed"
        elif decision.lower() == "none":
            code, status = None, "confirmed_no_match"
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
    if pending:
        print(
            f"\n>>> {pending} uncertain matches need your confirmation in\n"
            f"    {REVIEW_CSV}\n"
            "    Fill the 'decision' column with an indent drug code, or 'none'.\n"
            "    They stay excluded from the build until you do."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
