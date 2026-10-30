"""solver/runner.py: the solver's self-report of where it runs (surfaced in /health + progress)."""

from fastapi.testclient import TestClient

from api.main import app
from solver.runner import runner_info


def test_runner_info_shape():
    r = runner_info()
    assert r["kind"] in ("modal", "fly", "self-hosted")
    assert r["cpus"] >= 1 and r["pid"] > 0
    assert isinstance(r["host"], str) and r["host"]


def test_kind_from_env(monkeypatch):
    for k in ("MODAL_TASK_ID", "MODAL_IMAGE_ID", "MODAL_ENVIRONMENT", "FLY_APP_NAME", "FLY_MACHINE_ID"):
        monkeypatch.delenv(k, raising=False)
    assert runner_info()["kind"] == "self-hosted"
    monkeypatch.setenv("FLY_APP_NAME", "x")
    assert runner_info()["kind"] == "fly"
    monkeypatch.setenv("MODAL_TASK_ID", "t")
    assert runner_info()["kind"] == "modal"


def test_health_includes_runner():
    body = TestClient(app).get("/health").json()
    assert body["runner"]["pid"] == runner_info()["pid"]
