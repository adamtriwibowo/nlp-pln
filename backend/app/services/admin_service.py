"""Admin: document upload, ingestion status, background reindex job, eval run listing."""

import asyncio
import re
import unicodedata
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models import Chunk, Document, EvalRun
from app.ingest.models import ManifestEntry
from app.ingest.pipeline import load_manifest, sha256_file, uploads_path

MAX_UPLOAD_BYTES = 30 * 1024 * 1024
PDF_MAGIC = b"%PDF-"


class UploadError(ValueError):
    """Raised for rejected uploads; the message is safe to show to the admin."""


def slugify(title: str, max_len: int = 40) -> str:
    """ASCII-only filename stem derived from the title (the client filename is never used)."""
    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_title.lower()).strip("_")
    return (slug or "dokumen")[:max_len]


def next_doc_id(existing: list[str]) -> str:
    nums = [int(m.group(1)) for i in existing if (m := re.fullmatch(r"D(\d+)", i))]
    return f"D{max(nums, default=0) + 1}"


def validate_pdf_header(first_bytes: bytes) -> None:
    if not first_bytes.startswith(PDF_MAGIC):
        raise UploadError("Berkas bukan PDF yang valid.")


@dataclass
class UploadMeta:
    title: str
    short_title: str
    publisher: str
    source_url: str
    lang: str
    parser: str
    status_berlaku: str = "belum diverifikasi"
    license: str = "Dokumen publik"
    api_allowed: bool = False  # privacy: external use must be enabled explicitly
    index: bool = True


def register_upload(manifest: Path, raw_dir: Path, data: bytes, meta: UploadMeta) -> ManifestEntry:
    """Validate and store an uploaded PDF, then record it in manifest.uploads.yaml."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise UploadError("Berkas melebihi batas 30 MB.")
    validate_pdf_header(data[:8])
    entries = load_manifest(manifest)
    doc_id = next_doc_id([e.id for e in entries])
    filename = f"{doc_id}_{slugify(meta.title)}.pdf"
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / filename).write_bytes(data)
    entry = ManifestEntry(
        id=doc_id,
        title=meta.title,
        short_title=meta.short_title or meta.title[:40],
        publisher=meta.publisher,
        source_url=meta.source_url,
        downloaded_at=datetime.now(UTC).date().isoformat(),
        status_berlaku=meta.status_berlaku,
        license=meta.license,
        lang=meta.lang,
        file=filename,
        parser=meta.parser,
        extract="auto",
        index=meta.index,
        api_allowed=meta.api_allowed,
        note="Diunggah lewat halaman admin",
    )
    up = uploads_path(manifest)
    current: dict[str, Any] = (
        (yaml.safe_load(up.read_text(encoding="utf-8")) or {}) if up.exists() else {}
    )
    docs = current.get("documents", [])
    docs.append(entry.model_dump(mode="json"))
    up.write_text(
        yaml.safe_dump({"documents": docs}, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    return entry


async def documents_status(
    session: AsyncSession, manifest: Path, raw_dir: Path
) -> list[dict[str, Any]]:
    counts = dict(
        (await session.execute(select(Chunk.doc_id, func.count()).group_by(Chunk.doc_id))).all()
    )
    db_docs = {d.id: d for d in (await session.execute(select(Document))).scalars()}
    out = []
    for e in load_manifest(manifest):
        path = raw_dir / e.file if e.file else None
        d = db_docs.get(e.id)
        out.append(
            {
                "id": e.id,
                "title": e.title,
                "lang": e.lang,
                "file": e.file,
                "file_present": bool(path and path.is_file()),
                "sha256": sha256_file(path)[:12] if path and path.is_file() else None,
                "index": e.index,
                "api_allowed": e.api_allowed,
                "ingested": d is not None,
                "chunks": int(counts.get(e.id, 0)),
                "status_berlaku": e.status_berlaku,
                "note": e.note,
            }
        )
    return out


async def eval_runs(session: AsyncSession, limit: int = 50) -> list[dict[str, Any]]:
    runs = (
        await session.execute(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(limit))
    ).scalars()
    return [
        {
            "run_id": r.run_id,
            "config": r.config,
            "corpus_version": r.corpus_version,
            "models": r.models,
            "metrics": r.metrics,
            "created_at": r.created_at.isoformat(),
        }
        for r in runs
    ]


# ---- background reindex job ------------------------------------------------------------


@dataclass
class Job:
    id: str
    status: str = "queued"  # queued | running | done | failed
    log: list[str] = field(default_factory=list)
    error: str | None = None
    started_at: str | None = None
    finished_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status,
            "log": self.log,
            "error": self.error,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }


class JobManager:
    """Single-process job registry; only one reindex may run at a time."""

    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        self._tasks: set[asyncio.Task[None]] = set()

    def running(self) -> Job | None:
        return next((j for j in self.jobs.values() if j.status in ("queued", "running")), None)

    def start(self, work: Callable[[Job], Awaitable[None]]) -> Job:
        if self.running() is not None:
            raise RuntimeError("Reindex sedang berjalan.")
        job = Job(id=uuid.uuid4().hex[:12])
        self.jobs[job.id] = job

        async def runner() -> None:
            job.status, job.started_at = "running", datetime.now(UTC).isoformat()
            try:
                await work(job)
                job.status = "done"
            except Exception as exc:  # report to the admin, never crash the server
                job.status, job.error = "failed", f"{type(exc).__name__}: {exc}"
            job.finished_at = datetime.now(UTC).isoformat()

        task = asyncio.create_task(runner())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return job


async def reindex_work(job: Job, settings: Settings, on_done: Callable[[], None]) -> None:
    """ingest -> persist -> embed. Imports are local to keep module import light."""
    from app.db.session import SessionLocal
    from app.retrieval.embeddings import build_provider
    from app.services import ingest_service as ing
    from app.services.index_service import build_index

    job.log.append("Ingesti PDF...")
    entries, reports, chunks, version = await asyncio.to_thread(ing.run_pipeline)
    await asyncio.to_thread(ing.write_jsonl, chunks)
    await asyncio.to_thread(ing.write_report, entries, reports, chunks, version)
    async with SessionLocal() as session:
        await ing.persist(session, entries, reports, chunks, version)
    job.log.append(f"Ingesti selesai: {len(chunks)} chunk, corpus_version {version}.")

    job.log.append("Membangun embedding...")
    provider = build_provider(settings)
    async with SessionLocal() as session:
        st = await build_index(
            session, provider, external_api=settings.embedding_provider != "local"
        )
    job.log.append(
        f"Embedding: {st.embedded} baru, {st.unchanged} tetap, "
        f"{st.skipped_not_api_allowed} dilewati (api_allowed=false)."
    )
    on_done()
