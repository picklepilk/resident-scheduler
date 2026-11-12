"""Startup guard: on Fly (FLY_APP_NAME set) the service must not run with auth off
or with supabase mode lacking the config needed to verify tokens."""

from __future__ import annotations

import pytest

from api.auth import validate_startup_config


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for k in ("FLY_APP_NAME", "SOLVER_AUTH_MODE", "SUPABASE_URL", "SUPABASE_JWT_SECRET"):
        monkeypatch.delenv(k, raising=False)


def test_fly_with_mode_off_refuses(monkeypatch):
    monkeypatch.setenv("FLY_APP_NAME", "x")
    monkeypatch.setenv("SOLVER_AUTH_MODE", "off")
    with pytest.raises(RuntimeError, match="SOLVER_AUTH_MODE"):
        validate_startup_config()


def test_fly_with_mode_unset_refuses(monkeypatch):
    monkeypatch.setenv("FLY_APP_NAME", "x")
    with pytest.raises(RuntimeError, match="SOLVER_AUTH_MODE"):
        validate_startup_config()


def test_fly_with_mode_blank_refuses(monkeypatch):
    monkeypatch.setenv("FLY_APP_NAME", "x")
    monkeypatch.setenv("SOLVER_AUTH_MODE", "  ")
    with pytest.raises(RuntimeError, match="SOLVER_AUTH_MODE"):
        validate_startup_config()


def test_fly_supabase_with_url_starts_current_production_config(monkeypatch):
    monkeypatch.setenv("FLY_APP_NAME", "x")
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://abc.supabase.co")
    validate_startup_config()


def test_fly_supabase_with_only_jwt_secret_starts(monkeypatch):
    monkeypatch.setenv("FLY_APP_NAME", "x")
    monkeypatch.setenv("SOLVER_AUTH_MODE", "Supabase")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "s")
    validate_startup_config()


def test_fly_supabase_missing_config_refuses(monkeypatch):
    monkeypatch.setenv("FLY_APP_NAME", "x")
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        validate_startup_config()


@pytest.mark.parametrize("mode", [None, "off", "supabase"])
def test_non_fly_always_starts(monkeypatch, mode):
    if mode is not None:
        monkeypatch.setenv("SOLVER_AUTH_MODE", mode)
    validate_startup_config()
