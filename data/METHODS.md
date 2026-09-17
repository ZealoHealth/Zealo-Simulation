# Methods

Every number on the Zealo Map site is either copied from a source (`real`), computed from real
data by a formula written down here (`derived`), or modelled (`estimated`). This file is the
reference for the second and third kinds. Each method has an anchor id such as
`methods:taluk_annual_demand`; `Tagged.method` in the code points at it, so a number in the UI
can be traced to the paragraph that produced it.

> **Status:** every method below is implemented. Where real data is still being collected,
> the interim approach agreed with the project team on 2026-09-16 is described in place and
> tracked in `data/DATA_TODO.md` (`make data-check`).

---

## Provenance vocabulary

| Tag | Means | Rule enforced in code |
|---|---|---|
| `real` | Copied from a source record, unmodified. | Must cite ≥1 `source_id`. |
| `derived` | Computed from real data by a formula in this file. | Must name a `method`. |
| `estimated` | Modelled. Not observed in any source. | Must name a `method`. |

Enforced by `backend/zealo/models/provenance.py` and tested in
`backend/tests/test_provenance.py`. A value that fails these rules cannot be constructed.

---

## `methods:survey_tables` — Survey table extraction *(Milestone 2 — implemented)*

**Script:** `data/pipeline/01_extract_survey_tables.py` →
`data/interim/survey_table{1,2,3}_*.csv` + `survey_extraction_report.json`.
**Code:** `backend/zealo/pipeline/survey.py`. **Tests:** `backend/tests/test_survey_extraction.py`.

