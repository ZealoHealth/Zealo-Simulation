# Changes

A running log of what changed, milestone by milestone. Newest first.

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
