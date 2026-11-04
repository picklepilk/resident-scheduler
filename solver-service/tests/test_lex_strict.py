"""config.lexStrict: stages minimize their own expr only; default (false) is unchanged."""

from __future__ import annotations

from solver.io.payload import parse_payload
from solver.solve import _STAGE_NAMES, solve
from tests.helpers import load_fixture


def _raw(**cfg):
    raw = load_fixture("small_feasible.json")
    raw["config"].update(maxTimeSeconds=6, numWorkers=1, outerLns={"enabled": False}, **cfg)
    return raw


def test_default_false():
    assert parse_payload(_raw()).config.lex_strict is False
    assert parse_payload(_raw(lexStrict=True)).config.lex_strict is True


def test_lex_strict_valid_and_no_worse_in_earliest_tier():
    base = solve(parse_payload(_raw()))
    strict = solve(parse_payload(_raw(lexStrict=True)))
    assert strict.status in ("OPTIMAL", "FEASIBLE") and strict.validation["passed"]
    b = tuple(base.tiers[n] for n in _STAGE_NAMES)
    s = tuple(strict.tiers[n] for n in _STAGE_NAMES)
    first = next((i for i, n in enumerate(_STAGE_NAMES) if b[i] or s[i]), None)
    if first is not None:
        assert s[first] <= b[first]