**How.** Table 1 is read from text (its percentage is always the line's last token). Tables 2
and 3 are rebuilt from **word coordinates**, not text, because the tables are striped: only
shaded rows carry cell rectangles, so `extract_tables()` resolves every other row and collapses
the rest. Cells also wrap vertically — an essentiality class renders as "Most"/"essential"/
"drug list" on three lines centred on its data row, and long drug names wrap above and below.

Each row is anchored by its first-column word (serial number or drug code); every other word
attaches to the **nearest anchor by vertical distance**. Rows sit ~28.8pt apart and wrapped
lines ~10.8pt from their anchor, so the nearest anchor is unambiguous. Words further than 14pt
from any anchor (page headers, footers, captions, body prose) are dropped.

**Verification — the extraction is checked, not trusted.** The script exits non-zero if any of
these disagree: 15 categories; printed total **74.20%**; 104 Table 2 items with contiguous
serials 1–104; the two items the text calls universally unavailable (glyceryl trinitrate,
anti-D immunoglobin) both at 0.00%; 103 Table 3 rows with unique codes and a recognised
essentiality class for every row.

**Provenance: `real`** — these are transcriptions of published numbers. Nothing is adjusted.

### Two findings that constrain later steps

1. **Table 3 is one row short of Table 2.** *Glibenclamide* (item 38) has availability but no
   drug code, strength-form record or essentiality class. It therefore has no Table 3 attributes
   for `methods:indent_matching` to match on, and must be matched on its Table 2 name alone or
   sent for manual confirmation.
2. **Item 49 (*Lignocaine inj 2 % w/v*) is printed as 83.33%**, i.e. 12.5/15, which cannot arise
   from 15 binary observations. Every other value is an exact multiple of 1/15.
   **Decision for `methods:availability_matrix`:** its integer column total will be taken as
   **round(12.5) = 12** (banker's rounding would give 12; we take 12 explicitly), the deficit is
   absorbed by the documented margin reconciliation, and the item is flagged in the UI as
   resting on an inconsistent published value. This is recorded rather than silently smoothed.

---

## `methods:figure1_transcription` — Per-PHC availability *(implemented; interim until transcribed)*

Figure 1 is a raster image with no embedded data labels, so the 15 per-PHC percentages cannot
be extracted programmatically. They are **transcribed by hand** into
`data/manual/figure1_phc_availability.csv` and checked against the two values stated in the
paper's text (PHC 4 = 94.17, PHC 1 = 45.45) and against the overall mean of 74.20%.

Tagged `real` (published values, manually transcribed), with the transcription noted.

---

## `methods:availability_matrix` — The 15 × 104 in-stock matrix *(implemented)*

**Problem.** The survey publishes *margins only*: availability per item (Table 2, column
totals) and availability per PHC (Figure 1, row totals). It never publishes which specific PHC
held which specific item. The simulation needs a starting inventory per facility, which is a
full 15 × 104 binary matrix.

**Method.** Reconstruct a binary matrix whose margins match the published ones, using iterative
proportional fitting followed by a seeded constrained rounding to 0/1:

    row_total[p]    = round(figure1_availability[p] / 100 × 104)      for each PHC p
    column_total[i] = round(table2_availability[i] / 100 × 15)        for each item i

subject to `sum(row_totals) == sum(column_totals)` (reconciled by documented rounding).

**Provenance: `derived`, and the limitation is not optional.** The margins are real; *every
individual cell is reconstructed, not observed*. The UI must never imply that a named PHC was
observed to hold a specific item. Tests assert reconstructed margins match published margins
within tolerance.

Two items — **glyceryl trinitrate** and **anti-D immunoglobin** — are at 0.00% availability
(stated in the paper's text), so their entire column is zero. This is a useful correctness check.

---

## `methods:indent_matching` — Matching survey items to indent rows *(Milestone 3 — implemented)*

**Script:** `data/pipeline/02_extract_indent_and_match.py`. **Code:**
`backend/zealo/pipeline/{indent,matching}.py`. **Tests:** `backend/tests/test_{indent_extraction,matching}.py`.

**There is no code join.** The survey uses Karnataka EDL numbering (`6.3.2`); the indent uses
`D#####` (761 drugs) and `M#####` (122 consumables). The indent does contain 7 EDL-style dotted
codes, but they are blood-factor products and share **none** of the survey's 103 values —
checked, not assumed. So all 104 items must be matched from text.

**One fuzzy score is not safe enough.** Measured on the real data, `"Amoxycillin 250mg/5ml
syrup"` scores 81 against `"Amoxycillin Capsules IP 250 mg 1x1"` — right drug, right strength,
wrong form — and `"Zinc syrup 60 ml"` scores 50 against a paracetamol syrup whose 60ml pack
looks like an agreeing strength. Building stock levels on that would be inventing data.

**So each label is parsed into three comparable parts** and all three must agree:

| Part | How it is derived |
|---|---|
| base name | form words, pharmacopoeia markers (IP/BP/USP), pack sizes (`1x10ml`) and strengths stripped; trailing compositional prose ("Each tablet contains …") cut |
| dosage form | canonicalised (`tab`→`tablet`); syrup/suspension/solution/drops treated as equivalent, as are powder/granules/sachet, injection/infusion, ointment/cream/gel |
| strengths | normalised (g→mg, mcg→mg, lakh→IU) and **grouped by what they measure** — mass, volume, activity, concentration |

**Strengths are compared family by family.** Comparing the sets wholesale let
`250mg/5ml` match `125mg/5ml` because both contain `5ml`. Every family present on *both* sides
must agree. If both labels carry strengths but share no family at all — `Vitamin A 25000 IU`
against `Vitamin-E 400mg` — that counts as disagreement, because it let a wrong drug through.

**Auto-accept requires all of:** base-name similarity ≥ **88** (tuned against the real output,
not guessed), compatible form, compatible strength, **no near-tie** with the runner-up (within
2 points), and **no other survey item claiming the same indent row**. That last rule exists
because the survey lists both "Disposable mask" and "Triple layer mask" while the indent has one
"Disposable Mask Triple Layer Elastic type"; at least one must be wrong, so both go to a human.

**Result on the real data: 53 of 104 auto-accepted, 51 held for review.** Held items are
written to `data/manual/indent_match_review.csv` with their top 3 candidates and the reason,
and are **excluded from the build until a decision is recorded** — enforced by test. Decisions
already in the file are read back on every re-run and never overwritten.

Accepted links are tagged `derived` (the link is inferred); the availability figure each item
carries stays `real`.

---

## `methods:taluk_annual_demand` — Scaling statewide indent to Gadag *(implemented)*

    taluk_annual_demand[item] = statewide_indent_qty[item] × (gadag_population / karnataka_population)

`statewide_indent_qty` is `real` (KSMSCL). Populations are `real` (Census, pending). The product
is `derived`.

**Assumption to state in the UI:** per-capita demand in Gadag equals the state average. The
indent is a *request*, not consumption, so this is a demand proxy — not measured demand.

---

## `methods:facility_list` — Building the facility list *(Milestone 4 — implemented)*

**Script:** `data/pipeline/03_build_facilities.py`. **Code:** `backend/zealo/pipeline/facilities.py`.
**Tests:** `backend/tests/test_facilities.py`.

**Coordinates are `real`** — copied from OSM. **Facility type and ownership are `derived`**:
OSM carries no `operator` or `beds` tag for any facility in Gadag, so both are inferred from
names and descriptions. **Beds are unknown**, not estimated.

**Type rules**, in order: an explicit "District Hospital" → district hospital; "PHC" or
"primary health" → PHC; "CHC"/"community health" → CHC; "taluk"/"taluka" → taluk hospital;
`amenity=pharmacy` → pharmacy; any other government marker → **`government_other`**;
`amenity=hospital` → private hospital; `amenity=clinic|doctors` → clinic.

`government_other` exists deliberately. "Railway Hospital", "Rural Medical Service Hulkoti",
"Kadadi Government Hospital" and "Mulagund Government Hospital" are clearly government but of
unstated level. **The level decides which medicine list a facility carries** (the indent's
PHC/CHC/TLH/DLH columns), so calling them all taluk hospitals would hand several of them the
wrong list. They are typed as unclear and sent to a human.

A bare "Primary Health Care" is also flagged rather than trusted — a private clinic can use that
phrase, and treating it as a government PHC would put a state medicine list on a private clinic.

**De-duplication** merges two records only when they are within **50 m** *and* score **≥ 85** on
name similarity, which ignores generic words ("hospital", "clinic", "nursing home", "dr") and
compares with `token_sort_ratio`. Pairs within 120 m scoring ≥ 70 are **flagged, not merged**.

The scorer matters: `token_set_ratio` and a substring test both score a subset as a perfect
match, which merged "J C Shirol Nursing Home", "V C Shirol Nursing Home", "Shirol Nursing Home"
and "Shirola Hospital" into a single facility — almost certainly different practices sharing a
family name. **Erasing a real facility is worse than asking a human**, so the distinguishing
initials are allowed to lower the score.

**Exclusions** are recorded with a reason, never silently dropped: a veterinary hospital (animal
health) and a blood bank (no medicine inventory). Both appear in the build report.

**Labels.** Facilities are numbered per type, ordered north→south then west→east, so labels are
stable across runs. A type with a single member drops the number ("District Hospital"). Real
names never reach `data/processed/`; a test asserts it, after a review note quoting a
neighbouring facility's name leaked one during development.

**Nothing is usable yet:** `verified` is false for all 77 until the team confirms
`data/manual/facility_verification.csv`.

---

## `methods:facility_demand_split` — Splitting demand between facilities *(implemented; equal shares until attendance arrives)*

Preferred: split each item's taluk demand across the government facilities that carry it (per
the indent's PHC/CHC/TLH/DLH columns) in proportion to **OPD attendance from HMIS** → `derived`.

Fallback if HMIS data is unavailable: a documented facility-type weighting → `estimated`. The
weights will be written here explicitly when set, and the UI will show which split is in use.

Private facilities: a configurable share of taluk demand, split by beds where known and equally
otherwise → `estimated`. **No public inventory or demand data exists for private facilities**,
and the UI says so.

---

## `methods:daily_demand` — Daily demand draw *(Milestone 5/6)*

    daily_demand[facility, item, day] ~ Poisson(annual_demand[facility, item] / 365 × demand_scale)

Seeded, so a given seed reproduces a run exactly. `demand_scale` is user-controlled in Settings.
Tagged `estimated`: the Poisson shape is a modelling choice, not an observation.

---

## `methods:starting_stock` — Opening inventory *(implemented)*

- **PHCs:** in-stock/out-of-stock from `methods:availability_matrix`. In-stock items open at an
  estimated quantity derived from days-of-cover against estimated demand; out-of-stock items
  open at zero.
- **CHC / taluk hospital:** medicine list from the indent's level columns; opening availability
  drawn to match the survey's overall availability *for the same therapeutic category* →
  `estimated`.
- **Private hospitals, clinics, pharmacies:** taluk-hospital or PHC list as a proxy, scaled by
  beds where known → `estimated`, clearly labelled as having no public basis.

---

## `methods:starting_shelf_life` — Opening expiry dates *(implemented)*

Opening batches are given estimated remaining shelf life, with a configurable share near
expiry. Tagged `estimated` — the survey records no expiry dates whatsoever.

---

## `methods:facility_status` — Map colour per facility per day *(Milestone 6 — implemented)*

- **red** — any carried medicine is out of stock
- **amber** — **2 or more** carried medicines have under **7 days** of cover, **or** more than
  **25%** of units on hand expire within **90 days**
- **green** — otherwise

`derived` from simulation state. Days of cover use the forecast, not a fixed average.

---

## `methods:simulation` — The simulated day and the two policies *(Milestone 6 — implemented)*

**Code:** `backend/zealo/sim/`. **Tests:** `backend/tests/test_simulation.py` (36 tests).

**The day**, in this fixed order: deliveries and transfers due today arrive → expired batches are
removed and counted as waste → demand is served **earliest-expiry-first** → the active policy
decides → end-of-day state is recorded. FEFO matters: consuming newest-first would mean nothing
was ever at risk of expiring, and near-expiry rebalancing would have nothing to do.

**Determinism.** All randomness lives in the demand draw, generated once into the scenario before
either mode runs. The engine itself draws nothing, so the same seed gives byte-identical metrics,
events and timeline.

**Fairness.** Both modes read the same scenario, so they get identical demand and identical
opening stock. Any difference between them is caused by policy alone. Both properties are tested.

### Without Zealo (baseline)
Each facility reviews its own stock every **7 days**, orders from the manufacturer up to
**30 days** of forecast demand when its position falls below `forecast x (lead time + safety
days)`, **over-orders by 1.5x after a stockout**, accepts whatever shelf life it is sent, and
never shares stock with anyone.

### With Zealo
Daily, for facilities where `in_network` is true. A facility that opts out behaves **exactly** as
it does in the baseline — tested, because otherwise the comparison would be rigged.

1. **Forecast** — `Forecaster` is an interface (`update` / `predict`) so a trained model can
   replace the default without touching the policies. The default is an EWMA (alpha 0.2) of
   **served plus unmet** demand; forecasting on served demand alone would teach an
   already-short facility to stay short. *No outbreak or disease-surge model is built.*
2. **Shortage relief** — if stock plus arrivals within the manufacturer lead time will not cover
   demand until the next delivery, pull the gap from the **nearest network facility holding more
   than its own safety level**. Only if no peer can help does an express order go to a
   manufacturer: moving stock that already exists beats making more of it.
3. **Near-expiry rebalancing** — at-risk quantity is whatever expires before this facility's own
   consumption would reach it. It moves to the nearest network facility whose forecast demand
   will actually consume it before that expiry day; otherwise the move would only relocate waste.
4. **Refill** — order up to the target when position falls below `forecast x (lead time + safety
   days)`. Orders above the auto-approval limit raise an approval request and wait the approval
   delay; a recorded manual decision can reject them instead.
5. **Minimum shelf life** — Zealo refuses manufacturer stock with under **180 days** remaining.
   The baseline accepts it. Both are tested.

**Transfers only ever move between two different network facilities.** There is no warehouse and
no distributor: `NodeKind` has exactly two members, `facility` and `manufacturer`, so a delivery
cannot even name such a node. A transfer that would leave a facility for itself, or involve a
non-member, raises.

**Conservation.** `starting + manufacturer arrivals == dispensed + expired + on hand + in
transit`, checked for both policies.

**Prices.** Value figures (expired value, value moved, stock value) are **withheld entirely**
when any medicine is unpriced, rather than shown as zero — no public price source is confirmed
yet (request R6), and a zero would read as a real figure.

**Performance.** A 180-day run over 77 facilities x 104 medicines takes about **9 s** for the
baseline and **26 s** for the Zealo policy. Indexing in-transit deliveries by their destination
cut the Zealo run from 29 s to under 2 s at a smaller scale; what remains is the roughly 4.3
million policy evaluations a full run performs. Runs are cached, and the site ships a
pre-computed default run, so this is a build-time cost rather than a page-load one.

---

## `methods:unit_prices` — Unit prices *(decided: units only)*

To be filled once a public price source is identified. If a government ceiling price list or
public generic price list is found, prices are `real` and cited. **If none is found, we ask
before using illustrative prices**, and tag them `estimated`.

---

## Decisions of 2026-09-16/17 and how they are implemented

### `methods:population_share` — Population
Census 2011: Karnataka **61,095,297** (karnataka.gov.in, official), Gadag taluk **367,258**
(censusindia2011.com, a third-party mirror, because censusindia.gov.in serves an incomplete TLS
chain), Gadag district **1,064,570** (gadag.nic.in, sanity check only). Each value was
machine-verified against a saved snapshot in `data/raw/population/`, and step 04 re-checks the
snapshots and two ratios on every run, failing loudly if either drifts:
taluk ÷ state = **0.6011%** (expected ≈ 0.601%) and taluk ÷ district = **34.50%** (≈ 34.5%).

Limitations: 2011 populations are paired with 2025-26 indent quantities; only the taluk's
*share* is used and assumed broadly stable, with no growth projection. Gadag district now lists
7 taluks (5 in 2011), so the taluk boundary may have changed; this is not adjusted for.

### `methods:figure1_interim` — Figure 1 until it is transcribed
PHC 1 = 45.45 and PHC 4 = 94.17 (stated in the paper, `real`). The other 13 take one equal value,
(74.20 × 15 − 45.45 − 94.17) ÷ 13 = **74.8754**, which preserves the published mean (`estimated`,
"interim: equal distribution pending Figure 1 transcription"). A submitted transcription is used
only if all 15 are filled, each is 0–100, PHC 1 and PHC 4 match the paper and are the minimum and
maximum, and the mean is within ±0.5 of 74.20. Otherwise the failures are reported and the
interim values stay in force.

### Matrix construction, as implemented
Row totals = round-half-down(pct × 104). Column totals = round-half-down(Table 2 pct × 15) —
item 49's impossible 83.33% becomes 12. Rounding left rows 2 above columns (1159 vs 1157); the
difference is absorbed one unit at a time by the rows closest to rounding the other way,
**estimated rows first**, so the published PHC 1 and PHC 4 are not moved. Feasibility is checked
with Gale–Ryser, then the matrix is built by Ryser's construction (items in descending order of
holders, each given to the PHCs with most remaining capacity, ties broken by a fixed seed).
Exact row and column margins are asserted, not assumed.

### Unmatched survey items
Items without a confirmed indent match stay on the map with **survey availability only** — in or
out of stock at mapped PHCs from the matrix, tagged `derived`, with no quantities or demand, and
static because the survey is a single-day snapshot. Currently 53 of 104 have quantities.

Review suggestions: only a candidate whose name, strength and dosage form all align may be
suggested. "high" additionally needs both labels to name a form, a strict (subset-sensitive)
name score ≥ 90, and no near-tie; items sharing a suggested code are capped at "low". None
currently qualifies as high: anything that confident was already auto-accepted.

### Facilities of unconfirmed level, network defaults, corrections
* Railway Hospital → `other_government`: probably Indian Railways, **not in the network by
  default, no state medicine list**, type `estimated`.
* Other government facilities of unstated level → `government_level_unknown`: **PHC medicine
  list** (most conservative), in the network, type `estimated`, flagged "level unconfirmed".
* Pharmacies are **not in the network by default**. No pharmacy count is estimated.
* Team corrections in `facility_verification.csv` are keyed on each facility's stable OSM ids.
  A confirmed type is applied before labelling, switches the medicine list automatically and is
  tagged `real` with source `team_verification`. Invalid entries are reported and ignored.

### PHC locations (R4)
Rows in `data/manual/phc_locations.csv` with coordinates are placed exactly (`real`). Rows with
only a village are geocoded to the village centre with OpenStreetMap Nominatim — at most one
request per second, a descriptive user agent, results cached in `data/raw/geocode/`, restricted
to the Gadag taluk bounding box — tagged `derived`, labelled "approximate: village centre", and
drawn with a dashed, translucent marker. Locations outside the taluk are rejected; a PHC already
on the map is not duplicated. Survey profiles are assigned to mapped PHCs by a seeded,
illustrative shuffle; unassigned profiles are listed as unmapped and still count in taluk-wide
survey statistics.

### Demand split and private demand
Government facilities carrying an item share its taluk demand **equally** (`estimated`) until
every one of them has an OPD figure in `facility_attendance.csv`, then by attendance
(`derived`). Private facilities share an additional **25%** of the taluk demand equally
(`estimated`, adjustable in Settings). *The 25% is a modelling choice with no published basis.*

### Opening stock
An item recorded as in stock opens with **ceil**(30 × mean daily demand) units — ceiling, not
rounding, because rounding sent slow items at private facilities in with zero units while the
survey said they were in stock.

### Transfer policy corrections (found on the real data)
The first end-to-end run made 58,273 transfers in 180 days: 64% moved ≤ 2 units and stock
ran back and forth. Three rules fixed it (1,123 transfers, median 7 units):
1. **Minimum transfer of 5 units.** Smaller gaps are left to the regular refill.
2. **Donors keep their reorder point** (lead time + safety days of forecast), not just safety
   days — giving below it made the donor pull stock the next day, a cascade.
3. **Near-expiry rebalancing acts only within 90 days of expiry**, and at-risk quantity is
   computed FEFO: stock expiring by the soonest date minus what the facility consumes before
   then. A receiver must be able to consume it after its own stock expiring by that date.

### Approval limit in units
With no prices, an order's value is unknown and a rupee limit could never be exceeded, so
approvals would silently never occur. The limit is read as **units per order line** while prices
are absent, and as rupees if `data/manual/prices.csv` is added.

### Units only
No verified public price list could be accessed, so no rupee values are shown anywhere. Adding
`data/manual/prices.csv` (from `prices.csv.template`, every row sourced) switches value metrics
back on with `real` tags — but only when every simulated medicine is priced.

---

## Reproducibility

- `data/raw/` is never modified. Every output is produced by a re-runnable script in
  `data/pipeline/`.
- All randomness is seeded. The same seed gives byte-identical simulation results, enforced by
  test.
- Both simulation modes ("without Zealo" / "with Zealo") use **identical** demand draws and
  identical starting stock, so any difference between them is caused by policy alone. Also
  enforced by test.
