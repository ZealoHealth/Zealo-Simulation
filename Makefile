PY := .venv/bin/python

.PHONY: install test lint api data data-check clean

install:
	/opt/homebrew/bin/python3.11 -m venv .venv
	$(PY) -m pip install --upgrade pip setuptools wheel
	$(PY) -m pip install -e "./backend[pipeline,dev]"

test:
	$(PY) -m pytest backend -q

lint:
	$(PY) -m ruff check backend data

api:
	$(PY) -m uvicorn zealo.main:app --reload --app-dir backend --port 8000

# Rebuild every dataset from data/raw/ and data/manual/. Safe to re-run: entries in
# data/manual/ are never overwritten, and interim values are replaced as they are filled.
data:
	$(PY) data/pipeline/01_extract_survey_tables.py
	$(PY) data/pipeline/02_extract_indent_and_match.py
	$(PY) data/pipeline/03_build_facilities.py
	$(PY) data/pipeline/04_population.py
	$(PY) data/pipeline/05_phc_availability.py
	$(PY) data/pipeline/06_private_share.py
	$(PY) data/pipeline/data_check.py

# What is missing, interim or failing validation. Also regenerates data/DATA_TODO.md.
data-check:
	$(PY) data/pipeline/data_check.py

clean:
	rm -rf .pytest_cache .ruff_cache backend/**/__pycache__
