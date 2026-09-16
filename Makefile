PY := .venv/bin/python

.PHONY: install test lint api clean

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

clean:
	rm -rf .pytest_cache .ruff_cache backend/**/__pycache__
