"""parse_payload config hardening: bad config values must surface as PayloadError (HTTP 400)
rather than a raw ValueError (HTTP 500), and time budgets must be bounded."""

from __future__ import annotations

import pytest

from solver.io.payload import PayloadError, parse_payload
from tests.helpers import make_payload


def _with_config(**cfg):
    raw = make_payload()
    raw["config"].update(cfg)
    return raw


@pytest.mark.parametrize("cfg", [
    {"deadlineSeconds": "abc"},
    {"stallSeconds": "abc"},
    {"maxTimeSeconds": "abc"},
    {"portfolioParams": [{"nope": 1}]},
])
def test_bad_config_values_raise_payload_error(cfg):
    with pytest.raises(PayloadError):
        parse_payload(_with_config(**cfg))


@pytest.mark.parametrize("value", [float("inf"), float("nan"), -float("inf")])
def test_non_finite_time_budget_rejected(value):
    with pytest.raises(PayloadError):
        parse_payload(_with_config(maxTimeSeconds=value))
    with pytest.raises(PayloadError):
        parse_payload(_with_config(deadlineSeconds=value))


def test_time_budget_is_clamped():
    p = parse_payload(_with_config(maxTimeSeconds=10**9, deadlineSeconds=10**9))
    assert p.config.max_time_seconds == 1800.0
    assert p.config.deadline_seconds == 1860.0


def test_normal_time_budget_unchanged():
    p = parse_payload(_with_config(maxTimeSeconds=45, deadlineSeconds=50))
    assert p.config.max_time_seconds == 45.0
    assert p.config.deadline_seconds == 50.0
