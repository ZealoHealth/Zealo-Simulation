# Methods

Every number on the Zealo Map site is either copied from a source (`real`), computed from real
data by a formula written down here (`derived`), or modelled (`estimated`). This file is the
reference for the second and third kinds. Each method has an anchor id such as
`methods:taluk_annual_demand`; `Tagged.method` in the code points at it, so a number in the UI
can be traced to the paragraph that produced it.

> **Status:** skeleton. Methods are filled in as their milestone lands. A method marked
> *(not yet implemented)* has no code behind it and no numbers depending on it.

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

## `methods:figure1_transcription` — Per-PHC availability *(Milestone 2, blocked)*

Figure 1 is a raster image with no embedded data labels, so the 15 per-PHC percentages cannot
be extracted programmatically. They are **transcribed by hand** into
`data/manual/figure1_phc_availability.csv` and checked against the two values stated in the
paper's text (PHC 4 = 94.17, PHC 1 = 45.45) and against the overall mean of 74.20%.

Tagged `real` (published values, manually transcribed), with the transcription noted.

---

## `methods:availability_matrix` — The 15 × 104 in-stock matrix *(Milestone 2)*

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

## `methods:indent_matching` — Matching survey items to indent rows *(Milestone 3)*

The survey's drug codes (Karnataka EDL numbering, e.g. `6.3.2`) and the KSMSCL indent's codes
(e.g. `D00303`) are **different schemes**, so there is no code-level join. Items are matched on
normalised **name + strength + dosage form** using token-set fuzzy matching.

- Scores above the accept threshold → auto-accepted, tagged `derived`.
- Everything else → written to `data/manual/indent_match_review.csv` for human confirmation.
- **Unconfirmed uncertain matches are excluded from the build**, enforced by a test.

Thresholds are recorded here once tuned against real output rather than guessed in advance.

---

## `methods:taluk_annual_demand` — Scaling statewide indent to Gadag *(Milestone 5)*

    taluk_annual_demand[item] = statewide_indent_qty[item] × (gadag_population / karnataka_population)

`statewide_indent_qty` is `real` (KSMSCL). Populations are `real` (Census, pending). The product
is `derived`.

**Assumption to state in the UI:** per-capita demand in Gadag equals the state average. The
indent is a *request*, not consumption, so this is a demand proxy — not measured demand.

---

## `methods:facility_demand_split` — Splitting demand between facilities *(Milestone 5)*

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

## `methods:starting_stock` — Opening inventory *(Milestone 5)*

- **PHCs:** in-stock/out-of-stock from `methods:availability_matrix`. In-stock items open at an
  estimated quantity derived from days-of-cover against estimated demand; out-of-stock items
  open at zero.
- **CHC / taluk hospital:** medicine list from the indent's level columns; opening availability
  drawn to match the survey's overall availability *for the same therapeutic category* →
  `estimated`.
- **Private hospitals, clinics, pharmacies:** taluk-hospital or PHC list as a proxy, scaled by
  beds where known → `estimated`, clearly labelled as having no public basis.

---

## `methods:starting_shelf_life` — Opening expiry dates *(Milestone 5)*

Opening batches are given estimated remaining shelf life, with a configurable share near
expiry. Tagged `estimated` — the survey records no expiry dates whatsoever.

---

## `methods:facility_status` — Map colour per facility per day *(Milestone 6)*

- **red** — any carried medicine is out of stock
- **amber** — two or more carried medicines have under 7 days of cover, **or** near-expiry
  stock is above the configured threshold
- **green** — otherwise

`derived` from simulation state.

---

## `methods:unit_prices` — Unit prices *(Milestone 5, open)*

To be filled once a public price source is identified. If a government ceiling price list or
public generic price list is found, prices are `real` and cited. **If none is found, we ask
before using illustrative prices**, and tag them `estimated`.

---

## Reproducibility

- `data/raw/` is never modified. Every output is produced by a re-runnable script in
  `data/pipeline/`.
- All randomness is seeded. The same seed gives byte-identical simulation results, enforced by
  test.
- Both simulation modes ("without Zealo" / "with Zealo") use **identical** demand draws and
  identical starting stock, so any difference between them is caused by policy alone. Also
  enforced by test.
