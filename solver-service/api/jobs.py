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
(InMemoryJobs only -- see BACKENDS below.)

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

BACKENDS (2026-10-17): the route handlers below are thin and delegate to a job
backend chosen by env `SOLVER_JOBS_BACKEND` (`memory` default, `modal`):

- `InMemoryJobs` -- everything above (Fly / local). One running job per process.
- `ModalJobs` -- durable: `submit` spawns a Modal Function call (independent of
  this web container and of the client), ownership/budget metadata lives in a
  `modal.Dict`, progress is written by the solve function into another
  `modal.Dict`. One running job per owner (409 on a second); each call gets its own container.
  `status` can report `lost` (result expired after Modal's retention).

Backend interface (both): `submit(payload, owner, raw=None) -> job_id`,
`status(job_id, owner) -> dict`, `cancel(job_id, owner) -> dict`. `owner` is the
caller's ownership key to ENFORCE (None = enforcement off, i.e. auth disabled);
a missing job or an owner mismatch raises `JobNotFound` (route -> 404).
`status` dicts keep the legacy keys (`status`: queued|running|done|failed|
cancelled|lost, `startedAt`, `budgetSeconds`, `elapsedSeconds`, `result`,
`error`) plus `progress` (`{stage, stages, elapsed, budget, best}` or None).
"""

from __future__ import annotations

import json
import logging
import os
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from api.auth import AuthResult, require_auth
from api.concurrency import solve_slot
from api.runlog import log_run
from api.ratelimit import _client_ip, enforce_poll_ip_limit, enforce_preauth_ip_limit, enforce_rate_limit
from api.schemas import SolveRequest
from solver.io.payload import PayloadError, parse_payload
from solver.io.result import build_response
from solver.solve import begin_stoppable_run, end_stoppable_run, solve

router = APIRouter()
log = logging.getLogger(__name__)

# TTL for a FINISHED job (done/failed/cancelled) -- swept opportunistically
# (piggybacked on the next submit/poll, like ratelimit.py's own idle sweep)
# rather than on a dedicated timer thread. A job stuck queued/running forever
# (process died mid-solve without reaching the `finally`) is NOT swept by
# this -- that can only happen if the whole process crashes, in which case
# every in-memory job is gone anyway on restart.
_JOB_TTL_SECONDS = 2 * 60 * 60
# Finished jobs that were written to the durable store (SOLVER_JOBS_DIR) live this long, on disk and in memory.
_PERSISTED_TTL_SECONDS = 24 * 60 * 60
_FINISHED_STATUSES = ("done", "failed", "cancelled", "lost")


class JobNotFound(Exception):
    """Unknown job id, or the caller does not own it (same outcome on purpose)."""


class JobBackendError(Exception):
    """The backend could not perform the operation (e.g. Modal cancel failed). Route -> 502."""


class JobNotSupported(Exception):
    """The backend does not implement this operation (ModalJobs.stop). Route -> 501."""


class JobConflict(Exception):
    """A job is already running and this backend only allows one (InMemoryJobs)."""


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
    progress: Optional[dict] = None
    # Populated by begin_stoppable_run() once the worker thread actually
    # starts calling solve() -- see solve.py's own docstring. A plain list a
    # cancel() call iterates to call .stop_search() on each entry; append-only
    # from the worker thread, read-only (copied under _lock) from a canceller.
    solvers: list = field(default_factory=list)
    cancel_event: threading.Event = field(default_factory=threading.Event)
    # "Stop and keep best" (POST /jobs/{id}/stop): unlike cancel_event the result is KEPT.
    stop_event: threading.Event = field(default_factory=threading.Event)
    persisted: bool = False  # a result/marker file for this job exists in the durable store


def _owner_key(request: Request, auth: AuthResult) -> str:
    if auth.enabled and auth.subject:
        return f"sub:{auth.subject}"
    return f"ip:{_client_ip(request)}"


def solve_raw(raw: dict, on_progress=None) -> dict:
    """Parse a /solve-shaped dict, solve, return the response dict. Entry point for Modal's
    `solve_fn` (modal_app.py) -- same parse -> solve -> build_response as /solve."""
    payload = parse_payload(raw)
    kwargs = {"on_progress": on_progress} if on_progress is not None else {}
    t0 = time.monotonic()
    result = solve(payload, **kwargs)
    log_run(payload, result, time.monotonic() - t0, "modal")
    return build_response(payload.version, result)


# --- durable store for the in-memory backend ------------------------------------------------------
# One JSON file per job under SOLVER_JOBS_DIR (default: `<SOLVER_RUNLOG_DIR>/jobs` when the run log is
# on, else a per-user data dir -- NEVER inside the repo tree: the files hold schedule data). A marker
# file (state queued/running) is written at submit and atomically replaced by the result at finish, so
# a process that died mid-solve comes back as `lost` on the next start. Nothing serves this directory.

def _repo_root() -> Optional[Path]:
    for parent in Path(__file__).resolve().parents:
        if (parent / ".git").exists():
            return parent
    return None


def default_jobs_dir() -> Path:
    explicit = os.environ.get("SOLVER_JOBS_DIR", "").strip()
    if explicit:
        return Path(explicit)
    runlog = os.environ.get("SOLVER_RUNLOG_DIR", "").strip()
    if runlog:
        return Path(runlog) / "jobs"
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share"))
    return base / "resident-solver" / "jobs"


class _JobStore:
    """Best-effort JSON-file store. Every failure degrades to memory-only (logged once)."""

    def __init__(self, directory: Optional[Path] = None) -> None:
        self._dir_arg = directory
        self._dir: Optional[Path] = None
        self._checked = False
        self._warned = False

    def _warn(self, msg: str) -> None:
        if not self._warned:
            self._warned = True
            log.warning("durable jobs disabled (memory only): %s", msg)

    def directory(self) -> Optional[Path]:
        if self._checked:
            return self._dir
        self._checked = True
        try:
            d = Path(self._dir_arg if self._dir_arg is not None else default_jobs_dir()).resolve()
            root = _repo_root()
            if root is not None and (d == root or root in d.parents):
                self._warn("jobs dir is inside the repo tree")
                return None
            d.mkdir(parents=True, exist_ok=True)
            if os.name == "posix":
                try:
                    os.chmod(d, 0o700)
                except OSError:
                    pass
            probe = d / ".probe.tmp"
            probe.write_text("x", encoding="utf-8")
            probe.unlink()
            self._dir = d
        except Exception as exc:  # noqa: BLE001
            self._warn(type(exc).__name__)
        return self._dir

    @property
    def available(self) -> bool:
        return self.directory() is not None

    def _path(self, job_id: str) -> Optional[Path]:
        d = self.directory()
        if d is None:
            return None
        try:
            uuid.UUID(job_id)
        except ValueError:
            return None
        return d / f"{job_id}.json"

    def write(self, job: "_Job", state: str) -> bool:
        path = self._path(job.id)
        if path is None:
            return False
        rec = {
            "v": 1, "id": job.id, "owner": job.owner, "state": state,
            "createdAt": job.created_at, "startedAt": job.started_at, "finishedAt": job.finished_at,
            "budgetSeconds": job.budget_seconds, "result": job.result, "error": job.error,
        }
        tmp = path.with_name(path.name + ".tmp")
        try:
            tmp.write_text(json.dumps(rec, separators=(",", ":"), default=str), encoding="utf-8")
            os.replace(tmp, path)
            return True
        except Exception as exc:  # noqa: BLE001
            self._warn(type(exc).__name__)
            try:
                tmp.unlink()
            except OSError:
                pass
            return False

    def delete(self, job_id: str) -> None:
        path = self._path(job_id)
        if path is None:
            return
        try:
            path.unlink()
        except OSError:
            pass

    def load_all(self, now: float) -> list:
        """Fresh jobs from disk (queued/running markers become `lost`); stale/corrupt files are deleted."""
        d = self.directory()
        if d is None:
            return []
        out = []
        for f in list(d.glob("*.json")) + list(d.glob("*.tmp")):
            try:
                if f.name == ".probe.tmp":
                    continue
                mtime = f.stat().st_mtime
                age = now - mtime
                if f.suffix == ".tmp":
                    if age > 60:
                        f.unlink()
                    continue
                if age > _PERSISTED_TTL_SECONDS:
                    f.unlink()
                    continue
                rec = json.loads(f.read_text(encoding="utf-8"))
                job = _Job(
                    id=str(rec["id"]), owner=str(rec["owner"]), created_at=float(rec.get("createdAt") or now),
                    started_at=rec.get("startedAt"), finished_at=rec.get("finishedAt"),
                    budget_seconds=float(rec.get("budgetSeconds") or 0.0),
                    result=rec.get("result"), error=rec.get("error"), persisted=True,
                )
                state = rec.get("state")
                if state in ("done", "failed", "lost"):
                    job.status = state
                    job.finished_at = job.finished_at or mtime
                else:  # queued/running marker of a process that died
                    job.status = "lost"
                    job.finished_at = mtime
                    self.write(job, "lost")
                out.append(job)
            except Exception:  # noqa: BLE001 -- corrupt file: drop it
                try:
                    f.unlink()
                except OSError:
                    pass
        return out


class InMemoryJobs:
    """Today's behavior (Fly / local): jobs in process memory, one at a time."""

    max_budget_seconds = 7200.0  # longRun ceiling (payload.py); no per-call container timeout here
    features = ("stop", "longRun")

    def __init__(self, jobs_dir: Optional[Path] = None) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, _Job] = {}
        self._store = _JobStore(jobs_dir)
        self._loaded = False
        # The one job currently allowed to be queued/running -- None once it finishes
        # (see _run_job's finally). Guards the "one job at a time" rule without
        # scanning the whole _jobs dict on every submit.
        self._current_job_id: Optional[str] = None

    def feature_list(self) -> list:
        feats = list(self.features)
        if self._store.available:
            feats.append("durableJobs")
        return feats

    def _load_locked(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        for job in self._store.load_all(time.time()):
            self._jobs.setdefault(job.id, job)

    def _sweep_finished_locked(self, now: float) -> None:
        self._load_locked()
        stale = [
            jid for jid, j in self._jobs.items()
            if j.status in _FINISHED_STATUSES and j.finished_at is not None
            and now - j.finished_at > (_PERSISTED_TTL_SECONDS if j.persisted else _JOB_TTL_SECONDS)
        ]
        for jid in stale:
            if self._jobs[jid].persisted:
                self._store.delete(jid)
            del self._jobs[jid]

    def _persist_finished(self, job: _Job) -> None:
        """Replace the marker with the result (done/failed) or drop it (cancelled). Never raises."""
        try:
            with self._lock:
                status = job.status
            if status in ("done", "failed"):
                ok = self._store.write(job, status)
                with self._lock:
                    job.persisted = ok
            else:
                self._store.delete(job.id)
                with self._lock:
                    job.persisted = False
        except Exception as exc:  # noqa: BLE001
            log.warning("job persist failed: %s", type(exc).__name__)

    def _view(self, job: _Job) -> dict:
        with self._lock:
            now = time.time()
            end = job.finished_at or now
            start = job.started_at or job.created_at
            view = {
                "status": job.status,
                "startedAt": job.started_at,
                "budgetSeconds": job.budget_seconds,
                "elapsedSeconds": round(max(0.0, end - start), 1),
                "result": job.result,
                "error": job.error,
                "progress": job.progress,
            }
            if job.stop_event.is_set() and job.status not in _FINISHED_STATUSES:
                view["stopping"] = True
            return view

    def _run_job(self, job: _Job, payload) -> None:
        def _on_progress(p: dict) -> None:
            with self._lock:
                job.progress = p

        solvers = begin_stoppable_run(_on_progress)
        with self._lock:
            job.solvers = solvers
            job.status = "running"
            job.started_at = time.time()
        t0 = time.monotonic()
        try:
            result = solve(payload, cancel_event=job.cancel_event, stop_event=job.stop_event)
            if not job.cancel_event.is_set():
                log_run(payload, result, time.monotonic() - t0, "job")
            with self._lock:
                if job.cancel_event.is_set():
                    job.status = "cancelled"
                else:
                    job.status = "done"
                    job.result = build_response(payload.version, result)
                job.finished_at = time.time()
        except Exception as exc:  # pragma: no cover -- defensive, mirrors /solve's own 500 path
            with self._lock:
                job.status = "failed"
                job.error = str(exc)
                job.finished_at = time.time()
        finally:
            end_stoppable_run()
            self._persist_finished(job)
            _release_slot()
            with self._lock:
                if self._current_job_id == job.id:
                    self._current_job_id = None

    def submit(self, payload, owner: str, raw: Optional[dict] = None) -> str:
        with self._lock:
            self._sweep_finished_locked(time.time())
            if self._current_job_id is not None:
                current = self._jobs.get(self._current_job_id)
                if current is not None and current.status in ("queued", "running"):
                    raise JobConflict("a solve job is already running on this server")

            if not solve_slot.acquire(blocking=False):
                raise JobConflict("a solve is already running on this server")
            job_id = str(uuid.uuid4())
            job = _Job(id=job_id, owner=owner, budget_seconds=payload.config.max_time_seconds)
            self._jobs[job_id] = job
            self._current_job_id = job_id

        # Marker: a process that dies mid-solve leaves this behind -> `lost` on the next start.
        job.persisted = self._store.write(job, "queued")
        thread = threading.Thread(target=self._run_job, args=(job, payload), daemon=True)
        thread.start()
        return job_id

    def _get_owned(self, job_id: str, owner: Optional[str]) -> _Job:
        with self._lock:
            self._sweep_finished_locked(time.time())
            job = self._jobs.get(job_id)
        if job is None:
            raise JobNotFound(job_id)
        if owner is not None and job.owner != owner:
            # Same 404 as "doesn't exist" -- see module docstring's "not an
            # existence oracle" note.
            raise JobNotFound(job_id)
        return job

    def status(self, job_id: str, owner: Optional[str]) -> dict:
        return self._view(self._get_owned(job_id, owner))

    def cancel(self, job_id: str, owner: Optional[str]) -> dict:
        job = self._get_owned(job_id, owner)
        with self._lock:
            # `_view` takes `_lock` itself -- must never be called while THIS lock is already
            # held (threading.Lock is non-reentrant; a nested acquire from the same thread deadlocks
            # it forever, wedging every future /jobs request process-wide, not just this one -- a real
            # bug caught by hand during manual smoke testing, see solver-service/CLAUDE.md's
            # "Background jobs" section). Decide what to do INSIDE the lock, call `_view` AFTER
            # releasing it.
            already_finished = job.status in _FINISHED_STATUSES
            if not already_finished:
                job.cancel_event.set()
        if already_finished:
            return self._view(job)

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
            with self._lock:
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

        with self._lock:
            if job.status not in _FINISHED_STATUSES:
                job.status = "cancelled"
                job.finished_at = time.time()
        return self._view(job)

    def stop(self, job_id: str, owner: Optional[str]) -> dict:
        """Stop and KEEP the best solution: sets stop_event (never cancel_event), so the job ends `done`."""
        job = self._get_owned(job_id, owner)
        with self._lock:
            already_finished = job.status in _FINISHED_STATUSES
            if not already_finished:
                job.stop_event.set()
        if already_finished:
            return self._view(job)
        # Same restriction as cancel(): only the MOST RECENT solver (see the comment there -- stopping
        # older solvers of the re-solved staged model risked a native abort). The ladder also checks
        # stop_event between stages, so a stop landing in a gap still takes effect.
        deadline = time.time() + 1.0
        while time.time() < deadline:
            with self._lock:
                status = job.status
                latest = job.solvers[-1:] if job.solvers else []
            if status in _FINISHED_STATUSES:
                break
            for s in latest:
                try:
                    s.stop_search()
                except Exception:
                    pass
            time.sleep(0.1)
        view = self._view(job)
        if view["status"] not in _FINISHED_STATUSES:
            view["stopping"] = True
        return view

    def reset(self) -> None:
        with self._lock:
            self._jobs.clear()
            self._current_job_id = None
            self._loaded = True  # a reset backend must not reload old files


MODAL_APP_NAME = "resident-scheduler-solver"
MODAL_SOLVE_FN = "solve_fn"
MODAL_META_DICT = "solver-jobs-meta"
MODAL_PROGRESS_DICT = "solver-progress"


class ModalJobs:
    """Durable jobs on Modal. The solve runs in `solve_fn` (modal_app.py) via `Function.spawn`,
    so it survives this web container, the client's tab, and Fly-style auto-stop.

    Everything Modal-specific is injectable so tests run with fakes (no network): `solve_fn`
    (`.spawn(raw) -> call` with `.object_id`), `call_from_id(id) -> call` (`.get(timeout=0)` /
    `.cancel(terminate_containers=True)`), `meta` and `progress` (dict-likes with get/put), and
    `classify(exc) -> 'pending' | 'expired' | 'unknown_id' | None`. By default they resolve lazily
    from the real `modal` package on first use.
    """

    max_budget_seconds = 1800.0  # solve_fn's Modal timeout is 35 min: no longRun
    features = ("durableJobs",)

    def feature_list(self) -> list:
        return list(self.features)

    def stop(self, job_id: str, owner: Optional[str]) -> dict:
        raise JobNotSupported("stop_not_supported")

    def __init__(self, solve_fn=None, call_from_id=None, meta=None, progress=None, classify=None) -> None:
        self._solve_fn = solve_fn
        self._call_from_id = call_from_id
        self._meta = meta
        self._progress = progress
        self._classify = classify

    # -- lazy real-modal wiring -------------------------------------------------------------
    def _fn(self):
        if self._solve_fn is None:
            import modal
            self._solve_fn = modal.Function.from_name(MODAL_APP_NAME, MODAL_SOLVE_FN)
        return self._solve_fn

    def _from_id(self, call_id: str):
        if self._call_from_id is None:
            import modal
            self._call_from_id = modal.FunctionCall.from_id
        return self._call_from_id(call_id)

    def _meta_dict(self):
        if self._meta is None:
            import modal
            self._meta = modal.Dict.from_name(MODAL_META_DICT, create_if_missing=True)
        return self._meta

    def _progress_dict(self):
        if self._progress is None:
            import modal
            self._progress = modal.Dict.from_name(MODAL_PROGRESS_DICT, create_if_missing=True)
        return self._progress

    def _classify_exc(self, exc: BaseException) -> Optional[str]:
        if self._classify is not None:
            return self._classify(exc)
        import modal.exception as mex
        # Order matters: OutputExpiredError and FunctionTimeoutError both subclass
        # modal.exception.TimeoutError, which is how "still running" surfaces.
        if isinstance(exc, mex.OutputExpiredError):
            return "expired"
        if isinstance(exc, mex.NotFoundError):
            return "unknown_id"
        # The solve function itself failed: Modal re-raises the function's own exception from
        # get() (RemoteError if it can't be unpickled), ExecutionError = container crash/OOM,
        # FunctionTimeoutError = exceeded the 35 min limit. All terminal.
        if isinstance(exc, (mex.FunctionTimeoutError, mex.ExecutionError, mex.RemoteError, mex.InvalidError)):
            return None
        if isinstance(exc, (TimeoutError, mex.TimeoutError)):
            return "pending"
        # Modal client/infra trouble while polling (connection drops, service/internal errors,
        # auth refresh, gRPC wrappers, socket errors): the solve is unaffected, so don't fail it.
        mod = type(exc).__module__ or ""
        if isinstance(exc, (mex.Error, OSError)) or mod.startswith(("grpclib", "aiohttp", "asyncio")):
            return "transient"
        return None  # anything else is the solve function's own re-raised exception

    # -- interface --------------------------------------------------------------------------
    def submit(self, payload, owner: str, raw: Optional[dict] = None) -> str:
        if raw is None:
            raise ValueError("ModalJobs.submit needs the raw request dict")
        self._enforce_owner_cap(owner)
        call = self._fn().spawn(raw)
        job_id = call.object_id
        self._meta_dict().put(job_id, {
            "owner": owner,
            "submitted_at": time.time(),
            "budget": payload.config.max_time_seconds,
        })
        return job_id

    def _enforce_owner_cap(self, owner: str) -> None:
        """One running job per owner (any signed-up account could otherwise fan out 8-vCPU solves).
        Entries observed terminal are marked `done` so later scans skip them."""
        meta = self._meta_dict()
        for key, m in list(meta.items()):
            if not isinstance(m, dict) or m.get("owner") != owner or m.get("cancelled") or m.get("done"):
                continue
            if self._view(key, m)["status"] in ("queued", "running"):
                raise JobConflict("you already have a solve job running; wait for it or cancel it")
            meta.put(key, {**m, "done": True})

    def _get_meta(self, job_id: str, owner: Optional[str]) -> dict:
        meta = self._meta_dict().get(job_id)
        if not isinstance(meta, dict):
            raise JobNotFound(job_id)
        if owner is not None and meta.get("owner") != owner:
            raise JobNotFound(job_id)  # same 404 as unknown -- not an existence oracle
        return meta

    def _progress_of(self, job_id: str) -> Optional[dict]:
        try:
            p = self._progress_dict().get(job_id)
        except Exception:
            return None
        return p if isinstance(p, dict) else None

    def _view(self, job_id: str, meta: dict) -> dict:
        now = time.time()
        submitted = meta.get("submitted_at", now)
        base = {
            "startedAt": submitted,
            "budgetSeconds": meta.get("budget", 0.0),
            "elapsedSeconds": round(max(0.0, (meta.get("finished_at") or now) - submitted), 1),
            "result": None,
            "error": None,
            "progress": self._progress_of(job_id),
        }
        if meta.get("cancelled"):
            return {**base, "status": "cancelled"}
        try:
            result = self._from_id(job_id).get(timeout=0)
        except Exception as exc:
            kind = self._classify_exc(exc)
            if kind == "pending":
                return {**base, "status": "running"}
            if kind == "transient":
                # Not persisted anywhere: the next poll just asks Modal again.
                log.warning("modal poll error for %s: %r", job_id, exc)
                return {**base, "status": "running", "transientError": str(exc) or exc.__class__.__name__}
            if kind in ("expired", "unknown_id"):
                return {**base, "status": "lost"}
            return {**base, "status": "failed", "error": str(exc) or exc.__class__.__name__}
        return {**base, "status": "done", "result": result}

    def status(self, job_id: str, owner: Optional[str]) -> dict:
        return self._view(job_id, self._get_meta(job_id, owner))

    def cancel(self, job_id: str, owner: Optional[str]) -> dict:
        meta = self._get_meta(job_id, owner)
        view = self._view(job_id, meta)
        if view["status"] in ("done", "failed", "cancelled", "lost"):
            return view
        try:
            # terminate_containers: CP-SAT is a long native call that a plain cancel may not
            # interrupt; solve_fn containers are single-call so terminating is safe.
            self._from_id(job_id).cancel(terminate_containers=True)
        except Exception as exc:
            log.warning("modal cancel failed for %s: %r", job_id, exc)
            # Do NOT mark cancelled: the solve may still be running (and billing).
            raise JobBackendError("could not cancel the job; try again") from exc
        meta = {**meta, "cancelled": True, "finished_at": time.time()}
        self._meta_dict().put(job_id, meta)
        return self._view(job_id, meta)

    def reset(self) -> None:  # test-hook parity with InMemoryJobs
        pass


_backend_lock = threading.Lock()
_backend = None  # (name, instance)


def jobs_backend_name() -> str:
    """`modal` when the durable backend is selected, else `memory` (for /health and /solve)."""
    return "modal" if os.environ.get("SOLVER_JOBS_BACKEND", "memory").strip().lower() == "modal" else "memory"


def get_backend():
    """Backend for env SOLVER_JOBS_BACKEND, built on first use."""
    global _backend
    name = jobs_backend_name()
    with _backend_lock:
        if _backend is None or _backend[0] != name:
            _backend = (name, ModalJobs() if name == "modal" else InMemoryJobs())
        return _backend[1]


def set_backend(backend, name: str = "test") -> None:
    """Test-only: install a specific backend instance (until reset_jobs_store())."""
    global _backend
    with _backend_lock:
        _backend = (name, backend)


@router.post("/jobs")
def submit_job(
    request: SolveRequest,
    req: Request,
    _preauth: None = Depends(enforce_preauth_ip_limit),
    auth: AuthResult = Depends(enforce_rate_limit),
) -> dict:
    raw = request.model_dump(mode="python")
    try:
        payload = parse_payload(raw)
    except PayloadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    backend = get_backend()
    if payload.config.max_time_seconds > getattr(backend, "max_budget_seconds", float("inf")):
        raise HTTPException(status_code=400, detail="long_run_not_supported")
    try:
        job_id = backend.submit(payload, _owner_key(req, auth), raw=raw)
    except JobConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"jobId": job_id}


