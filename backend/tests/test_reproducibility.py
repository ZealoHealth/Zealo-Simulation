"""The same settings must give the same run in every process.

Python randomises string hashing per process, so iterating a set or frozenset of ids
visits them in a different order after every restart. When such a loop drew from the
RNG (opening stock), the same seed produced a different simulation each time the API
started. Tests inside one process can never see this, because the hash seed is fixed
for the whole test session; these run the simulation in fresh interpreters with
different hash seeds instead.
"""

import json
import os
import subprocess
import sys

SCRIPT = """
import hashlib, json
from zealo.sim.runner import build_scenario, run_both_modes
built = build_scenario(days=8, seed=42, demand_scale=1.0, lead_time_days=21,
                       express_lead_time_days=5, min_shelf_life_days=180,
                       near_expiry_share=0.15)
cached = run_both_modes(built, "check")
out = {}
for mode, result in cached.results.items():
    events = json.dumps([e.to_dict() for e in result.events.events], sort_keys=True)
    out[mode] = {
        "metrics": result.metrics.to_dict(),
        "events": hashlib.sha256(events.encode()).hexdigest(),
    }
print(json.dumps(out, sort_keys=True))
"""


def _run_with_hash_seed(seed: str) -> dict:
    env = {**os.environ, "PYTHONHASHSEED": seed}
    completed = subprocess.run(
        [sys.executable, "-c", SCRIPT], env=env, capture_output=True, text=True, check=True
    )
    return json.loads(completed.stdout.strip().splitlines()[-1])


def test_a_run_does_not_depend_on_the_process_hash_seed():
    first = _run_with_hash_seed("1")
    second = _run_with_hash_seed("2")
    assert first == second
