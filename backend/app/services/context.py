"""Load chunks from the DB as prompt context, enforcing the api_allowed privacy rule."""

from collections.abc import Iterable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.schemas import ContextChunk
from app.db.models import Chunk, Document


def filter_api_allowed(chunks: Iterable[ContextChunk]) -> list[ContextChunk]:
    """Only chunks with api_allowed=True may be sent to an external LLM API."""
    return [c for c in chunks if c.api_allowed]


def relabel(chunks: list[ContextChunk]) -> list[ContextChunk]:
    for i, c in enumerate(chunks, 1):
        c.label = i
    return chunks


async def load_chunks(session: AsyncSession, ids: list[str]) -> dict[str, ContextChunk]:
    """chunk_id -> ContextChunk (label 0 until placed in a prompt). Missing ids are skipped."""
    if not ids:
        return {}
    rows = (
        await session.execute(
            select(Chunk, Document)
            .join(Document, Document.id == Chunk.doc_id)
            .where(Chunk.chunk_id.in_(ids))
        )
    ).all()
    out: dict[str, ContextChunk] = {}
    for chunk, doc in rows:
        out[chunk.chunk_id] = ContextChunk(
            label=0,
            chunk_id=chunk.chunk_id,
            doc_id=doc.id,
            doc_title=doc.title,
            ref=str(chunk.hierarchy.get("label", chunk.chunk_id)),
            text=chunk.text,
            page_start=chunk.page_start,
            # both the document flag and the chunk flag must allow external use
            api_allowed=bool(doc.api_allowed and chunk.hierarchy.get("api_allowed", False)),
        )
    return out


async def list_documents(session: AsyncSession) -> list[dict[str, Any]]:
    rows = (await session.execute(select(Document).where(Document.index.is_(True)))).scalars()
    return [{"id": d.id, "title": d.title, "lang": d.lang, "publisher": d.publisher} for d in rows]