def _owner_to_enforce(req: Request, auth: AuthResult) -> Optional[str]:
    # In `off` mode there is no real per-caller identity, so ownership is not enforced.
    return _owner_key(req, auth) if auth.enabled else None


@router.get("/jobs/{job_id}")
def get_job(
    job_id: str,
    req: Request,
    _preauth: None = Depends(enforce_poll_ip_limit),
    auth: AuthResult = Depends(require_auth),
) -> dict:
    try:
        return get_backend().status(job_id, _owner_to_enforce(req, auth))
    except JobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc


@router.delete("/jobs/{job_id}")
def cancel_job(
    job_id: str,
    req: Request,
    _preauth: None = Depends(enforce_poll_ip_limit),
    auth: AuthResult = Depends(require_auth),
) -> dict:
    try:
        return get_backend().cancel(job_id, _owner_to_enforce(req, auth))
    except JobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
    except JobBackendError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/jobs/{job_id}/stop")
def stop_job(
    job_id: str,
    req: Request,
    _preauth: None = Depends(enforce_poll_ip_limit),
    auth: AuthResult = Depends(require_auth),
) -> dict:
    try:
        return get_backend().stop(job_id, _owner_to_enforce(req, auth))
    except JobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
    except JobNotSupported as exc:
        raise HTTPException(status_code=501, detail="stop_not_supported") from exc


def _release_slot() -> None:
    """Release the shared solve slot; a stale release (after reset_jobs_store) is a no-op."""
    try:
        solve_slot.release()
    except RuntimeError:
        pass


def reset_jobs_store() -> None:
    """Test-only: drop all job state (and the cached backend) between test cases."""
    global _backend
    with _backend_lock:
        if _backend is not None:
            _backend[1].reset()
        _backend = None
    if solve_slot.locked():
        _release_slot()
