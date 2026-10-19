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
make data          # rebuild every dataset from data/raw + data/manual (never overwrites entries)
make data-check    # what is missing / interim / invalid; regenerates data/DATA_TODO.md
make test          # pytest
make lint          # ruff check
make api           # uvicorn dev server on :8000
cd frontend && npm run dev | npm test | npm run lint | npx tsc -b --noEmit
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

## Simulation notes (Milestone 6)

- `backend/zealo/sim/`: `models` (entities) · `inventory` (FEFO batches) · `forecast`
  (`Forecaster` interface + EWMA) · `events` (log + metrics) · `engine` (day loop, `Scenario`,
  `SimulationState`) · `policies` (baseline + Zealo).
- **`NodeKind` has exactly two members**, `facility` and `manufacturer`. That is how "no
  warehouses, no distributors" is enforced — a `Delivery` cannot name a node kind that does not
  exist, and `Delivery.__post_init__` rejects a transfer that is not facility-to-facility.
- **Policies never touch inventories directly.** They call `state.place_order` and
  `state.transfer`, which enforce the invariants (no self-transfer, both ends in-network,
  minimum shelf life) and write the event log. Keep it that way.
- **Determinism comes from `Scenario`**, which holds a pre-generated demand array. The engine
  draws no randomness. Both modes read the same `Scenario`, which is what makes the comparison
  fair — there are tests for both.
- **A facility with `in_network=False` must behave identically to the baseline.** Tested. The
  shared `review_alone()` in `policies.py` is what guarantees it.
- **Performance:** 180 days x 77 facilities x 104 medicines is ~9 s baseline, ~26 s Zealo.
  The big win was indexing in-transit deliveries by `(facility, medicine)` — `arrivals_within`
  and `next_arrival_day` were scanning one flat list per call and were 33 of 36 profiled
  seconds. A per-day forecast cache was tried and reverted: no measurable gain, and it added a
  stale-read footgun. Further speedup needs vectorising the policy loop — ask first.
- **Value metrics are withheld, not zeroed**, when prices are unknown (R6 still open).
- Test scenario factories live in `backend/tests/factories.py`. They are synthetic **on
  purpose** and must never move into the shipped package or into `data/processed/`.

## API notes (Milestone 7)

- `zealo/api/routes.py` (endpoints) · `api/schemas.py` (request/response models) ·
  `data_access.py` (loads `data/processed/`, cached) · `sources_registry.py` (structured
  source list behind `GET /sources`) · `sim/runner.py` (scenario assembly + run cache).
- **`/simulate` deliberately returns 422, not a fabricated run**, while population figures
  (R5) and the availability matrix (R1) are missing. `MissingDemandInputs` carries the exact
  request ids so the UI can say what is needed. Everything else is already wired to real data.
- **Every data response carries the disclaimer and its own caveats.** Don't add an endpoint
  that returns numbers without them.
- A missing run returns 404 `run_not_found` with a message telling the client to re-submit to
  `/simulate` — the frontend re-runs on this rather than rendering an empty map.
- `run_id` is a hash of the scenario settings, so the same settings always name the same run
  and the cache hits.
- Only `auto` and `confirmed` medicine matches reach the API. Pending ones are excluded in
  `data_access.load_medicines`, so an unreviewed guess cannot appear in the UI.
- **Verified 2026-09-16:** `censusindia.gov.in` and `nppa.gov.in` both serve an incomplete TLS
  chain and cannot be fetched with verification on. Do not work around this with `-k`.

## Frontend notes (Milestone 8)

- `frontend/`: Vite 8 + React 19 + TypeScript 6, Tailwind 4 (CSS-first `@theme`, no JS config),
  Leaflet + react-leaflet 5 + react-leaflet-cluster, TanStack Query for server state, Zustand
  for view state, Vitest + Testing Library. Lint is `oxlint` (Vite template default).
- **Split of concerns: TanStack Query owns server data, Zustand owns view state.** Playback
  advances the day in the store many times a second and must never trigger a request; the
  timeline arrives once from `/simulate`.
- **Pure map logic lives in `components/map/mapLogic.ts`** so filtering, distance ranking and
  transfer lines are testable without mounting Leaflet. Put new map behaviour there.
- **Markers encode two channels**: shape = facility type, colour = stock status, plus a glyph.
  Do not collapse to colour alone — it has to stay readable without colour vision.
