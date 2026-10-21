# Changes

A running log of what changed, milestone by milestone. Newest first.

---

## Faster loading, a paced story, smoother map — 2026-10-19

- **Story pacing:** "Next" (and the arrow / clicker keys, and the chapter dots ahead) stay
  disabled until the chapter's camera flight has landed and its playback has reached its last
  day. A bar fills along the button while it waits. Timing is one pure function,
  `chapterAnimationMs` in `storyLogic.ts`. Back and Exit are never held.
- **Faster data:**
  - `/simulate` builds its ~15 MB JSON once per run and serves the stored bytes after that.
    A repeat request went from 0.7 s to 0.004 s locally (about 7 s on Render's free CPU). The
    response is byte-for-byte the same JSON as before (checked against the live API).
  - Concurrent requests for the same run wait for one computation instead of each running it.
  - `ZEALO_WARM_DEFAULT_RUN=true` (on in `render.yaml`) computes the default run at startup in
    a background thread.
  - The frontend starts the default run without waiting for the facility list first.
  - Fixed: `ZEALO_RUN_CACHE_SIZE` was never read (the cache was always 8 runs).
- **Smoother map:** pin and arrow icons are cached, so Leaflet no longer rebuilds every marker on
  every day of playback; routes, arrows and pin changes fade in; tiles load at the end of a camera
  flight instead of at every zoom step (`updateWhenZooming={false}`). All motion still respects
  reduced-motion.

---

## Deployment on Render (free tier) — 2026-10-19

**Status:** live at https://zealo-map.onrender.com (API: https://zealo-api.onrender.com).

- `render.yaml` Blueprint: the API as a free Python web service (editable install, so `zealo.config`
  still finds `data/`; `ZEALO_RUN_CACHE_SIZE=3` to fit 512 MB), the site as a free static site with
  an SPA rewrite.
- Checked live in headless Chrome: home page data, `/map` loaded directly, and the full story to
  day 180, with no console or network errors.
- **Cold starts:** the free API sleeps after 15 idle minutes and takes up to a minute to wake. The
  frontend now retries unreachable-server failures (network error, 502/503/504) for about 75 s
  (`api/retry.ts`) instead of once; deliberate API answers (422, 404) are still not retried.
- Fixed the build: the hidden map checkboxes left two unused variables, which failed `tsc -b`.

---

## Dispensary redesign, milestones 4–7: Network, Home, Data and methods, polish — 2026-10-05

**Status:** complete. Nothing committed. Built in one pass at the user's request ("complete all at
once").

### Network page (milestone 4)
- **Header:** the title and description, plus a compact day control with "Replay". Playback moved
  into a shared hook (`state/usePlayback.ts`) so it doesn't depend on the full playback bar.
- **Stat row:** transfers, units moved, kilometres, units lost to expiry, shelves under a week
  today, and shelves with over a month spare. All count up to the day shown.
- **"Who is short and who has spare, today":** a grid with one row per medicine and one column per
  network facility.
  - Cell states: − under a week, plain for normal, + over a month spare, dashed outline for doesn't
    carry it.
  - Rows are ordered with shortages first. 12 show, with "Show all".
  - Every cell is focusable and has a description, e.g. "Clinic 2: 0 units on the shelf and 120 due
    this week, 21 days of stock".
- **Two panels:**
  - "Units moved so far": a single line, labelled with its total, and an "Opening rebalance"
    note when most units moved on day 1.
  - "Busiest routes", from the event log.
- **Unmapped PHCs:** the surveyed PHCs with no location, as dashed chips.

### Home (milestone 5)
- **Hero:**
  - The new headline and copy, with "Open the Gadag map" and "Watch the story" (the story stays
    prominent, as asked) and a "See how a transfer works" link.
  - A still map showing one real transfer, chosen from the run: the first relief transfer into a
    PHC within two days of running out. Today that's Glimepiride 1mg tablet: PHC 5 out of stock,
    PHC 1 16.2 km away sends 302, arriving day 2.
  - The card shows the medicine and its code, both facilities, and the arrival day.
- **"Gadag already shows the problem.":**
  - The survey paragraph and a range strip (PHC 1 45.45%, average 74.2%, PHC 4 94.17%), with the
    49-point gap computed.
  - A shelf matrix of nine named items (15, 15, 14, 13, 9, 7, 5, 2 and 0 of 15), read from survey
    item numbers.
- **"What happens when stock runs low":** the three numbered steps.
- **Then:** the guided story's chapter list, the green results band (99.0% of medicine-days in
  stock, 258 transfers, 13,002 units moved, 13 lost to expiry, all from the run).

