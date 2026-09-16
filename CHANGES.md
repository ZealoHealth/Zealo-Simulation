# Changes

A running log of what changed, milestone by milestone. Newest first.

---

## Milestone 8 — Inventory map — 2026-09-16

**Status:** complete and verified in a real browser against the live backend. Nothing committed.

### Added — `frontend/`
Vite 8 + React 19 + TypeScript 6, Tailwind 4 (CSS-first `@theme` with Zealo's palette),
Leaflet + react-leaflet 5 with marker clustering, TanStack Query, Zustand, Vitest.

- `api/types.ts`, `api/client.ts`, `api/hooks.ts` — typed client mirroring the backend schemas,
  including a typed `ApiError` that distinguishes *missing real-world inputs* from *broken*.
- `state/store.ts` — view state only: day, mode, filters, selection.
- `components/map/` — `InventoryMap` (tiles, boundary, clustered markers, animated transfer
  lines, off-map manufacturer arrows), `icons.ts`, `Legend.tsx`, `mapLogic.ts`.
- `components/panels/` — `FacilityPanel`, `MedicineSearch`, `EventFeed`.
- `components/` — `Provenance` badges, `Disclaimer`, `NetworkTotals`, `MissingInputsNotice`,
  `TimeControls`.
- `pages/InventoryMapPage.tsx` — the assembled view.
- **41 frontend tests** covering map logic, playback, the mode toggle and missing-run handling.

### Design decisions worth keeping
- **Markers encode two channels** — shape for facility type, colour for stock status, plus a
  glyph — so the map stays readable without colour vision.
- **Pure map logic is separated from Leaflet** so filtering, distance ranking and transfer-line
  selection are tested without mounting a map.
- **Out-of-stock facilities stay in the medicine search results.** "Who has run out" is the
  question the map exists to answer; filtering them away would hide the shortage.
- **Transfers stay visible for a short trailing window** — at playback speed a single-day line
  would flicker past unseen.
- **Manufacturers are drawn entering from the map edge**, because the dataset does not record
  where they are and putting them at a point on the map would invent a location.
- **Value figures are omitted, not zeroed**, in the totals panel.
- The facility panel repeats *in place* that a PHC's stock pattern is an illustrative
  assignment — a marker on a real location invites the reader to believe otherwise.

### The 422 is a designed state
`/simulate` currently refuses (R5 and R1 outstanding). The map still loads **77 real facility
locations**, the taluk boundary and 53 real medicines, and the right-hand panel explains exactly
which inputs are missing rather than showing a blank page or a fabricated run.

### Verified in the browser
Real OSM tiles, the boundary outline, clustering, the legend, layer toggles, the medicine list
and the missing-inputs notice all render against the live API, with no console errors beyond the
expected 422. Fixed two things found this way: absolute filesystem paths leaking into the UI
through the error message, and a `?? []` that allocated a new array every render and defeated
memoisation.

---

## Milestone 7 — API — 2026-09-16

**Status:** complete. Read endpoints serve real data; `/simulate` is built end to end but
refuses to run until R5 and R1 are supplied. Nothing committed.

### Added
- `backend/zealo/api/routes.py` — `/facilities`, `/medicines`, `/sources`, `/simulate`,
  `/runs/{id}/facilities/{fid}`, `/runs/{id}/medicines/{mid}`.
- `backend/zealo/api/schemas.py` — typed request and response models.
- `backend/zealo/data_access.py` — cached loaders for `data/processed/`.
- `backend/zealo/sources_registry.py` — the 8-source structured registry.
- `backend/zealo/sim/runner.py` — scenario assembly from real data, plus a bounded run cache.
- `backend/tests/test_api.py` — **37 tests**. Total suite now **181**.

### Serving real data
77 facilities with per-field provenance and the taluk boundary; 890 medicines, of which the
**53 confirmed** survey links carry real availability and the 51 pending ones are excluded;
8 sources with licences, attributions and limitations — including the ones we could **not**
obtain, marked `pending` with the reason rather than quietly omitted.

### `/simulate` refuses rather than inventing
Taluk demand needs the population ratio (**R5**) and PHC opening stock needs the availability
matrix (**R1**). Neither exists, so `build_scenario` raises `MissingDemandInputs` and the
endpoint returns **422** naming both requests. Everything else — facilities, medicines, levels,
both policies, the cache — is wired and starts working the moment those land.

### Two source checks I had previously skipped
I had called R5 and R6 blocked without trying. Having now tried:
- **`censusindia.gov.in` serves an incomplete TLS certificate chain** (omits the intermediate
  CA), so it cannot be fetched with verification on. I will not disable verification for a
  figure I would present as authoritative. `census2011.co.in` works but is an unofficial
  aggregator — your call whether that is acceptable.
- **`nppa.gov.in` has the same TLS problem**, and Jan Aushadhi is a JavaScript app. So there is
  still no price source, and value figures stay withheld rather than zeroed.

### Contract details worth keeping
- `run_id` is a hash of the scenario settings, so identical settings hit the cache.
- A missing run returns 404 `run_not_found` telling the client to re-submit — the frontend
  re-runs instead of rendering an empty map.
- Every data response carries the disclaimer and its own caveats.
- Playback data (per-day facility status) is returned once by `/simulate`; there is no per-day
  endpoint to poll.

---

## Milestone 6 — Simulation core — 2026-09-16

**Status:** complete. Built ahead of Milestone 5, which is blocked on R4/R5, so the engine runs
on synthetic test scenarios until real demand and opening stock arrive. Nothing committed.

### Added — `backend/zealo/sim/`
- `models.py` — facilities, medicines, batches, deliveries, manufacturers, rules.
- `inventory.py` — per-facility batch store, consumed **earliest-expiry-first**.
- `forecast.py` — `Forecaster` interface plus an EWMA default.
- `events.py` — event log with plain-language messages, and the metrics accumulator.
- `engine.py` — the day loop, `Scenario`, `SimulationState`, facility status, `RunResult`.
- `policies.py` — `BaselinePolicy` and `ZealoPolicy`.
- `backend/tests/factories.py` + `test_simulation.py` — **36 tests**. Total suite now **144**.

### How the guarantees are made structural
- **No warehouses.** `NodeKind` has exactly two members, `facility` and `manufacturer`, so a
  delivery cannot name a warehouse or distributor. `Delivery.__post_init__` rejects a transfer
  that is not facility-to-facility, and a facility sending to itself.
- **Determinism.** All randomness lives in the demand array, generated once into `Scenario`
  before either mode runs. Same seed → byte-identical metrics, events and timeline.
- **Fair comparison.** Both modes read the same `Scenario`, so demand and opening stock are
  identical and any difference is caused by policy alone.
- **Opting out means opting out.** A facility with `in_network=False` behaves *exactly* as it
  does in the baseline — same shared code path, and a test asserts the metrics match exactly.
- **Conservation.** `starting + manufacturer arrivals == dispensed + expired + on hand + in
  transit`, checked for both policies.
- **Value metrics are withheld, not zeroed**, when prices are unknown (R6). A zero would read
  as a real figure.

### Result on a full-scale synthetic run (77 facilities x 104 medicines x 180 days)
| | availability | unmet units | transfers |
|---|---|---|---|
| Without Zealo | 92.63% | 951,105 | 0 |
| With Zealo | **99.64%** | **33,361** | 10,193 |

Identical demand and identical opening stock, so the difference is policy alone.

### Performance
Indexing in-transit deliveries by `(facility, medicine)` cut the Zealo run **29.1 s → 1.9 s** at
20x40x180 with byte-identical output: `arrivals_within` and `next_arrival_day` were scanning one
flat list on every call and accounted for 33 of 36 profiled seconds. Caching inventory totals
gave a smaller further win. A per-day forecast cache was tried and **reverted** — no measurable
gain and it introduced a stale-read footgun.

Full scale now runs in ~9 s (baseline) and ~26 s (Zealo). Runs are cached and the site will ship
a pre-computed default run, so this is a build cost rather than a page-load one. Going faster
means vectorising the policy loop, which is a larger change worth agreeing first.

---

## Milestone 4 — Facility list from OpenStreetMap — 2026-09-16

**Status:** built and tested. **Not usable until you verify it (R8)**, and the PHC gap needs R4.
Nothing committed.

### Added
- `backend/zealo/pipeline/facilities.py` — boundary stitching, point-in-polygon, type and
  ownership classification, de-duplication, stable labelling.
- `data/pipeline/03_build_facilities.py` — runnable; preserves anything already recorded in the
  verification sheet.
- `backend/tests/test_facilities.py` — 32 tests.

### Data obtained (Overpass API, ODbL, retrieved 2026-09-16)
- `data/raw/osm/overpass_gadag_health_20260916.json` — 82 elements
- `data/raw/osm/overpass_gadag_taluk_boundary_20260916.json` — relation **4155661**,
  `admin_level=6`. (admin_level 5 is the *district* — a real trap.)

### Output
- `data/processed/facilities.csv` — **77 facilities, no real names**
- `data/processed/gadag_taluk_boundary.geojson` — 446-point ring for the map
- `data/manual/facility_verification.csv` — **77 rows with names and two map links, for R8**
- `data/interim/facility_build_report.json`

82 elements → 77 facilities: 39 private hospitals, 25 clinics, 5 PHCs, 4 government facilities of
unclear level, 3 pharmacies, 1 district hospital. All 77 verified as inside the taluk boundary.
2 excluded with a recorded reason (veterinary hospital, blood bank).

### The finding that matters most
**OSM has 5 PHCs; the survey covers 15.** Ten of the survey's availability profiles have no
location to attach to. This is not worked around — it needs the HMIS facility list (R4), and no
PHC location will be invented. OSM also lists only **3 pharmacies** in the whole taluk, which is
plainly an undercount.

### Three defects found and fixed
1. **Over-merging erased real facilities.** `token_set_ratio` and a substring test both score a
   subset as a perfect match, so "J C Shirol Nursing Home", "V C Shirol Nursing Home", "Shirol
   Nursing Home" and "Shirola Hospital" collapsed into one. Switched to `token_sort_ratio` with
   no substring shortcut: the distinguishing initials now lower the score, J C and V C stay
   separate, and the pair is flagged for a human instead.
2. **Real names leaked into `data/processed/`** — a duplicate-suspect note read *"29 m from 'V C
   Shirol Nursing Home'"*, and `facilities.csv` is what the website reads. Review output is now
   split: short flag codes (safe to publish) in processed data, name-bearing prose only in the
   verification sheet. **A test now asserts no real name appears anywhere in `data/processed/`.**
3. **Government facilities were being called taluk hospitals.** "Railway Hospital" and "Rural
   Medical Service Hulkoti" are government but of unstated level, and the level decides which
   medicine list a facility carries. Added a `government_other` type so the level is asked for
   rather than guessed. A bare "Primary Health Care" name is likewise flagged, not trusted.

### Provenance
Coordinates are `real` (OSM). Type and ownership are `derived` — OSM has no `operator` tag for
any Gadag facility. Beds are **unknown**, not estimated. `verified` is false for all 77.

---

## Milestone 3 — Medicine master list and indent matching — 2026-09-16

**Status:** complete. 51 matches await your confirmation before they enter the build.
Nothing committed.

### Added
- `backend/zealo/pipeline/indent.py` — extracts all 890 rows of the KSMSCL Annual Indent.
- `backend/zealo/pipeline/matching.py` — matches survey items to indent rows on base name,
  dosage form and per-family strength.
- `backend/zealo/pipeline/pdf_tables.py` — shared row assembly, extracted from `survey.py`
  (which now uses it; its 25 tests still pass unchanged).
- `data/pipeline/02_extract_indent_and_match.py` — runnable, and **never overwrites a decision
  you have already recorded**.
- `backend/tests/test_indent_extraction.py` + `test_matching.py` — 39 tests.

### Output
- `data/processed/medicines.csv` — 890 medicines with therapeutic group, PHC/CHC/TLH/DLH flags,
  statewide indent quantity, provenance `real`
- `data/processed/survey_item_matches.csv` — 104 survey items with their indent link and
  `match_status` (`auto` / `confirmed` / `confirmed_no_match` / `pending_review`)
- `data/manual/indent_match_review.csv` — **51 items needing your decision**
- `data/interim/indent_match_report.json`

### Verified
890 rows (matching the document's own claim) · contiguous serials 1–890 · unique codes · all
four facility-level flags parsed on every row · a quantity on every row · **levels nest**
(384 PHC ⊂ 657 CHC ⊂ 879 TLH ⊂ 890 DLH).

### Three extraction defects found and fixed
1. **Content leaked between rows.** Row heights vary enormously, so a 5-line drug name's outer
   lines sat nearer a *neighbouring* row's serial number than their own. Nearest-anchor
   assignment moved them; at worst 36 rows were wrong (`"ampoules Disposable Mask…"`,
   `"Ampicillin Capsules… Antacid Suspension…"`). Fixed by using **the table's own shading
   rectangles** as row boundaries — every band holds exactly one serial number. Now 0 leaks;
   the 2 remaining odd-looking names are printed that way in the source.
2. **A category glued to the next column.** `'AntioxytocicsAvailable'` is a single token, so
   four rows lost their PHC availability. Fixed by splitting straddling words at the column
   boundary using character positions.
3. **A quantity split across two tokens.** `'1'` + `'3,84,87,350'` parsed as nothing.

### Two matching defects found and fixed
1. **A shared volume excused a differing dose.** `250mg/5ml` matched `125mg/5ml` because both
   contain `5ml`. Strengths are now compared **family by family** (mass / volume / activity /
   concentration).
2. **Unrelated units counted as "no contradiction".** `Vitamin A 25000 IU` auto-accepted against
   `Vitamin-E 400mg`. Both sides carrying strengths that share no family is now a disagreement.

Also added: two survey items may not claim the same indent row (the survey lists "Disposable
mask" and "Triple layer mask"; the indent has one such row), and a near-tie between the top two
candidates blocks auto-acceptance.

### Result
**53 of 104 auto-accepted, 51 held for review.** Every auto-accepted match was read by hand.
Unconfirmed matches produce no indent code anywhere in the build — enforced by test.

### Confirmed, not assumed
The indent's 7 dotted EDL-style codes share **no** values with the survey's 103, so there is
genuinely no code-level join and text matching is unavoidable.

---

## Milestone 2 (part 1) — Survey table extraction — 2026-09-16

**Status:** Tables 1, 2 and 3 extracted and verified. The derived availability matrix is the
remaining part and is blocked on R1 (Figure 1 values). Nothing committed.

### Added
- `backend/zealo/pipeline/survey.py` — extracts Tables 1–3 from the survey PDF. Tables 2 and 3
  are rebuilt from **word coordinates rather than text**: the tables are striped, so
  `extract_tables()` resolves only alternating rows, and cells wrap vertically across up to
  three lines. Rows are anchored on the first-column word; other words attach to the nearest
  anchor by vertical distance.
- `data/pipeline/01_extract_survey_tables.py` — runnable script. **Exits non-zero if the
  extraction disagrees with any figure the paper states in its own text.**
- `backend/tests/test_survey_extraction.py` — 25 tests.

### Output (`data/interim/`)
- `survey_table1_categories.csv` — 15 therapeutic categories, total 74.20%
- `survey_table2_items.csv` — 104 items with name, strength, availability %
- `survey_table3_items.csv` — 103 items with drug code, strength, dosage form, essentiality
- `survey_extraction_report.json` — counts, published anchors, known gap, verification status

### Verified against the paper
15 categories · printed total **74.20%** · 104 items with contiguous serials 1–104 · glyceryl
trinitrate and anti-D immunoglobin both **0.00%** · 103 unique Table 3 drug codes · every row
classified essential / most essential / very essential (35 / 48 / 20) · the three hardest
multi-line rows (wrapped name, wrapped dosage form, NA/NA) reassemble correctly.

### Two findings in the published paper
1. **Table 3 has 103 rows, not 104.** *Glibenclamide 5 mg tablet* (Table 2 item 38, 93.33%)
   appears in Table 2 and nowhere in Table 3 — every page searched. It therefore has no drug
   code, dosage form or essentiality class to match against the indent.
2. **Item 49, *Lignocaine inj 2 % w/v*, is printed as 83.33% = 12.5/15**, which cannot come from
   15 binary observations. All 103 other values are exact multiples of 1/15. Recorded, not
   smoothed: its matrix column total will be rounded to 12, documented in `data/METHODS.md`.

Both are captured as named constants and pinned by tests, so neither can drift silently.

---

## Milestone 1 — Plan and scaffold — 2026-09-16

**Status:** complete, awaiting review. Nothing committed.

### Added

**Project structure**
- `backend/` — Python package `zealo` (`models/`, `sim/`, `api/`, `pipeline/`) + `tests/`
- `data/` — `raw/`, `interim/`, `processed/`, `manual/`, `pipeline/`
- `frontend/`, `docs/` — placeholders for later milestones
- `.venv/` — Python 3.11, backend installed editable with `pipeline` and `dev` extras

**Core code**
- `backend/zealo/models/provenance.py` — `Provenance` enum (`real`/`derived`/`estimated`) and
  `Tagged[T]`, which wraps a value with its source ids, retrieval date and method. Validates at
  construction: a `real` value without a source, or a `derived`/`estimated` value without a
  method, raises. This is the mechanism behind "every number is traceable".
- `backend/zealo/models/sources.py` — `Source` registry model (licence, attribution, what was
  taken, access method, limitations). Backs `GET /sources` and the Data Sources page.
- `backend/zealo/config.py` — settings and data-directory paths.
- `backend/zealo/main.py` — FastAPI app, CORS, `GET /health` (returns the required disclaimer).

**Documentation**
- `CLAUDE.md` — hard rules, layout, commands, verified data decisions, open questions,
  milestone status.
- `data/SOURCES.md` — nine source entries with licence, retrieval date, access method and
  limitations; records which sources are obtained vs blocked, and why.
- `data/METHODS.md` — method skeleton with anchor ids (`methods:availability_matrix`,
  `methods:taluk_annual_demand`, …) that `Tagged.method` points at.
- `data/manual/REQUESTS.md` — the six things needed from the user (R1–R6), each with why it
  can't be automated.
- `data/manual/figure1_phc_availability.csv` — pre-filled template for the Figure 1 transcription.
- `data/raw/README.md` — "never edit anything in here", plus a provenance table.
- `README.md`, `.gitignore`, `Makefile`.

**Tests — 12 passing**
- `test_provenance.py` (7) — unsourced `real` rejected; method-less `derived`/`estimated`
  rejected; immutability; JSON serialisation shape.
- `test_sources.py` (2) — licence required; limitations retained.
- `test_health.py` (2) — health responds; disclaimer text is exact.

### Data obtained
- `data/raw/gadag_phc_survey_cureus_e39341.pdf` — Cureus survey, CC BY 4.0, 208 KB, 14 pages.
- `data/raw/ksmscl_annual_indent_2025_26.pdf` — KSMSCL Annual Indent 2025-26, 757 KB, 26 pages.

Both downloaded only after confirming robots.txt permits it.

### Verified (not assumed)
- Survey PDF contains the published anchors: **74.20%** overall, **PHC 4 94.17%**,
  **PHC 1 45.45%**, 104 items, 15 PHCs. Tables 1–3 extract as text.
- **Figure 1 is a raster image with no data labels** → per-PHC values must be hand-transcribed.
- Indent PDF confirmed as "890 Drugs" with the PHC/CHC/TLH/DLH columns the spec describes.
- **Survey and indent use different drug-code schemes** (`6.3.2` vs `D00303`) → no code join;
  fuzzy name+strength+form matching will be required.
- robots.txt: `data.gov.in` and `karnataka.data.gov.in` are `Disallow: /` → manual download only.

### Decisions
- **Python 3.11**, not 3.14: numpy ≥2.5 requires ≥3.12, the installed 3.12 is a broken symlink,
  and 3.11 has the widest wheel + hosting support.
- Backend installed editable so `data/pipeline/` scripts can `import zealo` cleanly.
- Pinned numpy `<3` / pandas `<3` after the initial 2.5 pin failed on 3.11.
- Re-ran the editable install after writing the package files: setuptools had snapshotted the
  layout before `__init__.py` existed and registered `zealo` as a namespace package, so
  `from zealo import __version__` failed from the repo root. Noted in `CLAUDE.md` as a gotcha
  for any future subpackage.

### Blocked
R1 (Figure 1 values), R2 (OGD files), R3 (ABDM export), R4 (HMIS), R5 (population), R6 (price
source decision). See `data/manual/REQUESTS.md`.
