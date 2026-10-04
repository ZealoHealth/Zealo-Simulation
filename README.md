# Zealo Map

A live medicine-inventory map for **Gadag taluk, Karnataka**, and a simulation of how
**Zealo** keeps medicines in stock. Zealo is a shared inventory layer: it refills facilities
**directly from manufacturers** and **moves stock between facilities in its network** before
it runs out or expires. The model has no warehouses and no distributors.

Built for an ideathon by **Shriyans Nayak and Sanjana Srinivas**. It is a proof of concept.

> **Disclaimer.** Facility locations and medicine lists come from public sources. Stock levels
> are estimates. PHC availability patterns come from a 2021–22 published survey and are assigned
> to map locations for illustration.

---

## What's in the app

| Page | What it shows |
|---|---|
| **Story** (`/`) | The pitch: the real problem from the Gadag PHC survey, how Zealo works, the simulated results against the same facilities on their own, and the chapters of the guided story. |
| **Map** (`/map`) | 15 real facilities, coloured by stock status, with day-by-day playback. You can search for a medicine to see which facilities hold it, nearest first. Transfers appear as lines between facilities. A feed lists stockouts, transfers and express orders. |
| **Facility** | One facility's full inventory: stock, days of cover, deliveries due, expiry alerts, a stock history chart and the approval queue. You can also take the facility in or out of the network here. |
| **Network** | What the network has moved up to the selected day (transfers, units, distance, the medicines moved most), and which facilities are short or have surplus that day. |
| **Settings** | Run length, lead times, facility rules, network membership and approval limits, plus a share link that reproduces the exact scenario. |
| **Data sources** | Every source, licence and method behind the numbers. |
| **About** | What Zealo is, and what this demo does and does not show. |

A quiet **Data status** link in the header lists the data that is still interim (see below).

### Presenting the demo

Open the Story page and press **Start the story**. It plays seven chapters on the live map:

1. The problem
2. The medicine is already nearby
3. Zealo connects facilities
4. An express order only when no neighbour can help
5. The map turns green
6. Six months later
7. What a hospital gets

Step through with the arrow keys or a presentation clicker (Page Up / Page Down), and press Esc
to leave. A scoreboard compares the Zealo network with the same facilities on their own, on the
day shown.

Every number in the story is computed from the run on screen, or taken from the published survey.
None is typed in, so changing a setting or the seed changes the story with it.

### Map colours

| Colour | Meaning |
|---|---|
| 🟢 Green | 95% or more of the facility's medicines in stock, with no warnings |
| 🟠 Amber | 80–95% in stock, or more than 10% of medicines under 7 days of cover, or more than 25% of stock within 90 days of expiry |
| 🔴 Red | Under 80% in stock, the WHO / Health Action International availability benchmark cited in the Gadag survey |

Days of cover counts deliveries already due within the week. The thresholds were fixed before
any run was measured.

---

## How the simulation works

- **Facilities:** 15 of the 77 health facilities mapped in Gadag taluk. That's every state
  facility with a medicine list (5 PHCs, the district hospital and 3 government hospitals of
  unconfirmed level), plus the private facility nearest each PHC and the district hospital.
  Each facility keeps the share of taluk demand it would have with all 77 present.
- **Medicines:** the survey's 104 essential medicines, matched to the Karnataka State Annual
  Indent 2025–26.
- **Demand:** statewide indent quantity × Gadag taluk's share of Karnataka's population
  (Census 2011, 0.601%). Government facilities share it equally. Private facilities carry
  3.66× government demand, a ratio from the NSS 75th round (Karnataka, Table A8) on where
  people are treated. Daily demand is drawn with a fixed seed, so every run is reproducible.
- **Opening stock:** the survey's per-PHC availability patterns decide which medicines start
  in stock.
- **What Zealo does each day, for every facility in the network:**
  1. **Covers shortages.** A facility about to run short gets stock from a nearby member with
     surplus. Only if no member can help does an express order go to a manufacturer (5-day
     lead time).
  2. **Rebalances near-expiry stock.** Stock within 90 days of expiry goes to a facility that
     will use it in time.
  3. **Refills from manufacturers** (21-day lead time) when stock plus orders falls below the
     reorder point.

  Every transfer is at least 5 units, and a donor never drops below its own reorder point.
- **Units only.** No verified public price list could be accessed, so no rupee values are shown.

The backend runs the simulation once per scenario. The browser then plays it back day by day
without further requests.

### Showing the "without Zealo" baseline

The app shows the Zealo network only. The backend still simulates a baseline on identical
demand and opening stock, where every facility manages stock alone. The Story page and the guided
story quote it as "on their own" for contrast. To bring back the mode toggle and the Compare
page, set this in `frontend/.env` and restart the dev server:

