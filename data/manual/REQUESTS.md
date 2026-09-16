# Data I need from you

Files that cannot be collected automatically — either because the site forbids it, or because
the data only exists as an image. Drop each file in the path shown, then tell me it has landed.

**Nothing here will be invented or worked around.** Each blocked item stops the milestone that
needs it; the rest of the build continues around it.

---

## Blocking Milestone 2 (survey data)

### R1 — Figure 1 per-PHC availability  →  `data/manual/figure1_phc_availability.csv`

**Why manual:** Figure 1 on page 4 of the survey PDF is a raster image. I checked — the page
holds two images and no numeric text belonging to the chart, so there is nothing to extract.
Guessing values off the picture would be inventing data.

**What to do:** open `data/raw/gadag_phc_survey_cureus_e39341.pdf` at page 4 and read the 15 bar
values. A template is already written for you at that path.

**Cross-check (from the paper's own text):** PHC 4 must be `94.17`, PHC 1 must be `45.45`, and
the 15 values should average close to `74.20`. I will test all three and tell you if they
disagree.

---

## Blocking Milestone 4 (facilities)

### R2 — Open Government Data files  →  `data/raw/ogd/`

**Why manual:** both https://karnataka.data.gov.in and https://www.data.gov.in serve
`User-agent: * / Disallow: /`. Automated fetching is forbidden and this project will not do it.

**What to download** (CSV/XLSX, whatever the portal offers), filtered to **Gadag district**:
- taluk hospital list
- CHC (community health centre) list
- private hospital list

### R3 — ABDM Health Facility Registry export  →  `data/raw/abdm/`

**Why manual:** https://facility.abdm.gov.in/ is a JavaScript app with a dynamic search; it
serves no robots file and automation is neither clearly permitted nor practical.

**What to collect:** Gadag taluk facilities — name, facility type, ownership (government/
private), address, and coordinates if the portal shows them. A CSV or a screenshot-to-CSV
transcription both work.

---

## Blocking Milestone 5 (demand and starting inventory)

### R4 — HMIS Gadag taluk reports  →  `data/raw/hmis/`

**Why manual:** https://hmis.mohfw.gov.in is an interactive report builder behind an API, with
no robots file.

**What to pull:**
- OPD and IPD attendance for Gadag taluk facilities (latest full year available)
- the HMIS facility list for Gadag taluk, including the **15 PHCs** the survey covered

**If you cannot get this:** say so and I will use a documented facility-type weighting instead,
tagged `estimated` and labelled as such in the UI. I will not silently substitute it.

### R5 — Population figures  →  `data/manual/population.json`

**I tried to fetch this and could not.** `censusindia.gov.in` serves an **incomplete TLS
certificate chain** (`unable to verify the first certificate` — it omits the intermediate CA),
so it cannot be fetched with certificate verification on. I will not disable verification to
obtain a figure I would then present as authoritative.

**What I need:** the **Gadag taluk** and **Karnataka** populations, with the citation.
A template is at `data/manual/population.json.template` — copy it to `population.json`.

`census2011.co.in` is reachable and carries taluk figures, but it is an **unofficial
third-party aggregator**, and the spec asks for Census of India or an official projection. Tell
me if you would rather I use it with that clearly labelled, and I will.

**This is the single highest-value thing you can give me.** It is two numbers, and together with
R1 it unblocks Milestone 5 and makes `POST /simulate` work end to end.

### R6 — Unit prices — *decision needed, not a file*

**I searched and came up empty.** `nppa.gov.in` (the price regulator) has the **same incomplete
TLS certificate chain problem** as the census site, and the Jan Aushadhi portal is a JavaScript
application with no scrapable price list. `pmbi.co.in` returns 404.

**Current behaviour, which needs no decision from you unless you dislike it:** all value figures
— stock value, value moved, value saved from expiry — are **withheld entirely** rather than shown
as zero, because a zero reads as a real number. Everything is reported in **units** instead.

**Your options:** (a) leave it as units-only, which is fully honest and costs nothing;
(b) supply a price list you trust and I will tag prices `real` and cite it; (c) authorise
illustrative prices, which I will tag `estimated` and label on screen. I will not pick (c) on
my own.

---

## Now waiting on you

### R7 — Confirm 51 uncertain medicine matches  →  `data/manual/indent_match_review.csv`

**Why manual:** the survey and the indent use different drug-code schemes, so the 104 survey
items have to be matched to indent rows by name, strength and dosage form. 53 matched cleanly
on their own. The other **51 are genuinely ambiguous** and I will not guess them — a wrong match
would attach the wrong therapeutic group, facility levels and demand quantity to a medicine.

**What to do:** open the file. Each row has the survey item, **why** it needs review, and the
top 3 candidate indent rows with their scores. Put one of these in the `decision` column:
- an **indent drug code** (e.g. `D00461`) — that candidate, or any other code you know is right
- `none` — no indent row corresponds to this survey item

Leave a row blank and it simply stays excluded. Re-running the pipeline never overwrites a
decision you have recorded, so you can do this in several sittings.

**Typical reasons you will see:** *dosage form disagrees* (syrup vs capsule), *strength
disagrees*, *name similarity only 74.5*, *top two candidates are too close to separate*, and one
case where two survey items both claim the single "Disposable Mask Triple Layer" indent row.

---

### R8 — Verify the 77 facilities  →  `data/manual/facility_verification.csv`

**Why manual:** OSM has no `operator` or `beds` field for any Gadag facility, so **facility type
and ownership are inferred from names** — a guess, however careful. The list is not used until
your team confirms it, and `verified` is false for all 77 rows.

**What to do:** each row has the OSM name, the inferred type and ownership, and **two map links**
(OpenStreetMap and Google Maps) to check the location. Fill in:
- `verified` → `yes` once you have checked the location and type
- `correct_type` / `correct_ownership` → only if my inference is wrong
- `beds` → if you know it; otherwise leave blank and it stays unknown
- `notes` → anything else

**12 rows carry a flag and deserve the most attention:**
- 4 × `unclear_government_level` — "Railway Hospital", "Rural Medical Service Hulkoti", "Kadadi
  Government Hospital", "Mulagund Government Hospital". **These need a level (PHC / CHC / taluk
  hospital)**, because the level decides which medicine list the facility carries.
- 1 × `generic_phc_name` — a facility named "Primary Health Care". Is it a government PHC or a
  private clinic using the phrase?
- 3 × `merged_records` — two or more OSM records treated as one facility.
- 3 × `possible_duplicate_nearby` — close by and similarly named, **not** merged. Are "J C Shirol
  Nursing Home" and "V C Shirol Nursing Home" the same place or different practices?
- 2 × `unnamed_in_osm`.

Re-running the pipeline preserves what you have filled in.

---

### R4 is now urgent — the PHC gap

**OSM has 5 PHCs. The survey covers 15.** So 10 of the survey's availability profiles have no
location to attach to, and the inventory map would show a third of the taluk's PHC network.

I will **not** invent PHC locations. This needs the **HMIS facility list for Gadag taluk**
(request R4 above) — the same list the survey's authors used. If HMIS is not obtainable, tell me
and the map will show only the 5 locatable PHCs, with the shortfall stated on the page.

Relatedly, OSM has only **3 pharmacies** in the whole taluk, which is plainly an undercount.
R2/R3 (Open Government Data, ABDM) would help most here.

---

## Confirmations I will ask for later

- Nothing outstanding beyond R7 (medicine matches) and R8 (facilities) above.
