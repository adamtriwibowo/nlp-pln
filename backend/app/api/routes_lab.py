"""Admin lab endpoints: dataset (qa.jsonl) management, question playground, read-only config,
and dev-split evaluation jobs. Everything here requires the admin role."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import rate_limited, require_role
from app.core.config import Settings, get_settings
from app.db.models import Chunk
from app.db.session import get_session
from app.eval.qa_schema import QAItem
from app.retrieval.factory import CorpusCache
from app.services import admin_service as admin_svc
from app.services import lab_service as lab
from app.services.qa_store import (
    QAError,
    QAFrozenError,
    QANotFoundError,
    QAStore,
    eval_dir,
)
from app.services.query_log import over_daily_limit

router = APIRouter(prefix="/api/admin", tags=["admin-lab"])
AdminOnly = Depends(require_role("admin"))


def get_store(settings: Settings = Depends(get_settings)) -> QAStore:
    return QAStore(eval_dir(settings))


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, QAFrozenError):
        return HTTPException(status.HTTP_409_CONFLICT, str(exc))
    if isinstance(exc, QANotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, str(exc))
    if isinstance(exc, lab.LabError):
        return HTTPException(exc.status, str(exc))
    return HTTPException(422, str(exc))


async def _chunk_ids(db: AsyncSession) -> set[str]:
    return set((await db.execute(select(Chunk.chunk_id))).scalars().all())


def _cache(request: Request) -> CorpusCache:
    cache: CorpusCache = request.app.state.corpus_cache
    return cache


def _view(store: QAStore) -> dict[str, Any]:
    items = store.load()
    return {
        "items": [i.model_dump() for i in items],
        "stats": store.stats(items),
        "next_id": store.next_id(items),
        "frozen": store.lock_info(),
        "integrity": store.integrity(items),
    }


# ---- dataset ----------------------------------------------------------------------------


@router.get("/qa", dependencies=[AdminOnly])
async def list_qa(store: QAStore = Depends(get_store)) -> dict[str, Any]:
    try:
        return _view(store)
    except ValueError as exc:  # corrupt qa.jsonl: tell the admin which line
        raise HTTPException(500, f"qa.jsonl tidak valid: {exc}") from exc


@router.post("/qa", status_code=status.HTTP_201_CREATED, dependencies=[AdminOnly])
async def create_qa(
    item: QAItem,
    store: QAStore = Depends(get_store),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        store.create(item, await _chunk_ids(db))
    except QAError as exc:
        raise _http(exc) from exc
    return _view(store)


@router.put("/qa/{item_id}", dependencies=[AdminOnly])
async def update_qa(
    item_id: str,
    item: QAItem,
    store: QAStore = Depends(get_store),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        store.update(item_id, item, await _chunk_ids(db))
    except QAError as exc:
        raise _http(exc) from exc
    return _view(store)


@router.delete("/qa/{item_id}", dependencies=[AdminOnly])
async def delete_qa(item_id: str, store: QAStore = Depends(get_store)) -> dict[str, Any]:
    try:
        store.delete(item_id)
    except QAError as exc:
        raise _http(exc) from exc
    return _view(store)


@router.post("/qa/freeze", dependencies=[AdminOnly])
async def freeze_test(store: QAStore = Depends(get_store)) -> dict[str, Any]:
    try:
        store.freeze_test()
    except QAError as exc:
        raise _http(exc) from exc
    return _view(store)


@router.get("/qa/candidates", dependencies=[AdminOnly])
async def qa_candidates(
    request: Request,
    q: Annotated[str, Query(min_length=3, max_length=1000)],
    k: Annotated[int, Query(ge=1, le=20)] = 8,
    db: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> list[dict[str, Any]]:
    """Candidate chunks (hybrid search) to help choose gold_chunk_ids."""
    try:
        return await lab.candidates(db, settings, _cache(request), q, k)
    except (lab.LabError, RuntimeError) as exc:
        raise _http(exc) from exc


@router.get("/qa/export", dependencies=[AdminOnly])
async def export_qa(store: QAStore = Depends(get_store)) -> PlainTextResponse:
    text = store.path.read_text(encoding="utf-8") if store.path.exists() else ""
    return PlainTextResponse(
        text,
        media_type="application/x-ndjson; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="qa.jsonl"'},
    )


# ---- playground -------------------------------------------------------------------------


class PlaygroundRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    config_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,16}$")
    generate: bool = False  # False = retrieval only (free); B0/M3 always generate
    gold_chunk_ids: list[str] = Field(default_factory=list, max_length=20)
    audit: bool = False


@router.post("/playground", dependencies=[AdminOnly, Depends(rate_limited("ask_limiter"))])
async def run_playground(
    body: PlaygroundRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if await over_daily_limit(db, settings.daily_cost_limit_usd):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Batas biaya harian tercapai.")
    try:
        return await lab.playground(
            db,
            settings,
            _cache(request),
            question=body.question.strip(),
            config_id=body.config_id,
            generate=body.generate,
            gold_ids=body.gold_chunk_ids,
            audit=body.audit,
        )
    except lab.LabError as exc:
        raise _http(exc) from exc


# ---- configuration (read-only) and evaluation jobs ---------------------------------------


@router.get("/config", dependencies=[AdminOnly])
async def get_config(
    db: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)
) -> dict[str, Any]:
    return await lab.config_summary(db, settings)


class EvalRequest(BaseModel):
    config_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,16}$")
    kind: Literal["retrieval", "generation"]
    split: str = "dev"


@router.post("/evals/estimate", dependencies=[AdminOnly])
async def estimate_eval(
    body: EvalRequest,
    db: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    store: QAStore = Depends(get_store),
) -> dict[str, Any]:
    try:
        return await lab.eval_estimate(db, settings, store, body.config_id, body.kind, body.split)
    except lab.LabError as exc:
        raise _http(exc) from exc


@router.post("/evals", status_code=status.HTTP_202_ACCEPTED, dependencies=[AdminOnly])
async def start_eval(
    body: EvalRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    store: QAStore = Depends(get_store),
) -> dict[str, Any]:
    """Start a dev-split evaluation as a background job (shared with reindex: one at a time)."""
    try:
        await lab.eval_estimate(db, settings, store, body.config_id, body.kind, body.split)
    except lab.LabError as exc:
        raise _http(exc) from exc
    jobs: admin_svc.JobManager = request.app.state.jobs
    cache = _cache(request)

    async def work(job: admin_svc.Job) -> None:
        await lab.run_eval_job(job, settings, cache, store, body.config_id, body.kind, body.split)

    try:
        job = jobs.start(work)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return job.to_dict()
