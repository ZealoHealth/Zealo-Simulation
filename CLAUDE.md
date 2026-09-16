# CLAUDE.md — Zealo Map

Working notes for Claude Code on this repository. Kept current as milestones land.

## What this is

A working MVP for **Zealo**: a shared medicine-inventory layer. The site maps health facilities
in **Gadag taluk, Karnataka**, shows what medicines each facility has, and simulates how Zealo
keeps stock available by refilling **directly from manufacturers** and **redistributing stock
between facilities in its network**.

Priority order: **inventory map** > facility dashboard > network redistribution view >
with/without-Zealo comparison.

## Hard rules — do not violate these

1. **Never invent data and present it as real.** Every facility comes from a real source record.
   No made-up coordinates, facility counts, bed numbers, populations or medicine availability.
2. **Every field carries a provenance tag**: `real` / `derived` / `estimated`, plus source id
   and retrieval date. Enforced by `zealo.models.provenance`, which *refuses to construct* an
   unsourced `real` value or a method-less `derived`/`estimated` value.
3. **If a source can't be accessed automatically, stop and ask.** Do not scrape sites whose
   robots rules or terms disallow it. Do not substitute invented data. Requests go in
   `data/manual/REQUESTS.md`.
4. **Never display real facility names.** Real names live in `data/raw/` only. The UI labels
   facilities by type and number: "Taluk Hospital", "PHC 3", "CHC 1", "Private Hospital 2".
5. **Disclaimer on every page**, verbatim:
   > Facility locations and medicine lists come from public sources. Stock levels are estimates.
   > PHC availability patterns come from a 2021–22 published survey and are assigned to map
   > locations for illustration.
6. **No dosing or clinical guidance anywhere.** Medicines are inventory items only.
7. **No real manufacturer or brand names.** Manufacturers are generic nodes ("Manufacturer A").
8. **No warehouses and no distributors** anywhere in the model. Transfers only ever happen
   between two network facilities. There is a test for this.
9. **No outbreak detection or disease forecasting.** The `Forecaster` interface is built so an
   ML model can replace the rule-based one later, but no outbreak features are built.
10. **Do not commit.** The user commits manually. Ask after each change.

## Repository layout

```
backend/            FastAPI app + simulation engine (Python package `zealo`)
  zealo/
    models/         Pydantic models. provenance.py and sources.py are load-bearing.
    sim/            Simulation engine, policies, forecasting, metrics
    api/            Route handlers
    pipeline/       Library code for data extraction/matching/building
  tests/            pytest
data/
  raw/              Untouched originals. NEVER EDIT. See data/raw/README.md
  interim/          Intermediate extraction output
  processed/        Clean, provenance-tagged datasets the app reads
  manual/           Files the user supplies by hand + REQUESTS.md
  pipeline/         Numbered, re-runnable scripts
  SOURCES.md        One entry per source: URL, licence, retrieval date, limitations
  METHODS.md        Every derived/estimated formula, with anchor ids
frontend/           React + TypeScript (Vite) — scaffolded at Milestone 8
docs/
```

## Commands

```bash
make install       # create .venv and install backend (editable) with pipeline+dev extras
make test          # pytest
make lint          # ruff check
make api           # uvicorn dev server on :8000
```

Direct equivalents:
```bash
.venv/bin/python -m pytest backend           # tests (run from repo root)
.venv/bin/python -m uvicorn zealo.main:app --reload --app-dir backend
```

## Environment decisions

- **Python 3.11** (`/opt/homebrew/bin/python3.11`, arm64) in a repo-root `.venv`.
  Chosen deliberately: numpy ≥2.5 requires Python ≥3.12, and the installed 3.12 is a broken
  symlink, so 3.11 + numpy 2.4.x + pandas 2.3.x is the combination with the widest wheel and
  hosting support. Render supports 3.11 natively.
