# Zealo Map

A medicine inventory map for **Gadag taluk, Karnataka**, and a simulation of how Zealo keeps
stock available — refilling **directly from manufacturers** and **redistributing stock between
facilities in its network**. No warehouses, no distributors.

> **Disclaimer.** Facility locations and medicine lists come from public sources. Stock levels
> are estimates. PHC availability patterns come from a 2021–22 published survey and are assigned
> to map locations for illustration.

## Honesty about data

Every number on screen is labelled **Real**, **Derived** or **Estimated**, and traces to a
source in [`data/SOURCES.md`](data/SOURCES.md) or a formula in
[`data/METHODS.md`](data/METHODS.md). Nothing is invented. Where a source can't be accessed, the
gap is recorded in [`data/manual/REQUESTS.md`](data/manual/REQUESTS.md) rather than filled in
with a guess.

Real facility names are never displayed — facilities are labelled by type and number.

## Status

Milestone 1 of 12 (scaffold) complete. See [`CHANGES.md`](CHANGES.md).

## Quick start

```bash
make install   # Python 3.11 venv + backend in editable mode
make test      # pytest
make api       # http://localhost:8000/health
```

## Credits

- Tejesh S, Nagaveni SJ (2023). *An Assessment of the Availability of Essential Medicines in
  Gadag Taluk, Karnataka: A Study of Primary Health Centers.* Cureus 15(5): e39341.
  DOI [10.7759/cureus.39341](https://doi.org/10.7759/cureus.39341). Licensed **CC BY 4.0**.
- Karnataka State Medical Supplies Corporation Limited — Annual Indent 2025-26.
- Map data © OpenStreetMap contributors (ODbL).

Team: Shriyans Nayak and Sanjana Srinivas.
