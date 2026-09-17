"""Village-centre geocoding with OpenStreetMap Nominatim, used only for PHC locations.

Authorised by the project team for one case: an HMIS PHC whose village is known but
whose coordinates are not. The result is a village centre, not the facility, so it is
tagged `derived`, labelled "approximate: village centre", and drawn with a distinct
marker.

Nominatim usage policy, followed here:
  * at most one request per second
  * a descriptive User-Agent identifying the application
  * results cached, so the same village is never requested twice -- the cache is kept
    in data/raw/geocode/ as the original responses, and is reused across runs
"""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from zealo.config import RAW_DIR

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "ZealoMap/0.1 (ideathon MVP; PHC village geocoding; contact via project repo)"
CACHE_PATH = RAW_DIR / "geocode" / "nominatim_cache.json"
MIN_INTERVAL_SECONDS = 1.1

# Gadag taluk's bounding box, from the OSM boundary relation. Results are constrained to
# it so a same-named village elsewhere in India cannot be picked up.
GADAG_VIEWBOX = (75.44151, 15.63610, 75.85924, 15.20677)  # left, top, right, bottom

Fetcher = Callable[[str], list[dict]]


@dataclass(frozen=True)
class GeocodeResult:
    query: str
    lat: float
    lon: float
    display_name: str
    osm_type: str
    osm_id: str


def _live_fetch(url: str) -> list[dict]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
        return json.loads(response.read().decode())


class Geocoder:
    """Cached, rate-limited village lookups."""

    def __init__(
        self,
        cache_path: Path = CACHE_PATH,
        fetch: Fetcher | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.cache_path = cache_path
        self.fetch = fetch or _live_fetch
        self.sleep = sleep
        self._last_request = 0.0
        self.live_requests = 0
        self.cache: dict[str, list[dict]] = (
            json.loads(cache_path.read_text()) if cache_path.exists() else {}
        )

    def _url(self, query: str) -> str:
        left, top, right, bottom = GADAG_VIEWBOX
        params = {
            "q": query,
            "format": "jsonv2",
            "countrycodes": "in",
            "viewbox": f"{left},{top},{right},{bottom}",
            "bounded": "1",
            "limit": "1",
        }
        return f"{NOMINATIM_URL}?{urllib.parse.urlencode(params)}"

    def village_centre(self, village: str) -> GeocodeResult | None:
        query = f"{village.strip()}, Gadag, Karnataka, India"
        if query not in self.cache:
            wait = MIN_INTERVAL_SECONDS - (time.monotonic() - self._last_request)
            if self._last_request and wait > 0:
                self.sleep(wait)
            self.cache[query] = self.fetch(self._url(query))
            self._last_request = time.monotonic()
            self.live_requests += 1
            self.save()
        hits = self.cache[query]
        if not hits:
            return None
        hit = hits[0]
        return GeocodeResult(
            query=query,
            lat=float(hit["lat"]),
            lon=float(hit["lon"]),
            display_name=str(hit.get("display_name", "")),
            osm_type=str(hit.get("osm_type", "")),
            osm_id=str(hit.get("osm_id", "")),
        )

    def save(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(self.cache, indent=2, sort_keys=True))