```bash
VITE_SHOW_WITHOUT_ZEALO=true
```

---

## Data, and how honest it is

- **Nothing is invented.** Every value is tagged **Real**, **Derived** or **Estimated**, and
  traces to a source or a documented formula.
- **Real facility names are never displayed.** Facilities appear as "PHC 3", "Clinic 1" and
  so on. There are no real manufacturer or brand names, and no dosing or clinical guidance.
- Sources that couldn't be accessed are recorded, not worked around. Examples are
  `data.gov.in` (disallowed by robots.txt) and `censusindia.gov.in` (broken TLS chain).

| Where | What |
|---|---|
| [`data/references.csv`](data/references.csv) | Every reference since the project started, including blocked, rejected and consulted-but-unused sources |
| [`data/SOURCES.md`](data/SOURCES.md) | Each source used: URL, licence, retrieval date, limitations |
| [`data/METHODS.md`](data/METHODS.md) | Every derived or estimated formula |
| [`data/DATA_TODO.md`](data/DATA_TODO.md) | What is still interim, and which file fills it |

### Still interim

The app never blocks on missing data. Each gap uses a labelled interim value that `make data`
replaces once the team fills in the file.

| Gap | Interim approach | File to fill |
|---|---|---|
| Per-PHC availability (survey Figure 1 is an image) | 2 published values, the other 13 set equal to keep the published mean | `data/manual/figure1_phc_availability.csv` |
| Medicine match confirmations | Unconfirmed items show availability only, with no quantities | `data/manual/indent_match_review.csv` |
| Facility verification | Unverified facilities carry a badge, and the map has a "Verified only" filter | `data/manual/facility_verification.csv` |
| PHC locations (10 of 15 are not in OpenStreetMap) | Listed as unmapped on the Network page | `data/manual/phc_locations.csv` |
| Outpatient attendance | Equal demand shares | `data/manual/facility_attendance.csv` |

Run `make data-check` for the current state.

---

## Run it locally

**Requirements:** Python 3.11, Node 20.19+ or 22.12+, `make`.

```bash
# Backend: http://localhost:8000 (API docs at /docs)
make install
make api

# Frontend: http://localhost:5173 (in a second terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

The processed datasets are committed, so the app runs without rebuilding any data.

### Frontend settings (`frontend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend URL |
| `VITE_TILE_URL` | OpenStreetMap standard tiles | Map tile provider; attribution is always shown |
| `VITE_SHOW_WITHOUT_ZEALO` | `false` | Show the baseline toggle and the Compare page |

### Rebuild the data

```bash
make data         # rebuild every dataset from data/raw/ and data/manual/
make data-check   # list what is missing, interim or invalid; regenerates data/DATA_TODO.md
```

`make data` never overwrites the team's entries in `data/manual/`, and never edits `data/raw/`.

### Tests and checks

```bash
make test && make lint                                         # backend: pytest, ruff
cd frontend && npm test && npm run lint && npm run typecheck   # frontend: vitest, oxlint, tsc
```

---

## Repository layout

```
backend/zealo/
  sim/         simulation engine, policies, forecasting, metrics
  api/         FastAPI routes and schemas
  pipeline/    extraction, matching and dataset building
  models/      provenance-tagged data models
backend/tests/ pytest
frontend/src/
  pages/       one file per page
  components/  map, panels, network view logic
  ui/          the design system (all visual styling lives here)
  state/       view state and scenario settings
data/
  raw/         untouched source files
  manual/      files the team fills in by hand
  pipeline/    numbered, re-runnable build scripts
  processed/   the datasets the app reads
```

[`CHANGES.md`](CHANGES.md) records what changed and why, newest first.

---

## Credits

- Tejesh S, Nagaveni SJ (2023). *An Assessment of the Availability of Essential Medicines in
  Gadag Taluk, Karnataka: A Study of Primary Health Centers.* Cureus 15(5): e39341.
  DOI [10.7759/cureus.39341](https://doi.org/10.7759/cureus.39341). Licensed **CC BY 4.0**.
- Karnataka State Medical Supplies Corporation Limited. *Annual Indent 2025-26* (890 drugs).
- National Statistical Office, MoSPI. *Key Indicators of Social Consumption in India: Health*,
  NSS 75th round (2017–18).
- Census 2011 population: Government of Karnataka; Gadag district administration
  (gadag.nic.in); Gadag taluk via censusindia2011.com, a third-party mirror of Census data.
- Map data and tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
  licensed under the ODbL.
