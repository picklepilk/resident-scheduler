"""Implied (redundant) clique constraints, gated by `config.implied_cliques` (default off).

Per resident, build the conflict graph over that resident's in-block x vars where an edge means the pair
can never both be 1 under constraints already in the strict model:
  - same date (distinct shifts): the at-most-one-shift-per-day rule (variables.py);
  - date2 - date1 in {1, 2} with gap < required rest (rest.py, rule 17), using the SAME timing helpers;
  - next-day eve -> day (circadian.py `_add_eve_day_pairs`).
For each 3-calendar-day window we enumerate maximal cliques (Bron-Kerbosch with pivoting) and add
`sum(clique) <= 1` for cliques of size >= 3 that span MORE than one date (single-date cliques equal the
existing at-most-one exactly). Implied, so it never cuts a feasible solution; it only tightens the LP and
propagation. Strict builds only (the elastic pass-2 rebuild does not call this: its rest/circadian pairs may
be relaxed, which would make the cliques non-implied).

Prior-tail candidates (constants) are skipped: a clique over decision vars only. Total added constraints are
capped by MAX_CLIQUES; the count is returned and stored on `BuildResult.implied_cliques`.
"""

from __future__ import annotations

import logging

from solver.io.payload import Payload
from solver.model import timing
from solver.model.variables import VarStore, candidates_by_date

log = logging.getLogger(__name__)

MAX_CLIQUES = 20000          # global safety cap on added constraints
MAX_WINDOW_NODES = 60        # skip pathological windows (Bron-Kerbosch is exponential in the worst case)
_WINDOW_DAYS = 3             # rest scan covers date deltas 1 and 2 -> windows of 3 calendar dates


def _conflict(payload: Payload, date1: str, shift_id1: str, date2: str, shift_id2: str, delta: int) -> bool:
    """date1 <= date2 (delta = days apart). True when both can never be assigned together."""
    if delta == 0:
        return shift_id1 != shift_id2
    shift1 = payload.shifts[shift_id1]
    shift2 = payload.shifts[shift_id2]
    if delta == 1 and shift1.type == "eve" and shift2.type == "day":
        return True
    gap = timing.shift_start_min(date2, shift2) - timing.shift_end_min(date1, shift1)
    return gap < timing.required_rest_gap_min(shift1)


def _maximal_cliques(adj: list):
    """Bron-Kerbosch with pivot over adjacency sets. Yields lists of node indices."""
    out = []

    def bk(r, p, x):
        if not p and not x:
            out.append(r)
            return
        pivot = max(p | x, key=lambda u: len(adj[u] & p))
        for v in list(p - adj[pivot]):
            bk(r + [v], p & adj[v], x & adj[v])
            p = p - {v}
            x = x | {v}

    bk([], set(range(len(adj))), set())
    return out


def add_implied_cliques(model, payload: Payload, store: VarStore) -> int:
    added = 0
    for resident in payload.residents:
        by_date = candidates_by_date(payload, store, resident.id)
        dates = sorted(by_date)
        seen = set()
        for date0 in dates:
            window_dates = [timing.add_days(date0, k) for k in range(_WINDOW_DAYS)]
            nodes = []  # (date, delta_from_date0, shift_id, var)
            for k, d in enumerate(window_dates):
                for shift_id, var in by_date.get(d, []):
                    if var is not None:
                        nodes.append((d, k, shift_id, var))
            if len(nodes) < 3 or len({n[0] for n in nodes}) < 2 or len(nodes) > MAX_WINDOW_NODES:
                continue
            n = len(nodes)
            adj = [set() for _ in range(n)]
            for i in range(n):
                for j in range(i + 1, n):
                    di, ki, si, _ = nodes[i]
                    dj, kj, sj, _ = nodes[j]
                    if ki <= kj:
                        edge = _conflict(payload, di, si, dj, sj, kj - ki)
                    else:
                        edge = _conflict(payload, dj, sj, di, si, ki - kj)
                    if edge:
                        adj[i].add(j)
                        adj[j].add(i)
            for clique in _maximal_cliques(adj):
                if len(clique) < 3:
                    continue
                members = [nodes[i] for i in clique]
                if len({m[0] for m in members}) < 2:
                    continue  # single-date clique == existing at-most-one
                key = frozenset((m[0], m[2]) for m in members)
                if key in seen:
                    continue
                seen.add(key)
                model.add_at_most_one([m[3] for m in members])
                added += 1
                if added >= MAX_CLIQUES:
                    log.warning("implied cliques: cap %d reached", MAX_CLIQUES)
                    return added
    log.info("implied cliques added: %d", added)
    return added
