"""api/runlog.py: SOLVER_RUNLOG_DIR telemetry through the real /solve route."""

import json

import pytest
from fastapi.testclient import TestClient

from api.main import app
from tests.helpers import make_payload, make_resident


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "off")
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "600")
    monkeypatch.setenv("SOLVER_RATE_BURST", "50")
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_PER_MIN", "600")
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_BURST", "50")
    monkeypatch.delenv("SOLVER_RUNLOG_DIR", raising=False)


def _body():
    return make_payload(residents=[make_resident("secret-r1"), make_resident("secret-r2")])


def test_solve_writes_one_line_without_resident_ids(monkeypatch, tmp_path):
    monkeypatch.setenv("SOLVER_RUNLOG_DIR", str(tmp_path / "logs"))
    r = TestClient(app).post("/solve", json=_body())
    assert r.status_code == 200
    text = (tmp_path / "logs" / "runs.jsonl").read_text(encoding="utf-8")
    lines = text.splitlines()
    assert len(lines) == 1
    assert "secret-r" not in text
    rec = json.loads(lines[0])
    assert rec["residents"] == 2 and rec["dates"] == 5
    assert rec["status"] in ("OPTIMAL", "FEASIBLE", "RELAXED")
    for key in ("ts", "host", "cpuCount", "numWorkers", "maxTimeSeconds", "flags", "wallSeconds", "tiers"):
        assert key in rec
    assert "schedule" not in rec


def test_unset_env_writes_nothing(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert TestClient(app).post("/solve", json=_body()).status_code == 200
    assert not list(tmp_path.rglob("runs.jsonl"))


def test_write_failure_is_swallowed(monkeypatch, tmp_path):
    blocker = tmp_path / "file"
    blocker.write_text("x")
    monkeypatch.setenv("SOLVER_RUNLOG_DIR", str(blocker / "sub"))  # parent is a file -> mkdir fails
    assert TestClient(app).post("/solve", json=_body()).status_code == 200