- Backend installed editable (`pip install -e "./backend[pipeline,dev]"`) so `data/pipeline/`
  scripts can `import zealo` without path hacks.
  **Gotcha:** setuptools snapshots the package layout at install time. If you add a new
  subpackage under `zealo/`, re-run `make install` (or
  `pip install --force-reinstall --no-deps -e "./backend[...]"`), or it will be registered as a
  namespace package and `__init__.py` will silently not execute.
- Installed: fastapi 0.141.1, pydantic 2.13.5, numpy 2.4.6, pandas 2.3.3, pdfplumber 0.11.10,
  rapidfuzz 3.14.6, scipy 1.17.1, pytest 9.1.1.

## Data decisions (verified, not assumed)

- **Survey PDF is text-extractable.** Tables 1, 2, 3 come out as text. Verified the published
  anchors are present: overall 74.20%, PHC 4 94.17%, PHC 1 45.45%, 104 items, 15 PHCs.
- **Figure 1 is a raster image with no data labels** — page 4 has two images and no chart
  numerals. The 15 per-PHC values *must* be transcribed by hand. Blocking request R1.
- **Survey and indent use different drug-code schemes.** Survey Table 3 uses Karnataka EDL
  numbering (`6.3.2`, `19.1.1`); the KSMSCL indent uses `D00303`. **There is no code join** —
  matching must be on name + strength + dosage form, with uncertain matches held for human
  confirmation.
- **Indent PDF confirmed**: "890 Drugs", with `Drug Code`, `Drug Type`, `Drugs Category`,
  `PHC`/`CHC`/`TLH`/`DLH` availability columns, `Drug Name`, `Indent Qty`, `Mode of
  Procurement`. Rows wrap across lines → needs positional parsing.
- **robots.txt checked 2026-09-16:** Cureus and ksmscl.in permit automated download (done).
  `data.gov.in` and `karnataka.data.gov.in` both `Disallow: /` → **manual only, never fetch**.
  ABDM HFR and HMIS are JS apps with no robots file → manual.
- The two items at 0.00% availability across all PHCs (glyceryl trinitrate, anti-D
  immunoglobin) are a useful correctness check on the derived matrix.
- **Table 3 has 103 rows, not 104.** Glibenclamide (Table 2 item 38) is in Table 2 only —
  searched every page. It has no drug code / dosage form / essentiality class, so it has nothing
  to match on against the indent except its Table 2 name.
- **Item 49 (Lignocaine inj 2 % w/v) is printed as 83.33% = 12.5/15**, impossible for 15 binary
  observations. Every other value is an exact multiple of 1/15. The paper's inconsistency, not
  ours; its column total is rounded to 12 and the choice is documented in METHODS.md.
