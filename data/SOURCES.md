# Data sources

Every dataset in this project traces back to an entry here. Each entry records the URL, what
we took, the licence or terms, the retrieval date, how it was obtained, and its known limits.

**Complete reference list:** `data/references.csv` — every source from the start of the project,
including those consulted but not used, blocked by robots.txt or TLS, or rejected, with status,
purpose, licence, retrieval date and verification. A test keeps it in step with the app's source
registry.

**Status legend** — `obtained` (in `data/raw/`, untouched) · `needed` (blocked, waiting on a
manual download) · `planned` (not started).

Retrieval dates are the date the file landed in `data/raw/`. Raw files are never edited; every
transformation is a re-runnable script in `data/pipeline/`.

---

## 1. `gadag_survey_2023` — Gadag taluk PHC essential-medicines survey — **obtained**

| | |
|---|---|
| **Citation** | Tejesh S, Nagaveni SJ. *An Assessment of the Availability of Essential Medicines in Gadag Taluk, Karnataka: A Study of Primary Health Centers.* Cureus 15(5): e39341, 2023. |
| **DOI** | 10.7759/cureus.39341 |
| **PDF** | https://assets.cureus.com/uploads/original_article/pdf/158760/20230626-18345-1ul8rgb.pdf |
| **Licence** | **CC BY 4.0** — free to use with credit. |
| **Required attribution** | Tejesh S, Nagaveni SJ (2023), *Cureus* 15(5): e39341, DOI 10.7759/cureus.39341, CC BY 4.0. |
| **Retrieved** | 2026-09-16 |
| **Access** | Automated download. `assets.cureus.com` serves no robots.txt; `www.cureus.com/robots.txt` disallows only `/search`, `/people` and similar paths — not article PDFs. |
| **Raw file** | `data/raw/gadag_phc_survey_cureus_e39341.pdf` (208 KB, 14 pages, text-extractable) |

**What it contains** (verified against the PDF, not assumed):
- Survey of all **15 PHCs** in Gadag taluk, **November 2021 – March 2022**, by direct observation
  of PHC pharmacies.
- **104** medicines/items from the Karnataka essential medicines list for PHCs.
- **Table 1** — availability (%) by therapeutic category, 15 categories, total **74.20%**.
- **Table 2** — per-item availability across the 15 PHCs. Columns: `Sl. No`, `Essential drug
  name`, `Strength`, `% availability (n=15)`.
- **Table 3** — item list with `Drug code`, `Drug name`, `Strength`, `Dosage`, `PHC`, and
  essentiality class ("Essential drug List" / most essential / very essential).
- **Figure 1** — availability per PHC. Text states **PHC 4 highest at 94.17%**, **PHC 1 lowest
  at 45.45%**.

**What we use it for:** the starting inventory for PHCs, and the only genuinely observed
inventory data in the project.

**Limitations (must stay visible in the UI):**
- Single-day snapshot per PHC, not a time series.
- Records only *whether* an item was in stock — **never quantities**.
- PHCs are anonymised as PHC 1–15, so a survey profile **cannot** be matched to a real PHC
  location. Assignment to map locations is an explicitly-labelled illustrative assignment.
- Collected 2021–22; it is not current stock.

**Data-quality findings from extraction (both verified against the printed PDF):**
- **Table 3 has 103 rows, not 104.** *Glibenclamide 5 mg tablet* (Table 2 item 38, 93.33%
  availability) appears in Table 2 and **nowhere in Table 3**. Every page was searched. So one
  item has availability data but no drug code, dosage form or essentiality class, and has no
  Table 3 attributes to match on against the indent.
- **One published percentage is internally inconsistent.** With n=15 PHCs every Table 2 value
  must be k/15. Exactly one is not: item 49, *Lignocaine inj 2 % w/v*, printed as **83.33%**,
  which is 12.5/15. All 103 other values are exact multiples of 1/15. This is the paper's own
  inconsistency; it forces a documented rounding decision when building the derived matrix.

