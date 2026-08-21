from ortools.sat.python import cp_model

from solver.model.sequence_constraints import add_soft_sequence_constraint, negated_bounded_span


def test_negated_bounded_span_includes_neighbors_at_edges():
    m = cp_model.CpModel()
    works = [m.new_bool_var(f"w{i}") for i in range(5)]
    middle = negated_bounded_span(works, 1, 2)  # start=1, length=2 -> neighbors on both sides
    assert len(middle) == 4  # works[0], not works[1], not works[2], works[3]

    at_start = negated_bounded_span(works, 0, 2)  # no left neighbor
    assert len(at_start) == 3

    at_end = negated_bounded_span(works, 3, 2)  # no right neighbor (3+2 == len(works))
    assert len(at_end) == 3


def test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length():
    # Only lengths strictly between soft_max and hard_max (inclusive of
    # hard_max) are truly forbidden -- anything longer than hard_max falls
    # through to the soft "over_span" cost zone instead (see the CAUTION note
    # on add_soft_sequence_constraint). soft_max=1, hard_max=2 forbids an
    # isolated run of exactly length 2.
    m = cp_model.CpModel()
    works = [m.new_bool_var(f"w{i}") for i in range(3)]
    add_soft_sequence_constraint(
        m, works, hard_min=0, soft_min=0, min_cost=0, soft_max=1, hard_max=2, max_cost=0, prefix="t"
    )
    m.add(works[0] == 1)
    m.add(works[1] == 1)
    m.add(works[2] == 0)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(m)) == "INFEASIBLE"


def test_run_within_hard_bounds_is_feasible():
    m = cp_model.CpModel()
    works = [m.new_bool_var(f"w{i}") for i in range(4)]
    add_soft_sequence_constraint(
        m, works, hard_min=0, soft_min=0, min_cost=0, soft_max=4, hard_max=4, max_cost=0, prefix="t"
    )
    for w in works:
        m.add(w == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(m)) in ("OPTIMAL", "FEASIBLE")


def test_soft_min_penalizes_isolated_short_run():
    m = cp_model.CpModel()
    works = [m.new_bool_var(f"w{i}") for i in range(4)]
    cost_lits, cost_coefs = add_soft_sequence_constraint(
        m, works, hard_min=1, soft_min=3, min_cost=10, soft_max=4, hard_max=4, max_cost=0, prefix="t"
    )
    total_cost = sum(c * lit for c, lit in zip(cost_coefs, cost_lits))
    m.add(works[0] == 1)
    m.add(works[1] == 0)
    m.add(works[2] == 0)
    m.add(works[3] == 0)
    m.minimize(total_cost)
    solver = cp_model.CpSolver()
    status = solver.solve(m)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    assert solver.objective_value > 0  # an isolated 1-day run under soft_min=3 costs something


def test_run_at_or_above_soft_min_costs_nothing():
    m = cp_model.CpModel()
    works = [m.new_bool_var(f"w{i}") for i in range(4)]
    cost_lits, cost_coefs = add_soft_sequence_constraint(
        m, works, hard_min=1, soft_min=3, min_cost=10, soft_max=4, hard_max=4, max_cost=0, prefix="t"
    )
    total_cost = sum(c * lit for c, lit in zip(cost_coefs, cost_lits)) if cost_lits else 0
    for w in works[:3]:
        m.add(w == 1)
    m.add(works[3] == 0)
    if cost_lits:
        m.minimize(total_cost)
    solver = cp_model.CpSolver()
    status = solver.solve(m)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    if cost_lits:
        assert solver.objective_value == 0
