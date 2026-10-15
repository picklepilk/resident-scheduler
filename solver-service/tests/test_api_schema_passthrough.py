"""The HTTP request schema must not drop payload keys it doesn't declare --
api/main.py feeds `model_dump()` into solver/io/payload.py, so a key lost here
is silently absent on the deployed (HTTP) path while the CLI path keeps it."""

from api.schemas import SolveRequest


def _minimal_request(**extra_top):
    return {
        "version": 1,
        "block": {"startDate": "2026-07-27", "endDate": "2026-07-28", "dates": ["2026-07-27", "2026-07-28"]},
        "shifts": {},
        "residents": [{"id": "r1", "truePrimary": ["POD-D"], "someFutureField": 3}],
        "eligible": {},
        "coverage": {},
        **extra_top,
    }


def test_unknown_top_level_and_nested_keys_survive_model_dump():
    raw = _minimal_request(obligationsExemptAfterNight=True, grDates=["2026-07-29"])
    dumped = SolveRequest.model_validate(raw).model_dump(mode="python")
    assert dumped["obligationsExemptAfterNight"] is True
    assert dumped["grDates"] == ["2026-07-29"]
    assert dumped["residents"][0]["truePrimary"] == ["POD-D"]
    assert dumped["residents"][0]["someFutureField"] == 3
