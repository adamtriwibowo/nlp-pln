"""Public read endpoints: chunk text/metadata (with bbox for PDF highlights) and source documents."""

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Chunk, Document
from app.db.session import get_session
from app.ingest.pipeline import load_manifest
from app.services.ingest_service import MANIFEST, RAW_DIR

router = APIRouter(prefix="/api", tags=["content"])


@router.get("/chunks/{chunk_id}")
async def get_chunk(chunk_id: str, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    row = (
        await session.execute(
            select(Chunk, Document)
            .join(Document, Document.id == Chunk.doc_id)
            .where(Chunk.chunk_id == chunk_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chunk tidak ditemukan.")
    chunk, doc = row
    return {
        "chunk_id": chunk.chunk_id,
        "doc_id": doc.id,
        "doc_title": doc.title,
        "label": chunk.hierarchy.get("label", chunk.chunk_id),
        "hierarchy": chunk.hierarchy,
        "page_start": chunk.page_start,
        "page_end": chunk.page_end,
        "bbox": chunk.bbox,
        "text": chunk.text,
        "ocr_noisy": bool(chunk.hierarchy.get("ocr_noisy", False)),
    }


@router.get("/documents")
async def list_documents(session: AsyncSession = Depends(get_session)) -> list[dict[str, Any]]:
    docs = (await session.execute(select(Document).order_by(Document.id))).scalars().all()
    return [
        {
            "id": d.id,
            "title": d.title,
            "publisher": d.publisher,
            "lang": d.lang,
            "status": d.status,
            "source_url": d.source_url,
            "indexed": d.index,
        }
        for d in docs
    ]


def _pdf_path(doc_id: str) -> Path | None:
    """File path comes from the manifest only (never from user input)."""
    for entry in load_manifest(MANIFEST):
        if entry.id == doc_id and entry.file:
            path = RAW_DIR / entry.file
            return path if path.is_file() else None
    return None


@router.get("/documents/{doc_id}/file")
async def document_file(doc_id: str, session: AsyncSession = Depends(get_session)) -> FileResponse:
    doc = await session.get(Document, doc_id)
    path = _pdf_path(doc_id) if doc else None
    if doc is None or path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dokumen tidak tersedia.")
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{path.name}"'},
    )