- **Tile URL and API base URL are env vars** (`frontend/.env.example`). OSM attribution is
  always rendered; the tile provider is swappable without a code change.
- `MissingInputsNotice` is a **designed state, not an error screen**: when `/simulate` returns
  422 the map still shows real facilities and the panel explains which requests are outstanding.
- Watch for `?? []` in render paths — it allocates a new array each render and silently breaks
  memoisation. Use the module-level `NO_FACILITIES` / `NO_MEDICINES` constants.
- Verified in a real browser against the live backend: tiles, boundary, clustering, legend,
  medicine list and the 422 state all render, with no console errors beyond the expected 422.

## Design system (added in Milestone 9)

- **`frontend/src/ui/index.tsx` is the only place visual styling is defined.** Card, CardTitle,
  Button, Field, TextInput, Select, Checkbox, StatTile, StatusPill, EmptyState, Table/Th/Td.
  Build new UI from these; do not hand-roll a styled `div`.
- Tokens live in `@theme` in `src/index.css`: brand colours plus `ink` / `surface` /
  `hairline` tints and two shadow levels. **Separation is elevation and spacing, not a border on
  every edge** — borders everywhere was what made the first pass read as a wireframe.
- Inter, with `.tabular` for any number that changes during playback so columns do not reflow.
- **Native form controls were the loudest unpolished element.** The range track and thumb are
  restyled in CSS; the medicine picker is a `role="listbox"` of buttons, not a `<select
  size=6>`, which cannot be styled.
- `shortMedicineName` in `api/format.ts` trims the indent's compositional prose for display
  only. The full name stays in the data and on hover — never shorten the stored value.
- Recharts is **lazily loaded**: the two chart pages are `React.lazy` routes so the map, the
  page a judge lands on, does not pay for it.

## "Dispensary" redesign (complete, 2026-10-04 to 2026-10-05)

- Spec: the "Restyle Zealo: the dispensary redesign" brief (scrub green on off-white, register
  tables, blister-pack logo). Visual and copy only: no change to simulation, API behaviour,
  pipeline, provenance logic or URLs, except as the brief allows. Worked in 7 milestones; the
  user commits after each.
- **Decided with the user:** the disclaimer stays **verbatim** (hard rule 5) in the new slim
  `DisclaimerStrip`, on every page including Home; fonts load from **Google Fonts** in
  `index.html` (no npm dependency); the Facility chart's reorder-point and projected-stock lines
  come from a **small read-only API addition** (milestone 3); the **guided story is kept** and
  stays prominent (the brief wanted it reduced to a link).
- Tokens live in `@theme` in `src/index.css` (Tailwind 4 has no `tailwind.config`). The old
  palette names (`purple`, `coral`, `navy`, `lavender`, `ink-muted`, `ink-subtle`,
  `surface-sunken`, `hairline`, `status-*`) were aliases during the redesign and are **gone**: a
  class using them now silently renders no colour. Every text/background pair in use has been
  checked at 4.5:1 or better (lowest: muted on wash, 5.90).
- Components stay in `src/ui/` (the brief says `src/components/ui/`; kept for consistency).
  Button looks are in `ui/buttonStyles.ts` (`buttonClass` for links styled as buttons) so
  `ui/index.tsx` exports only components.
- `StatusPill` takes an optional `label`: a medicine's amber means under a week of cover **or**
  stock within 90 days of expiry, so only a caller that knows which can say "Under a week".
- Gotcha: `hidden sm:inline-flex` on an element whose class also contains `inline-flex` stays
  visible on phones. Wrap it in `<span className="hidden sm:contents">` instead.