### Data and methods, Settings, About (milestone 6)
- **Data and methods:** the lead, then "Three kinds of number" and the survey panel. The panel has
  its stat row on a heavy rule, "On the shelf at no PHC", and a bar chart of the 15 medicine groups
  under plain names, sorted, with a reference line at the taluk average. Then the formulas (kept),
  a register table of sources, and "What this proof of concept can't tell you yet", built from the
  data-status items and coverage statements.
- **Settings:**
  - Panels: Facility rules, Supply, Facilities outside the network (the brief said "Without
    Zealo"; renamed to follow the copy rule), Zealo network, and Run, each with helper text.
  - A sticky bar with Run simulation, Reset to default and Copy share link, plus a status line
    ("Simulation ran with these settings.").
- **About:** reading layout covering what Zealo is, what the demo shows and doesn't, and who built
  it. No contact section, because no contact details were given.

### Polish (milestone 7)
- **Old styles removed:** the remaining legacy classes, ALL-CAPS labels, middle-dot separators and
  9–11 px text are gone from the data-status drawer, the missing-inputs notice and the flag-gated
  Compare page. The temporary palette aliases are deleted from `index.css`.
- **Contrast:** every text/background pair in use measures 4.5:1 or better (lowest: muted text on
  the wash strip, 5.90).
- **390 px, all eight pages:** no sideways scroll, and no button, link or input without an
  accessible name.
- **Fixed:** the Network grid's screen-reader text escaped its scroller and made the page 1,168 px
  wide. The hero map's credit floated above where the playback bar would be.
- **Reduced motion** switches off the transfer animation, the story card entrance, the loading
  shimmer, map fly-to and story playback.

### Checked
- 1440 px and 390 px. No console errors.
- Backend 250 tests, ruff clean. Frontend 127 tests (+9), lint and typecheck clean. Main bundle
  449 kB (Home now includes the map).

---

## Dispensary redesign, milestone 3 of 7: Facilities page — 2026-10-05

**Status:** complete. Nothing committed.

### API (read-only additions, as agreed)
- The medicine series behind the chart now carries two more lines:
  - `on_the_way`: units still in transit each day, both orders and transfers. It's a new series
    the engine records after each day's decisions, and it changes no decisions.
  - `reorder_point`: computed per day with the policy's own formula,
    `ceil(forecast × (lead time + safety days))`.
- Tested: both cover every day, the reorder point matches the formula, and everything on the way
  is at least what's due this week.

### Facilities page
- **Identity:**
  - A facility picker, the name as a 52 px title, then type, ownership, survey stock pattern
    (illustrative), location ("Not yet checked"), beds, and the state medicine list. Each fact
    has its provenance badge.
  - The level-unconfirmed and private-proxy notes appear where they apply.
  - The network checkbox sits in its own panel and explains that turning it off re-runs the
    simulation.
- **Stat row:** medicines carried, a week of stock or more, under a week, out of stock.
- **"Shelf on day N":**
  - Group and Status filters, with Status defaulting to Problems first.
  - Register table: medicine name with its printed code, units with "+N due", days left, next
    expiry (bold when within 90 days), status chip, and what Zealo is doing (transfers in bold
    blue).
  - Out-of-stock rows are tinted. Survey-only items show "—" and "Survey item, no quantity data".
  - The first 10 rows show, with "Show all".
- **Chart:**
  - Three lines: units on the shelf, shelf plus deliveries on the way, and the reorder point.
  - Also: a "Today" line, labels on the largest transfer steps, a legend, a tooltip with the
    day's events, and a summary sentence for screen readers.
  - It opens on the first problem item until you pick one.
- **Activity at {facility}:** the event feed, newest first.
- **Approval queue:** Approve / Reject kept unchanged; it explains how to turn approvals on.
- Expiry alerts are folded into the table: near-expiry rows, their status, and a filter.

### Fixed while checking
- **"Stocks 47 of the 98" was wrong:** that PHC carries all 98, with 51 of them as survey items
  without quantities. The old map panel had the same miscount. It now reads "Carries 98 of 98".
- **Overlapping chart labels:** three transfers landing the same day printed on top of each
  other. They now share one label ("+56 from 3 facilities") with a white halo, placed to the
  right near the start of the run.
- **"+133 due" wrapped** onto three lines; it now stays on one.
- **Sideways scrolling on phones:** the table pushed the page wide; it now scrolls inside its
  card.

### Checked
- 1440 px and 390 px. No console errors.
- Backend 250 tests (+1), ruff clean. Frontend 118 tests (+10), lint and typecheck clean.

---

## Dispensary redesign, milestone 2 of 7: Map page, plus a reproducibility fix — 2026-10-04

**Status:** complete. Nothing committed.

### Bug fixed: the simulation was not reproducible across restarts
- **Found** while adding the map's medicine field: an API test passed or failed from one run to
  the next. With the same seed, five separate processes produced 230, 244, 249, 247 and 242
  transfers.
- **Cause:** opening stock for non-PHC facilities draws from the random number generator once
  per medicine, looping over a `frozenset` of medicine codes. Python's set order depends on a
  per-process hash seed, so each API restart handed the random draws to medicines in a different
  order.
- **Fix:** sorted iteration in `runner.py`, `engine.py` and `policies.py`. The engine and policy
  loops didn't change results, but they did change the order of the event log.
- **Guarded by** `test_reproducibility.py`. It runs the simulation under two different hash seeds
  in subprocesses and compares the metrics and the event log. It fails without the fix.
- **The default run's figures changed.** They are now stable: 99.03% of medicine-days in stock,
  258 transfers, 13,002 units moved, 13 expired; 95.35% on their own; 10 of 15 facilities red
  on day 1. Earlier figures (99.1%, 274 transfers, "9 of 15") came from whatever hash seed the
  server started with. The pitch page and story compute from the run, so they updated themselves.
- The old flaky test had a second, latent weakness: the API rounds forecasts to 3 decimals, which
  distorts cover badly for slow-moving medicines. It now checks against the exact range the
  rounding allows.

### API
- Each medicine row (`/runs/{id}/medicines/{mid}`) now includes `incoming_7d`, the deliveries due
  this week, so the map's "under a week" counts incoming stock the way the facility colours do.
  Tested against the facility endpoint.

### Map page
- **Layout:** left rail 330 px, the map, right rail 370 px. Below 1280 px they stack, and the map
  stays at least 420 px tall. The whole-run totals sit inline in the disclaimer strip.
- **Pins:**
  - Shape shows the facility type: hospitals are rounded squares, PHCs and CHCs diamonds,
    clinics circles, pharmacies small circles, and other government facilities dashed squares.
  - Fill and a glyph both show stock: green; amber with a dot (under a week); red with a bar
    (out); stone grey when the facility doesn't carry the selected medicine. Every pin has a
    white outline.
  - The selected facility gets a ring.
  - Up to six name labels appear: the selected facility, the ends of the busiest routes, and
    facilities out of stock. Everything else is named on hover.
  - Clustering is gone, because it hid statuses.
  - The base map tiles are muted.
- **Movement:** blue animated dashed transfers with arrowheads. Express orders come in from the
  nearest map edge as thin dashed lines, with a "Manufacturer A" chip. Animation is off under
  reduced motion.
- **Legend:** three groups (stock, facility type, movement). The stock group switches to "Stock
  of {medicine}" with a "Doesn't carry it" row when a medicine is selected. It's collapsed by
  default below 1600 px so it doesn't cover the map.
- **Left rail:**
  - "Find a medicine" search. Picking one gives the summary sentence "Carried by N… N have stock
    on day D", then the five nearest facilities with stock (distance, days of stock, a chip),
    with an optional radius.
  - "Show on the map" checkboxes, with "Checked locations only" replacing "Verified only", and
    "Reset the map".
  - Coverage notes from the data.
- **Right rail:**
  - The selected facility: name, type, network membership and badge, the warning chips, a shelf
    bar with "N carried. N in stock, N under a week, N out."
  - "Needs attention": days left, plus what Zealo is doing. That's a transfer (they arrive the
    next day), an express order, deliveries due, or "No delivery due this week".
  - A link to the full inventory.
  - "Day N in the network": that day's counts and the event feed in plain sentences.
