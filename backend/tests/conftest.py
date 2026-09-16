"""Shared pytest fixtures. Scenario builders live in tests/factories.py."""

from __future__ import annotations

import pytest

from tests.factories import build_scenario


@pytest.fixture
def scenario():
    return build_scenario()
