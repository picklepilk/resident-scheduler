"""Auto portfolio default: absent config.portfolio -> K=2 at >= 12 workers."""
from __future__ import annotations

import pytest

from solver.io.payload import parse_payload
from solver.solve import AUTO_PORTFOLIO_MIN_WORKERS, resolve_portfolio_k, solve
from tests.helpers import load_fixture


@pytest.mark.parametrize("cfg,workers,expected", [
    (None, 16, 2), (None, 8, 1), (None, 12, 2), (None, 11, 1), (1, 16, 1), (4, 16, 4), (4, 1, 4),
])
def test_resolve_portfolio_k(cfg, workers, expected):
    assert resolve_portfolio_k(cfg, workers) == expected


def test_constant():
    assert AUTO_PORTFOLIO_MIN_WORKERS == 12


def _raw(workers, portfolio=None):
    raw = load_fixture("small_feasible.json")
    raw["config"]["maxTimeSeconds"] = 3
    raw["config"]["numWorkers"] = workers
    if portfolio is not None:
        raw["config"]["portfolio"] = portfolio
    return raw


def test_absent_portfolio_parses_to_none():
    assert parse_payload(_raw(1)).config.portfolio is None
    assert parse_payload(_raw(1, 1)).config.portfolio == 1


def test_auto_report_flag(monkeypatch):
    # numWorkers is clamped to cpu_count; pretend the box is big enough.
    monkeypatch.setattr("solver.solve.os.cpu_count", lambda: 16)
    result = solve(parse_payload(_raw(12)))
    p = result.report["portfolio"]
    assert p["k"] == 2 and p["auto"] is True


def test_explicit_one_stays_single(monkeypatch):
    monkeypatch.setattr("solver.solve.os.cpu_count", lambda: 16)
    result = solve(parse_payload(_raw(12, 1)))
    assert "portfolio" not in result.report