- **Playback bar:** play with an icon, previous/next, the day label, the slider, and speeds of
  1×, 4× and 20×. It floats over the map. The slider is named "Simulation day", and screen
  readers hear "Day 4 of 180" as its value.
- **Story:** restyled to match. Sentence-case kickers, bordered panel, 44 px chapter targets, and
  a register-style scoreboard. Started from "Watch the story" beside the zoom buttons.

### Couldn't match exactly
- "Can spare N" became "Has spare" (over a month of stock), because the medicine view has no
  reorder point to compute a quantity from.
- "Reset" left the floating playback bar on the map, so the bar fits on one line. It's in the
  left rail instead.

### Checked
- 1440 px with a facility and a medicine selected, and the story; 390 px for stacking and
  horizontal overflow. No console errors.
- Backend 249 tests (+2), ruff clean. Frontend 108 tests (+18), lint and typecheck clean.

---

## Dispensary redesign, milestone 1 of 7: foundations — 2026-10-04

**Status:** complete. Nothing committed. The pages' own layouts are restyled in milestones 2–7.

### Decided with the user before starting
- The disclaimer stays verbatim, in the new slim strip on every page, including Home.
- Fonts load from Google Fonts, so there's no new dependency.
- The Facility chart's reorder-point and projected-stock lines will come from a small read-only
  API addition (milestone 3).
