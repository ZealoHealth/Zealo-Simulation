# data/raw/ogd — Open Government Data files (request R2, optional)

**Why manual:** https://www.data.gov.in and https://karnataka.data.gov.in both serve
`User-agent: * / Disallow: /`, so this project never fetches them programmatically.

**What to download** (CSV or XLSX, whatever the portal offers), filtered to **Gadag district**:

| File | Search the portal for | Used for |
|---|---|---|
| Taluk hospital list | "taluk hospital Karnataka" | confirming government facility levels |
| CHC list | "community health centre Karnataka" | confirming government facility levels |
| Private hospital list | "private hospitals Karnataka" | locating private facilities |
| Pharmacy / drug licence list | "retail drug licence Karnataka" | **the pharmacy undercount** — OSM has only 3 |

Drop the files here unchanged and keep the original file names. Add a line to
`data/SOURCES.md` noting the dataset title, URL and download date.
