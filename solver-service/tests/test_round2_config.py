"""Round 2 option parsing (2026-11-24): all default OFF, lenient on garbage."""
from solver.io.payload import LadderConfig, ScopeConfig, _parse_hint_repair_and_ladder, parse_scope
from solver.lns_outer import OuterLnsConfig, parse_outer_lns


def test_outer_lns_round2_defaults_off():
    d = parse_outer_lns({})
    assert d == OuterLnsConfig()
    assert d.sub_stall_seconds == 0.0 and d.chooser == "success" and d.grow_on_success is False


def test_outer_lns_round2_parse():
    c = parse_outer_lns({"subStallSeconds": 1.5, "chooser": "gainRate", "growOnSuccess": True})
    assert c.sub_stall_seconds == 1.5 and c.chooser == "gainRate" and c.grow_on_success is True
    g = parse_outer_lns({"subStallSeconds": "x", "chooser": "best", "growOnSuccess": "yes"})
    assert g.sub_stall_seconds == 0.0 and g.chooser == "success" and g.grow_on_success is False
    assert parse_outer_lns({"subStallSeconds": 999}).sub_stall_seconds == 60.0
    assert parse_outer_lns({"subStallSeconds": -3}).sub_stall_seconds == 0.0


def test_rank_stall_seconds_parse():
    assert LadderConfig().rank_stall_seconds == 0.0
    assert _parse_hint_repair_and_ladder({})["ladder"].rank_stall_seconds == 0.0
    assert _parse_hint_repair_and_ladder({"ladder": {"rankStallSeconds": 5}})["ladder"].rank_stall_seconds == 5.0
    assert _parse_hint_repair_and_ladder({"ladder": {"rankStallSeconds": "x"}})["ladder"].rank_stall_seconds == 0.0
    assert _parse_hint_repair_and_ladder({"ladder": {"rankStallSeconds": 9999}})["ladder"].rank_stall_seconds == 120.0


def test_scope_parse():
    assert parse_scope(None) is None and parse_scope({}) is None and parse_scope("x") is None
    assert parse_scope({"dates": ["2026-11-10", "2026-11-03"]}) is None  # from > to
    assert parse_scope({"dates": ["2026-11-03"], "residentIds": []}) is None
    assert parse_scope({"dates": ["2026-13-40", "2026-11-03"]}) is None
    s = parse_scope({"dates": ["2026-11-03", "2026-11-09"], "residentIds": ["r1", "r1", 3, "", "r2"]})
    assert s == ScopeConfig(dates=("2026-11-03", "2026-11-09"), resident_ids=("r1", "r2"))
    assert parse_scope({"residentIds": ["r9"]}) == ScopeConfig(dates=None, resident_ids=("r9",))
    assert _parse_hint_repair_and_ladder({"scope": {"residentIds": ["a"]}})["scope"].resident_ids == ("a",)
    assert _parse_hint_repair_and_ladder({})["scope"] is None


def test_scope_keep_cells_parse():
    s = parse_scope({"keepCells": [["r1", "2026-11-03"], ["r1", "2026-11-03"], ["r2"], "x", [1, 2], ["r3", "2026-11-04"]]})
    assert s == ScopeConfig(keep_cells=(("r1", "2026-11-03"), ("r3", "2026-11-04")))
    assert parse_scope({"keepCells": []}) is None