- The guided story stays, and stays prominent.

### Changed
- **Palette and type:**
  - The design tokens are in `@theme` (`index.css`): ink, muted, paper, wash, line, scrub, move,
    low and out, each with its tints.
  - The type is Atkinson Hyperlegible, with IBM Plex Mono for printed codes (`.code`).
  - One focus ring: 3 px blue on `:focus-visible`.
  - Panels have a border and no shadow.
- **Logo and favicon:** a blister pack with one empty slot replaces the gradient "Z" tile and
  Vite's default favicon.
- **Header:**
  - Plain-text nav: How it works, Map, Facilities, Network, Data and methods, About. The active
    link is bold green with a 3 px bar, and carries `aria-current`.
  - Right of the nav: "Data status" as a quiet link with a status dot, then "Open the Gadag map"
    on Home or "Simulation settings" elsewhere.
  - Under 1024 px a "Menu" button replaces the nav.
- **Disclaimer strip:** the verbatim text on a pale green strip with a "How this was built" link.
  It replaces the grey line under the header.
- **Components:**
  - Buttons come in primary, secondary, quiet, ghost, danger and inverse, all at least 44 px
    tall.
  - Chips always carry words.
  - Provenance badges: Real is solid green, Derived has a blue border, Estimated a dashed one.
  - New: `Stat` / `StatRow` (number above label).
  - Tables have a register header (a 2 px ink rule) and 15 px rows.
  - Sentence-case field labels; 44 px inputs, selects and checkboxes.
- The old palette names temporarily point at the new colours, so every page still renders until
  it's redone.

### Checked
- Every page at 1440 px; the header and menu at 390 px.
- Fixed: at 390 px the header's main button showed and "Data status" wrapped onto three lines.
- No console errors. Frontend tests 90, lint and typecheck clean.

---

## Pitch page and guided story — 2026-10-04

**Status:** complete. Nothing committed.

A demo for presenting Zealo to hospitals: a pitch page and a chaptered story played on the live
map. Every number either comes from the published survey (badged Real) or is computed from the
run the page is showing (badged Estimated). None is typed in by hand.

### Decided with the user
- The story **may quote the "on their own" baseline** as contrast (same facilities, demand and
  opening stock, each managing stock alone). The mode toggle and Compare page stay hidden.
- Format: a pitch landing page plus a guided tour on the map.