- **Map (milestone 2):** pins are built by the pure `pinHtml` in `components/map/icons.ts`
  (shape = type, fill + glyph = stock; `none` = doesn't carry the selected medicine). Stock
  words come from `api/stock.ts` (`stockState`: out / under a week / ok / spare, cover counts
  deliveries due this week); use it, not the backend's amber, wherever "under a week" is said,
  because amber also means near expiry. Path colours are CSS classes (`zealo-transfer`,
  `zealo-manufacturer`, `zealo-boundary`), not hex in components. No marker clustering any more
  (clusters hid the statuses). Whole-run totals sit in the disclaimer strip via `RunTotals`.
  "Has spare" = over 30 days of stock (the Network rule): the medicine view has no reorder point,
  so no spare *quantity* is shown. `FacilityPanel` and `NetworkTotals` were removed; the old
  panel's beds / "should carry vs carries" content moves to the Facility page in milestone 3.

- **Facilities page (milestone 3):** ordering and the chart's labels are pure in
  `components/facility/shelfLogic.ts` ("problems first": out, under a week, near expiry, rest,
  survey-only last). "What Zealo is doing" is one rule, `components/panels/zealoAction.ts`, used by
  the map rail and the shelf table. The chart's policy lines come from the API: `on_the_way`
  (a recorded series: everything in transit, orders *and* transfers) and `reorder_point`
  (computed per day with the policy's own formula, `ceil(forecast x (lead time + safety days))`).
  Same-day transfers share one chart label. Recharts colours come from `ui/tokens.ts`, which reads
  the CSS variables (SVG attributes can't use `var()` reliably).
- A facility "carries" its modelled items **plus** its availability-only survey items. Counting
  only the modelled ones made a PHC look short of half its state list.
- Gotcha: a CSS grid with no column template sizes its implicit column to content, so a wide table
  pushes the page sideways on a phone. Use `grid-cols-1` (minmax(0, 1fr)) as the base.

- **Network (milestone 4):** the centrepiece is the shortage grid (`shortageGrid` in
  `networkLogic.ts`: medicines with a shortage first, then most spare); busiest routes come from
  the event log (`busiestRoutes`). Playback is a hook, `state/usePlayback.ts`, mounted by whichever
  control a page shows (the full bar or the Network page's compact "Replay").
- **Home (milestone 5):** the hero transfer is chosen in `components/home/heroTransfer.ts`: the
  first relief transfer into a PHC within two days of running out, judged from that PHC's own
  shelf that day. The card says "Sends N", not "Can spare N": no spare quantity is computed. The
  shelf matrix reads survey item numbers (`survey_sl_no`) and rounds % x 15. The guided story keeps
  a full section on Home (the user asked for it to stay prominent).
- **Data and methods, Settings, About (milestone 6):** survey groups get plain names in
  `PLAIN_GROUP` (the survey's own name stays on hover). "What this proof of concept can't tell you
  yet" is built from the data-status items and coverage statements. The Settings panel the brief
  called "Without Zealo" is "Facilities outside the network" (copy rule). About has no contact
  section: no contact details were given.
- Gotcha: a visually hidden (`sr-only`) element is absolutely positioned; inside a horizontally
  scrolling table with no positioned ancestor it escapes the scroller and widens the whole page.
  Give the cell `relative`.

## Determinism across processes (fixed 2026-10-04)

- **Never iterate a `set`/`frozenset` of ids in the simulation without `sorted()`.** Python
  randomises string hashing per process, so the order changes on every restart. Opening stock
  drew from the RNG in `frozenset` order, so the same seed gave a different run each time the API
  started (5 processes: 230–249 transfers). In-process tests could never see it.
  `tests/test_reproducibility.py` runs the simulation under two `PYTHONHASHSEED`s in subprocesses
  and must stay. The default run's figures changed when this was fixed: 99.03% in stock, 258
  transfers, 13,002 units moved, 13 expired; on their own 95.35%.

## "With Zealo" only (decided 2026-09-17)

- The UI shows the Zealo network only. The mode toggle and the Compare page are hidden behind
  `VITE_SHOW_WITHOUT_ZEALO` (`frontend/src/config.ts`, default off); `/compare` redirects to the
  map. **The backend still runs both modes** and every baseline test stays — hiding is UI-only,
  so the comparison can come back without code changes. Don't delete `ComparisonPage`.
- Copy must not refer to "both modes" or "without Zealo" outside flag-gated UI. **Exception
  (decided 2026-10-04):** the pitch page and the story may quote the baseline as "on their own"
  for contrast, always with "same facilities, demand and opening stock".

## Pitch page and story (2026-10-04)

- `/` is the pitch page (`pages/StoryPage.tsx`); the map is at **`/map`**. The map page is lazy
  and prefetched from `App.tsx`. Keep the pitch page free of Leaflet and Recharts.
- **Every story number is computed from the run** in `components/story/storyLogic.ts` (survey
  figures come from `/survey-summary`). Never type a result into copy: a new seed or setting
  must change the story with it. A chapter whose moment did not happen is omitted.
- Chapters are in day order. Each sets `day`, optional `playTo`, `highlight`, `zoom` and
  `movement` ("none" on the problem chapter, so the solution is not shown before it is told).
- The worked example prefers a day-1 move into a red facility ≥ 0.5 km away: several facilities
  share a site (< 100 m), and their markers overlap.
- During the story the map is unclustered, full width, legend hidden; the card is a left panel
  (a bottom card cost a zoom level), and `FocusOn` pads for it. The approval limit applies to
  **manufacturer orders**, not transfers — the copy says so; keep it that way.

## Network page and per-day queries (2026-09-17)

- **Per-day queries use `keepWhileOnlyDayChanges`** (`api/placeholder.ts`): the previous day's
  data stays on screen while the next day loads, but only if nothing else in the key changed.
  Without it the Network page blanked 12 times in 4 s of playback. Use it for any new query keyed
  on `day`.
- The Network page's movement figures (transfers, units, km, expired, chart, top medicines) come
  from `run.events` via `components/network/networkLogic.ts`, the same log the map's feed uses, so
  they count **up to the selected day** and cost no request. Only surplus/shortage positions are
  fetched. `/runs/{id}/redistribution` totals also count up to `day` (tested equal to the run
  metrics on the last day); `transfers_over_time` stays a whole-run series.
- "Short" on the Network page = the map's low-cover rule (cover incl. deliveries due in 7 days),
  via `SHORT_DAYS = LOW_COVER_DAYS`, so the two views cannot disagree.
- Recharts animations are off on pages that update during playback.
- The map's totals card is whole-run and says so ("Whole run").
- The uvicorn started for browser checks has no `--reload`: restart it after backend changes, or
  the frontend reads the old response shape (a missing `name` crashed the page once).

## Proof-of-concept subset (decided 2026-09-17)

- The site shows **15 of 77** facilities: all 9 state facilities with a medicine list + the nearest
  private facility to each PHC and the district hospital. Rule in `select_poc`; selection in
  `data/manual/poc_facilities.csv` (generated once, then the team's to edit, never overwritten).
- `data/processed/facilities.csv` holds only the 15, labelled within the subset (PHC 1-5,
  Private Hospital 1-4, Clinic 1-2...). `facility_universe.csv` holds all 77 (no names/coords).
- **Demand shares divide by holders in the universe, not the POC**, or each POC facility would get
  several times its real demand. Tested.
- `data/references.csv` is the complete reference list (26 rows, incl. blocked/rejected sources);
  `test_references.py` fails if a registry source is missing from it.

## Interim data rules (decided by the team, 2026-09-16)

- **Never block on missing data.** Each gap has an interim approach, tagged `estimated`, listed
  in `data/DATA_TODO.md` and the site's Data status panel. Interim rules must never produce fake
  facilities, locations, prices or survey values.
- **User entries in `data/manual/` are never overwritten.** Every pipeline step that rewrites a
  manual file reads the existing entries first. Keep it that way.
- **Manual sheets are keyed on stable ids**, not labels: `facility_key` (sorted OSM ids) for
  facilities, `survey_sl_no` for matches. `internal_id` changes when a type is corrected.
- Population: Census 2011, machine-verified snapshots, ratio checks fail loudly.
- `data/raw/private_share/nss75_health_in_india_report_586.pdf` is 68.8 MB and gitignored; no
  step reads it. Don't commit it.
- Figure 1: PHC 1 = 45.45, PHC 4 = 94.17, other 13 = 74.8754 until transcribed and validated.
- Unmatched survey items: availability only (PHCs, from the matrix), no quantities.
- `government_level_unknown` → PHC list, in network; `other_government` (Railway) → no list, out
  of network; pharmacies out of network by default.
- Demand: equal shares between government holders (attendance-weighted once every holder has
  OPD). **Private facilities carry 3.656x government demand** — NSS 75th round Karnataka,
  Table A8, weighted by Gadag's urban/rural mix; verified against the PDF by step 06. A Settings
  value overrides it (`private_share_basis: user_setting`). It replaced an unsourced 25%.
- **Units only.** Hide value metrics entirely. The auto-approval limit is in units while no
  prices exist, or it could never trigger.

## Simulation policy notes (found on real data)

- Minimum transfer 5 units; donors keep their reorder point; near-expiry rebalancing only within
  90 days, at-risk computed FEFO. Without these the first real run made 58,273 transfers, 64% of
  them ≤ 2 units, with stock ping-ponging. There are tests for each.
- Opening stock uses ceil, not round, or survey-in-stock items open empty.
- **Map status is share-based** (team decision 2026-09-17, replacing the spec's "red if any
  medicine is out", which made nearly every facility red): red < 80% in stock (WHO/HAI
  benchmark, cited in the survey), amber < 95% or >10% of medicines under 7 days' cover or >25%
  near expiry, green otherwise. **Cover includes deliveries due within 7 days** — shelf-only cover
  flagged ~90% of facility-days amber in both modes. Same rule in both modes; thresholds fixed
  before measuring. Don't tune them to the output.

## Frontend notes (interim data)

- Header has a quiet **Data status** link → `DataStatusPanel`, fed by `GET /data-status`
  (same `data_status.collect()` as `make data-check`). No warning banners on the map.
- Map draws at most 25 transfer routes and 12 express arrows per day, aggregated by route /
  facility; the rest are counted on the movement chip. Per-order lines caused 780 duplicate-key
  errors and an unreadable day 1.
- Event feed groups routine manufacturer orders per facility per day and lists transfers,
  stockouts and express orders first.
- `KeepSizeInSync` calls `invalidateSize` via ResizeObserver: the grid settles after Leaflet
  mounts, which left the tiles filling only part of the map.
- Scenario settings live in `state/scenario.ts`; share links encode them as base64url JSON in
  `?scenario=`. Settings edits are a draft until "Run simulation".

## Deployment (2026-10-19)

- `render.yaml` at the repo root: `zealo-api` (free Python web service) and `zealo-map` (free static
  site). Site: https://zealo-map.onrender.com.
- The API must be installed **editable** (`pip install -e ./backend`): `zealo.config` locates
  `data/` relative to the source tree, which a normal install would move into site-packages.
- `ZEALO_ALLOWED_ORIGINS` is a **JSON list**, not comma-separated: pydantic-settings parses list
  settings as JSON. `ZEALO_RUN_CACHE_SIZE=3` (a run peaks ~140 MB; free plan is 512 MB).
- The free API sleeps after 15 idle minutes; waking takes up to a minute and loses the run cache.
  `api/retry.ts` retries unreachable-server failures for ~75 s. Use it for any new query.
- `/simulate` is ~15 MB of JSON; Render's edge compresses it to ~0.8 MB (brotli). The body is
  serialised once per run and stored on `CachedRun.response_json`; a per-run lock stops duplicate
  computation. `ZEALO_WARM_DEFAULT_RUN` (on in production) precomputes the default run, and a test
  pins that the frontend's default request has the same `run_id` as `ScenarioRequest()`.
- Render's free CPU is roughly 10x slower than a laptop: anything that costs 0.1 s locally costs
  about a second there. Profile locally, then multiply.
- **Story pacing:** forward navigation is locked until the camera lands (`CAMERA_FLIGHT_MS` in
  `ui/motion.ts`, shared with `FocusOn`) and any playback reaches its last day.
- **Map icons are cached** (`facilityIcon`, `arrowIcon`). Never build a new `L.divIcon` per render:
  react-leaflet calls `setIcon` whenever the icon object changes, which replaces the marker element.

## Open questions

- R1, R4, R7, R8 still being filled by the team; see `data/DATA_TODO.md`.
- `starlette.testclient` warns that `httpx` is deprecated in favour of `httpx2`. Harmless now.

## Milestone status

| # | Milestone | Status |
|---|---|---|
| 1 | Plan and scaffold | **done** |
| 2 | Survey data | **done — matrix built; Figure 1 interim until transcribed** |
| 3 | Medicine master list | **done — 51 matches await your confirmation (R7)** |
| 4 | Facilities | **done — interim types; verification and PHC locations ongoing** |
| 5 | Demand and starting inventory | **done — real population, interim split** |
| 6 | Simulation core | **done — engine, both policies, metrics, 36 tests** |
| 7 | API | **done — runs end to end; + /data-status, /survey-summary** |
| 8 | Inventory map | **done — end to end on real + interim data** |
| 9 | Facility dashboard + redistribution view | **done — plus a design-system pass** |
| 10 | Comparison, Settings, Data Sources, About | **done — Compare hidden by default (flag)** |
| 11 | Deployment | **done — Render free tier via `render.yaml`** |
| 12 | Polish | not started |

## Working style

- Ask before major architectural changes or significant new dependencies.
- Keep `data/raw/` untouched; all transformations are re-runnable scripts.
- Keep this file and `CHANGES.md` updated.
- **Do not commit.** Summarise the change and let the user commit.
- If a source is unavailable, a number can't be verified, or a requirement seems unrealistic:
  flag it and ask. Do not work around it.