**Extraction notes:**
- Tables 1, 2 and 3 extract as text cleanly. Table 3 rows wrap across lines (the essentiality
  class renders as "Essential" / "drug List" on separate lines) and needs positional parsing.
- **Figure 1 is a raster image with no embedded data labels.** Page 4 contains two images and
  no numeric text belonging to the chart. The 15 per-PHC percentages therefore **cannot** be
  extracted and must be transcribed by hand → `data/manual/figure1_phc_availability.csv`.
- Table 3 drug codes use Karnataka EDL section numbering (`6.3.2`, `19.1.1`, `28.23.9`), which
  is **a different scheme** from the KSMSCL indent's `D00303` codes. See source 2.

---

## 2. `ksmscl_indent_2025_26` — Karnataka State Annual Indent 2025-26 — **obtained**

| | |
|---|---|
| **Publisher** | Karnataka State Medical Supplies Corporation Limited (KSMSCL) |
| **PDF** | https://www.ksmscl.in/files/AI-2025-26.pdf |
| **Licence** | Indian government public procurement document. No explicit open licence stated; used here as a public-record citation with attribution. |
| **Retrieved** | 2026-09-16 |
| **Access** | Automated download. `www.ksmscl.in` serves no robots.txt (404), so no crawl restriction applies. |
| **Raw file** | `data/raw/ksmscl_annual_indent_2025_26.pdf` (757 KB, 26 pages) |

**What it contains** (verified): *"Drugs List Considered for Procurement - 890 Drugs"*, with
columns `Sl.No`, `Drug Code` (e.g. `D00303`), `Drug Type` (Essential/Desirable), `Drugs
Category` (therapeutic group), `PHC`, `CHC`, `TLH`, `DLH` (each "Available" / "Not Available"),
`Drug Name` (with strength and pack), `Indent Qty`, `Mode of Procurement`, `Quarantine
Required`.

**What we use it for:** the medicine master list; which facility level carries which item; and
the statewide quantity that taluk demand is scaled down from.

**Limitations:**
- Indent quantities are what government facilities **requested** for the year — not actual
  consumption, and not Gadag-specific.
- Covers government supply only. Private facilities are outside it entirely.
- Row text wraps across lines in the PDF; extraction needs column-position clustering.

**Join risk — confirmed:** survey Table 3 codes (`6.3.2`) and indent codes are different
schemes, so the 104 survey items must be matched by **name + strength + dosage form**, not by
code. Uncertain matches go to `data/manual/indent_match_review.csv` and are excluded until
confirmed. 53 of 104 matched automatically; 51 await confirmation.

**Extraction findings (verified against the printed PDF):**
- Row count confirmed at **890**, matching the document's own claim.
- Codes come in **three** forms, not one: `D#####` (761 drugs), `M#####` (122 medical devices
  and consumables), and **7 dotted EDL-style codes** for blood-factor products. Those 7 share
  no values with the survey's 103, so they do not create a join.
- Facility levels **nest**: every item stocked at PHC is stocked at CHC, TLH and DLH.
  384 PHC / 657 CHC / 879 TLH / 890 DLH. Checked, because a break would mean a misread column.
- Split by type: 539 Essential, 351 Desirable.
- Two names are printed oddly in the source itself and are **not** extraction errors:
  `"surgical gloves 6 1x1"` (lowercase in the PDF) and `"lndacaterol"` (a capital-I rendered as
  a lowercase L).

**Extraction notes:** rows had to be rebuilt from the table's own shading rectangles rather than
from text or word distance — see `methods:survey_tables` and `methods:indent_matching` in
`data/METHODS.md` for why.

---

## 3. `osm_overpass` — OpenStreetMap health facilities — **obtained**

