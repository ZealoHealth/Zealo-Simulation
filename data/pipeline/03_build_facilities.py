#!/usr/bin/env python
"""Build the Gadag taluk facility list.

    python data/pipeline/03_build_facilities.py

Reads   data/raw/osm/overpass_gadag_health_20260916.json        (never modified)
        data/raw/osm/overpass_gadag_taluk_boundary_20260916.json
        data/manual/facility_verification.csv   (your corrections, R8)
        data/manual/phc_locations.csv           (PHCs you have located, R4)
Writes  data/processed/facilities.csv           -- no real names; what the site reads
        data/processed/gadag_taluk_boundary.geojson
        data/manual/facility_verification.csv   -- your entries preserved
        data/manual/phc_locations.csv           -- created empty if absent
        data/manual/facility_attendance.csv     -- created/extended, entries preserved
        data/interim/facility_build_report.json

Entries you make are keyed on each facility's stable OpenStreetMap ids, not on its
display label or internal id, so correcting a facility's type never detaches them.
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
    GOVERNMENT_TYPES,
    MEDICINE_LIST,
    NETWORK_DEFAULT,
    PHARMACY,
    PHC,
    PHC_LOCATION_FIELDS,
    SOURCE_ID,
    apply_corrections,
    assign_labels,
    build_facilities,
    load_boundary,
    load_osm_records,
    phcs_from_locations,
    read_phc_locations,
    read_poc_keys,
    select_poc,
    POC_FIELDS,
)
from zealo.pipeline.geocode import Geocoder

OSM_DIR = RAW_DIR / "osm"
HEALTH_JSON = OSM_DIR / "overpass_gadag_health_20260916.json"
BOUNDARY_JSON = OSM_DIR / "overpass_gadag_taluk_boundary_20260916.json"
VERIFICATION_CSV = MANUAL_DIR / "facility_verification.csv"
PHC_LOCATIONS_CSV = MANUAL_DIR / "phc_locations.csv"
ATTENDANCE_CSV = MANUAL_DIR / "facility_attendance.csv"
POC_CSV = MANUAL_DIR / "poc_facilities.csv"

SURVEY_PHC_COUNT = 15
RETRIEVED = "2026-09-16"

VERIFICATION_FIELDS = [
    "facility_key", "in_poc", "internal_id", "display_label", "facility_type", "ownership",
    "osm_name", "lat", "lon", "location_precision", "needs_review", "evidence",
    "map_link_osm", "map_link_google",
    "verified", "correct_type", "correct_ownership", "beds", "notes",
]
ATTENDANCE_FIELDS = [
    "facility_key", "display_label", "osm_name", "opd_annual", "ipd_annual",
    "period", "source", "notes",
]


def _read_keyed(path, key_fields=("facility_key", "osm_ids")) -> dict[str, dict[str, str]]:
    """Rows keyed on the facility's stable key; older sheets keyed on osm_ids still load."""
    if not path.exists():
        return {}
    with path.open(newline="") as fh:
        lines = [line for line in fh if not line.lstrip().startswith("#")]
    rows = {}
    for row in csv.DictReader(lines):
        for field in key_fields:
            key = (row.get(field) or "").strip()
            if key:
                rows[" ".join(sorted(key.split())) if field == "osm_ids" else key] = row
                break
    return rows


