"""Modal deployment of the CP-SAT solver service (see DEPLOY-MODAL.md).

Two functions in one app:

- `solve_fn` -- the heavy CP-SAT solve (4 Modal "cpu" = 4 physical cores = 8 vCPU, 8 GiB). Called
  ONLY via `Function.spawn` from the web function's job backend (`api/jobs.py` `ModalJobs`), so a
  solve runs independent of the browser tab and of the web container. Writes progress into the
  `solver-progress` modal.Dict under its own call id.
- `web` -- the FastAPI app (`api.main.app`) with `SOLVER_JOBS_BACKEND=modal`. Tiny CPU,
  `max_containers=1` (the per-process rate limiters stay effectively global) and
  `@modal.concurrent(max_inputs=50)` so one container serves many concurrent polls.

Why jobs only: a Modal web endpoint caps one HTTP request at 150 s (then a 303 that CORS browser
fetches cannot follow), while a normal solve is ~120 s + overhead and Deep Solve is 300 s. So on
Modal `POST /solve` answers 400 `{"error": "use_jobs"}` and the browser submit-then-polls `/jobs`.

`SOLVER_NUM_WORKERS=8`: `os.cpu_count()` inside a container can report the HOST's cores, which
would oversubscribe CP-SAT; `solver/solve.py` honors this env var whenever the payload leaves
`config.numWorkers` at 0/absent (Modal cpu=4 -> 8 vCPU).

Imports of `api`/`solver` (and so ortools/fastapi) happen INSIDE the functions: this module must
import cleanly on a laptop with only `modal` installed (that is how `modal deploy` loads it).
"""

from __future__ import annotations

from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent

APP_NAME = "resident-scheduler-solver"
SECRET_NAME = "resident-scheduler-solver"
PROGRESS_DICT_NAME = "solver-progress"

app = modal.App(APP_NAME)

# add_local_* steps must come LAST in the image build (Modal docs, Image reference).
_base = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install_from_requirements(str(HERE / "requirements.txt"))
)


def _with_code(image: modal.Image) -> modal.Image:
    return (
        image
        # `solver/model/objective.py` finds config/default_weights.json at <pkg root>/config.
        .add_local_dir(str(HERE / "config"), remote_path="/root/config")
        .add_local_python_source("api", "solver")
    )


solve_image = _with_code(_base.env({"SOLVER_NUM_WORKERS": "8"}))
web_image = _with_code(_base.env({"SOLVER_JOBS_BACKEND": "modal"}))


@app.function(image=solve_image, cpu=4.0, memory=8192, timeout=35 * 60)
def solve_fn(raw: dict) -> dict:
    """Run one solve for a /solve-shaped request dict; returns the /solve response dict."""
    from api.jobs import solve_raw

    progress = modal.Dict.from_name(PROGRESS_DICT_NAME, create_if_missing=True)
    call_id = modal.current_function_call_id()

    def on_progress(p: dict) -> None:
        progress.put(call_id, p)  # sink failures are swallowed by solver.solve.ProgressReporter

    return solve_raw(raw, on_progress=on_progress)


@app.function(
    image=web_image,
    cpu=0.5,
    memory=1024,
    max_containers=1,
    secrets=[modal.Secret.from_name(SECRET_NAME)],
)
@modal.concurrent(max_inputs=50)
@modal.asgi_app()
def web():
    from api.main import app as fastapi_app

    return fastapi_app