### Pitch page (`/`, `pages/StoryPage.tsx`)
- Hero: "The medicine a patient needs is often a few kilometres away", with the headline result
  (80% fewer stockout days: 1,249 against 6,275).
- The problem in real survey figures: 74.2% availability across 15 PHCs, 45.5% at the worst,
  2 of 104 medicines missing everywhere, drawn against the 80% WHO/HAI benchmark.
- How Zealo works (3 steps), the simulated results (stockout days −80%, units not supplied −83%,
  no red facility by day 6 against day 22, 99.1% against 95.3% in stock), the chapter list, the
  data sources, and the team.
- The map moved to **`/map`**. `/compare` and the Settings share link point there now.

### Guided story on the map (`components/story/`)
- `storyLogic.ts` builds the facts and chapters from the run. A chapter whose moment didn't
  happen in the run is left out. There is no expiry chapter because the default run has no
  near-expiry moves and no expiries.
- 7 chapters in day order: the problem (9 of 15 red) → the medicine is nearby (PHC 2 →
  Clinic 2, 0.7 km) → 241 transfers on day 1 → an express order only when no neighbour can help
  → plays days 1–6 until no facility is red → day 180 results → what a hospital gets.
- Each chapter sets the day, spotlights and zooms to its facilities, and chooses which movements
  are drawn. The problem chapter draws none, so the solution doesn't show before it's told.
- A live scoreboard compares "With Zealo" and "On their own" on the day shown.
- Arrow keys and presentation clickers (Page Up / Page Down) step through; Esc exits. A
  "Play the story" button on the map starts it too.

### Found while checking in the browser
- The shortest day-1 move was between two facilities **0.1 km apart** (the same site), whose
  markers overlap. The example now prefers a move into a red facility at least 0.5 km away.
- On chapter 1, clustering folded the spotlit red facilities into numbered clusters. Clustering
  is off during the story.
- A bottom-centre card cost the map a whole zoom level, because the taluk is taller than it is
  wide. The card became a left side panel.
- The express chapter (day 1) originally came after the day 1–6 replay. It was moved so the
  story runs in day order.

### Also
- Header: gradient mark, "Shared medicine inventory" tagline, logo links home.
- `Button` gains `size="lg"` and an `inverse` variant. `ui/motion.ts` holds the reduced-motion
  check, and every script animation (camera, counters, story playback) honours it.
- The map page is lazy-loaded and prefetched from the pitch page. The main bundle went from
  491.6 kB to 297.8 kB, and the >500 kB warning is gone.
- Tests: frontend 90 (+18).

---

## "With Zealo" only, a steady Network page, README — 2026-09-17

**Status:** complete. Nothing committed.

### Baseline hidden
- The "Without Zealo" toggle and the Compare page are hidden. `/compare` redirects to the map.
- Hidden, not removed: `VITE_SHOW_WITHOUT_ZEALO=true` brings both back. The backend still
  simulates both modes on identical demand, and every baseline test still runs.
- Copy that referred to "both modes" reworded: Settings header, the "review interval" label (now
  "outside the network", which is what it controls under Zealo), About, Data Sources.

### Network page: no reloading, and consistent with the map
- **Diagnosed in the browser:** every new day changed the query key, the data went `undefined`,
  and the whole page unmounted. 12 blank frames in 4 seconds of playback. Now 0.
- New `keepWhileOnlyDayChanges` placeholder keeps the previous day on screen while the next
  loads, only when nothing but the day changed. Applied to the Network, Facility and map
  medicine/facility queries. The Facility page had the same flicker.
- **Inconsistency fixed:** on day 13 the page showed the whole run's 272 transfers and full chart
  while the map showed day 13. Everything now counts up to the selected day: transfers, units,
  distance and expired units come from the run's event log (the map's source), so they move in
  step with playback without a request. The cumulative chart grows with the day.
- `/runs/{id}/redistribution` totals and top medicines now also count up to `day`.
- "Short" now counts deliveries due within the week, the same rule as the map colours.
  Previously a facility shown green could be listed as short while its refill was a day away.
- Table shows medicine names instead of indent codes, and "+N due" beside stock.
- The medicine filter lists only modelled medicines (availability-only items had empty tables).
- Chart animations off; fixed heights so cards don't jump.
- The map's totals card is now titled "Whole run", as it shows all 180 days.

