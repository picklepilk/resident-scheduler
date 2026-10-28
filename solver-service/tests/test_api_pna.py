"""Tests for the /health `cpus` field and the Private Network Access (PNA)
response header (api/pna.py) -- see that module's own docstring for why PNA
matters here: a public HTTPS page fetching http://127.0.0.1:8765 (the "run
the optimizer on this computer" target) gets an extra Chrome preflight check
beyond ordinary CORS.
"""

from __future__ import annotations

import os

from fastapi.testclient import TestClient

from api.main import app


def test_health_reports_cpus():
    resp = TestClient(app).get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert isinstance(body["cpus"], int)
    assert body["cpus"] >= 1
    assert body["cpus"] == (os.cpu_count() or 1)


def test_preflight_without_pna_request_header_gets_no_pna_response_header():
    resp = TestClient(app).options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-private-network" not in {k.lower() for k in resp.headers}


def test_preflight_with_pna_request_header_gets_pna_response_header():
    resp = TestClient(app).options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    assert resp.headers.get("access-control-allow-private-network") == "true"
    # Ordinary CORS headers must still be present -- PNA is additive, not a replacement.
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_pna_header_also_applied_to_an_actual_post_solve_preflight(monkeypatch):
    # /solve's own preflight (POST, with the auth/content-type headers the real client sends)
    # must get the same treatment as /health's -- PNA has nothing to do with auth/rate-limit/body
    # middleware, it only cares about the CORS preflight shape.
    monkeypatch.setenv("SOLVER_CORS_ORIGINS", "https://residentscheduling.netlify.app")
    resp = TestClient(app).options(
        "/solve",
        headers={
            "Origin": "https://residentscheduling.netlify.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,authorization",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    assert resp.headers.get("access-control-allow-private-network") == "true"


def test_non_preflight_request_without_pna_header_is_unaffected():
    # A plain GET /health with no PNA request header at all must round-trip exactly as before --
    # the middleware is a no-op when the header is absent.
    resp = TestClient(app).get("/health")
    assert resp.status_code == 200
    assert "access-control-allow-private-network" not in {k.lower() for k in resp.headers}


def test_health_host_hints_absent_by_default(monkeypatch):
    monkeypatch.delenv("SOLVER_HOST_KIND", raising=False)
    body = TestClient(app).get("/health").json()
    assert body["jobs"] == "memory"
    assert "host" not in body and "preferJobs" not in body and "defaultBudgetSeconds" not in body


def test_health_host_hints_pi(monkeypatch):
    monkeypatch.setenv("SOLVER_HOST_KIND", "pi")
    monkeypatch.delenv("SOLVER_DEFAULT_BUDGET_SECONDS", raising=False)
    body = TestClient(app).get("/health").json()
    assert body["jobs"] == "memory"  # truthful: in-memory jobs
    assert body["host"] == "pi" and body["preferJobs"] is True
    assert body["defaultBudgetSeconds"] == 300
    monkeypatch.setenv("SOLVER_DEFAULT_BUDGET_SECONDS", "240")
    assert TestClient(app).get("/health").json()["defaultBudgetSeconds"] == 240
    monkeypatch.setenv("SOLVER_DEFAULT_BUDGET_SECONDS", "junk")
    assert TestClient(app).get("/health").json()["defaultBudgetSeconds"] == 300