- **Three row-assembly rules exist in `pdf_tables.py`; pick by layout.** `max_row_dy`
  (nearest anchor) suits the survey, whose cells are centred on their anchor.
  `row_boundaries` (the table's own shading rectangles) is what the indent needs: its row
  heights vary so much that a 5-line drug name's outer lines land nearer a *neighbouring*
  row's serial number, which silently moved content between rows (36 rows affected at worst).
  Every shading band holds exactly one serial number, so the document's own rules are exact.
  `band_up_tolerance` exists but neither PDF uses it now.
- **Indent extraction gotchas, all fixed and pinned by tests:** the PDF's text layer splits a
  long quantity into two tokens (`'1'` + `'3,84,87,350'`), and glues a category to the next
  column (`'AntioxytocicsAvailable'`) which needs char-level splitting. No word legitimately
  starts between x=158.3 and x=178.9, so the category/PHC split at 178.0 is unambiguous.
- **Indent codes have three forms:** `D#####` (761), `M#####` (122 consumables), and 7 dotted
  EDL-style codes. The dotted ones share no values with the survey, so there is still no join.
- **OSM boundary: relation 4155661 = "Gadag taluk" (admin_level 6).** admin_level 5 is the
  *district*, not the taluk — easy to confuse. 9 outer ways stitch to one closed 446-point ring.
- **OSM has no `operator` or `beds` tag for any Gadag facility**, so type and ownership are
  `derived` from names and beds are unknown. Hence the verification sheet and `verified=false`.
- **`government_other` is a deliberate type.** "Railway Hospital" etc. are government but of
  unstated level, and the level picks the medicine list — so it is not guessed.
- **Use `token_sort_ratio` for facility names, never `token_set_ratio` or a substring test.**
  Both score a subset as perfect and merged four distinct Shirol practices into one facility.
- **Real names must never reach `data/processed/`.** A review note quoting a neighbouring
  facility's name leaked one; flags in processed output are now short codes, with the
  name-bearing prose confined to the verification sheet. Guarded by a test.
- **PHC gap: OSM has 5, the survey covers 15.** Blocked on R4 (HMIS). Do not invent locations.
- **Matching needs three signals, not one score.** Name similarity alone matched syrup to
  capsules at 81 and a wrong drug at 50. Base name + dosage form + per-family strength, all
  three required, plus no near-tie and no two items claiming the same indent row.
- Tables 2 and 3 must be parsed from **word coordinates, not text**: the tables are striped, so
  `extract_tables()` only resolves alternating rows, and cells wrap vertically across up to
  three lines. Column left edges: Table 2 `[70, 105, 305, 430]`, Table 3 `[70, 105, 317, 444,
  486]`; a wrapped line sits ~10.8pt from its anchor, rows ~28.8pt apart.

## Architecture notes

- **Simulation logic stays in the backend; the frontend only presents.**
- Playback happens in the browser from a timeline returned by one `POST /simulate` call — never
  one API call per simulated day.
- `Tagged[T]` wraps every value with its evidence. Prefer the `real()` / `derived()` /
  `estimated()` shorthands.
- `Forecaster` is an interface (`update(day, observed_demand)` / `predict(day)`); the default is
  a rule-based EWMA. An ML forecaster must be able to drop in without touching anything else.
- Determinism is a requirement, not a nicety: same seed → identical results, and both modes must
  share identical demand draws and starting stock so differences are attributable to policy.

## Open questions

- **R7 match confirmations** — 51 of 104 survey items need a decision in
  `data/manual/indent_match_review.csv`. They are excluded from the build until then.
- **R8 facility verification** — 77 facilities need checking; 12 carry flags. `verified` is
  false for all of them until then.
- **PHC gap (R4)** — only 5 of 15 PHCs are locatable from OSM. Blocks assigning the survey's 15
  availability profiles to real locations.
- **R5 population figures** — blocks the demand formula; must be official and cited.
- **Unit prices** — no source identified yet; ask before using illustrative prices.
- **HMIS availability** — determines whether the demand split is `derived` or `estimated`.
- **Gadag taluk boundary source** — needed to draw the outline and validate coordinates.
- `starlette.testclient` warns that `httpx` is deprecated in favour of `httpx2`. Harmless now;
  revisit if it breaks.

## Milestone status

| # | Milestone | Status |
|---|---|---|
| 1 | Plan and scaffold | **done** |
| 2 | Survey data | **tables 1–3 extracted + verified; matrix blocked on R1** |
| 3 | Medicine master list | **done — 51 matches await your confirmation (R7)** |
| 4 | Facilities | **built from OSM — awaiting R8 verification; PHC gap needs R4** |
| 5 | Demand and starting inventory | blocked on R4, R5 |
| 6 | Simulation core | not started |
| 7 | API | not started |
| 8 | Inventory map | not started |
| 9 | Facility dashboard + redistribution view | not started |
| 10 | Comparison, Settings, Data Sources, About | not started |
| 11 | Deployment | not started |
| 12 | Polish | not started |

## Working style

- Ask before major architectural changes or significant new dependencies.
- Keep `data/raw/` untouched; all transformations are re-runnable scripts.
- Keep this file and `CHANGES.md` updated.
- **Do not commit.** Summarise the change and let the user commit.
- If a source is unavailable, a number can't be verified, or a requirement seems unrealistic:
  flag it and ask. Do not work around it.