### README
Rewritten. It still said "Milestone 1 of 12". Now covers: what each page shows, map colours, how
the simulation works, the baseline flag, data honesty and where sources live, what is still
interim and which file fills it, local setup, env vars, data rebuild, tests, layout, credits.

### Tests
- Backend 247 (+2): redistribution totals count up to the day and match run metrics on the last
  day; shortage cover matches the facility endpoint including deliveries due.
- Frontend 72 (+9): `networkActivity` (counts through day, ignores manufacturer orders, chart
  starts from zero, medicine ranking), `keepWhileOnlyDayChanges` (keeps on day change, drops on
  facility or run change).

### Worth knowing for the demo
Most redistribution happens on day 1: 237 of the 270 transfers in the default run, when
Zealo first sees stock across the network and closes the gaps the survey patterns leave. The
chart shows a step on day 1, then a slow climb. That is the model's behaviour, not a display
bug.

---

## References CSV, 15-facility proof of concept, share-based map colours — 2026-09-17

**Status:** complete. Nothing committed.

### `data/references.csv`
26 references from the start of the project: the 11 sources used (survey, indent, OSM facilities,
boundary and tiles, three population sources, NSS Karnataka table, WHO/HAI benchmark via the
survey), 4 consulted but not used (NSS summary and full report, PIB release, National Health
Accounts), 6 blocked (data.gov.in, karnataka.data.gov.in, censusindia.gov.in, NPPA, Jan Aushadhi,
PMBI), 2 pending manual (ABDM, HMIS), 1 rejected (census2011.co.in), Nominatim (authorised, unused),
and the CC BY 4.0 and ODbL licences. Columns: status, purpose, access method, licence, retrieval
date, raw file, verification, notes. `test_references.py` keeps it in step with the app.

### 15 facilities
Chosen by a documented rule, not by hand: all 9 state facilities with a medicine list, plus the
nearest private facility to each PHC and the district hospital (4 private hospitals, 2 clinics).
Written to `data/manual/poc_facilities.csv` once and never overwritten. **Each facility keeps the
demand it would have with all 77 present** — dividing taluk demand over 15 would have inflated
each clinic's demand about tenfold. Runs now take 2.5 s instead of 15 s.

### Map colours
- Replaced "red if any medicine is out" (red almost everywhere) with a share-based rule: red under
  80% in stock (WHO/HAI benchmark, confirmed in the survey PDF), amber under 95% or with low cover
  or much near-expiry stock, green otherwise. Thresholds fixed before measuring.
- **Found a measurement flaw:** cover counted shelf stock only, so the 21-day lead time kept ~90% of
  facility-days amber in both modes. Cover now includes deliveries due within the week — in the
  engine, the per-medicine status and a new `incoming_7d` field on facility rows.
- Legend, Data Sources and the facility dashboard updated; Compare page gains **"How often
  facilities are healthy"**.
- Also fixed on Compare: the availability axis read 102%, and closing stock (+55%) was coloured
  as an improvement although more stock is not better in itself.

### Result (15 facilities, 180 days)
| | Availability | Unmet units | Green / amber / red facility-days |
|---|---|---|---|
| Without Zealo | 95.4% | 89,744 | 74% / 19% / 7% |
| With Zealo | **99.0%** | **14,415** (−84%) | **94% / 5% / 1%** |

### Tests
Backend **245** (POC rule, file preservation, universe demand, colour thresholds, delivery-aware
cover, references), frontend **63**. Verified in the browser: 15 facilities, green markers, legend,
Compare colour bars.

---

## Research-based private demand; map status rule kept — 2026-09-17

**Status:** complete. Nothing committed.

### Decisions
- **Map status:** keep the specified rule (red if any carried medicine is out), knowing it makes
  most facilities red in both modes. Recorded in METHODS and CLAUDE.md.
- **Private demand:** replace my unsourced 25% placeholder with government-backed research.

