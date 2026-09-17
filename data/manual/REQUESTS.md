# What we still need from you

**The live, always-current list is `data/DATA_TODO.md`.** Run `make data-check` to regenerate
it and see what is missing, interim or failing validation. After filling any file below, run
`make data` — your entries are never overwritten, and interim values are replaced automatically.

Nothing here blocks the site: every gap has a clearly labelled interim approach (see the
**Data status** link in the site header).

## Fill first — in this order

1. **R1 · Figure 1 values** — `figure1_phc_availability.csv`. 13 numbers off the chart on page 4
   of the survey PDF (PHC 1 and PHC 4 are pre-filled). Replaces the interim equal-value rule for
   13 PHCs and rebuilds the matrix. Validation is automatic.
2. **R8 · the 4 government facilities of unconfirmed level** — `facility_verification.csv`,
   rows flagged `level unconfirmed` (an `evidence` column shows what OSM records). Set
   `correct_type` to `phc`, `chc`, `taluk_hospital` or `other_government`. Each changes which
   medicine list the facility carries.
3. **R7 · medicine matches** — `indent_match_review.csv`, most useful rows first. Type
   `accept` to take the `suggested` code, an indent code, or `none`. Each confirmed match moves a
   survey item from availability-only to full quantities (53 of 104 have quantities now).
4. **R4 · PHC locations** — `phc_locations.csv`. 10 of the survey's 15 PHCs are not on the map.
   Coordinates if you have them; a village name alone is geocoded to its centre.

## When you can

5. **R8 · verify the other 73 facilities** — set `verified` to `yes`.
6. **R4 · OPD/IPD attendance** — `facility_attendance.csv`, switches demand from equal shares
   (estimated) to attendance-weighted (derived).
7. **R2 / R3 · OGD and ABDM files** — `data/raw/ogd/`, `data/raw/abdm/` (each has a README).
   Mainly for the pharmacy undercount.

## Decided — nothing to do

- **R5 population** — Census 2011, machine-verified.
- **R6 prices** — units only.
