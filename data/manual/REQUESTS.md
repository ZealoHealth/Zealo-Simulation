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

### R5 — Population figures  →  tell me the numbers and the citation

- **Gadag taluk** population
- **Karnataka** population

Must be Census of India or an official projection, with the source so I can cite it. The spec
says not to estimate this myself, so this one genuinely blocks the demand formula.

### R6 — Unit prices — *decision needed, not a file*

I will search for a public price source (government ceiling price list / public generic price
list). If I find one I will cite it and tag prices `real`. **If I find nothing, I will come back
and ask** before using illustrative prices — I will not put made-up prices on screen without
your say-so.

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

## Confirmations I will ask for later

- **Milestone 4:** `data/manual/facility_verification.csv` — every candidate facility with a map
  link, for your team to eyeball before the list is used.
