#!/usr/bin/env python
"""Build the Gadag taluk facility list from OpenStreetMap.

    python data/pipeline/03_build_facilities.py

Reads   data/raw/osm/overpass_gadag_health_20260916.json      (never modified)
        data/raw/osm/overpass_gadag_taluk_boundary_20260916.json
        data/manual/facility_verification.csv                 (your corrections, if present)
Writes  data/processed/facilities.csv          -- no real names; this is what the site reads
        data/processed/gadag_taluk_boundary.geojson
        data/manual/facility_verification.csv  -- with names and map links, for your team
        data/interim/facility_build_report.json

Real facility names stay in data/raw/ and the verification sheet. They never reach
data/processed/ and never reach the website.

Re-running preserves anything already recorded in the verification sheet.
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import date

import pandas as pd

from zealo.config import INTERIM_DIR, MANUAL_DIR, PROCESSED_DIR, RAW_DIR
from zealo.pipeline.facilities import (
    BOUNDARY_RELATION,
    PHC,
    SOURCE_ID,
    build_facilities,
    load_boundary,
    load_osm_records,
)

OSM_DIR = RAW_DIR / "osm"
HEALTH_JSON = OSM_DIR / "overpass_gadag_health_20260916.json"
BOUNDARY_JSON = OSM_DIR / "overpass_gadag_taluk_boundary_20260916.json"
VERIFICATION_CSV = MANUAL_DIR / "facility_verification.csv"

# The survey covers every PHC in the taluk, so it tells us how many should exist.
SURVEY_PHC_COUNT = 15
RETRIEVED = "2026-09-16"


def _map_links(lat: float, lon: float) -> tuple[str, str]:
    osm = f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=18/{lat}/{lon}"
    google = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"
    return osm, google


def _read_existing() -> dict[str, dict[str, str]]:
    if not VERIFICATION_CSV.exists():
        return {}
    with VERIFICATION_CSV.open(newline="") as fh:
        return {
            row["internal_id"]: row
            for row in csv.DictReader(fh)
            if row.get("internal_id")
        }


def main() -> int:
    for path in (HEALTH_JSON, BOUNDARY_JSON):
        if not path.exists():
            print(f"ERROR: missing raw source {path}", file=sys.stderr)
            return 2

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)

    rings = load_boundary(BOUNDARY_JSON)
    records = load_osm_records(HEALTH_JSON)
    facilities, excluded = build_facilities(records, rings)
    existing = _read_existing()

    # --- boundary, for the map and for coordinate validation -------------------
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": "Gadag taluk",
                    "source": SOURCE_ID,
                    "osm_relation": BOUNDARY_RELATION,
                    "licence": "ODbL",
                    "attribution": "© OpenStreetMap contributors",
                    "retrieved": RETRIEVED,
                    "provenance": "real",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[lon, lat] for lat, lon in ring] for ring in rings],
                },
            }
        ],
    }
    (PROCESSED_DIR / "gadag_taluk_boundary.geojson").write_text(json.dumps(geojson))

    # --- the file the website reads: labels only, never real names -------------
    rows = []
    for f in facilities:
        prior = existing.get(f.internal_id, {})
        rows.append(
            {
                "internal_id": f.internal_id,
                "display_label": f.display_label,
                "facility_type": f.facility_type,
                "ownership": f.ownership,
                "lat": f.lat,
                "lon": f.lon,
                "beds": "",
                "inside_boundary": f.inside_boundary,
                "source_ids": SOURCE_ID,
                "retrieved": RETRIEVED,
                # Provenance per field. Coordinates are copied from the source;
                # type and ownership are inferred from names because OSM has no
                # field for either.
                "lat_provenance": "real",
                "lon_provenance": "real",
                "facility_type_provenance": "derived",
                "ownership_provenance": "derived",
                "beds_provenance": "unknown",
                # Flag codes only. The human-readable notes can name real
                # facilities, so they stay in the verification sheet.
                "review_flags": " ".join(f.review_flags),
                "verified": (prior.get("verified", "") or "").strip().lower() == "yes",
            }
        )
    pd.DataFrame(rows).to_csv(PROCESSED_DIR / "facilities.csv", index=False)

    # --- the sheet your team checks: names and map links ----------------------
    fields = [
        "internal_id",
        "display_label",
        "facility_type",
        "ownership",
        "osm_name",
        "lat",
        "lon",
        "osm_ids",
        "needs_review",
        "map_link_osm",
        "map_link_google",
        "verified",
        "correct_type",
        "correct_ownership",
        "beds",
        "notes",
    ]
    with VERIFICATION_CSV.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for f in facilities:
            prior = existing.get(f.internal_id, {})
            osm_link, google_link = _map_links(f.lat, f.lon)
            writer.writerow(
                {
                    "internal_id": f.internal_id,
                    "display_label": f.display_label,
                    "facility_type": f.facility_type,
                    "ownership": f.ownership,
                    "osm_name": " | ".join(f.real_names),
                    "lat": f.lat,
                    "lon": f.lon,
                    "osm_ids": " ".join(f.osm_ids),
                    "needs_review": "; ".join(f.review_notes),
                    "map_link_osm": osm_link,
                    "map_link_google": google_link,
                    "verified": prior.get("verified", ""),
                    "correct_type": prior.get("correct_type", ""),
                    "correct_ownership": prior.get("correct_ownership", ""),
                    "beds": prior.get("beds", ""),
                    "notes": prior.get("notes", ""),
                }
            )

    phc_count = sum(1 for f in facilities if f.facility_type == PHC)
    verified_count = sum(1 for r in rows if r["verified"])
    by_type: dict[str, int] = {}
    for f in facilities:
        by_type[f.facility_type] = by_type.get(f.facility_type, 0) + 1

    meta = {
        "built_on": date.today().isoformat(),
        "source": SOURCE_ID,
        "osm_relation": BOUNDARY_RELATION,
        "retrieved": RETRIEVED,
        "osm_records": len(records),
        "facilities": len(facilities),
        "excluded": excluded,
        "by_type": by_type,
        "flagged_for_review": sum(1 for f in facilities if f.review_flags),
        "verified": verified_count,
        "phc_gap": {
            "found_in_osm": phc_count,
            "expected_from_survey": SURVEY_PHC_COUNT,
            "missing": SURVEY_PHC_COUNT - phc_count,
            "consequence": (
                "The survey provides 15 PHC availability profiles. Only "
                f"{phc_count} PHC locations exist in OpenStreetMap, so "
                f"{SURVEY_PHC_COUNT - phc_count} profiles have nowhere to go. "
                "The remaining PHC locations must come from the HMIS facility list "
                "(request R4) -- they will not be invented."
            ),
        },
    }
    (INTERIM_DIR / "facility_build_report.json").write_text(json.dumps(meta, indent=2))

    print(f"OSM records: {len(records)}  ->  facilities: {len(facilities)}")
    print(f"Excluded:    {len(excluded)} ({', '.join(e['reason'] for e in excluded)})")
    print("By type:     " + ", ".join(f"{k}={v}" for k, v in sorted(by_type.items())))
    print(f"Flagged:     {meta['flagged_for_review']} need review")
    print(f"Verified:    {verified_count} of {len(facilities)}")
    print(f"\nWrote facilities.csv and gadag_taluk_boundary.geojson to {PROCESSED_DIR}")
    print(f"Verification sheet: {VERIFICATION_CSV}")
    if phc_count < SURVEY_PHC_COUNT:
        print(
            f"\n>>> PHC GAP: OpenStreetMap has {phc_count} PHCs; the survey covers "
            f"{SURVEY_PHC_COUNT}.\n"
            f"    {SURVEY_PHC_COUNT - phc_count} survey profiles have no location to "
            "attach to.\n"
            "    Needs the HMIS facility list (request R4). No locations will be invented."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
