"""Demand forecasting.

``Forecaster`` is an interface so a trained model can replace the rule-based
default later without touching the policies that call it. The default is an
exponentially weighted average of **served plus unmet** demand -- forecasting on
served demand alone would learn to under-supply a facility that is already short,
because a stockout would look like low demand.

Out of scope on purpose: no outbreak detection and no disease-surge forecasting.
The interface is built so such a model *could* be added; none is built here.
"""

from __future__ import annotations

from typing import Protocol


class Forecaster(Protocol):
    """What a policy needs from any forecaster, learned or otherwise."""

    def update(self, day: int, observed_demand: float) -> None:
        """Record the demand actually observed on ``day``."""

    def predict(self, day: int) -> float:
        """Expected demand per day, looking forward from ``day``."""


class EwmaForecaster:
    """Exponentially weighted moving average of observed demand.

    ``alpha`` sets how quickly the estimate follows a change: higher reacts
    faster and is noisier. The prior seeds the estimate before any observation,
    so a facility does not start by forecasting zero and ordering nothing.
    """

    def __init__(self, alpha: float = 0.2, prior: float = 0.0) -> None:
        if not 0.0 < alpha <= 1.0:
            raise ValueError("alpha must be in (0, 1]")
        self.alpha = alpha
        self._value = prior
        self._observations = 0

    def update(self, day: int, observed_demand: float) -> None:
        if self._observations == 0 and self._value == 0.0:
            self._value = observed_demand
        else:
            self._value = self.alpha * observed_demand + (1 - self.alpha) * self._value
        self._observations += 1

    def predict(self, day: int) -> float:
        return max(0.0, self._value)

    @property
    def observations(self) -> int:
        return self._observations
