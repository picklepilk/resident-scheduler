"""The image build context must not ship the local venv or session logs (Docker ignores the root .gitignore)."""

from pathlib import Path

DOCKERIGNORE = Path(__file__).resolve().parent.parent / ".dockerignore"


def test_dockerignore_excludes_venv_and_session_logs():
    lines = {ln.strip() for ln in DOCKERIGNORE.read_text(encoding="utf-8").splitlines()}
    assert {".venv", "CC-Session-Logs"} <= lines
    assert not ({"api", "solver", "config"} & lines)
