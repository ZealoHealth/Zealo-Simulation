"""The source registry behind `GET /sources` and the Data Sources page.

Kept in code rather than parsed out of `data/SOURCES.md` so that a source can be
referenced by id from a `Tagged` value and checked by a test. The prose in
SOURCES.md is the long form; this is the structured form, and the two must agree.
"""

from __future__ import annotations

from datetime import date

from zealo.models.sources import AccessMethod, Source

SOURCES: list[Source] = [
    Source(
        id="gadag_survey_2023",
        title=(
            "An Assessment of the Availability of Essential Medicines in Gadag Taluk, "
            "Karnataka: A Study of Primary Health Centers"
        ),
        publisher="Cureus 15(5): e39341",
        url="https://doi.org/10.7759/cureus.39341",
        licence="CC BY 4.0",
        attribution=(
            "Tejesh S, Nagaveni SJ (2023). An Assessment of the Availability of Essential "
            "Medicines in Gadag Taluk, Karnataka: A Study of Primary Health Centers. "
            "Cureus 15(5): e39341. DOI 10.7759/cureus.39341. Licensed under CC BY 4.0."
        ),
        what_was_taken=(
            "Table 1 (availability by therapeutic category), Table 2 (per-item availability "
            "across 15 PHCs) and Table 3 (drug code, strength, dosage form, essentiality). "
            "Figure 1's per-PHC values require manual transcription."
        ),
        retrieved=date(2026, 9, 16),
        access=AccessMethod.AUTOMATED,
        raw_path="data/raw/gadag_phc_survey_cureus_e39341.pdf",
        limitations=[
            "Single-day snapshot per PHC, not a time series.",
            "Records only whether an item was in stock, never quantities.",
            "PHCs are anonymised as PHC 1-15, so a survey profile cannot be matched to a "
            "real PHC location. Assignment to map locations is illustrative.",
            "Collected November 2021 to March 2022; it is not current stock.",
            "Table 3 lists 103 items against Table 2's 104: Glibenclamide appears in "
            "Table 2 only.",
            "One published percentage is internally inconsistent: item 49 at 83.33% is "
            "12.5/15, which cannot arise from 15 binary observations.",
        ],
    ),
    Source(
        id="ksmscl_indent_2025_26",
        title="Annual Indent 2025-26 - Drugs List Considered for Procurement (890 Drugs)",
        publisher="Karnataka State Medical Supplies Corporation Limited",
        url="https://www.ksmscl.in/files/AI-2025-26.pdf",
        licence=(
            "Indian government public procurement document; no explicit open licence "
            "stated. Used as a cited public record."
        ),
        attribution="Karnataka State Medical Supplies Corporation Limited, Annual Indent 2025-26.",
        what_was_taken=(
            "All 890 rows: drug code, drug type, therapeutic category, PHC/CHC/TLH/DLH "
            "availability, drug name, statewide indent quantity and mode of procurement."
        ),
        retrieved=date(2026, 9, 16),
        access=AccessMethod.AUTOMATED,
        raw_path="data/raw/ksmscl_annual_indent_2025_26.pdf",
        limitations=[
            "Indent quantities are what government facilities requested for the year, "
            "not actual consumption, and are statewide rather than Gadag-specific.",
            "Covers government supply only; private facilities are outside it entirely.",
            "Its drug codes share no values with the survey's, so the two are matched "
            "on name, strength and dosage form rather than joined.",
        ],
    ),
    Source(
        id="osm_overpass",
        title="OpenStreetMap health facilities and administrative boundary, Gadag taluk",
        publisher="OpenStreetMap contributors, via the Overpass API",
        url="https://www.openstreetmap.org/relation/4155661",
        licence="Open Database License (ODbL) 1.0",
        attribution="© OpenStreetMap contributors",
        what_was_taken=(
            "Facilities tagged amenity=hospital|clinic|doctors|pharmacy or healthcare=* "
            "within the Gadag taluk boundary, and the boundary geometry of relation "
            "4155661 (admin_level 6)."
        ),
        retrieved=date(2026, 9, 16),
        access=AccessMethod.AUTOMATED,
        raw_path="data/raw/osm/overpass_gadag_health_20260916.json",
        limitations=[
            "Only 5 of the taluk's 15 PHCs appear in OpenStreetMap, and only 3 pharmacies "
            "in the whole taluk. Absence from OSM is not evidence a facility does not exist.",
            "No facility carries an operator or beds tag, so facility type and ownership "
            "are inferred from names and bed counts are unknown.",
            "Tags are contributor-entered and may be stale.",
            "Facility locations are pending manual verification; none is confirmed yet.",
        ],
    ),
    Source(
        id="hmis_mohfw",
        title="HMIS sub-district reports for Gadag taluk (OPD/IPD attendance, facility list)",
        publisher="Ministry of Health and Family Welfare, Government of India",
        url="https://hmis.mohfw.gov.in",
        licence="Government of India open data; terms per the HMIS portal.",
        what_was_taken="Not yet obtained.",
        access=AccessMethod.PENDING,
        limitations=[
            "An interactive report builder behind an API; report selection is manual.",
            "Needed to split demand between facilities, and to locate the 10 PHCs "
            "missing from OpenStreetMap.",
        ],
    ),
    Source(
        id="census_population",
        title="Population of Gadag taluk and Karnataka",
        publisher="Census of India / Office of the Registrar General",
        url="https://censusindia.gov.in",
        licence="Government of India open data.",
        what_was_taken="Not yet obtained.",
        access=AccessMethod.PENDING,
        limitations=[
            "censusindia.gov.in serves an incomplete TLS certificate chain, so it cannot "
            "be fetched with certificate verification enabled.",
            "Required to scale statewide indent quantities down to taluk demand. Will not "
            "be estimated.",
        ],
    ),
    Source(
        id="ogd_platforms",
        title="Open Government Data platforms (India and Karnataka)",
        publisher="Government of India / Government of Karnataka",
        url="https://www.data.gov.in",
        licence="Government Open Data Licence - India.",
        what_was_taken="Not yet obtained.",
        access=AccessMethod.MANUAL_DOWNLOAD,
        limitations=[
            "Both portals serve 'User-agent: * / Disallow: /', so this project does not "
            "fetch them programmatically. Files must be downloaded by hand.",
        ],
    ),
    Source(
        id="abdm_hfr",
        title="Ayushman Bharat Health Facility Registry",
        publisher="National Health Authority",
        url="https://facility.abdm.gov.in",
        licence="Terms per the ABDM portal.",
        what_was_taken="Not yet obtained.",
        access=AccessMethod.MANUAL_DOWNLOAD,
        limitations=[
            "A JavaScript application with a dynamic search and no robots file; "
            "automated access is neither clearly permitted nor practical.",
        ],
    ),
    Source(
        id="unit_prices",
        title="Public unit price list for matched medicines",
        publisher="To be identified",
        licence="Unknown.",
        what_was_taken="Not yet obtained.",
        access=AccessMethod.PENDING,
        limitations=[
            "nppa.gov.in serves an incomplete TLS certificate chain; the Jan Aushadhi "
            "portal is a JavaScript application.",
            "Until a public price source is confirmed, all value figures (stock value, "
            "value moved, value lost to expiry) are withheld rather than shown as zero.",
        ],
    ),
]

SOURCES_BY_ID: dict[str, Source] = {s.id: s for s in SOURCES}
