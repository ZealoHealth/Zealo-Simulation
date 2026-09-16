"""Build the facility list for Gadag taluk from OpenStreetMap.

Source: OpenStreetMap via the Overpass API. Licence ODbL -- "(c) OpenStreetMap
contributors" must appear on every map.

What is real and what is not
----------------------------
Coordinates and OSM tags are ``real``: they are copied from the source record.
Facility **type** and **ownership** are ``derived`` -- OSM carries no `operator`
or `beds` tag for any facility here, so both are inferred from names and
descriptions by the documented rules below. Inference is fallible, which is why
every facility goes onto a verification sheet before the list is used, and why
the ``verified`` flag starts false.

Real names are kept here and in data/raw/ only. The processed output the website
reads carries display labels ("PHC 3", "Private Hospital 7") and no real names.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path

from rapidfuzz import fuzz

SOURCE_ID = "osm_overpass"
BOUNDARY_RELATION = 4155661  # "Gadag taluk", admin_level 6

# Facility types, in the order labels are numbered.
PHC = "phc"
CHC = "chc"
TALUK_HOSPITAL = "taluk_hospital"
DISTRICT_HOSPITAL = "district_hospital"
GOVERNMENT_OTHER = "government_other"
PRIVATE_HOSPITAL = "private_hospital"
CLINIC = "clinic"
PHARMACY = "pharmacy"

TYPE_LABELS = {
    PHC: "PHC",
    CHC: "CHC",
    TALUK_HOSPITAL: "Taluk Hospital",
    DISTRICT_HOSPITAL: "District Hospital",
    GOVERNMENT_OTHER: "Government Hospital",
    PRIVATE_HOSPITAL: "Private Hospital",
    CLINIC: "Clinic",
    PHARMACY: "Pharmacy",
}

GOVERNMENT_TYPES = frozenset(
    {PHC, CHC, TALUK_HOSPITAL, DISTRICT_HOSPITAL, GOVERNMENT_OTHER}
)

# Excluded outright: not human medicine-dispensing facilities, so they cannot
# carry the essential-medicines list this project models. Recorded, not silently
# dropped -- the excluded rows appear in the verification sheet with a reason.
_EXCLUDE_PATTERNS = [
    (re.compile(r"\bveterinar", re.I), "veterinary (animal health)"),
    (re.compile(r"\bblood\s*bank\b", re.I), "blood bank (no medicine inventory)"),
]

_GOVERNMENT_PATTERNS = re.compile(
    r"\b(government|govt|g\.?h\.?|phc|chc|primary health|community health|"
    r"taluk|taluka|district hospital|railway|esi|civil hospital|rural medical)\b",
    re.I,
)

# Review flag codes. Short, stable and free of real names, so they can be shown in
# the UI next to a facility without breaking the no-real-names rule.
FLAG_GENERIC_PHC_NAME = "generic_phc_name"
FLAG_UNCLEAR_GOVERNMENT_LEVEL = "unclear_government_level"
FLAG_NO_AMENITY_TAG = "no_amenity_tag"
FLAG_OUTSIDE_BOUNDARY = "outside_boundary"
FLAG_MERGED_RECORDS = "merged_records"
FLAG_UNNAMED_IN_OSM = "unnamed_in_osm"
FLAG_POSSIBLE_DUPLICATE = "possible_duplicate_nearby"

FLAG_EXPLANATIONS = {
    FLAG_GENERIC_PHC_NAME: (
        "typed PHC only from a generic 'primary health' name -- confirm this is a "
        "government PHC and not a private clinic using the phrase"
    ),
    FLAG_UNCLEAR_GOVERNMENT_LEVEL: (
        "government facility of unclear level -- set PHC / CHC / taluk hospital, "
        "because the level decides which medicine list it carries"
    ),
    FLAG_NO_AMENITY_TAG: "no amenity tag in OSM; defaulted to clinic",
    FLAG_OUTSIDE_BOUNDARY: "coordinates fall outside the taluk boundary",
    FLAG_MERGED_RECORDS: "several OSM records merged as one facility -- confirm",
    FLAG_UNNAMED_IN_OSM: "unnamed in OSM; type inferred from tags alone",
    FLAG_POSSIBLE_DUPLICATE: (
        "a nearby facility has a similar name -- confirm they are different places"
    ),
}


# Merge two records only when they are both very close and named almost alike.
DUPLICATE_DISTANCE_M = 50.0
DUPLICATE_NAME_SCORE = 85.0
# Looser bounds: not merged, but put in front of a human.
SUSPECT_DISTANCE_M = 120.0
SUSPECT_NAME_SCORE = 70.0


@dataclass
class Facility:
    internal_id: str
    display_label: str
    facility_type: str
    ownership: str
    lat: float
    lon: float
    beds: int | None
    osm_ids: list[str]
    real_names: list[str]
    inside_boundary: bool
    # Two parallel records of the same concerns. ``review_flags`` are short codes
    # safe to publish; ``review_notes`` are for humans and may name real
    # facilities, so they stay out of data/processed/ and off the website.
    review_flags: list[str] = field(default_factory=list)
    review_notes: list[str] = field(default_factory=list)
    verified: bool = False


# --- geometry ----------------------------------------------------------------

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def stitch_rings(ways: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    """Join boundary ways end-to-end into closed rings.

    Overpass returns a relation's outline as unordered way fragments that may run
    in either direction, so they are chained by matching endpoints.
    """
    remaining = [list(w) for w in ways if w]
    rings: list[list[tuple[float, float]]] = []
    while remaining:
        ring = remaining.pop(0)
        progressed = True
        while progressed and ring[0] != ring[-1]:
            progressed = False
            for i, candidate in enumerate(remaining):
                if candidate[0] == ring[-1]:
                    ring += candidate[1:]
                elif candidate[-1] == ring[-1]:
                    ring += list(reversed(candidate))[1:]
                elif candidate[-1] == ring[0]:
                    ring = candidate[:-1] + ring
                elif candidate[0] == ring[0]:
                    ring = list(reversed(candidate))[:-1] + ring
                else:
                    continue
                remaining.pop(i)
                progressed = True
                break
        rings.append(ring)
    return rings


def point_in_rings(lat: float, lon: float, rings: list[list[tuple[float, float]]]) -> bool:
    """Ray-casting point-in-polygon across every ring."""
    inside = False
    for ring in rings:
        for (lat1, lon1), (lat2, lon2) in zip(ring, ring[1:], strict=False):
            if (lat1 > lat) != (lat2 > lat):
                x = (lon2 - lon1) * (lat - lat1) / (lat2 - lat1) + lon1
                if lon < x:
                    inside = not inside
    return inside


def load_boundary(path: Path) -> list[list[tuple[float, float]]]:
    """Read the taluk outline from a saved Overpass `out geom` response."""
    data = json.loads(path.read_text())
    relation = data["elements"][0]
    ways = [
        [(p["lat"], p["lon"]) for p in m.get("geometry", [])]
        for m in relation["members"]
        if m.get("role") == "outer" and m["type"] == "way"
    ]
    return stitch_rings(ways)


# --- classification ----------------------------------------------------------

def _text_of(tags: dict[str, str]) -> str:
    return " ".join(
        str(tags.get(k, "")) for k in ("name", "description", "healthcare", "amenity")
    )


def exclusion_reason(tags: dict[str, str]) -> str | None:
    text = _text_of(tags)
    for pattern, reason in _EXCLUDE_PATTERNS:
        if pattern.search(text):
            return reason
    return None


def classify_type(tags: dict[str, str]) -> tuple[str, list[str]]:
    """Infer facility type from tags. Returns the type and any review flag codes.

    OSM has no field for this, so the rules read names and descriptions. Anything
    the rules cannot separate confidently is flagged rather than guessed.
    """
    name = tags.get("name", "")
    description = tags.get("description", "")
    text = f"{name} {description}"
    amenity = tags.get("amenity", "")
    notes: list[str] = []

    if re.search(r"\bdistrict hospital\b", text, re.I):
        return DISTRICT_HOSPITAL, notes
    if re.search(r"\b(phc|primary health)\b", text, re.I):
        # "PHC" is unambiguous. A bare "Primary Health Care" is a name a private
        # clinic also uses, so it is not taken as proof of a government PHC.
        if not re.search(r"\bphc\b", text, re.I) and not re.search(
            r"primary health cent", text, re.I
        ):
            notes.append(FLAG_GENERIC_PHC_NAME)
        return PHC, notes
    if re.search(r"\b(chc|community health)\b", text, re.I):
        return CHC, notes
    if re.search(r"\b(taluk|taluka)\b", text, re.I):
        return TALUK_HOSPITAL, notes
    if amenity == "pharmacy":
        return PHARMACY, notes

    if _GOVERNMENT_PATTERNS.search(text):
        # A government facility not named as PHC/CHC/taluk/district could be any of
        # them -- "Railway Hospital" serves railway employees, "Rural Medical
        # Service" is a rural unit. The level decides which medicine list the
        # facility carries, so calling them all taluk hospitals would hand several
        # of them the wrong one. They get their own type and go to a human.
        notes.append(FLAG_UNCLEAR_GOVERNMENT_LEVEL)
        return GOVERNMENT_OTHER, notes

    if amenity == "hospital":
        return PRIVATE_HOSPITAL, notes
    if amenity in ("clinic", "doctors"):
        return CLINIC, notes
    return CLINIC, [FLAG_NO_AMENITY_TAG]


def classify_ownership(facility_type: str, tags: dict[str, str]) -> str:
    if facility_type in GOVERNMENT_TYPES:
        return "government"
    if _GOVERNMENT_PATTERNS.search(_text_of(tags)):
        return "government"
    return "private"


# --- de-duplication ----------------------------------------------------------

def _normalise_name(name: str) -> str:
    n = re.sub(r"[^a-z0-9 ]+", " ", name.lower())
    n = re.sub(
        r"\b(hospital|clinic|nursing home|centre|center|care|gadag|the|and|dr|doctor)\b",
        " ",
        n,
    )
    return " ".join(n.split())


def name_similarity(a: str, b: str) -> float:
    """Similarity of two facility names, ignoring generic words and honorifics.

    Deliberately uses ``token_sort_ratio`` rather than ``token_set_ratio``, and has
    no substring shortcut. Both of those score a subset as a perfect match, which
    merged "J C Shirol Nursing Home", "V C Shirol Nursing Home" and "Shirol Nursing
    Home" into one facility -- almost certainly different practices sharing a family
    name. Losing a real facility is worse than sending a pair to a human, so the
    distinguishing initials are allowed to lower the score.
    """
    na, nb = _normalise_name(a), _normalise_name(b)
    if not na or not nb:
        return 0.0
    return fuzz.token_sort_ratio(na, nb)


@dataclass
class OsmRecord:
    osm_id: str
    name: str
    lat: float
    lon: float
    tags: dict[str, str]


def load_osm_records(path: Path) -> list[OsmRecord]:
    """Read an Overpass `out center tags` response into flat records."""
    data = json.loads(path.read_text())
    records: list[OsmRecord] = []
    for element in data.get("elements", []):
        lat = element.get("lat") or element.get("center", {}).get("lat")
        lon = element.get("lon") or element.get("center", {}).get("lon")
        if lat is None or lon is None:
            continue
        tags = element.get("tags", {})
        records.append(
            OsmRecord(
                osm_id=f"{element['type']}/{element['id']}",
                name=tags.get("name", ""),
                lat=float(lat),
                lon=float(lon),
                tags=tags,
            )
        )
    return records


DuplicateSuspect = tuple[int, int, float, float]


def group_duplicates(
    records: list[OsmRecord],
) -> tuple[list[list[int]], list[DuplicateSuspect]]:
    """Cluster records that are the same facility mapped twice.

    Merging is deliberately cautious: two records join only when they are within
    ``DUPLICATE_DISTANCE_M`` **and** named almost identically. OSM around Gadag
    town has several genuinely distinct facilities a few metres apart sharing a
    family name, so a looser rule would erase real facilities.

    Pairs that are close and similar but below the merge bar are returned
    separately as suspects, to be judged by a human rather than by this function.
    """
    parent = list(range(len(records)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    suspects: list[DuplicateSuspect] = []
    for i in range(len(records)):
        for j in range(i + 1, len(records)):
            a, b = records[i], records[j]
            distance = haversine_m(a.lat, a.lon, b.lat, b.lon)
            if distance > SUSPECT_DISTANCE_M:
                continue
            score = name_similarity(a.name, b.name)
            if distance <= DUPLICATE_DISTANCE_M and score >= DUPLICATE_NAME_SCORE:
                parent[find(i)] = find(j)
            elif score >= SUSPECT_NAME_SCORE:
                suspects.append((i, j, distance, score))

    clusters: dict[int, list[int]] = {}
    for i in range(len(records)):
        clusters.setdefault(find(i), []).append(i)
    return list(clusters.values()), suspects


def build_facilities(
    records: list[OsmRecord], rings: list[list[tuple[float, float]]]
) -> tuple[list[Facility], list[dict[str, str]]]:
    """Turn OSM records into the facility list, plus the rows excluded and why."""
    excluded: list[dict[str, str]] = []
    keep: list[OsmRecord] = []
    for r in records:
        reason = exclusion_reason(r.tags)
        if reason:
            excluded.append({"osm_id": r.osm_id, "name": r.name, "reason": reason})
        else:
            keep.append(r)

    clusters, suspects = group_duplicates(keep)
    suspect_of: dict[int, list[str]] = {}
    for i, j, distance, score in suspects:
        suspect_of.setdefault(i, []).append(
            f"{distance:.0f} m from '{keep[j].name}' (name similarity {score:.0f})"
        )
        suspect_of.setdefault(j, []).append(
            f"{distance:.0f} m from '{keep[i].name}' (name similarity {score:.0f})"
        )

    facilities: list[Facility] = []
    for cluster in clusters:
        members = [keep[i] for i in cluster]
        # Represent a merged cluster by its longest-named record: the fuller name
        # is the more informative one for the verification sheet.
        primary = max(members, key=lambda m: len(m.name))
        facility_type, flags = classify_type(primary.tags)
        ownership = classify_ownership(facility_type, primary.tags)
        lat = sum(m.lat for m in members) / len(members)
        lon = sum(m.lon for m in members) / len(members)
        inside = point_in_rings(lat, lon, rings)
        notes = [FLAG_EXPLANATIONS[f] for f in flags]
        if not inside:
            flags.append(FLAG_OUTSIDE_BOUNDARY)
            notes.append(FLAG_EXPLANATIONS[FLAG_OUTSIDE_BOUNDARY])
        if len(members) > 1:
            flags.append(FLAG_MERGED_RECORDS)
            notes.append(f"merged {len(members)} OSM records as one facility")
        if not primary.name:
            flags.append(FLAG_UNNAMED_IN_OSM)
            notes.append(FLAG_EXPLANATIONS[FLAG_UNNAMED_IN_OSM])
        nearby = [m for i in cluster for m in suspect_of.get(i, [])]
        if nearby:
            flags.append(FLAG_POSSIBLE_DUPLICATE)
            notes.extend(nearby)

        facilities.append(
            Facility(
                internal_id="",  # assigned with the display label, once sorted
                display_label="",
                facility_type=facility_type,
                ownership=ownership,
                lat=round(lat, 6),
                lon=round(lon, 6),
                beds=None,  # OSM carries no bed count for any facility here
                osm_ids=sorted(m.osm_id for m in members),
                real_names=sorted({m.name for m in members if m.name}),
                inside_boundary=inside,
                review_flags=sorted(set(flags)),
                review_notes=notes,
            )
        )

    assign_labels(facilities)
    return facilities, excluded


def assign_labels(facilities: list[Facility]) -> None:
    """Give each facility a stable display label and internal id, in place.

    Numbering is by type, ordered north to south then west to east, so labels stay
    the same across runs. Real names never reach the website; these labels are what
    it shows.
    """
    facilities.sort(key=lambda f: (f.facility_type, -f.lat, f.lon))
    counters: dict[str, int] = {}
    for facility in facilities:
        counters[facility.facility_type] = counters.get(facility.facility_type, 0) + 1
        n = counters[facility.facility_type]
        label = TYPE_LABELS[facility.facility_type]
        # A single facility of its kind needs no number ("District Hospital").
        facility.display_label = f"{label} {n}"
        facility.internal_id = f"{facility.facility_type}-{n:02d}"

    singletons = [t for t, n in counters.items() if n == 1]
    for facility in facilities:
        if facility.facility_type in singletons:
            facility.display_label = TYPE_LABELS[facility.facility_type]
