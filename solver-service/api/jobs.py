"""Background long-solve jobs: POST /jobs, GET /jobs/{id}, DELETE /jobs/{id}.

Prototype for "Long solve in the background" (rare usage, 2-3/month): the
admin picks a bigger time budget (5/15/30 min) than /solve's own ~60s/120s
defaults, keeps working, and polls for the result instead of blocking a
request for that long.

Same auth + body-size + rate-limit posture as /solve on the SUBMIT path
(api/main.py's MaxBodySizeMiddleware already wraps every route uniformly;
POST /jobs reuses enforce_preauth_ip_limit + enforce_rate_limit exactly like
/solve). GET/DELETE use `require_auth` (identity, for ownership) but NOT
`enforce_rate_limit` -- a client is expected to poll GET every ~10-20s for
the full budget (up to 30 min = ~180 polls), which would blow through
/solve's own SOLVER_RATE_PER_MIN (default 6) bucket almost immediately if
shared; polling still goes through the coarse preauth IP bucket.

One job runs at a time per server process (CP-SAT's own num_workers already
saturates every core the machine has -- a second concurrent solve would only
starve both). A second submit while one is queued/running gets 409.

Jobs are held IN MEMORY ONLY -- no DB, no disk. See CLAUDE.md's "Fly reality
check": fly.toml has auto_stop_machines=true/min_machines_running=0, so if
the machine stops (laptop sleeps, tab closes, no traffic for a while) mid-job,
the job and its result are gone for good. A client polling after the machine
restarts gets a 404 ("job not found") -- the UI's job client (src/lib/
solverJobs.js) must treat that as "the optimizer stopped before finishing,
run it again", never hang waiting for a job that no longer exists anywhere.

Job ids are random (uuid4, unguessable) and, once `SOLVER_AUTH_MODE=supabase`
is on, only the same JWT `sub` that submitted a job can poll or cancel it
(a mismatched/absent caller gets the same 404 as "doesn't exist" -- never a
403, so this isn't an existence oracle for job ids). In `off` mode there is
no real per-caller identity to check, so ownership is not enforced there
(matches /solve's own off-mode posture elsewhere in this service).
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from api.auth import AuthResult, require_auth
from api.ratelimit import _client_ip, enforce_preauth_ip_limit, enforce_rate_limit
from api.schemas import SolveRequest
from solver.io.payload import PayloadError, parse_payload
from solver.io.result import build_response
from solver.solve import begin_stoppable_run, end_stoppable_run, solve

router = APIRouter()

# TTL for a FINISHED job (done/failed/cancelled) -- swept opportunistically
# (piggybacked on the next submit/poll, like ratelimit.py's own idle sweep)
# rather than on a dedicated timer thread. A job stuck queued/running forever
# (process died mid-solve without reaching the `finally`) is NOT swept by
# this -- that can only happen if the whole process crashes, in which case
# every in-memory job is gone anyway on restart.
_JOB_TTL_SECONDS = 2 * 60 * 60
_FINISHED_STATUSES = ("done", "failed", "cancelled")


@dataclass
class _Job:
    id: str
    owner: str  # "sub:<uuid>" | "ip:<addr>" -- see _owner_key
    status: str = "queued"  # queued | running | done | failed | cancelled
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    budget_seconds: float = 0.0
    result: Optional[dict] = None
    error: Optional[str] = None
    # Populated by begin_stoppable_run() once the worker thread actually
    # starts calling solve() -- see solve.py's own docstring. A plain list a
    # cancel() call iterates to call .stop_search() on each entry; append-only
    # from the worker thread, read-only (copied under _lock) from a canceller.
    solvers: list = field(default_factory=list)
    cancel_event: threading.Event = field(default_factory=threading.Event)


_lock = threading.Lock()
_jobs: dict[str, _Job] = {}
# The one job currently allowed to be queued/running -- None once it finishes
# (see _run_job's finally). Guards the "one job at a time" rule without
# scanning the whole _jobs dict on every submit.
_current_job_id: Optional[str] = None


def _owner_key(request: Request, auth: AuthResult) -> str:
    if auth.enabled and auth.subject:
        return f"sub:{auth.subject}"
    return f"ip:{_client_ip(request)}"


def _sweep_finished_locked(now: float) -> None:
    stale = [
        jid for jid, j in _jobs.items()
        if j.status in _FINISHED_STATUSES and j.finished_at is not None
        and now - j.finished_at > _JOB_TTL_SECONDS
    ]
    for jid in stale:
        del _jobs[jid]


def _job_view(job: _Job) -> dict:
    with _lock:
        now = time.time()
        end = job.finished_at or now
        start = job.started_at or job.created_at
        return {
            "status": job.status,
            "startedAt": job.started_at,
            "budgetSeconds": job.budget_seconds,
            "elapsedSeconds": round(max(0.0, end - start), 1),
            "result": job.result,
            "error": job.error,
        }


def _run_job(job: _Job, payload) -> None:
    solvers = begin_stoppable_run()
    with _lock:
        job.solvers = solvers
        job.status = "running"
        job.started_at = time.time()
    try:
        result = solve(payload, cancel_event=job.cancel_event)
        with _lock:
            if job.cancel_event.is_set():
                job.status = "cancelled"
            else:
                job.status = "done"
                job.result = build_response(payload.version, result)
            job.finished_at = time.time()
    except Exception as exc:  # pragma: no cover -- defensive, mirrors /solve's own 500 path
        with _lock:
            job.status = "failed"
            job.error = str(exc)
            job.finished_at = time.time()
    finally:
        end_stoppable_run()
        global _current_job_id
        with _lock:
            if _current_job_id == job.id:
                _current_job_id = None


@router.post("/jobs")
def submit_job(
    request: SolveRequest,
    req: Request,
    _preauth: None = Depends(enforce_preauth_ip_limit),
    auth: AuthResult = Depends(enforce_rate_limit),
) -> dict:
    global _current_job_id
    raw = request.model_dump(mode="python")
    try:
        payload = parse_payload(raw)
    except PayloadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with _lock:
        _sweep_finished_locked(time.time())
        if _current_job_id is not None:
            current = _jobs.get(_current_job_id)
            if current is not None and current.status in ("queued", "running"):
                raise HTTPException(status_code=409, detail="a solve job is already running on this server")

        job_id = str(uuid.uuid4())
        job = _Job(id=job_id, owner=_owner_key(req, auth), budget_seconds=payload.config.max_time_seconds)
        _jobs[job_id] = job
        _current_job_id = job_id

    thread = threading.Thread(target=_run_job, args=(job, payload), daemon=True)
    thread.start()
    return {"jobId": job_id}


def _get_owned_job(job_id: str, req: Request, auth: AuthResult) -> _Job:
    with _lock:
        _sweep_finished_locked(time.time())
        job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    if auth.enabled and job.owner != _owner_key(req, auth):
        # Same 404 as "doesn't exist" -- see module docstring's "not an
        # existence oracle" note.
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.get("/jobs/{job_id}")
def get_job(
    job_id: str,
    req: Request,
    _preauth: None = Depends(enforce_preauth_ip_limit),
    auth: AuthResult = Depends(require_auth),
) -> dict:
    return _job_view(_get_owned_job(job_id, req, auth))


@router.delete("/jobs/{job_id}")
def cancel_job(
    job_id: str,
    req: Request,
    _preauth: None = Depends(enforce_preauth_ip_limit),
    auth: AuthResult = Depends(require_auth),
) -> dict:
    job = _get_owned_job(job_id, req, auth)
    with _lock:
        # `_job_view` takes `_lock` itself -- must never be called while THIS lock is already
        # held (threading.Lock is non-reentrant; a nested acquire from the same thread deadlocks
        # it forever, wedging every future /jobs request process-wide, not just this one -- a real
        # bug caught by hand during manual smoke testing, see solver-service/CLAUDE.md's
        # "Background jobs" section). Decide what to do INSIDE the lock, call `_job_view` AFTER
        # releasing it.
        already_finished = job.status in _FINISHED_STATUSES
        if not already_finished:
            job.cancel_event.set()
    if already_finished:
        return _job_view(job)

    # Stop whatever CpSolver(s) are registered for this job's worker thread
    # right now. A cancel racing the brief gap between two staged-solve
    # stages (solve.py's _solve_staged re-solves the same model up to 4
    # times) just means the NEXT solver -- appended to job.solvers right
    # before ITS OWN .solve() call -- still gets stopped almost immediately
    # rather than that stage running to completion; see solve.py's
    # begin_stoppable_run docstring for why this is safe (stop_search() on an
    # already-finished solver is a documented no-op).
    deadline = time.time() + 2.0
    while time.time() < deadline:
        with _lock:
            status = job.status
            # Only the MOST RECENTLY registered solver -- never the full history. The staged
            # solve (solver/solve.py's _solve_staged) re-solves the SAME underlying CpModel up to
            # 4 times, mutating it (new bound, new hint) between stages; calling .stop_search() on
            # an OLDER, already-finished solver tied to an earlier mutation of that same model --
            # on top of whatever the CURRENT stage's solver is doing -- risks exactly the kind of
            # native-level instability solve.py's own module docstring already warns about for
            # "repeated solve on the same, mutated model" (an observed native abort during manual
            # testing of this cancel path motivated this restriction; see solver-service/CLAUDE.md's
            # "Background jobs" section). The current stage's solver is always the LAST entry
            # appended (solvers are appended immediately before their own .solve() call), so this
            # still reliably reaches whichever solve is actually in flight right now.
            latest = job.solvers[-1:] if job.solvers else []
        if status in _FINISHED_STATUSES:
            break
        for s in latest:
            try:
                s.stop_search()
            except Exception:
                pass
        time.sleep(0.1)

    with _lock:
        if job.status not in _FINISHED_STATUSES:
            job.status = "cancelled"
            job.finished_at = time.time()
    return _job_view(job)


def reset_jobs_store() -> None:
    """Test-only: drop all job state between test cases."""
    global _current_job_id
    with _lock:
        _jobs.clear()
        _current_job_id = None
