# Data sources

Every dataset in this project traces back to an entry here. Each entry records the URL, what
we took, the licence or terms, the retrieval date, how it was obtained, and its known limits.

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

**Join risk:** survey Table 3 codes (`6.3.2`) and indent codes (`D00303`) are different
schemes, so the 104 survey items must be matched to indent rows by **name + strength + dosage
form**, not by code. Uncertain matches go to `data/manual/indent_match_review.csv` for human
confirmation and are excluded until confirmed.

---

## 3. `osm_overpass` — OpenStreetMap health facilities — **planned** (Milestone 4)

| | |
|---|---|
| **Source** | OpenStreetMap via the Overpass API |
| **Query** | `amenity=hospital\|clinic\|doctors\|pharmacy`, `healthcare=*` within the Gadag taluk boundary |
| **Licence** | **ODbL**. Required credit: **© OpenStreetMap contributors** — shown on every map. |
| **Access** | Automated (Overpass API is intended for programmatic use; we rate-limit and set a descriptive user agent). |

**Limitations:** OSM coverage in small Indian towns is uneven; absence from OSM is not evidence
that a facility does not exist. Tags are contributor-entered and may be stale.

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

## 7. `census_population` — Gadag taluk and Karnataka population — **needed**

Required for the demand formula (statewide indent × taluk share of state population). Must be
an official Census of India figure or official projection, cited. **We will not estimate this
ourselves** — see `data/manual/REQUESTS.md`.

---

## 8. `unit_prices` — Medicine unit prices — **open question** (Milestone 5)

To be searched for: a government ceiling price list (e.g. NPPA) or a public generic price list.
If found → tagged `real` and cited. If not → **ask before using illustrative prices**, and tag
them `estimated`.

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