| | |
|---|---|
| **Source** | OpenStreetMap via the Overpass API (`overpass-api.de`) |
| **Query** | `nwr[amenity~"^(hospital\|clinic\|doctors\|pharmacy)$"]` and `nwr[healthcare]` within area `3604155661` |
| **Licence** | **ODbL**. Required credit: **© OpenStreetMap contributors** — shown on every map. |
| **Access** | Automated. Overpass is intended for programmatic use; a descriptive user agent is sent and queries are run once and cached to `data/raw/`, not re-fetched per build. |
| **Retrieved** | 2026-09-16 |
| **Raw files** | `data/raw/osm/overpass_gadag_health_20260916.json` (82 elements)<br>`data/raw/osm/overpass_gadag_taluk_boundary_20260916.json` |

**Boundary:** OSM relation **4155661**, `name="Gadag taluk"`, `admin_level=6`
(wikidata Q123257397). Note admin_level **5** is the *district* ("Gadag", Q2353931) in this part
of India — the two are easy to confuse. The relation's 9 outer ways stitch into a single closed
ring of 446 points, used both to draw the taluk outline and to validate that every facility
coordinate falls inside it.

**What it yielded:** 82 OSM elements → **77 facilities** after merging duplicates and excluding 2
non-human-medicine records (a veterinary hospital and a blood bank). All 77 fall inside the
boundary. Breakdown: 39 private hospitals, 25 clinics, 5 PHCs, 4 government facilities of
unclear level, 3 pharmacies, 1 district hospital.

**Limitations — these matter a great deal here:**
- **Only 5 of the taluk's 15 PHCs are in OSM.** The survey covers all 15, so 10 availability
  profiles have no location to attach to. Blocked on the HMIS facility list (request R4).
  **No PHC locations will be invented.**
- **Only 3 pharmacies.** A taluk with Gadag town in it plainly has many more. Absence from OSM
  is not evidence that a facility does not exist.
- **No `operator` tag and no `beds` tag on any facility.** Facility type and ownership are
  therefore `derived` from names and descriptions, not read from a field, and bed counts are
  simply unknown. This is why every facility goes to a verification sheet and why `verified`
  starts false for all 77.
- Tags are contributor-entered and may be stale. Several records cite `source=Local Knowledge`.

**Real names** are kept in `data/raw/osm/` and in `data/manual/facility_verification.csv` only.
`data/processed/facilities.csv` carries display labels and no names, enforced by a test.

---

## 4. `abdm_hfr` — Ayushman Bharat Health Facility Registry — **needed** (manual)

| | |
|---|---|
| **URL** | https://facility.abdm.gov.in/ |
| **Access** | **Manual.** The site is a JavaScript single-page application with a dynamic search; `/robots.txt` returns the app shell rather than a robots file, so automated access is neither clearly permitted nor practical. |

**Blocked on:** a manual export of Gadag taluk records (facility name, type, ownership,
address, coordinates if shown). See `data/manual/REQUESTS.md`.

---

## 5. `ogd_karnataka` / `ogd_india` — Open Government Data platforms — **needed** (manual)

| | |
|---|---|
| **URLs** | https://karnataka.data.gov.in · https://www.data.gov.in |
| **Access** | **Manual — automated fetching is forbidden.** Both serve `User-agent: * / Disallow: /`. Verified 2026-09-16. This project will not fetch them programmatically. |

**Blocked on:** manual download of taluk hospital, CHC and private hospital lists for Gadag.

---

## 6. `hmis_mohfw` — HMIS sub-district reports (OPD/IPD, facility list) — **needed** (manual)

| | |
|---|---|
| **URL** | https://hmis.mohfw.gov.in |
| **Access** | **Manual.** A JavaScript application behind a report-builder API; no robots.txt is served (404 from `/hmis-ui/`). Report selection is interactive. |

**Blocked on:** Gadag taluk OPD/IPD attendance by facility, and the HMIS list of 15 PHCs used
by the survey. Used to split demand between facilities; a documented facility-type weighting is
the tagged-`estimated` fallback if unavailable.

---

## 7. Population, Census 2011 — **obtained, machine-verified**

Decided by the project team (R5). Each page was fetched after checking robots.txt, saved
unchanged to `data/raw/population/`, and the stated figure found in it.

