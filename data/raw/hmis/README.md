# data/raw/hmis — HMIS reports for Gadag taluk (request R4)

**Why manual:** https://hmis.mohfw.gov.in is an interactive report builder behind an API.

**Two things are needed:**

1. **The HMIS facility list for Gadag taluk**, including all 15 PHCs the survey covered.
   OpenStreetMap has only 5 of them. Copy the ones you can locate into
   `data/manual/phc_locations.csv` (coordinates, or just the village name — the village is
   then geocoded to its centre and shown as approximate).
2. **OPD and IPD attendance** for Gadag taluk government facilities (latest full year).
   Enter the annual figures in `data/manual/facility_attendance.csv`. Until then demand is
   split equally between facilities and tagged estimated.

Drop the original exported files here unchanged, for provenance.
