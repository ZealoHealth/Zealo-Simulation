"""How much medicine demand private facilities carry, relative to government ones.

The indent-derived demand in this project is government demand: it is scaled from what
government facilities requested. Private hospitals, clinics and pharmacies need a demand
figure of their own, and no public source records their medicine volumes.

The closest government-backed evidence is where people are treated. NSS 75th round
(MoSPI, July 2017 - June 2018, Report 586) reports the share of treated spells of ailment
by provider, separately for rural and urban India. Outpatient treatment is what draws on
PHC-level essential medicines, so that is the measure used:

    private share of treated ailments  = private hospitals + private doctors/clinics
    government share of treated ailments = government hospitals
    private : government ratio          = private share / government share

Rural and urban ratios are weighted by Gadag taluk's own urban/rural population
(Census 2011). Informal providers and charitable/NGO facilities are excluded: they are
neither the government facilities nor the private facilities on this map.

Assumption stated in the UI: a treated ailment draws on medicines similarly in either
sector. The survey counts treated spells, not medicine units.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from zealo.config import MANUAL_DIR

PRIVATE_SHARE_JSON = MANUAL_DIR / "private_share.json"


class PrivateShareError(ValueError):
    pass


@dataclass(frozen=True)
class AreaShares:
    government_pct: float
    private_hospital_pct: float
    private_clinic_pct: float
    other_pct: float  # informal providers + charitable/NGO

    @property
    def private_pct(self) -> float:
        return self.private_hospital_pct + self.private_clinic_pct

    @property
    def ratio(self) -> float:
        """Private treated ailments per government treated ailment."""
        return self.private_pct / self.government_pct

    def problems(self, label: str) -> list[str]:
        total = self.government_pct + self.private_pct + self.other_pct
        out = []
        if abs(total - 100) > 1.5:  # published shares are rounded
            out.append(f"{label} shares sum to {total:.1f}%, expected about 100%")
        if self.government_pct <= 0:
            out.append(f"{label} government share must be positive")
        return out


@dataclass(frozen=True)
class PrivateShare:
    rural: AreaShares
    urban: AreaShares
    urban_population: int
    rural_population: int
    geography: str
    source: dict

    @property
    def urban_weight(self) -> float:
        return self.urban_population / (self.urban_population + self.rural_population)

    @property
    def ratio(self) -> float:
        """Taluk-weighted private : government ratio of treated ailments."""
        w = self.urban_weight
        government = w * self.urban.government_pct + (1 - w) * self.rural.government_pct
        private = w * self.urban.private_pct + (1 - w) * self.rural.private_pct
        return private / government


def _area(data: dict, key: str) -> AreaShares:
    try:
        d = data[key]
        return AreaShares(
            float(d["government_pct"]),
            float(d["private_hospital_pct"]),
            float(d["private_clinic_pct"]),
            float(d.get("other_pct", 0.0)),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise PrivateShareError(f"private_share.json: '{key}' is incomplete") from exc


def load_private_share(path: Path | None = None) -> PrivateShare:
    path = path or PRIVATE_SHARE_JSON
    if not path.exists():
        raise PrivateShareError(f"{path.name} is missing")
    data = json.loads(path.read_text())
    return PrivateShare(
        rural=_area(data, "rural"),
        urban=_area(data, "urban"),
        urban_population=int(data["gadag_taluk_urban_population"]),
        rural_population=int(data["gadag_taluk_rural_population"]),
        geography=str(data.get("geography", "")),
        source=data.get("source", {}),
    )


def validate(share: PrivateShare, taluk_total: int | None = None) -> list[str]:
    problems = share.rural.problems("rural") + share.urban.problems("urban")
    if taluk_total is not None and share.urban_population + share.rural_population != taluk_total:
        problems.append(
            f"urban + rural population ({share.urban_population + share.rural_population:,}) "
            f"does not equal the verified taluk total ({taluk_total:,})"
        )
    return problems


KARNATAKA_ROW_LABELS = (
    "government/public hospital",
    "charitable/trust/NGO-run hospital",
    "private hospital",
    "private doctor/ in private clinic",
)


def verify_against_pdf(share: PrivateShare, pdf_path: Path, page_index: int = 47) -> list[str]:
    """Confirm each rural and urban figure is printed in the source table.

    Reads Table A8 of the NSS Key Indicators report and checks the Karnataka block line by
    line, so a mistyped figure in private_share.json cannot reach the model.
    """
    import pdfplumber

    if not pdf_path.exists():
        return [f"source PDF not found at {pdf_path}"]
    with pdfplumber.open(pdf_path) as pdf:
        lines = (pdf.pages[page_index].extract_text() or "").split("\n")
    try:
        start = next(i for i, line in enumerate(lines) if line.startswith("Karnataka "))
    except StopIteration:
        return ["Karnataka block not found in Table A8"]
    block = [lines[start].removeprefix("Karnataka ")] + lines[start + 1 : start + 4]

    expected = {
        "government/public hospital": (share.rural.government_pct, share.urban.government_pct),
        "private hospital": (share.rural.private_hospital_pct, share.urban.private_hospital_pct),
        "private doctor/ in private clinic": (
            share.rural.private_clinic_pct, share.urban.private_clinic_pct,
        ),
    }
    problems = []
    for label, (rural, urban) in expected.items():
        row = next((line for line in block if line.startswith(label)), None)
        if row is None:
            problems.append(f"row '{label}' not found in the Karnataka block")
            continue
        numbers = row[len(label):].split()
        if len(numbers) < 2 or float(numbers[0]) != rural or float(numbers[1]) != urban:
            problems.append(
                f"'{label}': file says rural {rural} / urban {urban}, PDF says {' '.join(numbers)}"
            )
    return problems