| Source id | Figure | Source | Quality |
|---|---|---|---|
| `karnataka_population_2011` | Karnataka **61,095,297** | https://karnataka.gov.in/new-page/SOCIETY/en | official state government |
| `gadag_taluk_population_2011` | Gadag taluk **367,258** | https://www.censusindia2011.com/karnataka/gadag/gadag-population.html | **third-party census mirror** |
| `gadag_district_population_2011` | Gadag district **1,064,570** (sanity check only) | https://gadag.nic.in/en/demography/ | official district site |

Retrieved 2026-09-17. **Label shown on the Data Sources page:** "Gadag taluk population taken
from a third-party mirror of Census 2011 data; the official census site could not be accessed
securely." (censusindia.gov.in serves an incomplete TLS certificate chain.)

Checks run on every build: taluk ÷ state = 0.6011% (≈ 0.601%), taluk ÷ district = 34.50% (≈ 34.5%).

Limitations: 2011 populations paired with 2025-26 indent quantities (share only, no growth
projection); the district page calls its figure provisional; Gadag district now has 7 taluks
(5 in 2011), so the taluk boundary may have changed.

---

## 7a. `nss75_health_karnataka` — Private vs government treatment, NSS 75th round — **obtained, machine-verified**

| | |
|---|---|
| **Title** | Key Indicators of Social Consumption in India: Health, NSS 75th round (July 2017 – June 2018) |
| **Publisher** | National Statistical Office, Ministry of Statistics and Programme Implementation, Government of India |
| **PDF** | https://www.mospi.gov.in/sites/default/files/publication_reports/KI_Health_75th_Final.pdf |
| **Taken** | Table A8 (PDF page 48), Karnataka: ailments treated on medical advice by provider, rural and urban |
| **Retrieved** | 2026-09-17; mospi.gov.in serves no robots.txt; valid TLS |
| **Raw files** | `data/raw/private_share/` — Key Indicators (5 MB, used), Report 586 summary (0.25 MB, all-India context), full Report 586 (68.8 MB, **gitignored**, not used; URL and SHA-256 in the folder README) |

Rural: government 29.0%, private hospital 35.3%, private doctor/clinic 35.4%. Urban: 14.1%,
55.0%, 29.0%. Weighted by Gadag taluk's urban/rural population → **3.656** private treated
ailments per government one, which sets private facilities' demand (`methods:private_demand_share`).

**Limitations:** treated ailments, not medicine units; Karnataka-wide, not Gadag-specific;
2017–18; charitable/NGO (1.1%) and informal providers excluded.

---

## 8. `unit_prices` — Medicine unit prices — **decided: units only**

Searched: nppa.gov.in serves an incomplete TLS chain, the Jan Aushadhi portal is a JavaScript
application, pmbi.co.in returned 404. **Decision (R6): keep everything in units.** "Values in
rupees are not shown because no verified public price list could be accessed." A sourced
`data/manual/prices.csv` would switch value metrics back on with `real` tags.

## 8a. `nominatim` — Village-centre geocoding — **authorised, not yet used**

OpenStreetMap Nominatim, only for PHCs the team locates by village name without coordinates.
Usage policy followed: ≤ 1 request/second, descriptive user agent, results cached in
`data/raw/geocode/`, bounded to the Gadag taluk box. Results tagged `derived`, "approximate:
village centre". ODbL, © OpenStreetMap contributors.

---

## 9. `gadag_boundary` — Gadag taluk administrative boundary — **planned**

Needed to draw the taluk outline and to validate that facility coordinates fall inside it.
Candidate: OSM administrative relation (ODbL, same attribution as source 3). To be cited once
selected.

---

## Sources deliberately **not** used

- **No warehouse or distributor datasets.** The Zealo model has no such nodes.
- **No real manufacturer or brand names.** Manufacturers are generic supply nodes.
- **No outbreak or disease-surveillance data.** Out of scope.