### Private demand share = 3.656, from NSS 75th round
Source: *Key Indicators of Social Consumption in India: Health* (NSO, MoSPI, 2017–18), **Table A8,
Karnataka** — ailments treated on medical advice by provider. Government hospitals treat 29.0%
(rural) and 14.1% (urban); private hospitals and clinics 70.7% and 84.0%. Weighted by Gadag
taluk's 52.1% urban population (urban 191,375 + rural 175,883 = the verified total), private
facilities treat **3.656** ailments for each one treated in a government facility, so they carry
3.656 x government demand. Karnataka is far more private than India as a whole (all-India
government shares are 33% rural, 26% urban), which is why the state table was used.

- `data/manual/private_share.json`, `backend/zealo/pipeline/private_share.py`,
  `data/pipeline/06_private_share.py` (added to `make data`). **Every figure is checked against
  the Karnataka block of Table A8 in the saved PDF on each build**, and the population split
  against the verified taluk total.
- Runner uses it by default (`derived`); a Settings value overrides it (`estimated`, reported as
  `private_share_basis: user_setting`). API cap raised from 2 to 10.
- New source `nss75_health_karnataka`; Data Sources page explains the calculation; Settings shows
  the research value; Data status lists it (R9, complete).
- Found along the way: the census mirror's own prose says Gadag is "50% urban and 60% rural"
  (110%); its table is consistent, so the table's counts were used.
- The full NSS Report 586 (68.8 MB) is gitignored with its URL and SHA-256 recorded; only the
  5 MB Key Indicators report is used.

### Effect on the 180-day run
| | Private share | Availability | Unmet demand | Transfers |
|---|---|---|---|---|
| 25% placeholder | 0.25 | 92.0% → 95.9% | −85% | 1,136 |
| **NSS research** | **3.656** | **95.0% → 98.7%** | **−82%** | 1,482 |

### Tests
Backend **230** (12 new, including a mistyped figure being caught against the PDF), frontend **63**.
Verified live: Settings shows "research value (3.66)", Data Sources explains the formula.

---

## Data decisions applied, Milestones 5 and 10, end-to-end run — 2026-09-17

**Status:** the site runs end to end on real and clearly labelled interim data. Nothing committed.

### Data decisions (from the team, 2026-09-16)
- **Population (R5):** Census 2011 figures, each fetched and **machine-verified** against a saved
  snapshot in `data/raw/population/`; ratio checks (0.6011% of state, 34.50% of district) run on
  every build and fail loudly.
- **Figure 1 (R1):** interim rule — PHC 1 = 45.45, PHC 4 = 94.17, other 13 = 74.8754 — with the
  team's validation for a submitted transcription. The 15 × 104 matrix is now built (Ryser's
  construction, exact margins asserted; rounding surplus absorbed by estimated rows only).
- **Matches (R7):** review file sorted by essentiality then PHC-level availability, with
  `suggested` + `suggestion_confidence`, `accept` support, rules in the header, and suggestions
  frozen once decided. Unmatched items kept as availability-only.
- **Facilities (R8, R4):** `other_government` (Railway; no list, out of network) and
  `government_level_unknown` (PHC list); pharmacies out of network by default; `evidence` column;
  corrections applied automatically; `phc_locations.csv` with policy-compliant Nominatim
  geocoding; `facility_attendance.csv` upgrade path for the demand split.
- **Prices (R6):** units only; `prices.csv.template` switches value metrics on later.
- Drop-folder READMEs in `data/raw/ogd/`, `abdm/`, `hmis/`.

### Tooling
- `make data` rebuilds everything; `make data-check` reports status and regenerates
  `data/DATA_TODO.md`. New pipeline steps 04 (population) and 05 (PHC availability).
- `GET /data-status` and `GET /survey-summary`.

### Bugs found and fixed along the way
1. **Verification sheet keyed on `internal_id`**, which changes when a type is corrected — a
   correction would have orphaned the team's own entries. Re-keyed on stable OSM ids; tested.
2. **Unsafe "high confidence" match suggestions** — ointment suggested as solution, four glove
   sizes onto one row, folic acid onto iron+folic acid. Now needs a known form, a strict name
   score, no near-tie, and no shared suggestion. None qualifies as high.
