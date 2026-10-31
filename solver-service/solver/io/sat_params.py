"""CP-SAT parameter overrides for diversified portfolio runs (`config.portfolioParams`).

Plain dicts of `SatParameters` field -> value (enum fields by name, e.g.
"PORTFOLIO_WITH_QUICK_RESTART_SEARCH"). Validated at parse time; applied in solve.py.
"""

from __future__ import annotations

from ortools.sat import sat_parameters_pb2

# Owned by the service, never by a payload: workers/time/seed are resolved per run by solve.py,
# repair_hint is unsafe across repeated staged solves (see solve.py `_configure_solver`).
FORBIDDEN = frozenset({"num_workers", "num_search_workers", "max_time_in_seconds", "random_seed", "repair_hint",
                       "fix_variables_to_their_hinted_value", "stop_after_first_solution"})

# Built-in per-run variants for K > 1 (run i uses entry i % len). Run 0 stays CP-SAT's default.
DEFAULT_PORTFOLIO_PARAMS = (
    {},
    {"linearization_level": 2, "search_branching": "PORTFOLIO_WITH_QUICK_RESTART_SEARCH", "randomize_search": True},
    {"optimize_with_core": True, "linearization_level": 0},
    {"use_lns_only": True},
)


def validate_params(params: dict) -> dict:
    if not isinstance(params, dict):
        raise ValueError("portfolioParams entries must be objects")
    fields = sat_parameters_pb2.SatParameters.DESCRIPTOR.fields_by_name
    out = {}
    for key, value in params.items():
        if key in FORBIDDEN or key not in fields:
            raise ValueError(f"portfolioParams: unsupported SatParameters field {key!r}")
        et = fields[key].enum_type
        if et is not None and (not isinstance(value, str) or value not in et.values_by_name):
            raise ValueError(f"portfolioParams: {key} must be one of {sorted(et.values_by_name)}")
        out[key] = value
    return out


def apply_params(target, params: dict) -> None:
    """Set each field on a `SatParameters` message (`solver.parameters`)."""
    fields = sat_parameters_pb2.SatParameters.DESCRIPTOR.fields_by_name
    for key, value in params.items():
        enum_type = fields[key].enum_type
        if enum_type is not None and isinstance(value, str):
            value = getattr(target, value)  # pybind enum member, e.g. target.PORTFOLIO_SEARCH
        setattr(target, key, value)


def params_for_run(portfolio_params, i: int) -> dict:
    table = portfolio_params if portfolio_params else DEFAULT_PORTFOLIO_PARAMS
    return dict(table[i % len(table)])
