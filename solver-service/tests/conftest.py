"""Shared test isolation: finished jobs are persisted (api/jobs.py), so never let a test write to the
real per-user jobs dir."""

import pytest


@pytest.fixture(autouse=True)
def _isolated_jobs_dir(tmp_path_factory, monkeypatch):
    monkeypatch.setenv("SOLVER_JOBS_DIR", str(tmp_path_factory.mktemp("jobs")))
    yield
