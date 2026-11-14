from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import Session, require_role
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.services import admin_service as svc
from app.services.ingest_service import MANIFEST, RAW_DIR

router = APIRouter(prefix="/api/admin", tags=["admin"])

READ_CHUNK = 1024 * 1024


@router.get("/documents")
async def list_documents(
    _: Session = Depends(require_role("admin")), db: AsyncSession = Depends(get_session)
) -> list[dict[str, Any]]:
    return await svc.documents_status(db, MANIFEST, RAW_DIR)


@router.post("/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: Annotated[UploadFile, File()],
    title: Annotated[str, Form(min_length=3, max_length=300)],
    publisher: Annotated[str, Form(min_length=2, max_length=200)],
    lang: Annotated[Literal["id", "en"], Form()],
    parser: Annotated[Literal["legal_id", "sections_smk2", "sections_en"], Form()],
    source_url: Annotated[str, Form(max_length=500)] = "",
    short_title: Annotated[str, Form(max_length=60)] = "",
    api_allowed: Annotated[bool, Form()] = False,
    index: Annotated[bool, Form()] = True,
    _: Session = Depends(require_role("admin")),
) -> dict[str, Any]:
    # Read in chunks and stop early so an oversized upload never fills memory/disk.
    data = bytearray()
    while chunk := await file.read(READ_CHUNK):
        data += chunk
        if len(data) > svc.MAX_UPLOAD_BYTES:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Berkas melebihi batas 30 MB.")
    try:
        entry = svc.register_upload(
            MANIFEST,
            RAW_DIR,
            bytes(data),
            svc.UploadMeta(
                title=title.strip(),
                short_title=short_title.strip(),
                publisher=publisher.strip(),
                source_url=source_url.strip(),
                lang=lang,
                parser=parser,
                api_allowed=api_allowed,
                index=index,
            ),
        )
    except svc.UploadError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return {"id": entry.id, "file": entry.file, "api_allowed": entry.api_allowed}


@router.post("/reindex", status_code=status.HTTP_202_ACCEPTED)
async def reindex(
    request: Request,
    _: Session = Depends(require_role("admin")),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    jobs: svc.JobManager = request.app.state.jobs

    async def work(job: svc.Job) -> None:
        await svc.reindex_work(job, settings, request.app.state.corpus_cache.invalidate)

    try:
        job = jobs.start(work)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return job.to_dict()


@router.get("/jobs/{job_id}")
async def job_status(
    job_id: str, request: Request, _: Session = Depends(require_role("admin"))
) -> dict[str, Any]:
    job: svc.Job | None = request.app.state.jobs.jobs.get(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job tidak ditemukan.")
    return job.to_dict()


@router.get("/eval-runs")
async def list_eval_runs(
    _: Session = Depends(require_role("admin")), db: AsyncSession = Depends(get_session)
) -> list[dict[str, Any]]:
    return await svc.eval_runs(db)