3. **Transfer thrashing** on the first real run: 58,273 transfers, 64% of ≤ 2 units, stock
   ping-ponging. Fixed with a 5-unit minimum, donors keeping their reorder point, and a FEFO-correct
   90-day near-expiry rule → 1,123 transfers, median 7 units.
4. **"Near expiry" transfers 679 days before expiry** — minimum order lots outlasting slow items.
5. **In-stock items opening with zero units** (round vs ceil), which flattened the comparison.
6. **Approval limit could never trigger** without prices — now read in units.
7. **780 React duplicate-key errors** from per-order map arrows; **map tiles filling only part of
   the map** (Leaflet sized before the grid settled); **unreadable day 1** and a feed buried in
   routine orders. Routes/arrows aggregated and capped, feed grouped and prioritised.

### Milestone 10
Comparison (side-by-side metrics with % change and availability over time), Settings (every
scenario parameter, facility rules, network membership, reset, copy share link), Data Sources
(every source with licence and limits, survey findings marked real, labels explained, formulas,
the units-only and third-party-population statements, "53 of 104 survey items have quantity
estimates"), and About.

### Result on the real run (180 days, seed 42)
| | Availability | Stockout item-days | Unmet units | Expired units |
|---|---|---|---|---|
| Without Zealo | 92.0% | 57,646 | 136,493 | 89 |
| With Zealo | **96.0%** | **28,904** (−49.9%) | **21,449** (−84.3%) | **25** (−71.9%) |

### Tests
Backend **218**, frontend **61**, lint and typecheck clean. Verified in a browser across all
seven pages with zero console errors.

---

## Milestone 9 — Facility dashboard, network view, and a design-system pass — 2026-09-16

**Status:** complete. Both pages render; their simulated content needs R1 and R5. Nothing
committed.

### Backend
- The engine now records **next expiry day** per facility, medicine and day, replacing two
  `None` placeholders left in Milestone 7.
- `GET /runs/{id}/facilities/{fid}` gained **expiry alerts** bucketed at 30/60/90 days and an
  opt-in `?series=<medicine_id>` returning that medicine's whole history for the chart. It is
  opt-in because returning every series would dwarf the day view.
- New `GET /runs/{id}/redistribution` — transfers over time, medicines moved most, and
  surplus/shortage positions. Aggregated from the cached run, so changing day or medicine is
  free.
- **11 new API tests** (48 in that file; 192 backend total).

### Frontend
- `react-router` added; three routes behind a shared `AppShell` that owns the brand, navigation,
  mode toggle and the disclaimer — so a page added later cannot forget it.
- `useRun` turns the simulation into a **query keyed on the scenario**, so all three pages share
  one cached run instead of each firing its own. Network membership and approval decisions are
  part of that key, because changing either must produce a new run.
- **Facility dashboard** — sortable, filterable medicine table; a stock/demand/forecast chart;
  30/60/90-day expiry alerts; refill and transfer log; approval queue with approve/reject; a
  network-membership toggle.
- **Network redistribution view** — cumulative transfers, medicines moved most split by relief
  vs near-expiry rebalancing, and a surplus/shortage table.

### The design-system pass
Done now rather than at Milestone 12, because building two more pages in the old language and
retrofitting three later costs more than establishing the system once.

- `src/ui/index.tsx` — Card, Button, Field, TextInput, Select, Checkbox, StatTile, StatusPill,
  EmptyState, Table. All pages now build from these.
- Inter with tabular figures, so numbers do not reflow during playback.
- Tokens extended with `ink` / `surface` / `hairline` tints and two shadow levels. **Separation
  is now elevation and spacing rather than a border on every edge.**
- Restyled the range slider and replaced the `<select size=6>` medicine picker with a proper
  listbox — the two loudest unpolished elements.
- `shortMedicineName` trims the indent's compositional prose for display; the full name stays in
  the data and on hover.
- Recharts is lazily loaded, keeping it off the map page: 516 kB main chunk (157 kB gzipped),
  343 kB chart chunk loaded only on the two chart pages.

### Verified in the browser
Fixed two things found that way: the missing-inputs notice said "the map below" on pages with no
map, and it replaced the whole dashboard instead of sitting above a still-usable facility card.

**45 frontend tests, 192 backend tests, lint and typecheck clean.**

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