def _links(lat: float, lon: float) -> tuple[str, str]:
    return (
        f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=18/{lat}/{lon}",
        f"https://www.google.com/maps/search/?api=1&query={lat},{lon}",
    )


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

    # PHCs the team has located (R4). Geocoding only runs for rows with a village and no
    # coordinates, and every response is cached.
    if not PHC_LOCATIONS_CSV.exists():
        with PHC_LOCATIONS_CSV.open("w", newline="") as fh:
            fh.write(
                "# R4: PHCs missing from OpenStreetMap. One row per PHC. Give latitude and\n"
                "# longitude if you have them; otherwise the village alone is geocoded to its\n"
                "# centre and shown as approximate. Names stay here and never reach the site.\n"
            )
            csv.writer(fh).writerow(PHC_LOCATION_FIELDS)
    location_rows = read_phc_locations(PHC_LOCATIONS_CSV)
    geocoder = Geocoder() if location_rows else None
    added, location_report = phcs_from_locations(location_rows, facilities, rings, geocoder)
    facilities.extend(added)

    corrections = _read_keyed(VERIFICATION_CSV)
    correction_problems: list[str] = []
    for f in facilities:
        if f.facility_key in corrections:
            correction_problems += apply_corrections(f, corrections[f.facility_key])
    assign_labels(facilities)  # labels over the full list, used only to describe the selection

    # --- proof-of-concept subset (15) ------------------------------------------------
    poc_keys = read_poc_keys(POC_CSV)
    poc_problems: list[str] = []
    if poc_keys is None:
        selection = select_poc(facilities)
        with POC_CSV.open("w", newline="") as fh:
            fh.write(
                "# Proof-of-concept facilities. Generated once by the rule in\n"
                "# zealo.pipeline.facilities.select_poc, then yours to edit: add or remove rows\n"
                "# by facility_key and run `make data`. This file is never overwritten.\n"
            )
            writer = csv.DictWriter(fh, fieldnames=POC_FIELDS)
            writer.writeheader()
            for f, reason in selection:
                writer.writerow({"facility_key": f.facility_key, "facility_type": f.facility_type,
                                 "label_when_selected": f.display_label, "reason": reason})
        poc_keys = [f.facility_key for f, _ in selection]
    by_key = {f.facility_key: f for f in facilities}
    poc_problems += [f"poc_facilities.csv: {k} is not a known facility" for k in poc_keys
                     if k not in by_key]
    poc_key_set = {k for k in poc_keys if k in by_key}
    poc = [f for f in facilities if f.facility_key in poc_key_set]
    rest = [f for f in facilities if f.facility_key not in poc_key_set]

    # Everything the rest of the pipeline and the site see is the subset, numbered within
    # itself (PHC 1-5, Private Hospital 1-4, ...). The full list is kept as a universe so
    # each facility's share of taluk demand is what it would be with every facility present.
    universe = [
        {"facility_key": f.facility_key, "facility_type": f.facility_type,
         "ownership": f.ownership, "medicine_list": MEDICINE_LIST[f.facility_type],
         "in_poc": f.facility_key in poc_key_set}
        for f in facilities
    ]
    pd.DataFrame(universe).to_csv(PROCESSED_DIR / "facility_universe.csv", index=False)
    assign_labels(poc)
    facilities = poc + rest

    # --- what the website reads: no real names anywhere ------------------------------
    rows = []
    for f in poc:
        rows.append(
            {
                "internal_id": f.internal_id,
                "facility_key": f.facility_key,
                "display_label": f.display_label,
                "facility_type": f.facility_type,
                "ownership": f.ownership,
                "lat": f.lat,
                "lon": f.lon,
                "beds": f.beds if f.beds is not None else "",
                "inside_boundary": f.inside_boundary,
                "location_precision": f.location_precision,
                "medicine_list": MEDICINE_LIST[f.facility_type],
                "in_network_default": NETWORK_DEFAULT[f.facility_type],
                "source_ids": " ".join(f.source_ids),
                "retrieved": RETRIEVED,
                "lat_provenance": f.location_provenance,
                "lon_provenance": f.location_provenance,
                "facility_type_provenance": f.type_provenance,
                "ownership_provenance": f.ownership_provenance,
                "beds_provenance": "real" if f.beds is not None else "unknown",
                "review_flags": " ".join(f.review_flags),
                "verified": f.verified,
            }
        )
    pd.DataFrame(rows).to_csv(PROCESSED_DIR / "facilities.csv", index=False)

    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": "Gadag taluk", "source": SOURCE_ID,
                    "osm_relation": BOUNDARY_RELATION, "licence": "ODbL",
                    "attribution": "© OpenStreetMap contributors",
                    "retrieved": RETRIEVED, "provenance": "real",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[lon, lat] for lat, lon in ring] for ring in rings],
                },
            }
        ],
    }
    (PROCESSED_DIR / "gadag_taluk_boundary.geojson").write_text(json.dumps(geojson))

    # --- verification sheet: rebuilt around your entries, which are never dropped ------
    with VERIFICATION_CSV.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=VERIFICATION_FIELDS)
        writer.writeheader()
        for f in facilities:
            prior = corrections.get(f.facility_key, {})
            osm_link, google_link = _links(f.lat, f.lon)
            in_poc = f.facility_key in poc_key_set
            writer.writerow(
                {
                    "facility_key": f.facility_key,
                    "in_poc": "yes" if in_poc else "no",
                    "internal_id": f.internal_id if in_poc else "",
                    "display_label": f.display_label if in_poc else "",
                    "facility_type": f.facility_type,
                    "ownership": f.ownership,
                    "osm_name": " | ".join(f.real_names),
                    "lat": f.lat,
                    "lon": f.lon,
                    "location_precision": f.location_precision,
                    "needs_review": "; ".join(f.review_notes),
                    "evidence": f.evidence,
                    "map_link_osm": osm_link,
                    "map_link_google": google_link,
                    **{k: prior.get(k, "") for k in
                       ("verified", "correct_type", "correct_ownership", "beds", "notes")},
                }
            )
        orphaned = set(corrections) - {f.facility_key for f in facilities}
        for key in sorted(orphaned):
            # A row whose facility vanished from the source is kept, never discarded.
            writer.writerow({**{k: corrections[key].get(k, "") for k in VERIFICATION_FIELDS},
                             "facility_key": key,
                             "needs_review": "facility no longer present in the source data"})

    # --- attendance template for the demand split (R4), entries preserved -------------
    attendance = _read_keyed(ATTENDANCE_CSV, key_fields=("facility_key",))
    with ATTENDANCE_CSV.open("w", newline="") as fh:
        fh.write(
            "# R4: annual OPD/IPD attendance from HMIS, for government facilities. While this\n"
            "# is empty, demand is split equally (estimated). Fill opd_annual to switch a\n"
            "# facility to attendance-weighted demand (derived).\n"
        )
        writer = csv.DictWriter(fh, fieldnames=ATTENDANCE_FIELDS)
        writer.writeheader()
        for f in poc:
            if f.facility_type not in GOVERNMENT_TYPES:
                continue
            prior = attendance.get(f.facility_key, {})
            writer.writerow({
                "facility_key": f.facility_key, "display_label": f.display_label,
                "osm_name": " | ".join(f.real_names),
                **{k: prior.get(k, "") for k in
                   ("opd_annual", "ipd_annual", "period", "source", "notes")},
            })
        for key in sorted(set(attendance) - {f.facility_key for f in poc}):
            writer.writerow({k: attendance[key].get(k, "") for k in ATTENDANCE_FIELDS})

    by_type: dict[str, int] = {}
    for f in poc:
        by_type[f.facility_type] = by_type.get(f.facility_type, 0) + 1
    phc_count = by_type.get(PHC, 0)
    meta = {
        "built_on": date.today().isoformat(),
        "osm_records": len(records),
        "facilities_mapped": len(facilities),
        "facilities": len(poc),
        "poc_problems": poc_problems,
        "added_from_phc_locations": len(added),
        "geocoder_live_requests": geocoder.live_requests if geocoder else 0,
        "excluded": excluded,
        "by_type": by_type,
        "verified": sum(1 for f in poc if f.verified),
        "pharmacies_mapped": sum(1 for f in facilities if f.facility_type == PHARMACY),
        "phcs_mapped": phc_count,
        "phcs_in_survey": SURVEY_PHC_COUNT,
        "location_report": location_report,
        "correction_problems": correction_problems,
    }
    (INTERIM_DIR / "facility_build_report.json").write_text(json.dumps(meta, indent=2))

    print(f"Facilities: {len(poc)} in the proof of concept, of {len(facilities)} mapped "
          f"({len(added)} added from phc_locations.csv)")
    print("By type:    " + ", ".join(f"{k}={v}" for k, v in sorted(by_type.items())))
    print(f"Verified:   {meta['verified']} of {len(poc)}")
    print(f"PHCs:       {phc_count} of {SURVEY_PHC_COUNT} mapped")
    for line in location_report + correction_problems + poc_problems:
        print(f"  ! {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
