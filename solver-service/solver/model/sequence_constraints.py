"""Soft run-length shaping (rules 36-37: night clustering, work shape).

`negated_bounded_span` / `add_soft_sequence_constraint` are a direct port of
the pattern from Google OR-Tools' own example
`examples/python/shift_scheduling_sat.py` (Apache-2.0), which is the
standard CP-SAT idiom for "penalize runs shorter than X or longer than Y in
a 0/1 sequence, integer cost per unit of shortfall/excess". Only renamed for
local style; the algorithm is unchanged.
"""

from __future__ import annotations


def negated_bounded_span(works: list, start: int, length: int) -> list:
    """Literals that must NOT all be true for the run of `length` starting at
    `start` in `works` to be an isolated span of exactly that length -- i.e.
    "the day before the span (if any) is off, every day in the span is on,
    and the day after (if any) is off" becomes "at least one of: day-before
    ON, some day IN the span off, day-after ON".
    """
    sequence = []
    if start > 0:
        sequence.append(works[start - 1])
    for i in range(length):
        sequence.append(works[start + i].negated())
    if start + length < len(works):
        sequence.append(works[start + length])
    return sequence


def add_soft_sequence_constraint(
    model,
    works: list,
    hard_min: int,
    soft_min: int,
    min_cost: int,
    soft_max: int,
    hard_max: int,
    max_cost: int,
    prefix: str,
):
    """Constrains the sequence of variables in `works` (booleans, one per
    day) so every maximal run of consecutive 1s has a length in
    [hard_min, hard_max], and returns (cost_literals, cost_coefficients) for
    the objective: a run shorter than soft_min or longer than soft_max is
    still allowed but incurs `min_cost`/`max_cost` per unit short/over.

    hard_max == len(works) degrades the top end to "soft-only" (no forbidden
    spans at all, just an escalating cost past soft_max) -- both call sites
    in this codebase use that for a shape penalty rather than a real ceiling.

    CAUTION on `hard_min = 0`: length 0 is a degenerate "span" in this
    algorithm -- its window is just the two neighbors of a would-be
    zero-length gap, so its cost literal is forced to 1 whenever any TWO
    ADJACENT days are both off. That fires constantly on ordinary rest days
    and is almost never what a caller wants. Use `hard_min = 1` unless you
    specifically intend to penalize adjacent off-day pairs.
    """
    cost_literals = []
    cost_coefficients = []

    for length in range(1, hard_min):
        for start in range(len(works) - length + 1):
            model.add_bool_or(negated_bounded_span(works, start, length))

    for length in range(hard_min, soft_min):
        for start in range(len(works) - length + 1):
            lit = model.new_bool_var(f"{prefix}: under_span(start={start}, length={length})")
            span = negated_bounded_span(works, start, length)
            span.append(lit)
            model.add_bool_or(span)
            cost_literals.append(lit)
            cost_coefficients.append(min_cost * (soft_min - length))

    for length in range(soft_max + 1, hard_max + 1):
        for start in range(len(works) - length + 1):
            span = negated_bounded_span(works, start, length)
            model.add_bool_or(span)

    for length in range(hard_max + 1, len(works) + 1):
        for start in range(len(works) - length + 1):
            lit = model.new_bool_var(f"{prefix}: over_span(start={start}, length={length})")
            span = negated_bounded_span(works, start, length)
            span.append(lit)
            model.add_bool_or(span)
            cost_literals.append(lit)
            cost_coefficients.append(max_cost * (length - soft_max))

    return cost_literals, cost_coefficients
