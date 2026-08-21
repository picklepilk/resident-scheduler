from solver.model import timing


def test_cross_midnight_end_lands_next_day():
    # startH=23 durationH=9 -> ends 08:00 the following calendar day.
    shift = timing.ShiftTiming("N", 23, 9, "night", "POD")
    start = timing.shift_start_min("2026-02-02", shift)
    end = timing.shift_end_min("2026-02-02", shift)
    assert end - start == 9 * 60
    assert end % (24 * 60) == 8 * 60  # 08:00 local time-of-day
    assert end // (24 * 60) == start // (24 * 60) + 1  # landed on the following calendar day


def test_gap_between_can_be_negative_on_overlap():
    night = timing.ShiftTiming("N", 23, 9, "night", "POD")
    day = timing.ShiftTiming("D", 7, 9, "day", "POD")
    gap = timing.gap_between("2026-02-02", night, "2026-02-03", day)
    assert gap == -60  # the day shift starts an hour before the night shift ends
    assert timing.required_rest_gap_min(night) == 9 * 60


def test_required_rest_gap_uses_earlier_shifts_own_duration():
    short = timing.ShiftTiming("E", 15, 4, "eve", "POD")
    long_ = timing.ShiftTiming("N", 23, 12, "night", "POD")
    assert timing.required_rest_gap_min(short) == 4 * 60
    assert timing.required_rest_gap_min(long_) == 12 * 60


def test_add_days_and_date_diff_cross_month_and_nonleap_feb():
    assert timing.add_days("2026-02-28", 1) == "2026-03-01"  # 2026 is not a leap year
    assert timing.date_diff_days("2026-03-01", "2026-02-28") == 1
    assert timing.date_diff_days("2026-02-28", "2026-03-01") == -1


def test_overlaps_hour_window_matches_journal_club_window():
    ped_n = timing.ShiftTiming("PED-N", 19, 9, "night", "PED")
    assert timing.overlaps_hour_window(ped_n, 18, 21) is True
    day = timing.ShiftTiming("D", 7, 9, "day", "POD")
    assert timing.overlaps_hour_window(day, 18, 21) is False
    # touching but not overlapping the window's edges
    edge = timing.ShiftTiming("EDGE", 21, 2, "eve", "POD")
    assert timing.overlaps_hour_window(edge, 18, 21) is False


def test_rolling_window_positions_and_mixed_terms():
    terms = [0, 1, "V0", "V1", 1]  # ints stand in for tail constants, strings for vars

    def get_term(i):
        return terms[i]

    windows = list(timing.rolling_window(get_term, len(terms), 3))
    assert windows[0] == (0, [0, 1, "V0"])
    assert windows[-1] == (2, ["V0", "V1", 1])
    assert len(windows) == len(terms) - 3 + 1


def test_rolling_window_empty_when_window_longer_than_sequence():
    assert list(timing.rolling_window(lambda i: 0, 3, 5)) == []
